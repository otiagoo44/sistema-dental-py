-- Prueba real de RLS/RPC con roles JWT simulados dentro de una transaccion.
-- Todo se revierte al final; no deja usuarios ni datos de prueba adicionales.

begin;

insert into auth.users (id, email, role, aud)
values
  ('10000000-0000-0000-0000-000000000001', 'transaction-admin-dentalpro@example.test', 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000002', 'transaction-reception-dentalpro@example.test', 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000003', 'transaction-admin-qab@example.test', 'authenticated', 'authenticated');

insert into public.profiles (id, clinic_id, full_name, email, role, active)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'Transactional Admin DentalPro', 'transaction-admin-dentalpro@example.test', 'owner', true),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000101', 'Transactional Reception DentalPro', 'transaction-reception-dentalpro@example.test', 'receptionist', true),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000102', 'Transactional Admin QA B', 'transaction-admin-qab@example.test', 'owner', true);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  scheduled public.appointments;
  manual_lead public.leads;
  attempt_lead public.leads;
  attempted_task public.tasks;
  booking_blocked boolean := false;
  early_no_show_blocked boolean := false;
begin
  if (select count(*) from public.clinics) <> 1 then
    raise exception 'DentalPro owner no ve exactamente una clinica';
  end if;
  if exists (select 1 from public.leads where clinic_id <> '00000000-0000-0000-0000-000000000101') then
    raise exception 'DentalPro owner ve leads cross-clinic';
  end if;
  if (select count(*) from public.clinic_public_forms) <> 1 then
    raise exception 'DentalPro owner no puede ver exactamente su public form';
  end if;

  update public.message_templates
  set message = message
  where clinic_id = '00000000-0000-0000-0000-000000000101'
    and template_key = 'first_contact';
  if not found then
    raise exception 'Owner no pudo editar su plantilla de WhatsApp';
  end if;

  select * into manual_lead
  from public.create_manual_lead(
    'Lead Presencial Transactional', '0981000999', null,
    'Consulta general', 'Esta semana', 'Prueba de fuente presencial',
    'Presencial', true, null, 'Enviar WhatsApp', now() + interval '1 hour',
    null, 'Lead Medio', 50, 'Quiere agendar una consulta', 'No sabe', null
  );

  if manual_lead.clinic_id <> '00000000-0000-0000-0000-000000000101'
     or manual_lead.source <> 'Presencial'
     or not exists (
       select 1 from public.tasks
       where lead_id = manual_lead.id and type = 'contact' and status = 'pendiente'
     ) then
    raise exception 'create_manual_lead no guardo fuente presencial y tarea atomica';
  end if;

  perform public.save_lead_followup(
    manual_lead.id,
    'Contactado',
    'Hacer seguimiento',
    now() + interval '1 day'
  );

  if not exists (
    select 1 from public.tasks
    where lead_id = manual_lead.id and type = 'followup' and status = 'pendiente'
  ) then
    raise exception 'save_lead_followup no creo tarea sin duplicar el flujo';
  end if;

  if exists (
    select 1 from public.tasks
    where lead_id = manual_lead.id and type = 'contact'
      and status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
  ) or not exists (
    select 1 from public.tasks
    where lead_id = manual_lead.id and type = 'contact'
      and status = 'hecho' and completed_at is not null and completed_by = auth.uid()
  ) or not exists (
    select 1 from public.lead_events
    where lead_id = manual_lead.id and event_type = 'task_completed_auto'
  ) then
    raise exception 'Contactado no cerro y audito la tarea de contacto';
  end if;

  select * into attempt_lead
  from public.create_manual_lead(
    'QA Contact Outcome Transactional', '0981000998', null,
    'Consulta general', 'Esta semana', 'Prueba outcome de contacto',
    'WhatsApp directo', true, null, 'Contactar lead', now() + interval '1 hour',
    null, 'Lead Medio', 50, 'Quiere agendar una consulta', 'No', null
  );

  select * into attempted_task
  from public.complete_contact_task((
    select id from public.tasks
    where lead_id = attempt_lead.id and type = 'contact' and status = 'pendiente'
    limit 1
  ), 'no_respondio', 'Intento QA');

  if attempted_task.status <> 'hecho'
     or (select status from public.leads where id = attempt_lead.id) = 'Contactado'
     or not exists (
       select 1 from public.tasks
       where lead_id = attempt_lead.id and type = 'contact' and status = 'pendiente'
     )
     or not exists (
       select 1 from public.lead_events
       where lead_id = attempt_lead.id and event_type = 'contact_attempted'
     ) then
    raise exception 'no_respondio cambio estado o no creo el proximo intento';
  end if;

  perform public.complete_contact_task((
    select id from public.tasks
    where lead_id = attempt_lead.id and type = 'contact' and status = 'pendiente'
    limit 1
  ), 'respondio', 'Respondio en segunda llamada');

  if (select status from public.leads where id = attempt_lead.id) <> 'Contactado'
     or exists (
       select 1 from public.tasks
       where lead_id = attempt_lead.id and type = 'contact'
         and status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
     ) then
    raise exception 'respondio no marco lead Contactado o dejo contacto abierto';
  end if;

  perform public.record_whatsapp_opened(attempt_lead.id, 'first_contact');
  if not exists (
    select 1 from public.lead_events
    where lead_id = attempt_lead.id and event_type = 'whatsapp_opened'
  ) then
    raise exception 'record_whatsapp_opened no creo evento';
  end if;

  perform public.mark_lead_lost(
    '00000000-0000-0000-0000-000000000203',
    'Otro',
    'Transactional RLS test',
    true
  );

  if not exists (
    select 1 from public.leads
    where id = '00000000-0000-0000-0000-000000000203' and is_archived
  ) then
    raise exception 'Owner no pudo archivar';
  end if;

  select * into scheduled
  from public.schedule_lead_appointment(
    '00000000-0000-0000-0000-000000000201',
    (now() at time zone 'America/Asuncion')::date + 2,
    time '10:00',
    'Dra. RPC QA',
    'Implante dental',
    'Transactional RPC test',
    null
  );

  if scheduled.id is null or scheduled.status <> 'Agendado' then
    raise exception 'schedule_lead_appointment no creo turno activo';
  end if;

  begin
    perform public.schedule_lead_appointment(
      '00000000-0000-0000-0000-000000000202',
      scheduled.appointment_date,
      scheduled.appointment_time,
      scheduled.doctor_assigned,
      'Ortodoncia',
      'Double booking test',
      null
    );
  exception when others then
    if sqlerrm like '%Ese horario ya esta ocupado para este doctor.%'
       or sqlerrm like '%Ese horario ya está ocupado para este doctor.%'
       or sqlerrm like '%Ese horario ya está ocupado para ese profesional%' then
      booking_blocked := true;
    else
      raise;
    end if;
  end;

  if not booking_blocked then
    raise exception 'La doble reserva no fue bloqueada';
  end if;

  begin
    perform public.update_appointment_outcome(scheduled.id, 'No Asistió', null, null, null);
  exception when sqlstate '22023' then
    early_no_show_blocked := true;
  end;

  if not early_no_show_blocked then
    raise exception 'Una cita futura pudo marcarse como No Asistió';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$
declare
  archived_blocked boolean := false;
  direct_appointment_blocked boolean := false;
  scheduled public.appointments;
  confirmed public.appointments;
  templates_updated integer := 0;
begin
  if exists (select 1 from public.leads where clinic_id <> '00000000-0000-0000-0000-000000000101') then
    raise exception 'Receptionist ve leads cross-clinic';
  end if;
  if exists (select 1 from public.clinic_public_forms) then
    raise exception 'Receptionist ve public forms';
  end if;
  if exists (select 1 from public.audit_logs) then
    raise exception 'Receptionist ve audit logs';
  end if;
  if not exists (
    select 1 from public.message_templates
    where clinic_id = '00000000-0000-0000-0000-000000000101'
  ) or exists (
    select 1 from public.message_templates
    where clinic_id <> '00000000-0000-0000-0000-000000000101'
  ) then
    raise exception 'Receptionist no puede usar plantillas de su clinica o ve plantillas cross-clinic';
  end if;

  update public.message_templates
  set message = 'No debe guardar'
  where template_key = 'first_contact';
  get diagnostics templates_updated = row_count;
  if templates_updated <> 0 then
    raise exception 'Receptionist pudo editar plantillas';
  end if;

  begin
    update public.leads
    set is_archived = true,
        archived_at = now(),
        archived_by = auth.uid(),
        archived_reason = 'Must fail'
    where id = '00000000-0000-0000-0000-000000000202';
  exception when sqlstate '42501' then
    archived_blocked := true;
  end;

  if not archived_blocked then
    raise exception 'Receptionist pudo archivar';
  end if;

  begin
    insert into public.appointments (
      clinic_id, lead_id, appointment_date, appointment_time, doctor_assigned, status
    ) values (
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000202',
      (now() at time zone 'America/Asuncion')::date + 3,
      time '15:00', 'Dra. Direct QA', 'Agendado'
    );
  exception when sqlstate '42501' then
    direct_appointment_blocked := true;
  end;

  if not direct_appointment_blocked then
    raise exception 'Receptionist pudo insertar appointment directo';
  end if;

  update public.leads
  set notes = 'Edicion permitida por RLS test',
      contact_attempts = contact_attempts + 1
  where id = '00000000-0000-0000-0000-000000000202';

  perform public.save_lead_followup(
    '00000000-0000-0000-0000-000000000202',
    'Contactado',
    'Hacer seguimiento desde recepción',
    now() + interval '1 day'
  );

  if not exists (
    select 1 from public.tasks
    where lead_id = '00000000-0000-0000-0000-000000000202'
      and type = 'followup' and status = 'pendiente'
  ) then
    raise exception 'Receptionist no pudo guardar seguimiento atomico';
  end if;

  select * into scheduled
  from public.schedule_lead_appointment(
    '00000000-0000-0000-0000-000000000202',
    (now() at time zone 'America/Asuncion')::date + 3,
    time '15:00',
    'Dra. RPC Reception QA',
    'Ortodoncia',
    'Receptionist RPC test',
    null
  );

  select * into confirmed
  from public.update_appointment_outcome(scheduled.id, 'Confirmado', null, null, null);

  if confirmed.status <> 'Confirmado'
     or exists (
       select 1 from public.tasks
       where lead_id = scheduled.lead_id and type = 'confirm'
         and status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
     )
     or not exists (
       select 1 from public.tasks
       where lead_id = scheduled.lead_id and type = 'attendance' and status = 'pendiente'
     ) then
    raise exception 'Confirmar cita no cerro confirmacion o no creo registro de asistencia';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;

do $$
declare
  cross_clinic_followup_blocked boolean := false;
begin
  if (select count(*) from public.clinics) <> 1 then
    raise exception 'QA B owner no ve exactamente una clinica';
  end if;
  if exists (select 1 from public.leads where clinic_id <> '00000000-0000-0000-0000-000000000102') then
    raise exception 'QA B owner ve DentalPro';
  end if;
  if exists (
    select 1 from public.message_templates
    where clinic_id <> '00000000-0000-0000-0000-000000000102'
  ) then
    raise exception 'QA B owner ve plantillas de DentalPro';
  end if;

  begin
    perform public.save_lead_followup(
      '00000000-0000-0000-0000-000000000201',
      'Contactado',
      'Debe fallar cross-clinic',
      now() + interval '1 day'
    );
  exception when sqlstate '42501' then
    cross_clinic_followup_blocked := true;
  end;

  if not cross_clinic_followup_blocked then
    raise exception 'QA B pudo modificar seguimiento de DentalPro';
  end if;
end
$$;

reset role;
rollback;

select 'PASS' as result, 'rls_rpc_multiclinic_transactional' as test;
