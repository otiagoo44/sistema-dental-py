-- Destructive QA-only reset.
-- Run only after confirming the linked project ref is unybqqzhgqxhrwucrofm.
-- It preserves every lead that cannot be classified as synthetic.

begin;

do $guard$
declare
  unexpected_clinics integer;
  unclassified_leads integer;
begin
  select count(*) into unexpected_clinics
  from public.clinics
  where id not in (
    '00000000-0000-0000-0000-000000000101'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid
  )
  or name not in ('DentalPro QA', 'QA Clinic B');

  if unexpected_clinics <> 0 then
    raise exception 'RESET ABORTADO: se detectaron clínicas fuera del entorno QA conocido';
  end if;

  select count(*) into unclassified_leads
  from public.leads l
  where not (
    coalesce(l.name, '') ~* '(^|[[:space:]])(qa|test|prueba|cors|rate|load|synthetic|sintetico|demo)([[:space:]]|$)'
    or coalesce(l.source, '') ~* '(qa|test|seed|demo)'
    or coalesce(l.page, '') ~* '(qa|test|preview|load)'
    or coalesce(l.notes, '') ~* '(qa|test|synthetic|sintetico)'
  );

  if unclassified_leads > 3 then
    raise exception 'RESET ABORTADO: % leads no pueden clasificarse como sintéticos', unclassified_leads;
  end if;
end;
$guard$;

create temporary table qa_leads_to_reset on commit drop as
select l.id, l.clinic_id
from public.leads l
where
  coalesce(l.name, '') ~* '(^|[[:space:]])(qa|test|prueba|cors|rate|load|synthetic|sintetico|demo)([[:space:]]|$)'
  or coalesce(l.source, '') ~* '(qa|test|seed|demo)'
  or coalesce(l.page, '') ~* '(qa|test|preview|load)'
  or coalesce(l.notes, '') ~* '(qa|test|synthetic|sintetico)';

create temporary table qa_tasks_to_reset on commit drop as
select id from public.tasks where lead_id in (select id from qa_leads_to_reset);

create temporary table qa_appointments_to_reset on commit drop as
select id from public.appointments where lead_id in (select id from qa_leads_to_reset);

delete from public.audit_logs
where row_id in (
  select id from qa_leads_to_reset
  union all select id from qa_tasks_to_reset
  union all select id from qa_appointments_to_reset
)
or (
  clinic_id in (
    '00000000-0000-0000-0000-000000000101'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid
  )
  and coalesce(metadata->>'lead_id', '') in (select id::text from qa_leads_to_reset)
);

delete from public.automation_jobs where lead_id in (select id from qa_leads_to_reset);
delete from public.messages where lead_id in (select id from qa_leads_to_reset);
delete from public.tasks where lead_id in (select id from qa_leads_to_reset);
delete from public.appointments where lead_id in (select id from qa_leads_to_reset);
delete from public.lead_events where lead_id in (select id from qa_leads_to_reset);
delete from public.leads where id in (select id from qa_leads_to_reset);

-- Submission logs do not carry lead_id. Both known clinics are QA-only and the
-- guard above aborts if any other clinic is present, so their load-test logs can
-- be safely cleared without touching form configuration, tokens or origins.
delete from public.form_submission_logs
where clinic_id in (
  '00000000-0000-0000-0000-000000000101'::uuid,
  '00000000-0000-0000-0000-000000000102'::uuid
);

insert into public.leads (
  id, clinic_id, name, phone, phone_plus, treatment, urgency,
  score, classification, status, situation, evaluation_previous,
  consultation_reason, estimated_value, next_action, next_followup_at,
  last_contact_at, contact_attempts, whatsapp_link, source, page, notes,
  consent_contact, consent_at, consent_source, consent_page
)
values
  (
    '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101',
    'QA Ana Implante Urgente', '0981000101', '+595981000101', 'Implante dental', 'Hoy',
    110, 'Lead Caliente', 'Nuevo', 'Quiere agendar una consulta', 'No',
    'Escenario sintético de contacto inicial urgente.', 5000000, 'Contactar inmediatamente', now() - interval '2 hours',
    null, 0, 'https://wa.me/595981000101', 'seed_qa', 'qa/contact-hot', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/contact-hot'
  ),
  (
    '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101',
    'QA Bruno Ortodoncia', '0981000102', '+595981000102', 'Ortodoncia', 'Esta semana',
    92, 'Lead Caliente', 'Contactado', 'Quiere precio', 'No sabe',
    'Escenario sintético con seguimiento futuro.', 4000000, 'Hacer seguimiento', app_private.tomorrow_at_asuncion(9),
    now() - interval '1 day', 1, 'https://wa.me/595981000102', 'WhatsApp directo', 'qa/contacted', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/contacted'
  ),
  (
    '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000101',
    'QA Carla Carillas Agendada', '0981000103', '+595981000103', 'Carillas', 'Este mes',
    88, 'Lead Caliente', 'Consulta Agendada', 'Quiere segunda opinión', 'Sí',
    'Escenario sintético con cita activa.', 2000000, 'Confirmar asistencia', now() + interval '1 day',
    now() - interval '2 days', 1, 'https://wa.me/595981000103', 'Instagram DM', 'qa/scheduled-hot', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/scheduled-hot'
  ),
  (
    '00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000101',
    'QA Diego No Show', '0981000104', '+595981000104', 'Implante dental', 'Esta semana',
    85, 'Lead Caliente', 'No Asistió', 'Quiere reprogramar', 'Sí',
    'Escenario sintético de recuperación no-show.', 5000000, 'Reprogramar consulta', app_private.tomorrow_at_asuncion(9),
    now() - interval '3 days', 2, 'https://wa.me/595981000104', 'Llamada', 'qa/no-show', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/no-show'
  ),
  (
    '00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000101',
    'QA Elena Estética', '0981000105', '+595981000105', 'Estética dental', 'Este mes',
    68, 'Lead Medio', 'Nuevo', 'Está comparando opciones', 'No',
    'Escenario sintético de captación manual.', 1500000, 'Enviar WhatsApp', now() + interval '3 hours',
    null, 0, 'https://wa.me/595981000105', 'Manual / Otro', 'qa/manual', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/manual'
  ),
  (
    '00000000-0000-0000-0000-000000000206', '00000000-0000-0000-0000-000000000101',
    'QA Fabio Sin Respuesta', '0981000106', '+595981000106', 'Prótesis', 'Esta semana',
    60, 'Lead Medio', 'No Respondió', 'Quiere precio', 'No sabe',
    'Escenario sintético con seguimiento vencido.', 2500000, 'Reintentar contacto', now() - interval '1 day',
    now() - interval '2 days', 2, 'https://wa.me/595981000106', 'Formulario web', 'qa/no-response', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/no-response'
  ),
  (
    '00000000-0000-0000-0000-000000000207', '00000000-0000-0000-0000-000000000101',
    'QA Gabriela Blanqueamiento', '0981000107', '+595981000107', 'Blanqueamiento', 'Este mes',
    58, 'Lead Medio', 'Consulta Agendada', 'Quiere agendar una consulta', 'No',
    'Escenario sintético de cita confirmada.', 500000, 'Asistir a evaluación', now() + interval '2 days',
    now() - interval '1 day', 1, 'https://wa.me/595981000107', 'Recomendación', 'qa/scheduled-medium', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/scheduled-medium'
  ),
  (
    '00000000-0000-0000-0000-000000000208', '00000000-0000-0000-0000-000000000101',
    'QA Hugo Presupuesto', '0981000108', '+595981000108', 'Ortodoncia', 'Este mes',
    52, 'Lead Medio', 'Presupuesto Enviado', 'Quiere precio', 'Sí',
    'Escenario sintético para seguimiento comercial.', 4000000, 'Dar seguimiento al presupuesto', now() + interval '4 days',
    now() - interval '2 days', 1, 'https://wa.me/595981000108', 'Presencial', 'qa/budget', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/budget'
  ),
  (
    '00000000-0000-0000-0000-000000000209', '00000000-0000-0000-0000-000000000101',
    'QA Inés Limpieza', '0981000109', '+595981000109', 'Limpieza', 'Solo estoy consultando',
    28, 'Lead Frío', 'Nuevo', 'Está comparando opciones', 'No',
    'Escenario sintético de prioridad baja.', 250000, 'Contactar esta semana', now() + interval '5 days',
    null, 0, 'https://wa.me/595981000109', 'Formulario externo', 'qa/cold-new', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/cold-new'
  ),
  (
    '00000000-0000-0000-0000-000000000210', '00000000-0000-0000-0000-000000000101',
    'QA Julia Consulta General', '0981000110', '+595981000110', 'Consulta general', 'Este mes',
    24, 'Lead Frío', 'Contactado', 'Solo está consultando', 'No sabe',
    'Escenario sintético de seguimiento no urgente.', 300000, 'Recontactar luego', now() + interval '7 days',
    now() - interval '1 day', 1, 'https://wa.me/595981000110', 'Llamada', 'qa/cold-contacted', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/cold-contacted'
  ),
  (
    '00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000101',
    'QA Kevin Perdido', '0981000111', '+595981000111', 'Blanqueamiento', 'Solo estoy consultando',
    18, 'Lead Frío', 'No Contactado', 'Está comparando opciones', 'No',
    'Escenario sintético terminal.', 500000, null, null,
    now() - interval '10 days', 3, 'https://wa.me/595981000111', 'Instagram DM', 'qa/lost', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/lost'
  ),
  (
    '00000000-0000-0000-0000-000000000212', '00000000-0000-0000-0000-000000000102',
    'QA Clinic B Aislamiento', '0982000112', '+595982000112', 'Implante dental', 'Esta semana',
    62, 'Lead Medio', 'Nuevo', 'Quiere agendar una consulta', 'No',
    'Escenario sintético de aislamiento multi-clínica.', 5000000, 'Contactar hoy', now() + interval '2 hours',
    null, 0, 'https://wa.me/595982000112', 'seed_qa', 'qa/clinic-b', 'Dato sintético, no corresponde a paciente real.',
    true, now(), 'seed_qa', 'qa/clinic-b'
  );

update public.leads
set status = 'Perdido',
    lost_reason = 'Sólo estaba consultando',
    lost_reason_note = 'Escenario sintético para métricas de pérdida.',
    lost_at = now() - interval '2 days'
where id = '00000000-0000-0000-0000-000000000211';

insert into public.appointments (
  id, clinic_id, lead_id, appointment_date, appointment_time,
  doctor_assigned, treatment_scheduled, status, notes
)
values
  (
    '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000203',
    (now() at time zone 'America/Asuncion')::date + 1, time '10:00',
    'Dra. DentalPro QA', 'Carillas', 'Agendado', 'Turno sintético para QA.'
  ),
  (
    '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000204',
    (now() at time zone 'America/Asuncion')::date - 1, time '11:00',
    'Dra. DentalPro QA', 'Implante dental', 'No Asistió', 'No-show sintético para QA.'
  ),
  (
    '00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000207',
    (now() at time zone 'America/Asuncion')::date + 2, time '15:00',
    'Dra. DentalPro QA', 'Blanqueamiento', 'Confirmado', 'Turno confirmado sintético para QA.'
  );

insert into public.tasks (
  id, clinic_id, lead_id, title, description, type, priority, status, due_at
)
values
  (
    '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000201', 'Contactar lead caliente',
    'Tarea sintética de contacto.', 'contact', 'alta', 'pendiente', now() - interval '2 hours'
  ),
  (
    '00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000202', 'Hacer seguimiento',
    'Tarea sintética de seguimiento.', 'followup', 'alta', 'pendiente', app_private.tomorrow_at_asuncion(9)
  ),
  (
    '00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000204', 'Recuperar paciente no-show',
    'Tarea sintética de recuperación.', 'no_show_recovery', 'alta', 'pendiente', app_private.tomorrow_at_asuncion(9)
  ),
  (
    '00000000-0000-0000-0000-000000000704', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000206', 'Reintentar contacto',
    'Tarea sintética vencida.', 'contact', 'media', 'vencido', now() - interval '1 day'
  ),
  (
    '00000000-0000-0000-0000-000000000705', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000209', 'Contactar lead frío',
    'Tarea sintética futura.', 'contact', 'baja', 'pendiente', now() + interval '5 days'
  ),
  (
    '00000000-0000-0000-0000-000000000706', '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000212', 'Contactar lead QA Clinic B',
    'Tarea sintética multi-clínica.', 'contact', 'media', 'pendiente', now() + interval '2 hours'
  );

insert into public.lead_events (
  id, clinic_id, lead_id, event_type, title, description, metadata
)
values
  (
    '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000201', 'lead_created', 'Lead QA creado',
    'Lead sintético creado por reset QA.', '{"source":"reset_qa","synthetic":true}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000204', 'appointment_no_show', 'No-show QA',
    'Inasistencia sintética para recuperación.', '{"source":"reset_qa","synthetic":true}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000206', 'contact_attempted', 'Intento sin respuesta QA',
    'Evento sintético de seguimiento.', '{"source":"reset_qa","synthetic":true}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000212', 'lead_created', 'Lead QA Clinic B creado',
    'Evento sintético multi-clínica.', '{"source":"reset_qa","synthetic":true}'::jsonb
  );

insert into public.automation_jobs (
  id, clinic_id, lead_id, workflow_name, status, attempts, payload
)
values
  (
    '00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000201', 'lead_hot_alert', 'pending', 0,
    '{"source":"reset_qa","synthetic":true}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000204', 'no_show_recovery', 'pending', 0,
    '{"source":"reset_qa","synthetic":true}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000803', '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000212', 'lead_created', 'pending', 0,
    '{"source":"reset_qa","synthetic":true}'::jsonb
  );

do $verify$
declare
  total_leads integer;
begin
  select count(*) into total_leads from public.leads;
  if total_leads not between 10 and 15 then
    raise exception 'RESET ABORTADO: el resultado sería % leads; se esperaban entre 10 y 15', total_leads;
  end if;

  if not exists (
    select 1 from public.leads
    where clinic_id = '00000000-0000-0000-0000-000000000102'
  ) then
    raise exception 'RESET ABORTADO: falta el escenario multi-clínica de QA Clinic B';
  end if;

  if (select count(*) from public.leads where classification = 'Lead Caliente') < 3
     or (select count(*) from public.leads where classification = 'Lead Medio') < 3
     or (select count(*) from public.leads where classification = 'Lead Frío') < 3 then
    raise exception 'RESET ABORTADO: faltan escenarios de clasificación';
  end if;
end;
$verify$;

commit;

select 'leads' as entity, count(*)::int as total from public.leads
union all select 'tasks', count(*)::int from public.tasks
union all select 'lead_events', count(*)::int from public.lead_events
union all select 'appointments', count(*)::int from public.appointments
union all select 'automation_jobs', count(*)::int from public.automation_jobs
union all select 'form_submission_logs', count(*)::int from public.form_submission_logs
order by entity;
