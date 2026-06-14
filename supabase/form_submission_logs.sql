-- CRM Dental - logs con hashes para rate limiting del webhook publico.
-- Ejecutar manualmente en Supabase SQL Editor.
-- No guarda IP ni telefono crudos. n8n debe enviar hashes.

begin;

create table if not exists public.form_submission_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_public_form_id uuid not null references public.clinic_public_forms(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  ip_hash text,
  phone_hash text,
  status text not null default 'accepted'
    check (status in ('accepted', 'rate_limited', 'invalid_token', 'error')),
  created_at timestamptz not null default now()
);

create index if not exists form_submission_logs_form_ip_created_idx
  on public.form_submission_logs (clinic_public_form_id, ip_hash, created_at desc)
  where ip_hash is not null;

create index if not exists form_submission_logs_form_phone_created_idx
  on public.form_submission_logs (clinic_public_form_id, phone_hash, created_at desc)
  where phone_hash is not null;

create index if not exists form_submission_logs_clinic_created_idx
  on public.form_submission_logs (clinic_id, created_at desc);

alter table public.form_submission_logs enable row level security;

drop policy if exists "form_submission_logs_select_admin" on public.form_submission_logs;
create policy "form_submission_logs_select_admin"
on public.form_submission_logs
for select
to authenticated
using (app_private.is_clinic_admin(clinic_id));

-- Intencionalmente no hay policies INSERT/UPDATE/DELETE para frontend.
-- n8n escribe estos logs con service_role server-side y RLS no se desactiva.

commit;
