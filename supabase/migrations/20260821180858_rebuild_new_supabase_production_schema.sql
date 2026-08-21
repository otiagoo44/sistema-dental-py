-- Final production hardening for the rebuilt multi-clinic CRM.
-- This migration is intentionally non-destructive to table data: no DROP TABLE,
-- TRUNCATE, or row deletion. Legacy policies/functions are replaced in place.

create extension if not exists pgcrypto;

create schema if not exists app_private;
revoke all on schema app_private from public, anon;

alter table public.leads
  add column if not exists consent_contact boolean not null default false,
  add column if not exists consent_at timestamptz,
  add column if not exists consent_source text,
  add column if not exists consent_page text;

alter table public.profiles
  alter column clinic_id set not null,
  alter column role set not null,
  alter column active set not null;

alter table public.lead_events alter column clinic_id set not null;
alter table public.appointments alter column clinic_id set not null;
alter table public.tasks alter column clinic_id set not null;
alter table public.clinic_public_forms
  alter column clinic_id set not null,
  alter column public_token set not null,
  alter column is_active set not null;
alter table public.form_submission_logs
  alter column clinic_public_form_id set not null,
  alter column clinic_id set not null,
  alter column status set not null;
alter table public.automation_jobs
  alter column clinic_id set not null,
  alter column workflow_name set not null,
  alter column status set not null;
alter table public.audit_logs
  alter column clinic_id set not null,
  alter column action set not null,
  alter column table_name set not null;
alter table public.campaigns alter column clinic_id set not null;
alter table public.messages alter column clinic_id set not null;

update public.appointments
set doctor_assigned = 'Sin asignar'
where doctor_assigned is null or btrim(doctor_assigned) = '';

alter table public.appointments
  alter column doctor_assigned set default 'Sin asignar',
  alter column doctor_assigned set not null;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'owner', 'receptionist'));

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads
  add constraint leads_status_check
  check (status in (
    'Nuevo', 'No Contactado', 'Contactado', 'Respondió',
    'Consulta Agendada', 'Confirmado', 'Asistió', 'Presupuesto Enviado',
    'Tratamiento Iniciado', 'No Respondió', 'Perdido', 'Reactivar 30d',
    'No Asistió', 'Archivado'
  ));

alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments
  add constraint appointments_status_check
  check (status in (
    'Agendado', 'Consulta Agendada', 'Confirmado', 'Pendiente',
    'Asistió', 'No Asistió', 'Reprogramado', 'Cancelado', 'Perdido'
  ));

alter table public.leads drop constraint if exists leads_consent_consistency_check;
alter table public.leads
  add constraint leads_consent_consistency_check
  check (consent_contact = false or consent_at is not null);

drop index if exists public.leads_clinic_phone_plus_unique;
create unique index if not exists leads_clinic_phone_plus_unique
  on public.leads (clinic_id, phone_plus);

create index if not exists profiles_clinic_active_idx
  on public.profiles (clinic_id, active);
create index if not exists appointments_lead_id_prod_idx
  on public.appointments (lead_id);
create index if not exists lead_events_lead_id_prod_idx
  on public.lead_events (lead_id);
create index if not exists tasks_lead_id_prod_idx
  on public.tasks (lead_id);
create index if not exists clinic_public_forms_clinic_id_idx
  on public.clinic_public_forms (clinic_id);
create index if not exists form_submission_logs_clinic_id_idx
  on public.form_submission_logs (clinic_id);
create index if not exists automation_jobs_lead_id_idx
  on public.automation_jobs (lead_id);
create index if not exists audit_logs_actor_id_idx
  on public.audit_logs (actor_id);
create index if not exists messages_lead_id_idx
  on public.messages (lead_id);

create unique index if not exists appointments_active_slot_unique_idx
  on public.appointments (
    clinic_id,
    lower(doctor_assigned),
    appointment_date,
    appointment_time
  )
  where status in ('Agendado', 'Consulta Agendada', 'Confirmado', 'Pendiente', 'Reprogramado');

create unique index if not exists tasks_open_lead_type_unique_idx
  on public.tasks (clinic_id, lead_id, type)
  where lead_id is not null
    and type is not null
    and status in ('pendiente', 'vencido', 'Pendiente', 'Vencida');

create or replace function app_private.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active is true
  limit 1;
$$;

create or replace function app_private.current_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.clinic_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active is true
  limit 1;
$$;

create or replace function app_private.current_user_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.current_clinic_id();
$$;

create or replace function app_private.is_clinic_member(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = target_clinic_id
      and p.active is true
  );
$$;

create or replace function app_private.has_role(target_clinic_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = target_clinic_id
      and p.active is true
      and p.role = any(allowed_roles)
  );
$$;

create or replace function app_private.is_clinic_admin(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.has_role(target_clinic_id, array['admin', 'owner']);
$$;

create or replace function app_private.is_clinic_public_form_admin(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.has_role(target_clinic_id, array['admin', 'owner']);
$$;

create or replace function app_private.asuncion_timestamp(target_date date, target_time time)
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select (target_date + target_time) at time zone 'America/Asuncion';
$$;

create or replace function app_private.tomorrow_at_asuncion(target_hour integer default 9)
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select (
    date_trunc('day', now() at time zone 'America/Asuncion')
    + interval '1 day'
    + make_interval(hours => greatest(0, least(target_hour, 23)))
  ) at time zone 'America/Asuncion';
$$;

create or replace function app_private.enforce_leads_update_permissions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_restricted jsonb;
  new_restricted jsonb;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if new.clinic_id is distinct from old.clinic_id then
    raise exception using errcode = '42501', message = 'No se puede cambiar clinic_id';
  end if;

  if app_private.has_role(new.clinic_id, array['admin', 'owner']) then
    return new;
  end if;

  if app_private.has_role(new.clinic_id, array['receptionist']) then
    if coalesce(new.is_archived, false) is distinct from coalesce(old.is_archived, false)
       or new.archived_at is distinct from old.archived_at
       or new.archived_by is distinct from old.archived_by
       or new.archived_reason is distinct from old.archived_reason
       or new.status = 'Archivado' then
      raise exception using errcode = '42501', message = 'Receptionist cannot archive leads';
    end if;

    old_restricted := to_jsonb(old)
      - 'status' - 'notes' - 'next_action' - 'next_followup_at'
      - 'contact_attempts' - 'last_contact_at' - 'updated_at';
    new_restricted := to_jsonb(new)
      - 'status' - 'notes' - 'next_action' - 'next_followup_at'
      - 'contact_attempts' - 'last_contact_at' - 'updated_at';

    if old_restricted = new_restricted then
      return new;
    end if;
  end if;

  raise exception using errcode = '42501', message = 'Insufficient permissions to update lead';
end;
$$;

create or replace function app_private.enforce_tasks_insert_permissions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin')
     or app_private.has_role(new.clinic_id, array['admin', 'owner']) then
    return new;
  end if;

  raise exception using errcode = '42501', message = 'Use the secure task RPC';
end;
$$;

create or replace function app_private.enforce_tasks_update_permissions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin')
     or app_private.has_role(new.clinic_id, array['admin', 'owner']) then
    return new;
  end if;

  raise exception using errcode = '42501', message = 'Use complete_task to update tasks';
end;
$$;

drop trigger if exists enforce_leads_update_permissions on public.leads;
create trigger enforce_leads_update_permissions
before update on public.leads
for each row execute function app_private.enforce_leads_update_permissions();

drop trigger if exists enforce_tasks_insert_permissions on public.tasks;
create trigger enforce_tasks_insert_permissions
before insert on public.tasks
for each row execute function app_private.enforce_tasks_insert_permissions();

drop trigger if exists enforce_tasks_update_permissions on public.tasks;
create trigger enforce_tasks_update_permissions
before update on public.tasks
for each row execute function app_private.enforce_tasks_update_permissions();

alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.appointments enable row level security;
alter table public.tasks enable row level security;
alter table public.clinic_public_forms enable row level security;
alter table public.form_submission_logs enable row level security;
alter table public.clinic_settings enable row level security;
alter table public.automation_jobs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.campaigns enable row level security;
alter table public.messages enable row level security;
alter table public.treatment_prices enable row level security;
alter table public.message_templates enable row level security;
alter table public.daily_reports enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'clinics', 'profiles', 'leads', 'lead_events', 'appointments', 'tasks',
        'clinic_public_forms', 'form_submission_logs', 'clinic_settings',
        'automation_jobs', 'audit_logs', 'campaigns', 'messages',
        'treatment_prices', 'message_templates', 'daily_reports'
      ])
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

create policy clinics_select_same_clinic on public.clinics
for select to authenticated
using ((select app_private.is_clinic_member(id)));
create policy clinics_update_admin_owner on public.clinics
for update to authenticated
using ((select app_private.has_role(id, array['admin', 'owner'])))
with check ((select app_private.has_role(id, array['admin', 'owner'])));

create policy profiles_select_same_clinic on public.profiles
for select to authenticated
using ((select app_private.is_clinic_member(clinic_id)));
create policy profiles_insert_admin_owner on public.profiles
for insert to authenticated
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));
create policy profiles_update_admin_owner on public.profiles
for update to authenticated
using ((select app_private.has_role(clinic_id, array['admin', 'owner'])))
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));

create policy leads_select_same_clinic on public.leads
for select to authenticated
using ((select app_private.is_clinic_member(clinic_id)));
create policy leads_insert_admin_owner on public.leads
for insert to authenticated
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));
create policy leads_update_same_clinic_guarded on public.leads
for update to authenticated
using ((select app_private.is_clinic_member(clinic_id)))
with check ((select app_private.is_clinic_member(clinic_id)));

create policy lead_events_select_same_clinic on public.lead_events
for select to authenticated
using ((select app_private.is_clinic_member(clinic_id)));
create policy lead_events_insert_same_clinic on public.lead_events
for insert to authenticated
with check (
  (select app_private.is_clinic_member(clinic_id))
  and (created_by is null or created_by = (select auth.uid()))
);

create policy appointments_select_same_clinic on public.appointments
for select to authenticated
using ((select app_private.is_clinic_member(clinic_id)));

create policy tasks_select_same_clinic on public.tasks
for select to authenticated
using ((select app_private.is_clinic_member(clinic_id)));
create policy tasks_insert_admin_owner on public.tasks
for insert to authenticated
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));
create policy tasks_update_admin_owner on public.tasks
for update to authenticated
using ((select app_private.has_role(clinic_id, array['admin', 'owner'])))
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));

create policy clinic_public_forms_select_admin_owner on public.clinic_public_forms
for select to authenticated
using ((select app_private.has_role(clinic_id, array['admin', 'owner'])));
create policy clinic_public_forms_insert_admin_owner on public.clinic_public_forms
for insert to authenticated
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));
create policy clinic_public_forms_update_admin_owner on public.clinic_public_forms
for update to authenticated
using ((select app_private.has_role(clinic_id, array['admin', 'owner'])))
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));

create policy form_submission_logs_select_admin_owner on public.form_submission_logs
for select to authenticated
using ((select app_private.has_role(clinic_id, array['admin', 'owner'])));

create policy clinic_settings_select_same_clinic on public.clinic_settings
for select to authenticated
using ((select app_private.is_clinic_member(clinic_id)));
create policy clinic_settings_insert_admin_owner on public.clinic_settings
for insert to authenticated
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));
create policy clinic_settings_update_admin_owner on public.clinic_settings
for update to authenticated
using ((select app_private.has_role(clinic_id, array['admin', 'owner'])))
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));

create policy automation_jobs_select_admin_owner on public.automation_jobs
for select to authenticated
using ((select app_private.has_role(clinic_id, array['admin', 'owner'])));
create policy audit_logs_select_admin_owner on public.audit_logs
for select to authenticated
using ((select app_private.has_role(clinic_id, array['admin', 'owner'])));

create policy campaigns_select_same_clinic on public.campaigns
for select to authenticated
using ((select app_private.is_clinic_member(clinic_id)));
create policy campaigns_insert_admin_owner on public.campaigns
for insert to authenticated
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));
create policy campaigns_update_admin_owner on public.campaigns
for update to authenticated
using ((select app_private.has_role(clinic_id, array['admin', 'owner'])))
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));

create policy messages_select_same_clinic on public.messages
for select to authenticated
using ((select app_private.is_clinic_member(clinic_id)));
create policy messages_insert_admin_owner on public.messages
for insert to authenticated
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));
create policy messages_update_admin_owner on public.messages
for update to authenticated
using ((select app_private.has_role(clinic_id, array['admin', 'owner'])))
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));

create policy treatment_prices_select_same_clinic on public.treatment_prices
for select to authenticated
using ((select app_private.is_clinic_member(clinic_id)));
create policy treatment_prices_insert_admin_owner on public.treatment_prices
for insert to authenticated
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));
create policy treatment_prices_update_admin_owner on public.treatment_prices
for update to authenticated
using ((select app_private.has_role(clinic_id, array['admin', 'owner'])))
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));

create policy message_templates_select_same_clinic on public.message_templates
for select to authenticated
using ((select app_private.is_clinic_member(clinic_id)));
create policy message_templates_insert_admin_owner on public.message_templates
for insert to authenticated
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));
create policy message_templates_update_admin_owner on public.message_templates
for update to authenticated
using ((select app_private.has_role(clinic_id, array['admin', 'owner'])))
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));

create policy daily_reports_select_same_clinic on public.daily_reports
for select to authenticated
using ((select app_private.is_clinic_member(clinic_id)));
create policy daily_reports_insert_admin_owner on public.daily_reports
for insert to authenticated
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));
create policy daily_reports_update_admin_owner on public.daily_reports
for update to authenticated
using ((select app_private.has_role(clinic_id, array['admin', 'owner'])))
with check ((select app_private.has_role(clinic_id, array['admin', 'owner'])));

create or replace function public.schedule_lead_appointment(
  p_lead_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_doctor_assigned text,
  p_treatment_scheduled text default null,
  p_notes text default null,
  p_appointment_id uuid default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  lead_record public.leads;
  appointment_record public.appointments;
  normalized_doctor text := nullif(btrim(p_doctor_assigned), '');
  appointment_due_at timestamptz;
  is_reschedule boolean := false;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if p_appointment_date is null or p_appointment_time is null then
    raise exception using errcode = '22023', message = 'La fecha y hora son obligatorias';
  end if;

  if p_appointment_date < (now() at time zone 'America/Asuncion')::date then
    raise exception using errcode = '22023', message = 'No se puede agendar en una fecha pasada';
  end if;

  if normalized_doctor is null then
    raise exception using errcode = '22023', message = 'El doctor es obligatorio';
  end if;

  select * into lead_record
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Lead no encontrado';
  end if;

  if not app_private.has_role(lead_record.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a este lead';
  end if;

  if p_appointment_id is not null then
    select * into appointment_record
    from public.appointments
    where id = p_appointment_id
      and clinic_id = lead_record.clinic_id
      and lead_id = lead_record.id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Turno no encontrado para este lead';
    end if;
    is_reschedule := true;
  else
    select * into appointment_record
    from public.appointments
    where clinic_id = lead_record.clinic_id
      and lead_id = lead_record.id
      and status in ('Agendado', 'Consulta Agendada', 'Confirmado', 'Pendiente', 'Reprogramado')
    order by created_at desc
    limit 1
    for update;
    is_reschedule := found;
  end if;

  begin
    if is_reschedule then
      update public.appointments
      set appointment_date = p_appointment_date,
          appointment_time = p_appointment_time,
          doctor_assigned = normalized_doctor,
          treatment_scheduled = coalesce(nullif(btrim(p_treatment_scheduled), ''), lead_record.treatment),
          status = 'Reprogramado',
          notes = nullif(btrim(p_notes), '')
      where id = appointment_record.id
      returning * into appointment_record;
    else
      insert into public.appointments (
        clinic_id, lead_id, appointment_date, appointment_time,
        doctor_assigned, treatment_scheduled, status, notes
      ) values (
        lead_record.clinic_id, lead_record.id, p_appointment_date, p_appointment_time,
        normalized_doctor, coalesce(nullif(btrim(p_treatment_scheduled), ''), lead_record.treatment),
        'Agendado', nullif(btrim(p_notes), '')
      ) returning * into appointment_record;
    end if;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'Ese horario ya está ocupado para este doctor.';
  end;

  update public.leads
  set status = 'Consulta Agendada',
      next_action = 'Confirmar asistencia',
      last_contact_at = coalesce(last_contact_at, now())
  where id = lead_record.id;

  appointment_due_at := greatest(
    now(),
    app_private.asuncion_timestamp(p_appointment_date, p_appointment_time) - interval '1 day'
  );

  insert into public.tasks (
    clinic_id, lead_id, title, description, type, priority,
    status, due_at, created_by
  ) values (
    lead_record.clinic_id, lead_record.id, 'Confirmar asistencia',
    'Confirmar la consulta 24 horas antes.', 'confirm', 'media',
    'pendiente', appointment_due_at, current_user_id
  )
  on conflict (clinic_id, lead_id, type)
    where lead_id is not null and type is not null
      and status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
  do update set
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    status = 'pendiente',
    due_at = excluded.due_at,
    completed_at = null,
    updated_at = now();

  insert into public.lead_events (
    clinic_id, lead_id, event_type, title, description, metadata, created_by
  ) values (
    lead_record.clinic_id,
    lead_record.id,
    case when is_reschedule then 'appointment_rescheduled' else 'appointment_scheduled' end,
    case when is_reschedule then 'Consulta reprogramada' else 'Consulta agendada' end,
    format('Consulta para %s %s con %s', p_appointment_date, p_appointment_time, normalized_doctor),
    jsonb_build_object('appointment_id', appointment_record.id),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    lead_record.clinic_id,
    current_user_id,
    case when is_reschedule then 'appointment_rescheduled' else 'appointment_scheduled' end,
    'appointments',
    appointment_record.id,
    jsonb_build_object('lead_id', lead_record.id)
  );

  return appointment_record;
end;
$$;

create or replace function public.update_appointment_outcome(
  p_appointment_id uuid,
  p_outcome text,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_doctor_assigned text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  appointment_snapshot public.appointments;
  appointment_record public.appointments;
  lead_record public.leads;
  normalized_outcome text := btrim(p_outcome);
  normalized_doctor text;
  lead_status text;
  next_action_value text;
  next_followup_value timestamptz;
  task_title text;
  task_type text;
  task_priority text := 'media';
  task_due_at timestamptz;
  event_type_value text;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if normalized_outcome not in ('Confirmado', 'Asistió', 'No Asistió', 'Reprogramado', 'Cancelado') then
    raise exception using errcode = '22023', message = 'Resultado de turno inválido';
  end if;

  select * into appointment_snapshot
  from public.appointments
  where id = p_appointment_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Turno no encontrado';
  end if;

  if not app_private.has_role(appointment_snapshot.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a este turno';
  end if;

  select * into lead_record
  from public.leads
  where id = appointment_snapshot.lead_id
  for update;

  select * into appointment_record
  from public.appointments
  where id = p_appointment_id
    and clinic_id = lead_record.clinic_id
    and lead_id = lead_record.id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Turno no encontrado para este lead';
  end if;

  if normalized_outcome = 'Reprogramado' then
    normalized_doctor := nullif(btrim(coalesce(p_doctor_assigned, appointment_record.doctor_assigned)), '');
    if p_appointment_date is null or p_appointment_time is null or normalized_doctor is null then
      raise exception using errcode = '22023', message = 'Fecha, hora y doctor son obligatorios para reprogramar';
    end if;
    if p_appointment_date < (now() at time zone 'America/Asuncion')::date then
      raise exception using errcode = '22023', message = 'No se puede reprogramar en una fecha pasada';
    end if;

    begin
      update public.appointments
      set status = 'Reprogramado',
          appointment_date = p_appointment_date,
          appointment_time = p_appointment_time,
          doctor_assigned = normalized_doctor
      where id = appointment_record.id
      returning * into appointment_record;
    exception
      when unique_violation then
        raise exception using errcode = 'P0001', message = 'Ese horario ya está ocupado para este doctor.';
    end;
  else
    update public.appointments
    set status = normalized_outcome
    where id = appointment_record.id
    returning * into appointment_record;
  end if;

  case normalized_outcome
    when 'Confirmado' then
      lead_status := 'Confirmado';
      next_action_value := 'Esperar asistencia';
      task_title := 'Esperar asistencia';
      task_type := 'attendance';
      task_due_at := app_private.asuncion_timestamp(appointment_record.appointment_date, appointment_record.appointment_time);
      event_type_value := 'appointment_confirmed';
    when 'Asistió' then
      lead_status := 'Asistió';
      next_action_value := 'Enviar presupuesto o iniciar tratamiento';
      next_followup_value := app_private.tomorrow_at_asuncion(9);
      task_title := 'Enviar presupuesto o iniciar tratamiento';
      task_type := 'followup';
      task_due_at := next_followup_value;
      event_type_value := 'appointment_attended';
    when 'No Asistió' then
      lead_status := 'No Asistió';
      next_action_value := 'Reprogramar consulta';
      next_followup_value := app_private.tomorrow_at_asuncion(9);
      task_title := 'Recuperar paciente no-show';
      task_type := 'no_show_recovery';
      task_priority := 'alta';
      task_due_at := next_followup_value;
      event_type_value := 'appointment_no_show';
    when 'Reprogramado' then
      lead_status := 'Consulta Agendada';
      next_action_value := 'Confirmar asistencia';
      task_title := 'Confirmar asistencia';
      task_type := 'confirm';
      task_due_at := greatest(
        now(),
        app_private.asuncion_timestamp(appointment_record.appointment_date, appointment_record.appointment_time) - interval '1 day'
      );
      event_type_value := 'appointment_rescheduled';
    when 'Cancelado' then
      lead_status := 'Contactado';
      next_action_value := 'Reprogramar consulta';
      next_followup_value := app_private.tomorrow_at_asuncion(9);
      task_title := 'Recuperar consulta cancelada';
      task_type := 'cancelled_recovery';
      task_priority := 'alta';
      task_due_at := next_followup_value;
      event_type_value := 'appointment_cancelled';
  end case;

  update public.leads
  set status = lead_status,
      next_action = next_action_value,
      next_followup_at = coalesce(next_followup_value, next_followup_at)
  where id = lead_record.id;

  if task_type is not null then
    insert into public.tasks (
      clinic_id, lead_id, title, description, type, priority,
      status, due_at, created_by
    ) values (
      lead_record.clinic_id, lead_record.id, task_title,
      task_title, task_type, task_priority,
      'pendiente', task_due_at, current_user_id
    )
    on conflict (clinic_id, lead_id, type)
      where lead_id is not null and type is not null
        and status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
    do update set
      title = excluded.title,
      description = excluded.description,
      priority = excluded.priority,
      status = 'pendiente',
      due_at = excluded.due_at,
      completed_at = null,
      updated_at = now();
  end if;

  insert into public.lead_events (
    clinic_id, lead_id, event_type, title, description, metadata, created_by
  ) values (
    lead_record.clinic_id,
    lead_record.id,
    event_type_value,
    'Turno: ' || normalized_outcome,
    format('Resultado del turno %s: %s', appointment_record.id, normalized_outcome),
    jsonb_build_object(
      'appointment_id', appointment_record.id,
      'outcome', normalized_outcome,
      'timezone', 'America/Asuncion'
    ),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    lead_record.clinic_id,
    current_user_id,
    event_type_value,
    'appointments',
    appointment_record.id,
    jsonb_build_object('lead_id', lead_record.id, 'outcome', normalized_outcome)
  );

  return appointment_record;
end;
$$;

create or replace function public.complete_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  task_record public.tasks;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into task_record
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Tarea no encontrada';
  end if;

  if not app_private.has_role(task_record.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a esta tarea';
  end if;

  update public.tasks
  set status = 'hecho',
      completed_at = now()
  where id = task_record.id
  returning * into task_record;

  if task_record.lead_id is not null then
    insert into public.lead_events (
      clinic_id, lead_id, event_type, title, description, metadata, created_by
    ) values (
      task_record.clinic_id,
      task_record.lead_id,
      'task_completed',
      'Tarea completada',
      coalesce(task_record.title, 'Tarea marcada como hecha'),
      jsonb_build_object('task_id', task_record.id),
      current_user_id
    );
  end if;

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    task_record.clinic_id,
    current_user_id,
    'task_completed',
    'tasks',
    task_record.id,
    jsonb_build_object('lead_id', task_record.lead_id)
  );

  return task_record;
end;
$$;

revoke all on all tables in schema public from anon, authenticated;

grant usage on schema public to authenticated, service_role;

grant select, update on public.clinics to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.leads to authenticated;
grant select, insert on public.lead_events to authenticated;
grant select on public.appointments to authenticated;
grant select, insert, update on public.tasks to authenticated;
grant select, insert, update on public.clinic_public_forms to authenticated;
grant select on public.form_submission_logs to authenticated;
grant select, insert, update on public.clinic_settings to authenticated;
grant select on public.automation_jobs to authenticated;
grant select on public.audit_logs to authenticated;
grant select, insert, update on public.campaigns to authenticated;
grant select, insert, update on public.messages to authenticated;
grant select, insert, update on public.treatment_prices to authenticated;
grant select, insert, update on public.message_templates to authenticated;
grant select, insert, update on public.daily_reports to authenticated;

grant select, insert, update on table
  public.clinics,
  public.profiles,
  public.leads,
  public.lead_events,
  public.appointments,
  public.tasks,
  public.clinic_public_forms,
  public.form_submission_logs,
  public.clinic_settings,
  public.automation_jobs,
  public.audit_logs,
  public.campaigns,
  public.messages,
  public.treatment_prices,
  public.message_templates,
  public.daily_reports
to service_role;

revoke all on all functions in schema app_private from public, anon, authenticated, service_role;
grant usage on schema app_private to authenticated;
grant execute on function app_private.current_profile() to authenticated;
grant execute on function app_private.current_clinic_id() to authenticated;
grant execute on function app_private.current_user_clinic_id() to authenticated;
grant execute on function app_private.is_clinic_member(uuid) to authenticated;
grant execute on function app_private.has_role(uuid, text[]) to authenticated;
grant execute on function app_private.is_clinic_admin(uuid) to authenticated;
grant execute on function app_private.is_clinic_public_form_admin(uuid) to authenticated;

revoke all on function public.schedule_lead_appointment(uuid, date, time, text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.update_appointment_outcome(uuid, text, date, time, text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_task(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.schedule_lead_appointment(uuid, date, time, text, text, text, uuid)
  to authenticated;
grant execute on function public.update_appointment_outcome(uuid, text, date, time, text)
  to authenticated;
grant execute on function public.complete_task(uuid)
  to authenticated;

notify pgrst, 'reload schema';
