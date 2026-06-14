-- Production schema hardening for the multi-clinic CRM.
-- Safe migration: no DROP TABLE, no TRUNCATE, no data deletion.

create extension if not exists pgcrypto;

create schema if not exists app_private;
revoke all on schema app_private from public;

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  doctor_name text,
  whatsapp text,
  email text,
  owner_email text,
  reception_phone text,
  address_link text,
  calendar_link text,
  primary_color text default '#0ea5e9',
  business_hours text,
  timezone text default 'America/Asuncion',
  status text default 'active',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete restrict,
  full_name text,
  email text,
  role text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  name text,
  phone text,
  phone_plus text,
  treatment text,
  urgency text,
  score int,
  classification text,
  status text default 'Nuevo',
  situation text,
  evaluation_previous text,
  consultation_reason text,
  estimated_value numeric,
  next_action text,
  next_followup_at timestamptz,
  contact_attempts int default 0,
  whatsapp_link text,
  source text,
  page text,
  notes text,
  is_archived boolean default false,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  archived_reason text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete restrict,
  lead_id uuid references public.leads(id) on delete cascade,
  event_type text,
  title text,
  description text,
  old_value text,
  new_value text,
  metadata jsonb default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete restrict,
  lead_id uuid references public.leads(id) on delete cascade,
  appointment_date date,
  appointment_time time,
  doctor_assigned text,
  treatment_scheduled text,
  status text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete restrict,
  lead_id uuid references public.leads(id) on delete cascade,
  title text,
  description text,
  type text,
  priority text,
  status text default 'Pendiente',
  due_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.clinic_public_forms (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  clinic_slug text not null,
  public_token text not null,
  landing_url text,
  allowed_origins text[] default '{}',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.form_submission_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_public_form_id uuid references public.clinic_public_forms(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  ip_hash text,
  phone_hash text,
  status text default 'accepted',
  created_at timestamptz default now()
);

create table if not exists public.clinic_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  opening_hours text,
  treatments jsonb default '[]'::jsonb,
  treatment_prices jsonb default '{}'::jsonb,
  hot_lead_threshold int default 80,
  notification_channels jsonb default '{}'::jsonb,
  message_templates jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  workflow_name text,
  status text default 'pending',
  attempts int default 0,
  last_error text,
  payload jsonb default '{}'::jsonb,
  next_retry_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text,
  table_name text,
  row_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  source text,
  campaign_name text,
  utm_data jsonb default '{}'::jsonb,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  channel text,
  template text,
  status text,
  sent_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.clinics
  add column if not exists slug text,
  add column if not exists email text,
  add column if not exists owner_email text,
  add column if not exists reception_phone text,
  add column if not exists timezone text default 'America/Asuncion',
  add column if not exists status text default 'active',
  add column if not exists is_active boolean default true;

alter table public.profiles
  add column if not exists active boolean default true;

alter table public.leads
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists is_archived boolean default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_reason text;

alter table public.lead_events
  add column if not exists old_value text,
  add column if not exists new_value text,
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.tasks
  add column if not exists type text,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists completed_at timestamptz;

alter table public.clinic_public_forms
  add column if not exists clinic_slug text,
  add column if not exists public_token text,
  add column if not exists landing_url text,
  add column if not exists allowed_origins text[] default '{}',
  add column if not exists is_active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.form_submission_logs
  add column if not exists clinic_public_form_id uuid references public.clinic_public_forms(id) on delete cascade,
  add column if not exists clinic_id uuid references public.clinics(id) on delete cascade,
  add column if not exists ip_hash text,
  add column if not exists phone_hash text,
  add column if not exists status text,
  add column if not exists created_at timestamptz default now();

alter table public.clinics
  alter column timezone set default 'America/Asuncion',
  alter column status set default 'active',
  alter column is_active set default true;

alter table public.profiles
  alter column active set default true;

alter table public.leads
  alter column is_archived set default false,
  alter column contact_attempts set default 0,
  alter column status set default 'Nuevo';

alter table public.tasks
  alter column status set default 'Pendiente';

alter table public.clinic_public_forms
  alter column allowed_origins set default '{}',
  alter column is_active set default true;

alter table public.form_submission_logs
  alter column status set default 'accepted';

alter table public.clinic_settings
  alter column treatments set default '[]'::jsonb,
  alter column treatment_prices set default '{}'::jsonb,
  alter column hot_lead_threshold set default 80,
  alter column notification_channels set default '{}'::jsonb,
  alter column message_templates set default '{}'::jsonb;

alter table public.automation_jobs
  alter column status set default 'pending',
  alter column attempts set default 0,
  alter column payload set default '{}'::jsonb;

alter table public.campaigns
  alter column utm_data set default '{}'::jsonb,
  alter column active set default true;

alter table public.messages
  alter column metadata set default '{}'::jsonb;

create unique index if not exists clinics_slug_unique_idx
  on public.clinics (slug)
  where slug is not null;

create unique index if not exists clinic_public_forms_clinic_slug_unique_idx
  on public.clinic_public_forms (clinic_slug)
  where clinic_slug is not null;

create unique index if not exists clinic_public_forms_public_token_unique_idx
  on public.clinic_public_forms (public_token)
  where public_token is not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_role_check'
  ) then
    alter table public.profiles drop constraint profiles_role_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('admin', 'owner', 'receptionist')) not valid;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_priority_check'
  ) then
    alter table public.tasks drop constraint tasks_priority_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_priority_check'
  ) then
    alter table public.tasks
      add constraint tasks_priority_check
      check (priority in ('baja', 'media', 'alta', 'urgente', 'Baja', 'Media', 'Alta', 'Urgente')) not valid;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_status_check'
  ) then
    alter table public.tasks drop constraint tasks_status_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_status_check'
  ) then
    alter table public.tasks
      add constraint tasks_status_check
      check (status in ('pendiente', 'hecho', 'vencido', 'cancelado', 'Pendiente', 'Completada', 'Vencida', 'Cancelada')) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.clinic_public_forms'::regclass
      and conname = 'clinic_public_forms_slug_format'
  ) then
    alter table public.clinic_public_forms
      add constraint clinic_public_forms_slug_format
      check (clinic_slug = lower(clinic_slug) and clinic_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.clinic_public_forms'::regclass
      and conname = 'clinic_public_forms_token_format'
  ) then
    alter table public.clinic_public_forms
      add constraint clinic_public_forms_token_format
      check (public_token ~ '^lf_[A-Za-z0-9_-]{32,}$') not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.form_submission_logs'::regclass
      and conname = 'form_submission_logs_status_check'
  ) then
    alter table public.form_submission_logs
      add constraint form_submission_logs_status_check
      check (status in ('accepted', 'rate_limited', 'invalid_token', 'spam', 'error')) not valid;
  end if;
end $$;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  item text;
  trigger_name text;
begin
  foreach item in array array[
    'clinics',
    'profiles',
    'leads',
    'appointments',
    'tasks',
    'clinic_public_forms',
    'clinic_settings',
    'automation_jobs',
    'campaigns'
  ]
  loop
    trigger_name := 'update_' || item || '_updated_at';

    if to_regclass('public.' || item) is not null
       and not exists (
         select 1
         from pg_trigger
         where tgrelid = ('public.' || item)::regclass
           and not tgisinternal
           and tgname in ('set_' || item || '_updated_at', trigger_name)
       ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.update_updated_at_column()',
        trigger_name,
        item
      );
    end if;
  end loop;
end $$;
