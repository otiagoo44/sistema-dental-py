-- Verificacion automatizable del rebuild. Ejecutar con postgres/SQL Editor.
-- Falla de inmediato si falta una proteccion critica.

do $$
declare
  expected_tables text[] := array[
    'clinics','profiles','leads','lead_events','appointments','tasks',
    'clinic_public_forms','form_submission_logs','clinic_settings',
    'automation_jobs','audit_logs','campaigns','messages','treatment_prices',
    'message_templates','daily_reports'
  ];
  missing_tables text[];
  rls_missing text[];
  missing_rpcs text[];
  delete_policy_count integer;
  duplicate_count integer;
  anon_privilege_count integer;
begin
  select array_agg(name order by name)
  into missing_tables
  from unnest(expected_tables) as name
  where to_regclass(format('public.%I', name)) is null;

  if missing_tables is not null then
    raise exception 'Tablas faltantes: %', missing_tables;
  end if;

  select array_agg(c.relname order by c.relname)
  into rls_missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(expected_tables)
    and not c.relrowsecurity;

  if rls_missing is not null then
    raise exception 'RLS desactivado: %', rls_missing;
  end if;

  select array_agg(name order by name)
  into missing_rpcs
  from unnest(array[
    'create_manual_lead','schedule_lead_appointment','update_appointment_outcome',
    'complete_task','mark_lead_contacted','complete_contact_task',
    'record_contact_attempt','record_whatsapp_opened'
  ]) as name
  where not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = name
  );

  if missing_rpcs is not null then
    raise exception 'RPCs faltantes: %', missing_rpcs;
  end if;

  select count(*) into delete_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = any(expected_tables)
    and cmd = 'DELETE';

  if delete_policy_count <> 0 then
    raise exception 'Hay % policies DELETE en tablas operativas', delete_policy_count;
  end if;

  if to_regclass('public.appointments_active_slot_unique_idx') is null then
    raise exception 'Falta el indice de doble reserva appointments_active_slot_unique_idx';
  end if;

  if to_regclass('public.leads_clinic_phone_plus_unique') is null then
    raise exception 'Falta el indice unico de duplicados por clinica y telefono';
  end if;

  if to_regclass('public.message_templates_clinic_key_unique_idx') is null then
    raise exception 'Falta el indice unico multi-clinica de plantillas';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'completed_by'
  ) then
    raise exception 'Falta tasks.completed_by';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'message_templates' and column_name = 'template_key'
  ) then
    raise exception 'Falta message_templates.template_key';
  end if;

  select count(*) into duplicate_count
  from (
    select clinic_id, phone_plus
    from public.leads
    where phone_plus is not null
    group by clinic_id, phone_plus
    having count(*) > 1
  ) duplicates;

  if duplicate_count <> 0 then
    raise exception 'Existen % telefonos duplicados dentro de una clinica', duplicate_count;
  end if;

  if exists (select 1 from public.leads where clinic_id is null) then
    raise exception 'Existen leads sin clinic_id';
  end if;

  if exists (
    select 1 from public.leads
    where consent_contact is true and consent_at is null
  ) then
    raise exception 'Hay consentimientos positivos sin timestamp';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'form_submission_logs'
      and column_name in ('ip', 'ip_address', 'raw_ip', 'phone', 'phone_plus', 'telefono')
  ) then
    raise exception 'form_submission_logs contiene una columna de PII cruda';
  end if;

  if exists (
    select 1 from public.form_submission_logs
    where status = 'accepted' and phone_hash is null
  ) then
    raise exception 'Hay logs accepted sin phone_hash';
  end if;

  select count(*) into anon_privilege_count
  from information_schema.role_table_grants
  where grantee = 'anon'
    and table_schema = 'public'
    and table_name = any(expected_tables);

  if anon_privilege_count <> 0 then
    raise exception 'anon conserva % privilegios directos sobre tablas CRM', anon_privilege_count;
  end if;

  if has_function_privilege(
    'anon',
    'public.schedule_lead_appointment(uuid,date,time without time zone,text,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'anon puede ejecutar schedule_lead_appointment';
  end if;

  if has_function_privilege(
    'anon',
    'public.create_manual_lead(text,text,text,text,text,text,text,boolean,text,text,timestamp with time zone,uuid,text,integer,text,text,numeric)',
    'EXECUTE'
  ) then
    raise exception 'anon puede ejecutar create_manual_lead';
  end if;

  if has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE') then
    raise exception 'anon puede ejecutar rls_auto_enable';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_manual_lead'
      and pg_get_function_arguments(p.oid) ilike '%clinic_id%'
  ) then
    raise exception 'create_manual_lead acepta clinic_id desde el cliente';
  end if;
end
$$;

select 'PASS' as result, 'schema_rls_rpc_indexes_privileges' as test;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.policyname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public'
  and c.relname in (
    'clinics','profiles','leads','lead_events','appointments','tasks',
    'clinic_public_forms','form_submission_logs','clinic_settings',
    'automation_jobs','audit_logs','campaigns','messages','treatment_prices',
    'message_templates','daily_reports'
  )
group by c.relname, c.relrowsecurity
order by c.relname;

select
  clinic_slug,
  is_active,
  'https://sistema-dental-py.vercel.app' = any(allowed_origins) as allows_real_landing,
  'http://localhost:5173' = any(allowed_origins) as allows_localhost
from public.clinic_public_forms
order by clinic_slug;

select
  (select count(*) from public.clinics where slug in ('dentalpro', 'qa-clinic-b')) as qa_clinics,
  (select count(*) from public.clinic_public_forms where clinic_slug in ('dentalpro', 'qa-clinic-b')) as qa_forms,
  (select count(*) from public.leads where source = 'seed_qa') as qa_leads,
  (select count(*) from public.appointments where notes like 'QA:%') as qa_appointments,
  (select count(*) from public.tasks) as tasks,
  (select count(*) from public.lead_events) as events,
  (select count(*) from public.automation_jobs) as automation_jobs,
  (select count(*) from public.profiles) as profiles;

select
  status,
  count(*) as logs,
  count(*) filter (where phone_hash is not null) as with_phone_hash,
  count(*) filter (where ip_hash is not null) as with_ip_hash
from public.form_submission_logs
group by status
order by status;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'appointments_active_slot_unique_idx',
    'leads_clinic_phone_plus_unique',
    'tasks_open_lead_type_unique_idx'
  )
order by indexname;

select
  (app_private.tomorrow_at_asuncion(9) at time zone 'America/Asuncion')::date
    = (now() at time zone 'America/Asuncion')::date + 1 as no_show_is_tomorrow,
  (app_private.tomorrow_at_asuncion(9) at time zone 'America/Asuncion')::time = time '09:00'
    as no_show_is_0900_asuncion;
