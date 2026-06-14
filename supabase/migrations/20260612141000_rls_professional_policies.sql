-- Professional RLS policies and role helpers.
-- Safe migration: replaces policies, keeps data, and does not create DELETE access
-- for operational lead/appointment/task/event tables.

create schema if not exists app_private;
revoke all on schema app_private from public;

create or replace function app_private.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select p
  from public.profiles p
  where p.id = (select auth.uid())
    and coalesce(p.active, true) = true
  limit 1;
$$;

create or replace function app_private.current_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.clinic_id
  from public.profiles p
  where p.id = (select auth.uid())
    and coalesce(p.active, true) = true
  limit 1;
$$;

create or replace function app_private.current_user_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select app_private.current_clinic_id();
$$;

create or replace function app_private.is_clinic_member(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = target_clinic_id
      and coalesce(p.active, true) = true
  );
$$;

create or replace function app_private.has_role(target_clinic_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = target_clinic_id
      and coalesce(p.active, true) = true
      and p.role = any(allowed_roles)
  );
$$;

create or replace function app_private.is_clinic_admin(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_role(target_clinic_id, array['admin', 'owner']);
$$;

create or replace function app_private.is_clinic_public_form_admin(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_role(target_clinic_id, array['admin', 'owner']);
$$;

revoke all on all functions in schema app_private from public;
grant usage on schema app_private to authenticated;
grant execute on all functions in schema app_private to authenticated;

create or replace function app_private.enforce_leads_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_restricted jsonb;
  new_restricted jsonb;
begin
  if auth.role() is null or auth.role() = 'service_role' then
    return new;
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
      raise exception 'Receptionist cannot archive leads';
    end if;

    old_restricted := to_jsonb(old)
      - 'status'
      - 'notes'
      - 'next_action'
      - 'next_followup_at'
      - 'contact_attempts'
      - 'last_contact_at'
      - 'updated_at';

    new_restricted := to_jsonb(new)
      - 'status'
      - 'notes'
      - 'next_action'
      - 'next_followup_at'
      - 'contact_attempts'
      - 'last_contact_at'
      - 'updated_at';

    if old_restricted = new_restricted then
      return new;
    end if;
  end if;

  raise exception 'Insufficient permissions to update lead';
end;
$$;

create or replace function app_private.enforce_tasks_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_restricted jsonb;
  new_restricted jsonb;
begin
  if auth.role() is null or auth.role() = 'service_role' then
    return new;
  end if;

  if app_private.has_role(new.clinic_id, array['admin', 'owner']) then
    return new;
  end if;

  if app_private.has_role(new.clinic_id, array['receptionist']) then
    old_restricted := to_jsonb(old) - 'status' - 'completed_at' - 'updated_at';
    new_restricted := to_jsonb(new) - 'status' - 'completed_at' - 'updated_at';

    if old_restricted = new_restricted
       and new.status in ('hecho', 'Completada') then
      return new;
    end if;
  end if;

  raise exception 'Insufficient permissions to update task';
end;
$$;

create or replace function app_private.enforce_tasks_insert_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is null or auth.role() = 'service_role' then
    return new;
  end if;

  if app_private.has_role(new.clinic_id, array['admin', 'owner']) then
    return new;
  end if;

  if app_private.has_role(new.clinic_id, array['receptionist'])
     and coalesce(new.type, '') in ('contact', 'followup', 'confirm', 'attendance') then
    return new;
  end if;

  raise exception 'Insufficient permissions to create task';
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
alter table public.treatment_prices enable row level security;
alter table public.message_templates enable row level security;
alter table public.daily_reports enable row level security;
alter table public.clinic_public_forms enable row level security;
alter table public.form_submission_logs enable row level security;
alter table public.clinic_settings enable row level security;
alter table public.automation_jobs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.campaigns enable row level security;
alter table public.messages enable row level security;

drop policy if exists "clinics_select_same_clinic" on public.clinics;
drop policy if exists "clinics_update_admin" on public.clinics;
drop policy if exists "clinics_update_admin_owner" on public.clinics;
create policy "clinics_select_same_clinic" on public.clinics
for select to authenticated
using (app_private.is_clinic_member(id));
create policy "clinics_update_admin_owner" on public.clinics
for update to authenticated
using (app_private.has_role(id, array['admin', 'owner']))
with check (app_private.has_role(id, array['admin', 'owner']));

drop policy if exists "profiles_select_same_clinic" on public.profiles;
drop policy if exists "profiles_insert_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;
drop policy if exists "profiles_insert_admin_owner" on public.profiles;
drop policy if exists "profiles_update_admin_owner" on public.profiles;
create policy "profiles_select_same_clinic" on public.profiles
for select to authenticated
using (app_private.is_clinic_member(clinic_id));
create policy "profiles_insert_admin_owner" on public.profiles
for insert to authenticated
with check (app_private.has_role(clinic_id, array['admin', 'owner']));
create policy "profiles_update_admin_owner" on public.profiles
for update to authenticated
using (app_private.has_role(clinic_id, array['admin', 'owner']))
with check (app_private.has_role(clinic_id, array['admin', 'owner']));

drop policy if exists "leads_select_same_clinic" on public.leads;
drop policy if exists "leads_insert_same_clinic" on public.leads;
drop policy if exists "leads_update_same_clinic" on public.leads;
drop policy if exists "leads_delete_same_clinic" on public.leads;
drop policy if exists "leads_insert_admin_owner" on public.leads;
drop policy if exists "leads_update_same_clinic_guarded" on public.leads;
create policy "leads_select_same_clinic" on public.leads
for select to authenticated
using (app_private.is_clinic_member(clinic_id));
create policy "leads_insert_admin_owner" on public.leads
for insert to authenticated
with check (app_private.has_role(clinic_id, array['admin', 'owner']));
create policy "leads_update_same_clinic_guarded" on public.leads
for update to authenticated
using (app_private.is_clinic_member(clinic_id))
with check (app_private.is_clinic_member(clinic_id));

drop policy if exists "lead_events_select_same_clinic" on public.lead_events;
drop policy if exists "lead_events_insert_same_clinic" on public.lead_events;
drop policy if exists "lead_events_update_same_clinic" on public.lead_events;
drop policy if exists "lead_events_delete_same_clinic" on public.lead_events;
create policy "lead_events_select_same_clinic" on public.lead_events
for select to authenticated
using (app_private.is_clinic_member(clinic_id));
create policy "lead_events_insert_same_clinic" on public.lead_events
for insert to authenticated
with check (app_private.is_clinic_member(clinic_id));

drop policy if exists "appointments_select_same_clinic" on public.appointments;
drop policy if exists "appointments_insert_same_clinic" on public.appointments;
drop policy if exists "appointments_update_same_clinic" on public.appointments;
drop policy if exists "appointments_delete_same_clinic" on public.appointments;
create policy "appointments_select_same_clinic" on public.appointments
for select to authenticated
using (app_private.is_clinic_member(clinic_id));
create policy "appointments_insert_same_clinic" on public.appointments
for insert to authenticated
with check (app_private.is_clinic_member(clinic_id));
create policy "appointments_update_same_clinic" on public.appointments
for update to authenticated
using (app_private.is_clinic_member(clinic_id))
with check (app_private.is_clinic_member(clinic_id));

drop policy if exists "tasks_select_same_clinic" on public.tasks;
drop policy if exists "tasks_insert_same_clinic" on public.tasks;
drop policy if exists "tasks_update_same_clinic" on public.tasks;
drop policy if exists "tasks_delete_same_clinic" on public.tasks;
drop policy if exists "tasks_insert_admin_owner" on public.tasks;
drop policy if exists "tasks_insert_same_clinic_guarded" on public.tasks;
drop policy if exists "tasks_update_same_clinic_guarded" on public.tasks;
create policy "tasks_select_same_clinic" on public.tasks
for select to authenticated
using (app_private.is_clinic_member(clinic_id));
create policy "tasks_insert_same_clinic_guarded" on public.tasks
for insert to authenticated
with check (app_private.is_clinic_member(clinic_id));
create policy "tasks_update_same_clinic_guarded" on public.tasks
for update to authenticated
using (app_private.is_clinic_member(clinic_id))
with check (app_private.is_clinic_member(clinic_id));

drop policy if exists "treatment_prices_select_same_clinic" on public.treatment_prices;
drop policy if exists "treatment_prices_insert_admin" on public.treatment_prices;
drop policy if exists "treatment_prices_update_admin" on public.treatment_prices;
drop policy if exists "treatment_prices_delete_admin" on public.treatment_prices;
drop policy if exists "treatment_prices_insert_admin_owner" on public.treatment_prices;
drop policy if exists "treatment_prices_update_admin_owner" on public.treatment_prices;
create policy "treatment_prices_select_same_clinic" on public.treatment_prices
for select to authenticated
using (app_private.is_clinic_member(clinic_id));
create policy "treatment_prices_insert_admin_owner" on public.treatment_prices
for insert to authenticated
with check (app_private.has_role(clinic_id, array['admin', 'owner']));
create policy "treatment_prices_update_admin_owner" on public.treatment_prices
for update to authenticated
using (app_private.has_role(clinic_id, array['admin', 'owner']))
with check (app_private.has_role(clinic_id, array['admin', 'owner']));

drop policy if exists "message_templates_select_same_clinic" on public.message_templates;
drop policy if exists "message_templates_insert_admin" on public.message_templates;
drop policy if exists "message_templates_update_admin" on public.message_templates;
drop policy if exists "message_templates_delete_admin" on public.message_templates;
drop policy if exists "message_templates_insert_admin_owner" on public.message_templates;
drop policy if exists "message_templates_update_admin_owner" on public.message_templates;
create policy "message_templates_select_same_clinic" on public.message_templates
for select to authenticated
using (app_private.is_clinic_member(clinic_id));
create policy "message_templates_insert_admin_owner" on public.message_templates
for insert to authenticated
with check (app_private.has_role(clinic_id, array['admin', 'owner']));
create policy "message_templates_update_admin_owner" on public.message_templates
for update to authenticated
using (app_private.has_role(clinic_id, array['admin', 'owner']))
with check (app_private.has_role(clinic_id, array['admin', 'owner']));

drop policy if exists "daily_reports_select_same_clinic" on public.daily_reports;
drop policy if exists "daily_reports_insert_admin" on public.daily_reports;
drop policy if exists "daily_reports_update_admin" on public.daily_reports;
drop policy if exists "daily_reports_delete_admin" on public.daily_reports;
drop policy if exists "daily_reports_insert_admin_owner" on public.daily_reports;
drop policy if exists "daily_reports_update_admin_owner" on public.daily_reports;
create policy "daily_reports_select_same_clinic" on public.daily_reports
for select to authenticated
using (app_private.is_clinic_member(clinic_id));
create policy "daily_reports_insert_admin_owner" on public.daily_reports
for insert to authenticated
with check (app_private.has_role(clinic_id, array['admin', 'owner']));
create policy "daily_reports_update_admin_owner" on public.daily_reports
for update to authenticated
using (app_private.has_role(clinic_id, array['admin', 'owner']))
with check (app_private.has_role(clinic_id, array['admin', 'owner']));

drop policy if exists "clinic_public_forms_select_same_clinic" on public.clinic_public_forms;
drop policy if exists "clinic_public_forms_insert_admin" on public.clinic_public_forms;
drop policy if exists "clinic_public_forms_update_admin" on public.clinic_public_forms;
drop policy if exists "clinic_public_forms_select_admin_owner" on public.clinic_public_forms;
drop policy if exists "clinic_public_forms_insert_admin_owner" on public.clinic_public_forms;
drop policy if exists "clinic_public_forms_update_admin_owner" on public.clinic_public_forms;
create policy "clinic_public_forms_select_admin_owner" on public.clinic_public_forms
for select to authenticated
using (app_private.has_role(clinic_id, array['admin', 'owner']));
create policy "clinic_public_forms_insert_admin_owner" on public.clinic_public_forms
for insert to authenticated
with check (app_private.has_role(clinic_id, array['admin', 'owner']));
create policy "clinic_public_forms_update_admin_owner" on public.clinic_public_forms
for update to authenticated
using (app_private.has_role(clinic_id, array['admin', 'owner']))
with check (app_private.has_role(clinic_id, array['admin', 'owner']));

drop policy if exists "form_submission_logs_select_admin" on public.form_submission_logs;
drop policy if exists "form_submission_logs_select_admin_owner" on public.form_submission_logs;
create policy "form_submission_logs_select_admin_owner" on public.form_submission_logs
for select to authenticated
using (app_private.has_role(clinic_id, array['admin', 'owner']));

drop policy if exists "clinic_settings_select_same_clinic" on public.clinic_settings;
drop policy if exists "clinic_settings_insert_admin_owner" on public.clinic_settings;
drop policy if exists "clinic_settings_update_admin_owner" on public.clinic_settings;
create policy "clinic_settings_select_same_clinic" on public.clinic_settings
for select to authenticated
using (app_private.is_clinic_member(clinic_id));
create policy "clinic_settings_insert_admin_owner" on public.clinic_settings
for insert to authenticated
with check (app_private.has_role(clinic_id, array['admin', 'owner']));
create policy "clinic_settings_update_admin_owner" on public.clinic_settings
for update to authenticated
using (app_private.has_role(clinic_id, array['admin', 'owner']))
with check (app_private.has_role(clinic_id, array['admin', 'owner']));

drop policy if exists "automation_jobs_select_admin_owner" on public.automation_jobs;
create policy "automation_jobs_select_admin_owner" on public.automation_jobs
for select to authenticated
using (app_private.has_role(clinic_id, array['admin', 'owner']));

drop policy if exists "audit_logs_select_admin_owner" on public.audit_logs;
create policy "audit_logs_select_admin_owner" on public.audit_logs
for select to authenticated
using (app_private.has_role(clinic_id, array['admin', 'owner']));

drop policy if exists "campaigns_select_same_clinic" on public.campaigns;
drop policy if exists "campaigns_insert_admin_owner" on public.campaigns;
drop policy if exists "campaigns_update_admin_owner" on public.campaigns;
create policy "campaigns_select_same_clinic" on public.campaigns
for select to authenticated
using (app_private.is_clinic_member(clinic_id));
create policy "campaigns_insert_admin_owner" on public.campaigns
for insert to authenticated
with check (app_private.has_role(clinic_id, array['admin', 'owner']));
create policy "campaigns_update_admin_owner" on public.campaigns
for update to authenticated
using (app_private.has_role(clinic_id, array['admin', 'owner']))
with check (app_private.has_role(clinic_id, array['admin', 'owner']));

drop policy if exists "messages_select_same_clinic" on public.messages;
drop policy if exists "messages_insert_admin_owner" on public.messages;
create policy "messages_select_same_clinic" on public.messages
for select to authenticated
using (app_private.is_clinic_member(clinic_id));
create policy "messages_insert_admin_owner" on public.messages
for insert to authenticated
with check (app_private.has_role(clinic_id, array['admin', 'owner']));
