create extension if not exists pgcrypto;

create schema if not exists app_private;

revoke all on schema app_private from public;

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  doctor_name text,
  whatsapp text,
  address_link text,
  calendar_link text,
  logo_url text,
  primary_color text not null default '#0ea5e9',
  business_hours jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  full_name text not null,
  email text not null,
  role text not null check (role in ('owner', 'doctor', 'receptionist', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, clinic_id)
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  name text not null,
  phone text,
  phone_plus text,
  treatment text,
  urgency text,
  score integer not null default 0 check (score >= 0),
  classification text not null default 'Lead Medio' check (classification in ('Lead Caliente', 'Lead Medio', 'Lead Frío')),
  status text not null default 'Nuevo' check (status in ('Nuevo', 'No Contactado', 'Contactado', 'Respondió', 'Consulta Agendada', 'Confirmado', 'Asistió', 'Presupuesto Enviado', 'Tratamiento Iniciado', 'No Respondió', 'Perdido', 'Reactivar 30d', 'No Asistió')),
  situation text,
  evaluation_previous text,
  consultation_reason text,
  estimated_value numeric(14,2),
  next_action text,
  next_followup_at timestamptz,
  last_contact_at timestamptz,
  contact_attempts integer not null default 0 check (contact_attempts >= 0),
  whatsapp_link text,
  source text,
  page text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, clinic_id)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  lead_id uuid not null,
  appointment_date date not null,
  appointment_time time not null,
  doctor_assigned text,
  treatment_scheduled text,
  status text not null default 'Agendado' check (status in ('Agendado', 'Confirmado', 'Asistió', 'No Asistió', 'Reprogramado', 'Cancelado')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lead_id, clinic_id) references public.leads(id, clinic_id) on delete cascade
);

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  lead_id uuid not null,
  event_type text not null,
  title text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lead_id, clinic_id) references public.leads(id, clinic_id) on delete cascade
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  lead_id uuid,
  title text not null,
  description text,
  due_at timestamptz,
  priority text not null default 'media' check (priority in ('baja', 'media', 'alta', 'urgente')),
  status text not null default 'pendiente' check (status in ('pendiente', 'hecho', 'vencido', 'cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lead_id, clinic_id) references public.leads(id, clinic_id) on delete cascade
);

create table if not exists public.treatment_prices (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  treatment text not null,
  estimated_price numeric(14,2) not null check (estimated_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, treatment)
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  treatment text,
  situation text,
  message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  report_date date not null,
  total_leads integer not null default 0 check (total_leads >= 0),
  hot_leads integer not null default 0 check (hot_leads >= 0),
  scheduled_appointments integer not null default 0 check (scheduled_appointments >= 0),
  pending_followups integer not null default 0 check (pending_followups >= 0),
  pipeline_value numeric(14,2) not null default 0 check (pipeline_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, report_date)
);

create index if not exists profiles_clinic_id_idx on public.profiles (clinic_id);
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists leads_clinic_created_at_idx on public.leads (clinic_id, created_at desc);
create index if not exists leads_clinic_status_idx on public.leads (clinic_id, status);
create index if not exists leads_clinic_classification_idx on public.leads (clinic_id, classification);
create index if not exists leads_clinic_next_followup_idx on public.leads (clinic_id, next_followup_at) where next_followup_at is not null;
create index if not exists leads_clinic_phone_idx on public.leads (clinic_id, phone);
create index if not exists leads_clinic_treatment_idx on public.leads (clinic_id, treatment);
create unique index if not exists leads_clinic_phone_plus_unique on public.leads (clinic_id, phone_plus) where phone_plus is not null;
create index if not exists appointments_clinic_date_time_idx on public.appointments (clinic_id, appointment_date, appointment_time);
create index if not exists appointments_lead_id_idx on public.appointments (lead_id);
create index if not exists appointments_clinic_status_idx on public.appointments (clinic_id, status);
create index if not exists lead_events_clinic_lead_created_idx on public.lead_events (clinic_id, lead_id, created_at desc);
create index if not exists lead_events_created_by_idx on public.lead_events (created_by);
create index if not exists lead_events_type_idx on public.lead_events (clinic_id, event_type);
create index if not exists tasks_clinic_status_due_idx on public.tasks (clinic_id, status, due_at);
create index if not exists tasks_lead_id_idx on public.tasks (lead_id);
create index if not exists tasks_priority_idx on public.tasks (clinic_id, priority);
create index if not exists treatment_prices_clinic_idx on public.treatment_prices (clinic_id);
create index if not exists message_templates_clinic_idx on public.message_templates (clinic_id);
create index if not exists message_templates_lookup_idx on public.message_templates (clinic_id, treatment, situation);
create index if not exists daily_reports_clinic_date_idx on public.daily_reports (clinic_id, report_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_clinics_updated_at on public.clinics;
create trigger set_clinics_updated_at before update on public.clinics for each row execute function public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists set_leads_updated_at on public.leads;
create trigger set_leads_updated_at before update on public.leads for each row execute function public.set_updated_at();

drop trigger if exists set_appointments_updated_at on public.appointments;
create trigger set_appointments_updated_at before update on public.appointments for each row execute function public.set_updated_at();

drop trigger if exists set_lead_events_updated_at on public.lead_events;
create trigger set_lead_events_updated_at before update on public.lead_events for each row execute function public.set_updated_at();

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();

drop trigger if exists set_treatment_prices_updated_at on public.treatment_prices;
create trigger set_treatment_prices_updated_at before update on public.treatment_prices for each row execute function public.set_updated_at();

drop trigger if exists set_message_templates_updated_at on public.message_templates;
create trigger set_message_templates_updated_at before update on public.message_templates for each row execute function public.set_updated_at();

drop trigger if exists set_daily_reports_updated_at on public.daily_reports;
create trigger set_daily_reports_updated_at before update on public.daily_reports for each row execute function public.set_updated_at();

create or replace function app_private.current_user_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.clinic_id
  from public.profiles p
  where p.id = (select auth.uid())
  limit 1;
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
  );
$$;

create or replace function app_private.is_clinic_admin(target_clinic_id uuid)
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
      and p.role in ('owner', 'admin')
  );
$$;

revoke all on all functions in schema app_private from public;
grant usage on schema app_private to authenticated;
grant execute on all functions in schema app_private to authenticated;

alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.appointments enable row level security;
alter table public.lead_events enable row level security;
alter table public.tasks enable row level security;
alter table public.treatment_prices enable row level security;
alter table public.message_templates enable row level security;
alter table public.daily_reports enable row level security;

drop policy if exists "clinics_select_same_clinic" on public.clinics;
create policy "clinics_select_same_clinic" on public.clinics for select to authenticated using (app_private.is_clinic_member(id));

drop policy if exists "clinics_update_admin" on public.clinics;
create policy "clinics_update_admin" on public.clinics for update to authenticated using (app_private.is_clinic_admin(id)) with check (app_private.is_clinic_admin(id));

drop policy if exists "profiles_select_same_clinic" on public.profiles;
create policy "profiles_select_same_clinic" on public.profiles for select to authenticated using (app_private.is_clinic_member(clinic_id));

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles for insert to authenticated with check (app_private.is_clinic_admin(clinic_id));

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update to authenticated using (app_private.is_clinic_admin(clinic_id)) with check (app_private.is_clinic_admin(clinic_id));

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles for delete to authenticated using (app_private.is_clinic_admin(clinic_id) and role <> 'owner');

drop policy if exists "leads_select_same_clinic" on public.leads;
create policy "leads_select_same_clinic" on public.leads for select to authenticated using (app_private.is_clinic_member(clinic_id));

drop policy if exists "leads_insert_same_clinic" on public.leads;
create policy "leads_insert_same_clinic" on public.leads for insert to authenticated with check (app_private.is_clinic_member(clinic_id));

drop policy if exists "leads_update_same_clinic" on public.leads;
create policy "leads_update_same_clinic" on public.leads for update to authenticated using (app_private.is_clinic_member(clinic_id)) with check (app_private.is_clinic_member(clinic_id));

drop policy if exists "leads_delete_same_clinic" on public.leads;
create policy "leads_delete_same_clinic" on public.leads for delete to authenticated using (app_private.is_clinic_admin(clinic_id));

drop policy if exists "appointments_select_same_clinic" on public.appointments;
create policy "appointments_select_same_clinic" on public.appointments for select to authenticated using (app_private.is_clinic_member(clinic_id));

drop policy if exists "appointments_insert_same_clinic" on public.appointments;
create policy "appointments_insert_same_clinic" on public.appointments for insert to authenticated with check (app_private.is_clinic_member(clinic_id));

drop policy if exists "appointments_update_same_clinic" on public.appointments;
create policy "appointments_update_same_clinic" on public.appointments for update to authenticated using (app_private.is_clinic_member(clinic_id)) with check (app_private.is_clinic_member(clinic_id));

drop policy if exists "appointments_delete_same_clinic" on public.appointments;
create policy "appointments_delete_same_clinic" on public.appointments for delete to authenticated using (app_private.is_clinic_member(clinic_id));

drop policy if exists "lead_events_select_same_clinic" on public.lead_events;
create policy "lead_events_select_same_clinic" on public.lead_events for select to authenticated using (app_private.is_clinic_member(clinic_id));

drop policy if exists "lead_events_insert_same_clinic" on public.lead_events;
create policy "lead_events_insert_same_clinic" on public.lead_events for insert to authenticated with check (app_private.is_clinic_member(clinic_id));

drop policy if exists "lead_events_update_same_clinic" on public.lead_events;
create policy "lead_events_update_same_clinic" on public.lead_events for update to authenticated using (app_private.is_clinic_member(clinic_id)) with check (app_private.is_clinic_member(clinic_id));

drop policy if exists "lead_events_delete_same_clinic" on public.lead_events;
create policy "lead_events_delete_same_clinic" on public.lead_events for delete to authenticated using (app_private.is_clinic_member(clinic_id));

drop policy if exists "tasks_select_same_clinic" on public.tasks;
create policy "tasks_select_same_clinic" on public.tasks for select to authenticated using (app_private.is_clinic_member(clinic_id));

drop policy if exists "tasks_insert_same_clinic" on public.tasks;
create policy "tasks_insert_same_clinic" on public.tasks for insert to authenticated with check (app_private.is_clinic_member(clinic_id));

drop policy if exists "tasks_update_same_clinic" on public.tasks;
create policy "tasks_update_same_clinic" on public.tasks for update to authenticated using (app_private.is_clinic_member(clinic_id)) with check (app_private.is_clinic_member(clinic_id));

drop policy if exists "tasks_delete_same_clinic" on public.tasks;
create policy "tasks_delete_same_clinic" on public.tasks for delete to authenticated using (app_private.is_clinic_member(clinic_id));

drop policy if exists "treatment_prices_select_same_clinic" on public.treatment_prices;
create policy "treatment_prices_select_same_clinic" on public.treatment_prices for select to authenticated using (app_private.is_clinic_member(clinic_id));

drop policy if exists "treatment_prices_insert_admin" on public.treatment_prices;
create policy "treatment_prices_insert_admin" on public.treatment_prices for insert to authenticated with check (app_private.is_clinic_admin(clinic_id));

drop policy if exists "treatment_prices_update_admin" on public.treatment_prices;
create policy "treatment_prices_update_admin" on public.treatment_prices for update to authenticated using (app_private.is_clinic_admin(clinic_id)) with check (app_private.is_clinic_admin(clinic_id));

drop policy if exists "treatment_prices_delete_admin" on public.treatment_prices;
create policy "treatment_prices_delete_admin" on public.treatment_prices for delete to authenticated using (app_private.is_clinic_admin(clinic_id));

drop policy if exists "message_templates_select_same_clinic" on public.message_templates;
create policy "message_templates_select_same_clinic" on public.message_templates for select to authenticated using (app_private.is_clinic_member(clinic_id));

drop policy if exists "message_templates_insert_admin" on public.message_templates;
create policy "message_templates_insert_admin" on public.message_templates for insert to authenticated with check (app_private.is_clinic_admin(clinic_id));

drop policy if exists "message_templates_update_admin" on public.message_templates;
create policy "message_templates_update_admin" on public.message_templates for update to authenticated using (app_private.is_clinic_admin(clinic_id)) with check (app_private.is_clinic_admin(clinic_id));

drop policy if exists "message_templates_delete_admin" on public.message_templates;
create policy "message_templates_delete_admin" on public.message_templates for delete to authenticated using (app_private.is_clinic_admin(clinic_id));

drop policy if exists "daily_reports_select_same_clinic" on public.daily_reports;
create policy "daily_reports_select_same_clinic" on public.daily_reports for select to authenticated using (app_private.is_clinic_member(clinic_id));

drop policy if exists "daily_reports_insert_admin" on public.daily_reports;
create policy "daily_reports_insert_admin" on public.daily_reports for insert to authenticated with check (app_private.is_clinic_admin(clinic_id));

drop policy if exists "daily_reports_update_admin" on public.daily_reports;
create policy "daily_reports_update_admin" on public.daily_reports for update to authenticated using (app_private.is_clinic_admin(clinic_id)) with check (app_private.is_clinic_admin(clinic_id));

drop policy if exists "daily_reports_delete_admin" on public.daily_reports;
create policy "daily_reports_delete_admin" on public.daily_reports for delete to authenticated using (app_private.is_clinic_admin(clinic_id));
