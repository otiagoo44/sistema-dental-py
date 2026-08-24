-- End-to-end domain workflows for a disposable/local database.
-- All fixtures and mutations are rolled back.
begin;

insert into public.clinics (id, name, slug)
values ('e1000000-0000-0000-0000-000000000001', 'Workflow QA', 'workflow-qa');

insert into auth.users (id, email, role, aud)
values
  ('e2000000-0000-0000-0000-000000000001', 'workflow-reception@example.test', 'authenticated', 'authenticated'),
  ('e2000000-0000-0000-0000-000000000002', 'workflow-owner@example.test', 'authenticated', 'authenticated');

insert into public.profiles (id, clinic_id, full_name, email, role, active)
values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Recepción Workflow QA', 'workflow-reception@example.test', 'receptionist', true),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'Owner Workflow QA', 'workflow-owner@example.test', 'owner', true);

insert into public.clinic_public_forms (
  id, clinic_id, clinic_slug, public_token, allowed_origins, is_active
) values (
  'e3000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  'workflow-qa',
  'lf_workflow_qa_0123456789abcdef012345',
  array['https://qa.example.test'],
  true
);

create or replace function pg_temp.assert_open_tasks(
  p_lead_id uuid,
  p_expected_count integer,
  p_expected_type text default null
)
returns void
language plpgsql
set search_path = ''
as $test$
declare
  actual_count integer;
begin
  select count(*)::integer into actual_count
  from public.tasks t
  where t.lead_id = p_lead_id
    and lower(t.status) in ('pendiente', 'vencido', 'vencida');

  if actual_count <> p_expected_count then
    raise exception 'Expected % open tasks for %, got %', p_expected_count, p_lead_id, actual_count;
  end if;

  if p_expected_type is not null and not exists (
    select 1 from public.tasks t
    where t.lead_id = p_lead_id
      and t.type = p_expected_type
      and lower(t.status) in ('pendiente', 'vencido', 'vencida')
  ) then
    raise exception 'Expected open task type % for %', p_expected_type, p_lead_id;
  end if;
end;
$test$;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

select public.create_public_lead_intake(
  'e3000000-0000-0000-0000-000000000001',
  'workflow-qa',
  'lf_workflow_qa_0123456789abcdef012345',
  'Paciente A flujo completo',
  '0981111101',
  '+595981111101',
  'Implante dental',
  'Hoy',
  95,
  'Lead Caliente',
  'Quiere agendar',
  'No',
  'Flujo completo QA',
  5000000,
  'Responder nueva consulta',
  now(),
  'https://wa.me/595981111101',
  'Formulario QA',
  'qa',
  'Dato sintético',
  now(),
  'workflow-ip-a',
  'workflow-phone-a'
);

reset role;

do $test$
declare
  lead_record public.leads;
begin
  select * into lead_record from public.leads where phone_plus = '+595981111101';
  if lead_record.status <> 'Nuevo'
     or lead_record.assigned_to <> 'e2000000-0000-0000-0000-000000000001'
     or lead_record.next_action is null
     or lead_record.next_followup_at is null
     or not exists (select 1 from public.lead_events where lead_id = lead_record.id and event_type = 'lead_created_from_landing')
     or not exists (select 1 from public.audit_logs where row_id = lead_record.id and action = 'lead_created_from_landing') then
    raise exception 'Flow A intake state is inconsistent';
  end if;
  perform pg_temp.assert_open_tasks(lead_record.id, 1, 'contact');
end;
$test$;

select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $test$
declare
  flow_lead_id uuid;
  appointment_one public.appointments;
  appointment_duplicate public.appointments;
  quote_one public.quotes;
  quote_duplicate public.quotes;
  quote_alternative public.quotes;
begin
  select id into flow_lead_id from public.leads where phone_plus = '+595981111101';

  perform public.register_lead_outcome(flow_lead_id, 'responded', 'Respondió en QA', now() + interval '1 day');
  if (select status from public.leads where id = flow_lead_id) <> 'Contactado' then
    raise exception 'Flow A responded did not contact lead';
  end if;
  perform pg_temp.assert_open_tasks(flow_lead_id, 1, 'followup');

  select * into appointment_one
  from public.schedule_lead_appointment(
    flow_lead_id,
    (now() at time zone 'America/Asuncion')::date + 2,
    time '15:00',
    'Dra. Workflow',
    'Implante dental',
    'Cita QA',
    null
  );
  perform pg_temp.assert_open_tasks(flow_lead_id, 1, 'confirm');
  if (select status from public.leads where id = flow_lead_id) <> 'Consulta Agendada' then
    raise exception 'Flow A schedule did not advance lead';
  end if;

  select * into appointment_duplicate
  from public.schedule_lead_appointment(
    flow_lead_id,
    (now() at time zone 'America/Asuncion')::date + 2,
    time '15:00',
    'Dra. Workflow',
    'Implante dental',
    'Cita QA',
    null
  );
  if appointment_duplicate.id <> appointment_one.id
     or appointment_duplicate.status <> 'Agendado'
     or (select count(*) from public.appointments a where a.lead_id = flow_lead_id) <> 1 then
    raise exception 'Flow A double schedule was not idempotent';
  end if;

  perform public.update_appointment_outcome(appointment_one.id, 'Confirmado', null, null, null);
  perform pg_temp.assert_open_tasks(flow_lead_id, 1, 'attendance');
  if (select status from public.leads where id = flow_lead_id) <> 'Confirmado' then
    raise exception 'Flow A confirmation did not advance lead';
  end if;

  reset role;
  update public.appointments
  set appointment_date = (now() at time zone 'America/Asuncion')::date - 1
  where id = appointment_one.id;
  set local role authenticated;

  perform public.update_appointment_outcome(appointment_one.id, 'Asistió', null, null, null);
  perform pg_temp.assert_open_tasks(flow_lead_id, 1, 'quote_registration');
  if (select status from public.leads where id = flow_lead_id) <> 'Asistió' then
    raise exception 'Flow A attendance did not advance lead';
  end if;

  select * into quote_one
  from public.create_treatment_quote(
    flow_lead_id, appointment_one.id, 'Implante dental', 8500000, 'PYG',
    'Dra. Workflow', now() + interval '2 days', 'Presupuesto QA'
  );
  perform pg_temp.assert_open_tasks(flow_lead_id, 1, 'quote_followup');

  select * into quote_duplicate
  from public.create_treatment_quote(
    flow_lead_id, appointment_one.id, 'Implante dental', 8500000, 'PYG',
    'Dra. Workflow', now() + interval '2 days', 'Presupuesto QA'
  );
  if quote_duplicate.id <> quote_one.id
     or (select count(*) from public.quotes q where q.lead_id = flow_lead_id) <> 1 then
    raise exception 'Flow A double quote was not idempotent';
  end if;

  select * into quote_alternative
  from public.create_treatment_quote(
    flow_lead_id, appointment_one.id, 'Alternativa de implante', 7800000, 'PYG',
    'Dra. Workflow', now() + interval '3 days', 'Alternativa QA'
  );

  perform public.set_treatment_quote_status(quote_one.id, 'accepted', null, 'Aceptado QA');
  perform pg_temp.assert_open_tasks(flow_lead_id, 2, 'treatment_start');
  if (select status from public.quotes where id = quote_one.id) <> 'accepted'
     or (select accepted_at from public.quotes where id = quote_one.id) is null
     or (select status from public.quotes where id = quote_alternative.id) <> 'pending'
     or not exists (
       select 1 from public.tasks
       where lead_id = flow_lead_id
         and quote_id = quote_alternative.id
         and type = 'quote_followup'
         and lower(status) in ('pendiente', 'vencido', 'vencida')
     ) then
    raise exception 'Flow A quote acceptance is inconsistent';
  end if;

  perform public.register_lead_outcome(flow_lead_id, 'treatment_started', 'Inició QA', null);
  perform pg_temp.assert_open_tasks(flow_lead_id, 0, null);
  if (select status from public.leads where id = flow_lead_id) <> 'Tratamiento Iniciado'
     or (select next_action from public.leads where id = flow_lead_id) is not null
     or (select next_followup_at from public.leads where id = flow_lead_id) is not null then
    raise exception 'Flow A terminal state left commercial work open';
  end if;
end;
$test$;

reset role;

-- Flow B: repeated no response attempts keep one canonical task.
insert into public.leads (
  id, clinic_id, name, phone, phone_plus, treatment, status, assigned_to,
  next_action, next_followup_at, consent_contact, consent_at, source
) values (
  'e4000000-0000-0000-0000-000000000002',
  'e1000000-0000-0000-0000-000000000001',
  'Paciente B no responde', '0981111102', '+595981111102', 'Ortodoncia',
  'Nuevo', 'e2000000-0000-0000-0000-000000000001',
  'Responder nueva consulta', now(), true, now(), 'QA'
);
insert into public.tasks (
  clinic_id, lead_id, title, type, priority, status, due_at, assigned_to, created_by
) values (
  'e1000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000002',
  'Responder nueva consulta', 'contact', 'alta', 'pendiente', now(),
  'e2000000-0000-0000-0000-000000000001',
  'e2000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select public.register_lead_outcome(
  'e4000000-0000-0000-0000-000000000002', 'no_response', 'Intento 1', now() + interval '1 day'
);
select public.register_lead_outcome(
  'e4000000-0000-0000-0000-000000000002', 'no_response', 'Doble clic', now() + interval '1 day'
);
reset role;

do $test$
begin
  if (select contact_attempts from public.leads where id = 'e4000000-0000-0000-0000-000000000002') <> 1 then
    raise exception 'Flow B double click incremented contact attempts';
  end if;
  perform pg_temp.assert_open_tasks('e4000000-0000-0000-0000-000000000002', 1, 'contact');
end;
$test$;

update public.lead_events
set created_at = now() - interval '1 minute'
where lead_id = 'e4000000-0000-0000-0000-000000000002'
  and event_type = 'contact_attempted';

set local role authenticated;
select public.register_lead_outcome(
  'e4000000-0000-0000-0000-000000000002', 'no_response', 'Intento 2', now() + interval '3 days'
);
reset role;
update public.lead_events
set created_at = now() - interval '1 minute'
where lead_id = 'e4000000-0000-0000-0000-000000000002'
  and event_type = 'contact_attempted';
set local role authenticated;
select public.register_lead_outcome(
  'e4000000-0000-0000-0000-000000000002', 'responded', 'Respondió', now() + interval '4 days'
);
reset role;

do $test$
begin
  if (select contact_attempts from public.leads where id = 'e4000000-0000-0000-0000-000000000002') <> 3
     or (select status from public.leads where id = 'e4000000-0000-0000-0000-000000000002') <> 'Contactado'
     or (select first_contacted_at from public.leads where id = 'e4000000-0000-0000-0000-000000000002') is null then
    raise exception 'Flow B attempts or final response state is inconsistent';
  end if;
  perform pg_temp.assert_open_tasks('e4000000-0000-0000-0000-000000000002', 1, 'followup');
end;
$test$;

-- Flow C: no-show history survives recovery and reprogramming.
insert into public.leads (
  id, clinic_id, name, phone, phone_plus, treatment, status, assigned_to,
  next_action, next_followup_at, consent_contact, consent_at, source
) values (
  'e4000000-0000-0000-0000-000000000003',
  'e1000000-0000-0000-0000-000000000001',
  'Paciente C no-show', '0981111103', '+595981111103', 'Limpieza',
  'Confirmado', 'e2000000-0000-0000-0000-000000000001',
  'Registrar asistencia', now() - interval '1 day', true, now(), 'QA'
);
insert into public.appointments (
  id, clinic_id, lead_id, appointment_date, appointment_time,
  doctor_assigned, treatment_scheduled, status, confirmed_at
) values (
  'e5000000-0000-0000-0000-000000000003',
  'e1000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000003',
  (now() at time zone 'America/Asuncion')::date - 1,
  time '10:00', 'Dra. Workflow', 'Limpieza', 'Confirmado', now() - interval '2 days'
);
insert into public.tasks (
  clinic_id, lead_id, title, type, priority, status, due_at, assigned_to, created_by
) values (
  'e1000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000003',
  'Registrar asistencia', 'attendance', 'media', 'pendiente', now() - interval '1 day',
  'e2000000-0000-0000-0000-000000000001',
  'e2000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select public.update_appointment_outcome('e5000000-0000-0000-0000-000000000003', 'No Asistió', null, null, null);
select public.schedule_lead_appointment(
  'e4000000-0000-0000-0000-000000000003',
  (now() at time zone 'America/Asuncion')::date + 2,
  time '10:30', 'Dra. Workflow', 'Limpieza', 'Recuperación QA',
  'e5000000-0000-0000-0000-000000000003'
);
reset role;

do $test$
declare
  new_appointment public.appointments;
begin
  select * into new_appointment
  from public.appointments
  where lead_id = 'e4000000-0000-0000-0000-000000000003'
    and id <> 'e5000000-0000-0000-0000-000000000003';

  if (select status from public.appointments where id = 'e5000000-0000-0000-0000-000000000003') <> 'No Asistió'
     or new_appointment.id is null
     or new_appointment.status <> 'Reprogramado'
     or (select count(*) from public.appointments where lead_id = 'e4000000-0000-0000-0000-000000000003') <> 2 then
    raise exception 'Flow C did not preserve no-show and create a distinct appointment';
  end if;
  perform pg_temp.assert_open_tasks('e4000000-0000-0000-0000-000000000003', 1, 'confirm');
end;
$test$;

update public.appointments
set appointment_date = (now() at time zone 'America/Asuncion')::date - 1
where lead_id = 'e4000000-0000-0000-0000-000000000003'
  and id <> 'e5000000-0000-0000-0000-000000000003';

set local role authenticated;
select public.update_appointment_outcome(
  (
    select id from public.appointments
    where lead_id = 'e4000000-0000-0000-0000-000000000003'
      and id <> 'e5000000-0000-0000-0000-000000000003'
  ),
  'Asistió', null, null, null
);
reset role;

do $test$
begin
  if (select status from public.appointments where id = 'e5000000-0000-0000-0000-000000000003') <> 'No Asistió'
     or not exists (
       select 1 from public.appointments
       where lead_id = 'e4000000-0000-0000-0000-000000000003'
         and id <> 'e5000000-0000-0000-0000-000000000003'
         and status = 'Asistió'
     ) then
    raise exception 'Flow C recovery lost no-show history or did not register attendance';
  end if;
  perform pg_temp.assert_open_tasks('e4000000-0000-0000-0000-000000000003', 1, 'quote_registration');
end;
$test$;

-- Flow D/E: multiple real quotes, rejection and acceptance remain distinct.
insert into public.leads (
  id, clinic_id, name, phone, phone_plus, treatment, status, assigned_to,
  next_action, next_followup_at, estimated_value, consent_contact, consent_at, source
) values (
  'e4000000-0000-0000-0000-000000000004',
  'e1000000-0000-0000-0000-000000000001',
  'Paciente D presupuestos', '0981111104', '+595981111104', 'Implante dental',
  'Asistió', 'e2000000-0000-0000-0000-000000000001',
  'Registrar presupuesto', now(), 5000000, true, now(), 'QA'
);

set local role authenticated;
do $test$
declare
  quote_a public.quotes;
  quote_b public.quotes;
begin
  select * into quote_a from public.create_treatment_quote(
    'e4000000-0000-0000-0000-000000000004', null,
    'Implante dental', 8500000, 'PYG', 'Dra. Workflow', now() + interval '1 day', null
  );
  select * into quote_b from public.create_treatment_quote(
    'e4000000-0000-0000-0000-000000000004', null,
    'Ortodoncia', 12000000, 'PYG', 'Dra. Workflow', now() + interval '2 days', null
  );

  perform public.set_treatment_quote_status(quote_b.id, 'rejected', 'Precio', 'Rechazado QA');
  perform pg_temp.assert_open_tasks('e4000000-0000-0000-0000-000000000004', 1, 'quote_followup');
  if (select quote_id from public.tasks where lead_id = quote_a.lead_id and type = 'quote_followup' and status = 'pendiente') <> quote_a.id then
    raise exception 'Flow D/E rejection did not keep the remaining quote canonical';
  end if;

  perform public.set_treatment_quote_status(quote_a.id, 'accepted', null, 'Aceptado QA');
  perform pg_temp.assert_open_tasks('e4000000-0000-0000-0000-000000000004', 1, 'treatment_start');

  if (select count(*) from public.quotes where lead_id = quote_a.lead_id) <> 2
     or (select status from public.quotes where id = quote_a.id) <> 'accepted'
     or (select accepted_at from public.quotes where id = quote_a.id) is null
     or (select status from public.quotes where id = quote_b.id) <> 'rejected'
     or (select rejected_at from public.quotes where id = quote_b.id) is null
     or (select rejection_reason from public.quotes where id = quote_b.id) <> 'Precio'
     or (select estimated_value from public.leads where id = quote_a.lead_id) <> 5000000 then
    raise exception 'Flow D/E quote history, dates, reason or estimate separation is inconsistent';
  end if;
end;
$test$;

reset role;

-- Flow E alone: rejecting the only quote requires a reason and creates a
-- decision follow-up; it must not silently mark the opportunity as lost.
insert into public.leads (
  id, clinic_id, name, phone, phone_plus, treatment, status, assigned_to,
  next_action, next_followup_at, consent_contact, consent_at, source
) values (
  'e4000000-0000-0000-0000-000000000005',
  'e1000000-0000-0000-0000-000000000001',
  'Paciente E rechazo', '0981111105', '+595981111105', 'Ortodoncia',
  'Asistió', 'e2000000-0000-0000-0000-000000000001',
  'Registrar presupuesto', now(), true, now(), 'QA'
);

set local role authenticated;
do $test$
declare
  rejected_quote public.quotes;
begin
  select * into rejected_quote from public.create_treatment_quote(
    'e4000000-0000-0000-0000-000000000005', null,
    'Ortodoncia', 12000000, 'PYG', 'Dra. Workflow', now() + interval '1 day', null
  );
  perform public.set_treatment_quote_status(rejected_quote.id, 'rejected', 'Precio', 'Rechazo QA');

  if (select status from public.leads where id = rejected_quote.lead_id) <> 'Presupuesto Enviado'
     or (select status from public.quotes where id = rejected_quote.id) <> 'rejected'
     or (select rejected_at from public.quotes where id = rejected_quote.id) is null
     or (select rejection_reason from public.quotes where id = rejected_quote.id) <> 'Precio' then
    raise exception 'Flow E rejection changed the lead terminally or lost quote facts';
  end if;
  perform pg_temp.assert_open_tasks(rejected_quote.lead_id, 1, 'decision_followup');
end;
$test$;
reset role;

-- Flow F/G: lost and archived opportunities preserve history but close pending
-- quotes, mirrored next actions and all commercial tasks.
insert into public.leads (
  id, clinic_id, name, phone, phone_plus, treatment, status, assigned_to,
  next_action, next_followup_at, consent_contact, consent_at, source
) values
  (
    'e4000000-0000-0000-0000-000000000006',
    'e1000000-0000-0000-0000-000000000001',
    'Paciente F no continúa', '0981111106', '+595981111106', 'Implante dental',
    'Asistió', 'e2000000-0000-0000-0000-000000000001',
    'Registrar presupuesto', now(), true, now(), 'QA'
  ),
  (
    'e4000000-0000-0000-0000-000000000007',
    'e1000000-0000-0000-0000-000000000001',
    'Paciente G archivado', '0981111107', '+595981111107', 'Ortodoncia',
    'Asistió', 'e2000000-0000-0000-0000-000000000001',
    'Registrar presupuesto', now(), true, now(), 'QA'
  );

select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select public.create_treatment_quote(
  'e4000000-0000-0000-0000-000000000006', null,
  'Implante dental', 8500000, 'PYG', 'Dra. Workflow', now() + interval '1 day', null
);
select public.create_treatment_quote(
  'e4000000-0000-0000-0000-000000000007', null,
  'Ortodoncia', 12000000, 'PYG', 'Dra. Workflow', now() + interval '1 day', null
);
select public.mark_lead_lost(
  'e4000000-0000-0000-0000-000000000006', 'Precio', 'No continúa en QA', false
);
reset role;

select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select public.mark_lead_lost(
  'e4000000-0000-0000-0000-000000000007', 'Otro', 'Archivo QA', true
);
reset role;

do $test$
begin
  if (select status from public.leads where id = 'e4000000-0000-0000-0000-000000000006') <> 'Perdido'
     or (select status from public.leads where id = 'e4000000-0000-0000-0000-000000000007') <> 'Archivado'
     or (select is_archived from public.leads where id = 'e4000000-0000-0000-0000-000000000007') is not true
     or exists (
       select 1 from public.leads
       where id in ('e4000000-0000-0000-0000-000000000006', 'e4000000-0000-0000-0000-000000000007')
         and (next_action is not null or next_followup_at is not null)
     )
     or (select count(*) from public.quotes where lead_id in ('e4000000-0000-0000-0000-000000000006', 'e4000000-0000-0000-0000-000000000007')) <> 2
     or exists (
       select 1 from public.quotes
       where lead_id in ('e4000000-0000-0000-0000-000000000006', 'e4000000-0000-0000-0000-000000000007')
         and status <> 'cancelled'
     ) then
    raise exception 'Flow F/G terminal cleanup or quote history is inconsistent';
  end if;
  perform pg_temp.assert_open_tasks('e4000000-0000-0000-0000-000000000006', 0, null);
  perform pg_temp.assert_open_tasks('e4000000-0000-0000-0000-000000000007', 0, null);
end;
$test$;

select 'PASS' as result, 'operational_workflows_e2e' as test;
rollback;
