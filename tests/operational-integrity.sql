-- Contract checks for the additive operational-integrity migration.
-- Run against a disposable/local Supabase database after `supabase db reset`.
-- The transaction always rolls back and never commits business data.
begin;

do $test$
begin
  if to_regprocedure('public.create_public_lead_intake(uuid,text,text,text,text,text,text,text,integer,text,text,text,text,numeric,text,timestamp with time zone,text,text,text,text,timestamp with time zone,text,text)') is null then
    raise exception 'create_public_lead_intake RPC is missing';
  end if;
  if to_regprocedure('public.register_lead_outcome(uuid,text,text,timestamp with time zone)') is null then
    raise exception 'register_lead_outcome RPC is missing';
  end if;
  if to_regprocedure('public.update_appointment_outcome(uuid,text,date,time without time zone,text)') is null then
    raise exception 'update_appointment_outcome RPC is missing';
  end if;
  if to_regprocedure('public.create_treatment_quote(uuid,uuid,text,numeric,text,text,timestamp with time zone,text)') is null then
    raise exception 'create_treatment_quote RPC is missing';
  end if;
  if to_regclass('public.quotes') is null then
    raise exception 'quotes table is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'quotes_amount_positive_check' and conrelid = 'public.quotes'::regclass
  ) then
    raise exception 'positive quote amount constraint is missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'quotes_clinic_lead_fk' and conrelid = 'public.quotes'::regclass
  ) then
    raise exception 'same-clinic quote/lead FK is missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'quotes_clinic_lead_appointment_fk' and conrelid = 'public.quotes'::regclass
  ) then
    raise exception 'same-clinic quote/appointment FK is missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'quotes' and policyname = 'quotes_select_same_clinic'
  ) then
    raise exception 'quotes tenant-isolation RLS policy is missing';
  end if;
  if has_function_privilege('anon', 'public.create_public_lead_intake(uuid,text,text,text,text,text,text,text,integer,text,text,text,text,numeric,text,timestamp with time zone,text,text,text,text,timestamp with time zone,text,text)', 'EXECUTE') then
    raise exception 'anon must not execute public intake transaction RPC';
  end if;
  if not has_function_privilege('service_role', 'public.create_public_lead_intake(uuid,text,text,text,text,text,text,text,integer,text,text,text,text,numeric,text,timestamp with time zone,text,text,text,text,timestamp with time zone,text,text)', 'EXECUTE') then
    raise exception 'service_role must execute public intake transaction RPC';
  end if;
  if has_table_privilege('authenticated', 'public.quotes', 'INSERT') then
    raise exception 'authenticated users must write quotes through RPCs, not direct INSERT';
  end if;
end;
$test$;

insert into public.clinics (id, name, slug)
values
  ('f1000000-0000-0000-0000-000000000001', 'Operational QA A', 'operational-qa-a'),
  ('f1000000-0000-0000-0000-000000000002', 'Operational QA B', 'operational-qa-b');

insert into auth.users (id, email, role, aud)
values
  ('f2000000-0000-0000-0000-000000000001', 'operational-reception-a@example.test', 'authenticated', 'authenticated'),
  ('f2000000-0000-0000-0000-000000000002', 'operational-owner-a@example.test', 'authenticated', 'authenticated'),
  ('f2000000-0000-0000-0000-000000000003', 'operational-owner-b@example.test', 'authenticated', 'authenticated');

insert into public.profiles (id, clinic_id, full_name, email, role, active)
values
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Recepción QA A', 'operational-reception-a@example.test', 'receptionist', true),
  ('f2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 'Owner QA A', 'operational-owner-a@example.test', 'owner', true),
  ('f2000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000002', 'Owner QA B', 'operational-owner-b@example.test', 'owner', true);

insert into public.clinic_public_forms (
  id, clinic_id, clinic_slug, public_token, allowed_origins, is_active
) values (
  'f3000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000001',
  'operational-qa-a',
  'lf_operational_qa_a',
  array['https://qa.example.test'],
  true
);

insert into public.leads (
  id, clinic_id, name, phone, phone_plus, treatment, status, assigned_to,
  next_action, next_followup_at, consent_contact, consent_at, source
) values
  (
    'f4000000-0000-0000-0000-000000000001',
    'f1000000-0000-0000-0000-000000000001',
    'Paciente asistencia QA', '0981000001', '+595981000001', 'Implante dental',
    'Consulta Agendada', 'f2000000-0000-0000-0000-000000000001',
    'Registrar asistencia', now() - interval '1 day', true, now(), 'QA'
  ),
  (
    'f4000000-0000-0000-0000-000000000002',
    'f1000000-0000-0000-0000-000000000001',
    'Paciente no-show QA', '0981000002', '+595981000002', 'Ortodoncia',
    'Confirmado', 'f2000000-0000-0000-0000-000000000001',
    'Registrar asistencia', now() - interval '1 day', true, now(), 'QA'
  ),
  (
    'f4000000-0000-0000-0000-000000000003',
    'f1000000-0000-0000-0000-000000000001',
    'Paciente futuro QA', '0981000003', '+595981000003', 'Consulta general',
    'Contactado', 'f2000000-0000-0000-0000-000000000001',
    'Agendar', now() + interval '1 day', true, now(), 'QA'
  ),
  (
    'f4000000-0000-0000-0000-000000000004',
    'f1000000-0000-0000-0000-000000000002',
    'Paciente clínica B', '0982000001', '+595982000001', 'Consulta general',
    'Nuevo', 'f2000000-0000-0000-0000-000000000003',
    'Contactar', now() + interval '1 day', true, now(), 'QA'
  );

insert into public.appointments (
  id, clinic_id, lead_id, appointment_date, appointment_time,
  doctor_assigned, treatment_scheduled, status
) values
  (
    'f5000000-0000-0000-0000-000000000001',
    'f1000000-0000-0000-0000-000000000001',
    'f4000000-0000-0000-0000-000000000001',
    (now() at time zone 'America/Asuncion')::date - 1,
    time '09:00', 'Dra. QA asistencia', 'Implante dental', 'Agendado'
  ),
  (
    'f5000000-0000-0000-0000-000000000002',
    'f1000000-0000-0000-0000-000000000001',
    'f4000000-0000-0000-0000-000000000002',
    (now() at time zone 'America/Asuncion')::date - 1,
    time '10:00', 'Dra. QA no-show', 'Ortodoncia', 'Confirmado'
  );

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

do $test$
begin
  perform public.create_public_lead_intake(
    'f3000000-0000-0000-0000-000000000001',
    'operational-qa-a',
    'lf_operational_qa_a',
    'Paciente captación QA',
    '0981000099',
    '+595981000099',
    'Implante dental',
    'Hoy',
    90,
    'Lead Caliente',
    'Quiere agendar una consulta',
    'No',
    'Prueba transaccional',
    5000000,
    'Responder nueva consulta',
    now(),
    'https://wa.me/595981000099',
    'Formulario QA',
    'qa',
    'Dato sintético con rollback',
    now(),
    'hash-ip-qa',
    'hash-phone-qa'
  );
end;
$test$;

reset role;

do $test$
declare
  captured_lead public.leads;
begin
  select * into captured_lead
  from public.leads
  where clinic_id = 'f1000000-0000-0000-0000-000000000001'
    and phone_plus = '+595981000099';

  if captured_lead.id is null
     or captured_lead.assigned_to <> 'f2000000-0000-0000-0000-000000000001'
     or not exists (
       select 1 from public.tasks
       where lead_id = captured_lead.id and type = 'contact' and status = 'pendiente'
     )
     or not exists (
       select 1 from public.lead_events
       where lead_id = captured_lead.id and event_type = 'lead_created_from_landing'
     )
     or not exists (
       select 1 from public.audit_logs
       where row_id = captured_lead.id and action = 'lead_created_from_landing'
     )
     or not exists (
       select 1 from public.form_submission_logs
       where clinic_public_form_id = 'f3000000-0000-0000-0000-000000000001' and status = 'accepted'
     ) then
    raise exception 'Captación pública no creó lead, encargado, tarea, evento, auditoría y log de forma consistente';
  end if;
end;
$test$;

select set_config('request.jwt.claim.sub', 'f2000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $test$
declare
  captured_lead_id uuid;
  created_quote public.quotes;
  scheduled public.appointments;
  invalid_amount_blocked boolean := false;
  cross_clinic_quote_blocked boolean := false;
  future_attendance_blocked boolean := false;
  attended_regression_blocked boolean := false;
  no_show_regression_blocked boolean := false;
begin
  select id into captured_lead_id
  from public.leads
  where clinic_id = 'f1000000-0000-0000-0000-000000000001'
    and phone_plus = '+595981000099';

  begin
    perform public.create_treatment_quote(
      captured_lead_id, null, 'Implante dental', 0, 'PYG', null, now() + interval '1 day', null
    );
  exception when sqlstate '22023' then
    invalid_amount_blocked := true;
  end;

  begin
    perform public.create_treatment_quote(
      'f4000000-0000-0000-0000-000000000004', null,
      'Consulta general', 100000, 'PYG', null, now() + interval '1 day', null
    );
  exception when sqlstate '42501' then
    cross_clinic_quote_blocked := true;
  end;

  select * into created_quote
  from public.create_treatment_quote(
    captured_lead_id, null, 'Implante dental', 8500000, 'PYG',
    'Dra. QA', now() + interval '1 day', 'Presupuesto QA'
  );

  perform public.set_treatment_quote_status(created_quote.id, 'accepted', null, 'Aceptado en QA');

  perform public.update_appointment_outcome(
    'f5000000-0000-0000-0000-000000000001', 'Asistió', null, null, null
  );
  begin
    perform public.update_appointment_outcome(
      'f5000000-0000-0000-0000-000000000001', 'Confirmado', null, null, null
    );
  exception when sqlstate '22023' then
    attended_regression_blocked := true;
  end;

  perform public.update_appointment_outcome(
    'f5000000-0000-0000-0000-000000000002', 'No Asistió', null, null, null
  );
  begin
    perform public.update_appointment_outcome(
      'f5000000-0000-0000-0000-000000000002', 'Confirmado', null, null, null
    );
  exception when sqlstate '22023' then
    no_show_regression_blocked := true;
  end;

  select * into scheduled
  from public.schedule_lead_appointment(
    'f4000000-0000-0000-0000-000000000003',
    (now() at time zone 'America/Asuncion')::date + 2,
    time '15:00', 'Dra. QA futuro', 'Consulta general', 'QA futuro', null
  );

  begin
    perform public.update_appointment_outcome(scheduled.id, 'Asistió', null, null, null);
  exception when sqlstate '22023' then
    future_attendance_blocked := true;
  end;

  if not invalid_amount_blocked
     or not cross_clinic_quote_blocked
     or not future_attendance_blocked
     or not attended_regression_blocked
     or not no_show_regression_blocked then
    raise exception 'Una validación crítica de presupuesto, clínica o agenda no fue aplicada';
  end if;
end;
$test$;

reset role;

do $test$
declare
  captured_lead_id uuid;
begin
  select id into captured_lead_id
  from public.leads
  where clinic_id = 'f1000000-0000-0000-0000-000000000001'
    and phone_plus = '+595981000099';

  if not exists (
    select 1 from public.quotes
    where lead_id = captured_lead_id and amount = 8500000 and status = 'accepted'
  ) or not exists (
    select 1 from public.tasks
    where lead_id = captured_lead_id and type = 'treatment_start' and status = 'pendiente'
  ) or exists (
    select 1 from public.tasks
    where lead_id = captured_lead_id and type = 'quote_followup'
      and status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
  ) then
    raise exception 'Aceptar presupuesto no cerró seguimiento o no creó el siguiente paso';
  end if;

  if (select status from public.appointments where id = 'f5000000-0000-0000-0000-000000000001') <> 'Asistió'
     or (select status from public.appointments where id = 'f5000000-0000-0000-0000-000000000002') <> 'No Asistió'
     or not exists (
       select 1 from public.tasks
       where lead_id = 'f4000000-0000-0000-0000-000000000002'
         and type = 'no_show_recovery' and status = 'pendiente'
     ) then
    raise exception 'La agenda no conservó asistencia/no-show o no creó recuperación';
  end if;
end;
$test$;

rollback;

select 'PASS' as result, 'operational_integrity_and_quotes' as test;
