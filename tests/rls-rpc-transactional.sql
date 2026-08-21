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
  no_show public.appointments;
  recovery_task public.tasks;
  booking_blocked boolean := false;
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

  update public.leads
  set is_archived = true,
      archived_at = now(),
      archived_by = auth.uid(),
      archived_reason = 'Transactional RLS test',
      status = 'Archivado'
  where id = '00000000-0000-0000-0000-000000000203';

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
       or sqlerrm like '%Ese horario ya está ocupado para este doctor.%' then
      booking_blocked := true;
    else
      raise;
    end if;
  end;

  if not booking_blocked then
    raise exception 'La doble reserva no fue bloqueada';
  end if;

  select * into no_show
  from public.update_appointment_outcome(scheduled.id, 'No Asistió', null, null, null);

  if no_show.status <> 'No Asistió' then
    raise exception 'update_appointment_outcome no guardo No Asistio';
  end if;

  if not exists (
    select 1
    from public.leads
    where id = scheduled.lead_id
      and status = 'No Asistió'
      and (next_followup_at at time zone 'America/Asuncion')::date
        = (now() at time zone 'America/Asuncion')::date + 1
      and (next_followup_at at time zone 'America/Asuncion')::time = time '09:00'
  ) then
    raise exception 'No-show no dejo seguimiento manana 09:00 America/Asuncion';
  end if;

  select * into recovery_task
  from public.complete_task((
    select id from public.tasks
    where lead_id = scheduled.lead_id
      and type = 'no_show_recovery'
      and status = 'pendiente'
    limit 1
  ));

  if recovery_task.status <> 'hecho' or recovery_task.completed_at is null then
    raise exception 'complete_task no completo la tarea';
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
  completed public.tasks;
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

  select * into completed
  from public.complete_task((
    select id from public.tasks
    where lead_id = scheduled.lead_id and type = 'confirm' and status = 'pendiente'
    limit 1
  ));

  if completed.status <> 'hecho' then
    raise exception 'Receptionist no pudo completar task por RPC';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.clinics) <> 1 then
    raise exception 'QA B owner no ve exactamente una clinica';
  end if;
  if exists (select 1 from public.leads where clinic_id <> '00000000-0000-0000-0000-000000000102') then
    raise exception 'QA B owner ve DentalPro';
  end if;
end
$$;

reset role;
rollback;

select 'PASS' as result, 'rls_rpc_multiclinic_transactional' as test;
