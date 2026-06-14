-- Run in Supabase SQL Editor after applying migrations and deploying lead-intake.

-- Ultimos leads.
select id, clinic_id, name, phone_plus, treatment, classification, score, status, source, page, created_at
from public.leads
order by created_at desc
limit 30;

-- Eventos recientes.
select id, clinic_id, lead_id, event_type, title, metadata, created_at
from public.lead_events
order by created_at desc
limit 50;

-- Tareas recientes.
select id, clinic_id, lead_id, title, type, priority, status, due_at, completed_at, created_at
from public.tasks
order by created_at desc
limit 50;

-- Jobs asincronicos para n8n.
select id, clinic_id, lead_id, workflow_name, status, attempts, next_retry_at, created_at
from public.automation_jobs
order by created_at desc
limit 50;

-- Logs de formulario.
select id, clinic_public_form_id, clinic_id, status, created_at
from public.form_submission_logs
order by created_at desc
limit 50;

-- Formularios publicos.
select id, clinic_id, clinic_slug, landing_url, allowed_origins, is_active, created_at, updated_at
from public.clinic_public_forms
order by created_at desc;

-- Origin real de landing para dentalpro. No debe quedar Netlify ni placeholder viejo.
select clinic_slug, allowed_origins, is_active
from public.clinic_public_forms
where clinic_slug = 'dentalpro';

select
  'https://sistema-dental-py.vercel.app' = any(allowed_origins) as has_vercel_landing_origin,
  'http://localhost:5173' = any(allowed_origins) as has_local_origin,
  'https://TU-LANDING.com' = any(allowed_origins) as has_old_placeholder,
  'https://sistema-dentalpro-py.netlify.app' = any(allowed_origins) as has_old_netlify_origin
from public.clinic_public_forms
where clinic_slug = 'dentalpro';

-- Agenda.
select id, clinic_id, lead_id, appointment_date, appointment_time, status, doctor_assigned, created_at
from public.appointments
order by appointment_date desc, appointment_time desc
limit 50;

-- RLS habilitado en tablas esperadas.
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'clinics','profiles','leads','lead_events','appointments','tasks',
    'treatment_prices','message_templates','daily_reports','clinic_public_forms',
    'form_submission_logs','automation_jobs','audit_logs','campaigns','messages',
    'clinic_settings'
  )
order by c.relname;

-- Policies instaladas.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- Helpers app_private esperados.
select n.nspname as schema_name, p.proname as function_name, pg_get_function_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app_private'
order by p.proname;

-- No debe haber DELETE frontend en tablas operativas.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and cmd = 'DELETE'
  and tablename in ('leads', 'lead_events', 'appointments', 'tasks');

-- Leads sin clinic_id no deben existir.
select count(*) as leads_without_clinic_id
from public.leads
where clinic_id is null;

-- Duplicados por clinica y phone_plus.
select clinic_id, phone_plus, count(*) as duplicates
from public.leads
where phone_plus is not null
group by clinic_id, phone_plus
having count(*) > 1
order by duplicates desc;
