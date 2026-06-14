-- Indexes required by lead-intake Edge Function and production dashboards.
-- Safe migration: creates indexes only if missing.

create index if not exists leads_clinic_created_at_desc_idx
  on public.leads (clinic_id, created_at desc);

create index if not exists leads_clinic_status_prod_idx
  on public.leads (clinic_id, status);

create index if not exists leads_clinic_phone_plus_idx
  on public.leads (clinic_id, phone_plus);

create index if not exists leads_clinic_classification_prod_idx
  on public.leads (clinic_id, classification);

create index if not exists leads_clinic_is_archived_idx
  on public.leads (clinic_id, is_archived);

create index if not exists appointments_clinic_date_time_prod_idx
  on public.appointments (clinic_id, appointment_date, appointment_time);

create index if not exists tasks_clinic_status_due_prod_idx
  on public.tasks (clinic_id, status, due_at);

create index if not exists tasks_clinic_lead_type_open_idx
  on public.tasks (clinic_id, lead_id, type, status);

create index if not exists lead_events_clinic_lead_created_desc_idx
  on public.lead_events (clinic_id, lead_id, created_at desc);

create index if not exists clinic_public_forms_slug_token_active_idx
  on public.clinic_public_forms (clinic_slug, public_token, is_active);

create index if not exists form_submission_logs_form_ip_created_desc_idx
  on public.form_submission_logs (clinic_public_form_id, ip_hash, created_at desc);

create index if not exists form_submission_logs_form_phone_created_desc_idx
  on public.form_submission_logs (clinic_public_form_id, phone_hash, created_at desc);

create index if not exists automation_jobs_status_retry_idx
  on public.automation_jobs (status, next_retry_at);

create index if not exists automation_jobs_clinic_status_idx
  on public.automation_jobs (clinic_id, status);

create index if not exists audit_logs_clinic_created_desc_idx
  on public.audit_logs (clinic_id, created_at desc);

create index if not exists campaigns_clinic_active_idx
  on public.campaigns (clinic_id, active);

create index if not exists messages_clinic_lead_created_idx
  on public.messages (clinic_id, lead_id, created_at desc);
