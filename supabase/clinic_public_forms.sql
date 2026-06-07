-- CRM Dental - formularios publicos por clinica.
-- Ejecutar manualmente en Supabase SQL Editor.
-- No modifica destructivamente tablas existentes, no desactiva RLS y no borra datos.

begin;

create table if not exists public.clinic_public_forms (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  clinic_slug text not null unique,
  public_token text not null unique,
  landing_url text,
  allowed_origins text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_public_forms_slug_format
    check (clinic_slug = lower(clinic_slug) and clinic_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint clinic_public_forms_token_format
    check (public_token ~ '^lf_[A-Za-z0-9_-]{32,}$')
);

create index if not exists clinic_public_forms_clinic_idx
  on public.clinic_public_forms (clinic_id);

create index if not exists clinic_public_forms_active_slug_idx
  on public.clinic_public_forms (clinic_slug)
  where is_active = true;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_clinic_public_forms_updated_at on public.clinic_public_forms;
create trigger set_clinic_public_forms_updated_at
before update on public.clinic_public_forms
for each row execute function public.set_updated_at();

create or replace function app_private.is_clinic_public_form_admin(target_clinic_id uuid)
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
      and p.role in ('admin', 'owner')
  );
$$;

revoke all on function app_private.is_clinic_public_form_admin(uuid) from public;
grant execute on function app_private.is_clinic_public_form_admin(uuid) to authenticated;

alter table public.clinic_public_forms enable row level security;

drop policy if exists "clinic_public_forms_select_same_clinic" on public.clinic_public_forms;
create policy "clinic_public_forms_select_same_clinic"
on public.clinic_public_forms
for select
to authenticated
using (app_private.is_clinic_member(clinic_id));

drop policy if exists "clinic_public_forms_insert_admin" on public.clinic_public_forms;
create policy "clinic_public_forms_insert_admin"
on public.clinic_public_forms
for insert
to authenticated
with check (app_private.is_clinic_public_form_admin(clinic_id));

drop policy if exists "clinic_public_forms_update_admin" on public.clinic_public_forms;
create policy "clinic_public_forms_update_admin"
on public.clinic_public_forms
for update
to authenticated
using (app_private.is_clinic_public_form_admin(clinic_id))
with check (app_private.is_clinic_public_form_admin(clinic_id));

-- Intencionalmente no se crea policy DELETE: desde frontend nadie puede borrar.

insert into public.clinic_public_forms (
  clinic_id,
  clinic_slug,
  public_token,
  landing_url,
  allowed_origins,
  is_active
)
values (
  '00000000-0000-0000-0000-000000000101',
  'dentalpro',
  'lf_FQtBqoPD7BCHLQkkDEdS4eK-pXwjj5WJCfLb8fvt6uI',
  null,
  array['http://localhost:5173', 'https://TU-LANDING.com']::text[],
  true
)
on conflict (clinic_slug) do update set
  clinic_id = excluded.clinic_id,
  landing_url = coalesce(public.clinic_public_forms.landing_url, excluded.landing_url),
  allowed_origins = case
    when public.clinic_public_forms.allowed_origins = '{}'::text[] then excluded.allowed_origins
    else public.clinic_public_forms.allowed_origins
  end,
  is_active = public.clinic_public_forms.is_active;

commit;
