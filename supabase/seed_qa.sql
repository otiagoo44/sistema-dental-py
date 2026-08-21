-- Idempotent synthetic QA data for the rebuilt Supabase project.
-- No real patient information is included.

insert into public.clinics (
  id, name, slug, doctor_name, whatsapp, email, owner_email,
  reception_phone, address_link, calendar_link, primary_color,
  business_hours, timezone, status, is_active
)
values
  (
    '00000000-0000-0000-0000-000000000101',
    'DentalPro QA',
    'dentalpro',
    'Dra. DentalPro QA',
    '595981000000',
    'contacto-dentalpro@example.test',
    'owner-dentalpro@example.test',
    '595981000001',
    'https://maps.example.test/dentalpro',
    'https://calendar.example.test/dentalpro',
    '#0ea5e9',
    '{"monday":"08:00-18:00","tuesday":"08:00-18:00","wednesday":"08:00-18:00","thursday":"08:00-18:00","friday":"08:00-17:00","saturday":"08:00-12:00","sunday":"closed"}'::jsonb,
    'America/Asuncion',
    'active',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    'QA Clinic B',
    'qa-clinic-b',
    'Dr. QA Clinic B',
    '595982000000',
    'contacto-qab@example.test',
    'owner-qab@example.test',
    '595982000001',
    'https://maps.example.test/qa-clinic-b',
    'https://calendar.example.test/qa-clinic-b',
    '#34c9ab',
    '{"monday":"09:00-17:00","tuesday":"09:00-17:00","wednesday":"09:00-17:00","thursday":"09:00-17:00","friday":"09:00-17:00","saturday":"closed","sunday":"closed"}'::jsonb,
    'America/Asuncion',
    'active',
    true
  )
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  doctor_name = excluded.doctor_name,
  whatsapp = excluded.whatsapp,
  email = excluded.email,
  owner_email = excluded.owner_email,
  reception_phone = excluded.reception_phone,
  address_link = excluded.address_link,
  calendar_link = excluded.calendar_link,
  primary_color = excluded.primary_color,
  business_hours = excluded.business_hours,
  timezone = excluded.timezone,
  status = excluded.status,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.clinic_public_forms (
  id, clinic_id, clinic_slug, public_token, landing_url, allowed_origins, is_active
)
values
  (
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000101',
    'dentalpro',
    'lf_FPBOEl9YF_dTGRm6tv3WKBzQgjpmwp__ImBx7pCyHAY',
    'https://sistema-dental-py.vercel.app',
    array['https://sistema-dental-py.vercel.app', 'http://localhost:5173'],
    true
  ),
  (
    '00000000-0000-0000-0000-000000000302',
    '00000000-0000-0000-0000-000000000102',
    'qa-clinic-b',
    'lf_t6Nj0eyee-jgc4L54CQ5ThtBKxwb1gpmfRCLXhf1RpI',
    'http://localhost:5173',
    array['http://localhost:5173'],
    true
  )
on conflict (id) do update set
  clinic_id = excluded.clinic_id,
  clinic_slug = excluded.clinic_slug,
  public_token = excluded.public_token,
  landing_url = excluded.landing_url,
  allowed_origins = excluded.allowed_origins,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.clinic_settings (
  clinic_id, opening_hours, treatments, treatment_prices,
  hot_lead_threshold, notification_channels, message_templates
)
values
  (
    '00000000-0000-0000-0000-000000000101',
    'Lunes a viernes 08:00-18:00; sábado 08:00-12:00',
    '["Implante dental","Ortodoncia","Blanqueamiento","Limpieza","Urgencia/dolor","Carillas"]'::jsonb,
    '{"Implante dental":5000000,"Ortodoncia":4000000,"Blanqueamiento":500000,"Limpieza":250000,"Urgencia/dolor":350000,"Carillas":2000000}'::jsonb,
    80,
    '{"email":false,"whatsapp":false,"n8n":false}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    'Lunes a viernes 09:00-17:00',
    '["Implante dental","Ortodoncia","Blanqueamiento","Limpieza","Urgencia/dolor","Carillas"]'::jsonb,
    '{"Implante dental":5000000,"Ortodoncia":4000000,"Blanqueamiento":500000,"Limpieza":250000,"Urgencia/dolor":350000,"Carillas":2000000}'::jsonb,
    80,
    '{"email":false,"whatsapp":false,"n8n":false}'::jsonb,
    '{}'::jsonb
  )
on conflict (clinic_id) do update set
  opening_hours = excluded.opening_hours,
  treatments = excluded.treatments,
  treatment_prices = excluded.treatment_prices,
  hot_lead_threshold = excluded.hot_lead_threshold,
  notification_channels = excluded.notification_channels,
  message_templates = excluded.message_templates,
  updated_at = now();

insert into public.treatment_prices (clinic_id, treatment, estimated_price)
select clinic_id, treatment, estimated_price
from (
  values
    ('00000000-0000-0000-0000-000000000101'::uuid, 'Implante dental', 5000000::numeric),
    ('00000000-0000-0000-0000-000000000101'::uuid, 'Ortodoncia', 4000000::numeric),
    ('00000000-0000-0000-0000-000000000101'::uuid, 'Blanqueamiento', 500000::numeric),
    ('00000000-0000-0000-0000-000000000101'::uuid, 'Limpieza', 250000::numeric),
    ('00000000-0000-0000-0000-000000000101'::uuid, 'Urgencia/dolor', 350000::numeric),
    ('00000000-0000-0000-0000-000000000101'::uuid, 'Carillas', 2000000::numeric),
    ('00000000-0000-0000-0000-000000000102'::uuid, 'Implante dental', 5000000::numeric),
    ('00000000-0000-0000-0000-000000000102'::uuid, 'Ortodoncia', 4000000::numeric),
    ('00000000-0000-0000-0000-000000000102'::uuid, 'Blanqueamiento', 500000::numeric),
    ('00000000-0000-0000-0000-000000000102'::uuid, 'Limpieza', 250000::numeric),
    ('00000000-0000-0000-0000-000000000102'::uuid, 'Urgencia/dolor', 350000::numeric),
    ('00000000-0000-0000-0000-000000000102'::uuid, 'Carillas', 2000000::numeric)
) as prices(clinic_id, treatment, estimated_price)
on conflict (clinic_id, treatment) do update set
  estimated_price = excluded.estimated_price,
  updated_at = now();

insert into public.message_templates (id, clinic_id, name, treatment, situation, message)
values
  (
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000101',
    'Primer contacto', null, 'Nuevo lead',
    'Hola {{name}}, gracias por contactar con DentalPro QA. ¿Querés que coordinemos una evaluación para {{treatment}}?'
  ),
  (
    '00000000-0000-0000-0000-000000000502',
    '00000000-0000-0000-0000-000000000101',
    'Recuperación no-show', null, 'No Asistió',
    'Hola {{name}}, vimos que no pudiste asistir. Podemos ayudarte a reprogramar tu consulta.'
  ),
  (
    '00000000-0000-0000-0000-000000000503',
    '00000000-0000-0000-0000-000000000102',
    'Primer contacto', null, 'Nuevo lead',
    'Hola {{name}}, gracias por contactar con QA Clinic B. ¿Querés coordinar una evaluación?'
  )
on conflict (id) do update set
  clinic_id = excluded.clinic_id,
  name = excluded.name,
  treatment = excluded.treatment,
  situation = excluded.situation,
  message = excluded.message,
  updated_at = now();

insert into public.leads (
  id, clinic_id, name, phone, phone_plus, treatment, urgency,
  score, classification, status, situation, evaluation_previous,
  consultation_reason, estimated_value, next_action, next_followup_at,
  contact_attempts, whatsapp_link, source, page, notes,
  consent_contact, consent_at, consent_source, consent_page
)
values
  (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    'QA Lead Caliente', '0981000101', '+595981000101', 'Implante dental', 'Hoy',
    110, 'Lead Caliente', 'Nuevo', 'Quiero agendar una consulta', 'Tengo estudios / radiografía',
    'Caso comercial sintético para QA', 5000000, 'Contactar inmediatamente', now() + interval '2 hours',
    0, 'https://wa.me/595981000101', 'seed_qa', 'qa/hot', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/hot'
  ),
  (
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000101',
    'QA Lead Medio', '0981000102', '+595981000102', 'Ortodoncia', 'Esta semana',
    60, 'Lead Medio', 'Contactado', 'Quiero saber precios', 'No',
    'Caso comercial sintético para QA', 4000000, 'Hacer seguimiento', app_private.tomorrow_at_asuncion(9),
    1, 'https://wa.me/595981000102', 'seed_qa', 'qa/medium', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/medium'
  ),
  (
    '00000000-0000-0000-0000-000000000203',
    '00000000-0000-0000-0000-000000000101',
    'QA Lead Frío', '0981000103', '+595981000103', 'Limpieza', 'Solo estoy consultando',
    20, 'Lead Frío', 'No Contactado', 'Estoy comparando opciones', 'No estoy seguro',
    'Caso comercial sintético para QA', 250000, 'Seguimiento automático', now() + interval '3 days',
    0, 'https://wa.me/595981000103', 'seed_qa', 'qa/cold', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/cold'
  ),
  (
    '00000000-0000-0000-0000-000000000204',
    '00000000-0000-0000-0000-000000000101',
    'QA No Show', '0981000104', '+595981000104', 'Implante dental', 'Esta semana',
    85, 'Lead Caliente', 'No Asistió', 'Quiero reprogramar', 'Sí',
    'Caso no-show sintético para QA', 5000000, 'Reprogramar consulta', app_private.tomorrow_at_asuncion(9),
    2, 'https://wa.me/595981000104', 'seed_qa', 'qa/no-show', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/no-show'
  ),
  (
    '00000000-0000-0000-0000-000000000205',
    '00000000-0000-0000-0000-000000000102',
    'QA Clinic B Lead', '0982000101', '+595982000101', 'Blanqueamiento', 'Este mes',
    50, 'Lead Medio', 'Nuevo', 'Quiero saber precios', 'No',
    'Caso sintético de aislamiento multi-clínica', 500000, 'Contactar hoy', app_private.tomorrow_at_asuncion(10),
    0, 'https://wa.me/595982000101', 'seed_qa', 'qa/clinic-b', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/clinic-b'
  )
on conflict (id) do update set
  clinic_id = excluded.clinic_id,
  name = excluded.name,
  phone = excluded.phone,
  phone_plus = excluded.phone_plus,
  treatment = excluded.treatment,
  urgency = excluded.urgency,
  score = excluded.score,
  classification = excluded.classification,
  status = excluded.status,
  situation = excluded.situation,
  evaluation_previous = excluded.evaluation_previous,
  consultation_reason = excluded.consultation_reason,
  estimated_value = excluded.estimated_value,
  next_action = excluded.next_action,
  next_followup_at = excluded.next_followup_at,
  contact_attempts = excluded.contact_attempts,
  whatsapp_link = excluded.whatsapp_link,
  source = excluded.source,
  page = excluded.page,
  notes = excluded.notes,
  consent_contact = excluded.consent_contact,
  consent_at = excluded.consent_at,
  consent_source = excluded.consent_source,
  consent_page = excluded.consent_page,
  updated_at = now();

insert into public.appointments (
  id, clinic_id, lead_id, appointment_date, appointment_time,
  doctor_assigned, treatment_scheduled, status, notes
)
values
  (
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000202',
    (now() at time zone 'America/Asuncion')::date + 2,
    '10:00', 'Dra. DentalPro QA', 'Ortodoncia', 'Agendado', 'Turno sintético para QA.'
  ),
  (
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000204',
    (now() at time zone 'America/Asuncion')::date - 1,
    '11:00', 'Dra. DentalPro QA', 'Implante dental', 'No Asistió', 'No-show sintético para QA.'
  )
on conflict (id) do update set
  clinic_id = excluded.clinic_id,
  lead_id = excluded.lead_id,
  appointment_date = excluded.appointment_date,
  appointment_time = excluded.appointment_time,
  doctor_assigned = excluded.doctor_assigned,
  treatment_scheduled = excluded.treatment_scheduled,
  status = excluded.status,
  notes = excluded.notes,
  updated_at = now();

insert into public.lead_events (
  id, clinic_id, lead_id, event_type, title, description, metadata
)
values
  (
    '00000000-0000-0000-0000-000000000601',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000201',
    'lead_created', 'Lead QA creado', 'Lead sintético creado por seed.',
    '{"source":"seed_qa","consent_contact":true}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000602',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000201',
    'lead_duplicate_submission', 'Duplicado controlado QA',
    'Evento sintético para probar deduplicación sin crear una segunda fila de lead.',
    '{"source":"seed_qa","duplicate":true}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000603',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000204',
    'appointment_no_show', 'No-show QA', 'Inasistencia sintética para recuperación.',
    '{"source":"seed_qa","timezone":"America/Asuncion"}'::jsonb
  )
on conflict (id) do update set
  clinic_id = excluded.clinic_id,
  lead_id = excluded.lead_id,
  event_type = excluded.event_type,
  title = excluded.title,
  description = excluded.description,
  metadata = excluded.metadata;

insert into public.tasks (
  id, clinic_id, lead_id, title, description, type, priority,
  status, due_at
)
values
  (
    '00000000-0000-0000-0000-000000000701',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000201',
    'Contactar lead caliente', 'Tarea sintética de contacto.', 'contact', 'alta',
    'pendiente', now() + interval '2 hours'
  ),
  (
    '00000000-0000-0000-0000-000000000702',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000204',
    'Recuperar paciente no-show', 'Tarea sintética de recuperación.', 'no_show_recovery', 'alta',
    'pendiente', app_private.tomorrow_at_asuncion(9)
  )
on conflict (id) do update set
  clinic_id = excluded.clinic_id,
  lead_id = excluded.lead_id,
  title = excluded.title,
  description = excluded.description,
  type = excluded.type,
  priority = excluded.priority,
  status = excluded.status,
  due_at = excluded.due_at,
  completed_at = null,
  updated_at = now();

insert into public.automation_jobs (
  id, clinic_id, lead_id, workflow_name, status, attempts, payload
)
values
  (
    '00000000-0000-0000-0000-000000000801',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000201',
    'lead_hot_alert', 'pending', 0,
    '{"source":"seed_qa","synthetic":true}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000802',
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000205',
    'lead_created', 'pending', 0,
    '{"source":"seed_qa","synthetic":true}'::jsonb
  )
on conflict (id) do update set
  clinic_id = excluded.clinic_id,
  lead_id = excluded.lead_id,
  workflow_name = excluded.workflow_name,
  status = excluded.status,
  attempts = excluded.attempts,
  payload = excluded.payload,
  updated_at = now();
