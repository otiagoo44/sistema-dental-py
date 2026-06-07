insert into public.clinics (
  id,
  name,
  doctor_name,
  whatsapp,
  address_link,
  calendar_link,
  logo_url,
  primary_color,
  business_hours
)
values (
  '00000000-0000-0000-0000-000000000101',
  'DentalPro Paraguay',
  'Dr. Demo Dental',
  '+595981000000',
  'https://maps.google.com/?q=DentalPro+Paraguay',
  'https://calendar.google.com/',
  null,
  '#0ea5e9',
  '{"monday":"08:00-18:00","tuesday":"08:00-18:00","wednesday":"08:00-18:00","thursday":"08:00-18:00","friday":"08:00-17:00","saturday":"08:00-12:00","sunday":"closed"}'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  doctor_name = excluded.doctor_name,
  whatsapp = excluded.whatsapp,
  address_link = excluded.address_link,
  calendar_link = excluded.calendar_link,
  logo_url = excluded.logo_url,
  primary_color = excluded.primary_color,
  business_hours = excluded.business_hours;

insert into public.treatment_prices (clinic_id, treatment, estimated_price)
values
  ('00000000-0000-0000-0000-000000000101', 'Implante dental', 5000000),
  ('00000000-0000-0000-0000-000000000101', 'Ortodoncia / brackets', 4000000),
  ('00000000-0000-0000-0000-000000000101', 'Blanqueamiento', 500000),
  ('00000000-0000-0000-0000-000000000101', 'Limpieza dental', 250000),
  ('00000000-0000-0000-0000-000000000101', 'Carillas', 2000000),
  ('00000000-0000-0000-0000-000000000101', 'Dolor o urgencia', 350000),
  ('00000000-0000-0000-0000-000000000101', 'Consulta general', 250000)
on conflict (clinic_id, treatment) do update set
  estimated_price = excluded.estimated_price;

insert into public.message_templates (clinic_id, name, treatment, situation, message)
values
  ('00000000-0000-0000-0000-000000000101', 'Primer contacto', null, 'Nuevo lead', 'Hola {{name}}, gracias por contactar con DentalPro Paraguay. Queremos ayudarte con tu consulta sobre {{treatment}}. ¿Te gustaría que coordinemos una evaluación?'),
  ('00000000-0000-0000-0000-000000000101', 'Seguimiento sin respuesta', null, 'No respondió', 'Hola {{name}}, te escribimos nuevamente de DentalPro Paraguay. Quedamos atentos para ayudarte a coordinar tu consulta.');

insert into public.leads (
  id,
  clinic_id,
  name,
  phone,
  phone_plus,
  treatment,
  urgency,
  score,
  classification,
  status,
  situation,
  evaluation_previous,
  consultation_reason,
  estimated_value,
  next_action,
  next_followup_at,
  last_contact_at,
  contact_attempts,
  whatsapp_link,
  source,
  page,
  notes
)
values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'Lead Demo Implante', '0981000001', '+595981000001', 'Implante dental', 'alta', 145, 'Lead Caliente', 'Nuevo', 'Solicita información comercial', null, 'Quiere conocer precio y disponibilidad', 5000000, 'Contactar por WhatsApp', now() + interval '2 hours', null, 0, 'https://wa.me/595981000001', 'landing', '/implantes', 'Dato demo, no corresponde a paciente real.'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101', 'Lead Demo Ortodoncia', '0981000002', '+595981000002', 'Ortodoncia / brackets', 'media', 80, 'Lead Medio', 'Contactado', 'Comparando opciones', null, 'Consulta por brackets', 4000000, 'Enviar opciones de agenda', now() + interval '1 day', now(), 1, 'https://wa.me/595981000002', 'facebook_ads', '/ortodoncia', 'Dato demo, no corresponde a paciente real.')
on conflict (id) do update set
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
  last_contact_at = excluded.last_contact_at,
  contact_attempts = excluded.contact_attempts,
  whatsapp_link = excluded.whatsapp_link,
  source = excluded.source,
  page = excluded.page,
  notes = excluded.notes;

insert into public.appointments (
  clinic_id,
  lead_id,
  appointment_date,
  appointment_time,
  doctor_assigned,
  treatment_scheduled,
  status,
  notes
)
values (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000202',
  current_date + 2,
  '10:30',
  'Dr. Demo Dental',
  'Ortodoncia / brackets',
  'Agendado',
  'Turno demo.'
);

insert into public.lead_events (
  clinic_id,
  lead_id,
  event_type,
  title,
  description,
  created_by
)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'lead_created', 'Lead creado', 'Lead ingresado desde landing.', null),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000202', 'whatsapp_contact', 'Contacto por WhatsApp', 'Se envió mensaje inicial.', null);

insert into public.tasks (
  clinic_id,
  lead_id,
  title,
  description,
  due_at,
  priority,
  status
)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'Contactar lead caliente', 'Enviar mensaje inicial por WhatsApp.', now() + interval '2 hours', 'urgente', 'pendiente'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000202', 'Confirmar turno', 'Confirmar asistencia 24 horas antes.', now() + interval '1 day', 'alta', 'pendiente');

insert into public.daily_reports (
  clinic_id,
  report_date,
  total_leads,
  hot_leads,
  scheduled_appointments,
  pending_followups,
  pipeline_value
)
values (
  '00000000-0000-0000-0000-000000000101',
  current_date,
  2,
  1,
  1,
  2,
  9000000
)
on conflict (clinic_id, report_date) do update set
  total_leads = excluded.total_leads,
  hot_leads = excluded.hot_leads,
  scheduled_appointments = excluded.scheduled_appointments,
  pending_followups = excluded.pending_followups,
  pipeline_value = excluded.pipeline_value;

-- insert into public.profiles (id, clinic_id, full_name, email, role) values ('AUTH_USERS_ID_REAL', '00000000-0000-0000-0000-000000000101', 'Usuario Demo DentalPro', 'demo@dentalpro.test', 'admin');
