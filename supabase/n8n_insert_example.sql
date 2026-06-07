-- Ejemplo legacy de insert directo.
-- Para produccion multi-clinica usar n8n-universal-workflow.md y resolver clinic_id desde clinic_public_forms.

insert into public.leads (
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
  contact_attempts,
  whatsapp_link,
  source,
  page,
  notes
)
values (
  '00000000-0000-0000-0000-000000000101',
  'Lead desde n8n',
  '0981000003',
  '+595981000003',
  'Implante dental',
  'alta',
  135,
  'Lead Caliente',
  'Nuevo',
  'Pidió información desde landing',
  null,
  'Consulta comercial sobre tratamiento',
  5000000,
  'Contactar por WhatsApp',
  now() + interval '15 minutes',
  0,
  'https://wa.me/595981000003',
  'landing',
  '/implantes',
  'Creado automáticamente por n8n.'
)
returning id;

-- En el workflow, mapear consultation_reason desde el body con este fallback:
-- body.consultation_reason || body.motivo_consulta || body.situacion || body.tratamiento || null
