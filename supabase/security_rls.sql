-- CRM Dental - hardening minimo para multi-clinica, archivado y roles.
-- Ejecutar manualmente en Supabase SQL Editor despues de revisar.
-- No desactiva RLS, no borra datos y no hace hard delete.

begin;

alter table public.leads
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_reason text;

create index if not exists leads_clinic_archived_idx
  on public.leads (clinic_id, is_archived, created_at desc);

do $$
declare
  constraint_name text;
begin
  select c.conname
    into constraint_name
  from pg_constraint c
  where c.conrelid = 'public.leads'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%status%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.leads drop constraint %I', constraint_name);
  end if;

  alter table public.leads
    add constraint leads_status_check
    check (status in (
      'Nuevo',
      'No Contactado',
      'Contactado',
      'Respondió',
      'Consulta Agendada',
      'Confirmado',
      'Asistió',
      'Presupuesto Enviado',
      'Tratamiento Iniciado',
      'No Respondió',
      'Perdido',
      'Reactivar 30d',
      'No Asistió',
      'Archivado'
    ));
end $$;

do $$
declare
  constraint_name text;
begin
  select c.conname
    into constraint_name
  from pg_constraint c
  where c.conrelid = 'public.profiles'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%role%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', constraint_name);
  end if;

  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('admin', 'receptionist')) not valid;
end $$;

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
      and p.role = 'admin'
  );
$$;

revoke all on function app_private.is_clinic_admin(uuid) from public;
grant execute on function app_private.is_clinic_admin(uuid) to authenticated;

drop policy if exists "leads_delete_same_clinic" on public.leads;
drop policy if exists "appointments_delete_same_clinic" on public.appointments;

-- Opcionalmente endurece tambien tablas operativas auxiliares. La app no usa DELETE.
drop policy if exists "lead_events_delete_same_clinic" on public.lead_events;
drop policy if exists "tasks_delete_same_clinic" on public.tasks;

alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.appointments enable row level security;
alter table public.lead_events enable row level security;
alter table public.tasks enable row level security;
alter table public.treatment_prices enable row level security;
alter table public.message_templates enable row level security;
alter table public.daily_reports enable row level security;

commit;
