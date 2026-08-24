-- RLS/RPC usando los UUID Auth QA permanentes del proyecto nuevo.
-- Todo cambio operativo se revierte al final; los profiles existentes no se modifican.

begin;

select set_config('request.jwt.claim.sub', 'd5a7314e-f4ee-4850-bd04-3fa0c3d961b5', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  manual_lead public.leads;
begin
  if (select count(*) from public.clinics) <> 1 then
    raise exception 'DentalPro owner no ve exactamente una clinica';
  end if;
  if exists (select 1 from public.leads where clinic_id <> '00000000-0000-0000-0000-000000000101') then
    raise exception 'DentalPro owner ve datos cross-clinic';
  end if;
  if (select count(*) from public.clinic_public_forms) <> 1 then
    raise exception 'DentalPro owner no ve exactamente su public form';
  end if;

  select * into manual_lead
  from public.create_manual_lead(
    'QA Manual Owner', '0981000991', '+595981000991',
    'Implante dental', 'Hoy', 'QA de lead manual owner',
    'WhatsApp directo', true, 'Dato sintetico con rollback',
    'Contactar inmediatamente', now() + interval '1 hour',
    'd5a7314e-f4ee-4850-bd04-3fa0c3d961b5',
    'Lead Caliente', 90, 'Quiere agendar', 'No', 5000000
  );

  if manual_lead.clinic_id <> '00000000-0000-0000-0000-000000000101'
     or manual_lead.source <> 'WhatsApp directo'
     or manual_lead.assigned_to <> 'd5a7314e-f4ee-4850-bd04-3fa0c3d961b5'
     or manual_lead.consent_contact is not true then
    raise exception 'Owner creo lead manual con datos o clinica incorrectos';
  end if;

  if not exists (
    select 1 from public.lead_events
    where lead_id = manual_lead.id and event_type = 'lead_created_manual'
  ) or not exists (
    select 1 from public.tasks
    where lead_id = manual_lead.id and type = 'contact' and status = 'pendiente'
  ) then
    raise exception 'Lead manual owner no creo event y task';
  end if;

  perform public.mark_lead_lost(
    '00000000-0000-0000-0000-000000000203',
    'Otro',
    'RLS real-user test',
    true
  );

  if not exists (
    select 1 from public.leads
    where id = '00000000-0000-0000-0000-000000000203' and is_archived
  ) then
    raise exception 'DentalPro owner no pudo archivar';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '326288c0-f3db-463b-997f-1538d41d71c0', true);
set local role authenticated;

do $$
declare
  archive_blocked boolean := false;
  direct_appointment_blocked boolean := false;
  direct_lead_blocked boolean := false;
  wrong_assignee_blocked boolean := false;
  scheduled public.appointments;
  confirmed public.appointments;
  manual_lead public.leads;
begin
  if exists (select 1 from public.leads where clinic_id <> '00000000-0000-0000-0000-000000000101') then
    raise exception 'DentalPro receptionist ve datos cross-clinic';
  end if;
  if exists (select 1 from public.clinic_public_forms) then
    raise exception 'DentalPro receptionist ve public forms';
  end if;
  if exists (select 1 from public.audit_logs) then
    raise exception 'DentalPro receptionist ve audit logs';
  end if;

  begin
    update public.leads
    set is_archived = true,
        archived_at = now(),
        archived_by = auth.uid(),
        archived_reason = 'Must fail'
    where id = '00000000-0000-0000-0000-000000000202';
  exception when sqlstate '42501' then
    archive_blocked := true;
  end;

  if not archive_blocked then
    raise exception 'Receptionist pudo archivar';
  end if;

  begin
    insert into public.leads (clinic_id, name, phone_plus, source)
    values (
      '00000000-0000-0000-0000-000000000101',
      'Must fail direct receptionist',
      '+595981000992',
      'WhatsApp directo'
    );
  exception when sqlstate '42501' then
    direct_lead_blocked := true;
  end;

  if not direct_lead_blocked then
    raise exception 'Receptionist pudo insertar lead directo sin RPC';
  end if;

  begin
    perform public.create_manual_lead(
      'Must fail cross clinic assignee', '0981000993', '+595981000993',
      'Ortodoncia', 'Esta semana', 'QA responsable cross-clinic',
      'Instagram DM', false, 'Dato sintetico con rollback',
      'Contactar hoy', now() + interval '1 day',
      '22d78b7a-38d1-4fc8-a0d8-945f44f4ca80',
      'Lead Medio', 50, 'Consulta directa', 'No', 4000000
    );
  exception when sqlstate '42501' then
    wrong_assignee_blocked := true;
  end;

  if not wrong_assignee_blocked then
    raise exception 'Receptionist asigno lead a usuario de otra clinica';
  end if;

  select * into manual_lead
  from public.create_manual_lead(
    'QA Manual Receptionist', '0981000994', '+595981000994',
    'Ortodoncia', 'Esta semana', 'QA de lead manual receptionist',
    'Instagram DM', true, 'Dato sintetico con rollback',
    'Contactar hoy', now() + interval '1 day',
    '326288c0-f3db-463b-997f-1538d41d71c0',
    'Lead Medio', 55, 'Consulta directa', 'No', 4000000
  );

  if manual_lead.clinic_id <> '00000000-0000-0000-0000-000000000101'
     or manual_lead.assigned_to <> '326288c0-f3db-463b-997f-1538d41d71c0' then
    raise exception 'Receptionist creo lead manual con clinica o responsable incorrectos';
  end if;

  if not exists (
    select 1 from public.lead_events
    where lead_id = manual_lead.id and event_type = 'lead_created_manual'
  ) or not exists (
    select 1 from public.tasks
    where lead_id = manual_lead.id
      and clinic_id = manual_lead.clinic_id
      and assigned_to = '326288c0-f3db-463b-997f-1538d41d71c0'
      and type = 'contact'
      and status = 'pendiente'
  ) then
    raise exception 'Lead manual receptionist no creo event y task correctos';
  end if;

  begin
    insert into public.appointments (
      clinic_id, lead_id, appointment_date, appointment_time, doctor_assigned, status
    ) values (
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000202',
      (now() at time zone 'America/Asuncion')::date + 4,
      time '16:00', 'Dra. Direct Real User QA', 'Agendado'
    );
  exception when sqlstate '42501' then
    direct_appointment_blocked := true;
  end;

  if not direct_appointment_blocked then
    raise exception 'Receptionist pudo insertar appointment directo';
  end if;

  select * into scheduled
  from public.schedule_lead_appointment(
    '00000000-0000-0000-0000-000000000202',
    (now() at time zone 'America/Asuncion')::date + 4,
    time '16:00',
    'Dra. RPC Real User QA',
    'Ortodoncia',
    'Real-user RLS test',
    null
  );

  if scheduled.id is null then
    raise exception 'Receptionist no pudo agendar por RPC';
  end if;

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
    raise exception 'Confirmar cita no sincronizo las acciones operativas';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '22d78b7a-38d1-4fc8-a0d8-945f44f4ca80', true);
set local role authenticated;

do $$
declare
  manual_lead public.leads;
begin
  if (select count(*) from public.clinics) <> 1 then
    raise exception 'QA Clinic B owner no ve exactamente una clinica';
  end if;
  if exists (select 1 from public.leads where clinic_id <> '00000000-0000-0000-0000-000000000102') then
    raise exception 'QA Clinic B owner ve DentalPro';
  end if;

  select * into manual_lead
  from public.create_manual_lead(
    'QA Manual Clinic B', '0982000991', '+595982000991',
    'Blanqueamiento', 'Este mes', 'QA de lead manual Clinic B',
    'Recomendación', false, 'Dato sintetico con rollback',
    'Contactar hoy', now() + interval '1 day',
    '22d78b7a-38d1-4fc8-a0d8-945f44f4ca80',
    'Lead Medio', 50, 'Consulta recomendada', 'No', 500000
  );

  if manual_lead.clinic_id <> '00000000-0000-0000-0000-000000000102'
     or exists (
       select 1 from public.leads
       where id = manual_lead.id
         and clinic_id <> '00000000-0000-0000-0000-000000000102'
     ) then
    raise exception 'QA Clinic B owner creo lead manual fuera de su clinica';
  end if;
end
$$;

reset role;
rollback;

select 'PASS' as result, 'rls_real_auth_users' as test;
