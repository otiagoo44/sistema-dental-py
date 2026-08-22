-- Transactional intake for leads received by WhatsApp, Instagram, phone or referral.
-- The caller never supplies clinic_id: it is derived from the active Auth profile.

create or replace function public.create_manual_lead(
  p_name text,
  p_phone text,
  p_phone_plus text,
  p_treatment text,
  p_urgency text,
  p_consultation_reason text,
  p_source text,
  p_consent_contact boolean,
  p_notes text,
  p_next_action text,
  p_next_followup_at timestamptz,
  p_assigned_to uuid,
  p_classification text,
  p_score integer,
  p_situation text,
  p_evaluation_previous text,
  p_estimated_value numeric
)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  current_profile public.profiles;
  assigned_user_id uuid;
  normalized_name text := nullif(btrim(p_name), '');
  normalized_phone text := nullif(btrim(p_phone), '');
  normalized_phone_plus text := nullif(btrim(p_phone_plus), '');
  normalized_source text := nullif(btrim(p_source), '');
  normalized_classification text := coalesce(nullif(btrim(p_classification), ''), 'Lead Medio');
  normalized_score integer := coalesce(p_score, 0);
  normalized_next_action text;
  normalized_next_followup_at timestamptz;
  task_priority text;
  whatsapp_digits text;
  created_lead public.leads;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select p.* into current_profile
  from public.profiles p
  where p.id = current_user_id
    and p.active is true
    and p.role in ('admin', 'owner', 'receptionist')
  limit 1;

  if not found then
    raise exception using errcode = '42501', message = 'Tu usuario no tiene un profile activo autorizado';
  end if;

  if normalized_name is null then
    raise exception using errcode = '22023', message = 'El nombre del lead es obligatorio';
  end if;

  if length(normalized_name) > 160 then
    raise exception using errcode = '22023', message = 'El nombre supera el máximo permitido';
  end if;

  if normalized_phone is null and normalized_phone_plus is null then
    raise exception using errcode = '22023', message = 'El teléfono del lead es obligatorio';
  end if;

  if length(coalesce(normalized_phone, '')) > 64 or length(coalesce(normalized_phone_plus, '')) > 64 then
    raise exception using errcode = '22023', message = 'El teléfono supera el máximo permitido';
  end if;

  if normalized_source not in (
    'WhatsApp directo', 'Instagram DM', 'Llamada', 'Recomendación',
    'Formulario externo', 'Meta Ads manual', 'Formulario web', 'Otro'
  ) then
    raise exception using errcode = '22023', message = 'Fuente de lead manual inválida';
  end if;

  if normalized_classification not in ('Lead Caliente', 'Lead Medio', 'Lead Frío') then
    raise exception using errcode = '22023', message = 'Clasificación inválida';
  end if;

  if normalized_score < 0 or normalized_score > 1000 then
    raise exception using errcode = '22023', message = 'El score debe estar entre 0 y 1000';
  end if;

  if p_estimated_value is not null and p_estimated_value < 0 then
    raise exception using errcode = '22023', message = 'El valor estimado no puede ser negativo';
  end if;

  assigned_user_id := coalesce(p_assigned_to, current_user_id);
  if not exists (
    select 1
    from public.profiles p
    where p.id = assigned_user_id
      and p.clinic_id = current_profile.clinic_id
      and p.active is true
  ) then
    raise exception using errcode = '42501', message = 'El responsable debe pertenecer a tu clínica';
  end if;

  normalized_next_action := coalesce(
    nullif(btrim(p_next_action), ''),
    case normalized_classification
      when 'Lead Caliente' then 'Contactar inmediatamente'
      when 'Lead Medio' then 'Contactar hoy'
      else 'Hacer seguimiento'
    end
  );

  normalized_next_followup_at := coalesce(
    p_next_followup_at,
    case normalized_classification
      when 'Lead Caliente' then now()
      when 'Lead Medio' then app_private.tomorrow_at_asuncion(9)
      else app_private.tomorrow_at_asuncion(9) + interval '2 days'
    end
  );

  task_priority := case normalized_classification
    when 'Lead Caliente' then 'alta'
    when 'Lead Frío' then 'baja'
    else 'media'
  end;

  whatsapp_digits := regexp_replace(coalesce(normalized_phone_plus, normalized_phone, ''), '[^0-9]', '', 'g');

  begin
    insert into public.leads (
      clinic_id, name, phone, phone_plus, treatment, urgency,
      score, classification, status, situation, evaluation_previous,
      consultation_reason, estimated_value, next_action, next_followup_at,
      whatsapp_link, source, page, notes, assigned_to,
      consent_contact, consent_at, consent_source, consent_page
    ) values (
      current_profile.clinic_id,
      normalized_name,
      normalized_phone,
      normalized_phone_plus,
      nullif(btrim(p_treatment), ''),
      nullif(btrim(p_urgency), ''),
      normalized_score,
      normalized_classification,
      'Nuevo',
      nullif(btrim(p_situation), ''),
      nullif(btrim(p_evaluation_previous), ''),
      coalesce(nullif(btrim(p_consultation_reason), ''), nullif(btrim(p_situation), ''), nullif(btrim(p_treatment), '')),
      p_estimated_value,
      normalized_next_action,
      normalized_next_followup_at,
      case when whatsapp_digits = '' then null else 'https://wa.me/' || whatsapp_digits end,
      normalized_source,
      'crm_manual',
      nullif(btrim(p_notes), ''),
      assigned_user_id,
      coalesce(p_consent_contact, false),
      case when coalesce(p_consent_contact, false) then now() else null end,
      case when coalesce(p_consent_contact, false) then 'crm_manual' else null end,
      case when coalesce(p_consent_contact, false) then 'crm_manual' else null end
    )
    returning * into created_lead;
  exception
    when unique_violation then
      raise exception using errcode = '23505', message = 'Ya existe un lead con ese teléfono en esta clínica';
  end;

  insert into public.lead_events (
    clinic_id, lead_id, event_type, title, description, metadata, created_by
  ) values (
    current_profile.clinic_id,
    created_lead.id,
    'lead_created_manual',
    'Lead creado manualmente',
    'Lead ingresado desde el CRM por un usuario autenticado.',
    jsonb_build_object(
      'source', normalized_source,
      'classification', normalized_classification,
      'score', normalized_score,
      'consent_contact', coalesce(p_consent_contact, false)
    ),
    current_user_id
  );

  insert into public.tasks (
    clinic_id, lead_id, title, description, type, priority,
    status, due_at, assigned_to, created_by
  ) values (
    current_profile.clinic_id,
    created_lead.id,
    normalized_next_action,
    'Seguimiento inicial del lead cargado manualmente.',
    'contact',
    task_priority,
    'pendiente',
    normalized_next_followup_at,
    assigned_user_id,
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    current_profile.clinic_id,
    current_user_id,
    'lead_created_manual',
    'leads',
    created_lead.id,
    jsonb_build_object('source', normalized_source, 'assigned_to', assigned_user_id)
  );

  return created_lead;
end;
$function$;

revoke all on function public.create_manual_lead(
  text, text, text, text, text, text, text, boolean, text,
  text, timestamptz, uuid, text, integer, text, text, numeric
) from public, anon, authenticated, service_role;

grant execute on function public.create_manual_lead(
  text, text, text, text, text, text, text, boolean, text,
  text, timestamptz, uuid, text, integer, text, text, numeric
) to authenticated;

notify pgrst, 'reload schema';
