-- CRM Clarity & Priority Upgrade
-- Scoring is derived in Postgres. The Edge Function and CRM only provide raw
-- domain inputs and read the resulting score, classification and explanation.

alter table public.leads
  add column if not exists score_breakdown jsonb not null default '[]'::jsonb,
  add column if not exists score_updated_at timestamptz,
  add column if not exists source_normalized text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists landing_page text,
  add column if not exists referrer text;

create or replace function app_private.normalize_domain_text(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select lower(translate(
    btrim(coalesce(p_value, '')),
    'áéíóúüñÁÉÍÓÚÜÑ',
    'aeiouunAEIOUUN'
  ));
$$;

create or replace function app_private.normalize_lead_source(p_source text, p_utm_source text default null)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  source_text text := app_private.normalize_domain_text(coalesce(nullif(p_utm_source, ''), p_source));
begin
  if source_text ~ '(instagram|(^|[^a-z])ig([^a-z]|$))' then return 'Instagram'; end if;
  if source_text ~ '(meta|facebook|fb ads)' then return 'Meta Ads'; end if;
  if source_text ~ '(google|adwords)' then return 'Google'; end if;
  if source_text ~ '(refer|recomend)' then return 'Referido'; end if;
  if source_text ~ '(landing|formulario|form|web)' then return 'Landing'; end if;
  if source_text ~ '(whatsapp|wa.me)' then return 'WhatsApp'; end if;
  return 'Otros';
end;
$$;

create or replace function app_private.lead_score_config(p_clinic_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hot_threshold integer := 80;
begin
  select greatest(50, least(100, coalesce(cs.hot_lead_threshold, 80)))
  into hot_threshold
  from public.clinic_settings cs
  where cs.clinic_id = p_clinic_id;

  hot_threshold := coalesce(hot_threshold, 80);

  return jsonb_build_object(
    'version', 1,
    'thresholds', jsonb_build_object('hot', hot_threshold, 'medium', 50),
    'weights', jsonb_build_object(
      'base', 15,
      'treatment', jsonb_build_object(
        'high', 25,
        'medium', 18,
        'standard', 10,
        'basic', 5,
        'high_price', 5000000,
        'medium_price', 2000000,
        'standard_price', 500000
      ),
      'urgency', jsonb_build_object('today', 25, 'week', 15, 'month', 5, 'browsing', -15),
      'situation', jsonb_build_object('booking', 25, 'pain', 20, 'second_opinion', 10, 'price', 5, 'comparing', -10, 'browsing', -15),
      'evaluation', jsonb_build_object('studies', 10, 'previous', 8),
      'behavior', jsonb_build_object(
        'contacted', 5,
        'responded', 10,
        'booked', 15,
        'confirmed', 18,
        'attended', 20,
        'quote_sent', 15,
        'treatment_started', 20,
        'no_response', -10,
        'no_show', -15,
        'extra_attempt', -3,
        'attempt_cap', -12
      )
    )
  );
end;
$$;

create or replace function app_private.calculate_lead_score(
  p_clinic_id uuid,
  p_treatment text,
  p_urgency text,
  p_situation text,
  p_evaluation_previous text,
  p_status text,
  p_contact_attempts integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config jsonb := app_private.lead_score_config(p_clinic_id);
  reasons jsonb := '[]'::jsonb;
  treatment_text text := app_private.normalize_domain_text(p_treatment);
  urgency_text text := app_private.normalize_domain_text(p_urgency);
  situation_text text := app_private.normalize_domain_text(p_situation);
  evaluation_text text := app_private.normalize_domain_text(p_evaluation_previous);
  status_text text := app_private.normalize_domain_text(p_status);
  reference_price numeric;
  points integer;
  total integer := (config #>> '{weights,base}')::integer;
  hot_threshold integer := (config #>> '{thresholds,hot}')::integer;
  medium_threshold integer := (config #>> '{thresholds,medium}')::integer;
  final_score integer;
  final_classification text;
begin
  reasons := reasons || jsonb_build_array(jsonb_build_object(
    'key', 'valid_consultation',
    'label', 'Consulta con datos suficientes',
    'points', total
  ));

  if treatment_text <> '' then
    select tp.estimated_price
    into reference_price
    from public.treatment_prices tp
    where tp.clinic_id = p_clinic_id
      and app_private.normalize_domain_text(tp.treatment) = treatment_text
    order by tp.updated_at desc
    limit 1;

    if reference_price >= (config #>> '{weights,treatment,high_price}')::numeric
       or treatment_text ~ '(implante)' then
      points := (config #>> '{weights,treatment,high}')::integer;
      reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'treatment', 'label', 'Tratamiento de alto potencial', 'points', points));
    elsif reference_price >= (config #>> '{weights,treatment,medium_price}')::numeric
       or treatment_text ~ '(ortodoncia|bracket|carilla|protesis)' then
      points := (config #>> '{weights,treatment,medium}')::integer;
      reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'treatment', 'label', 'Tratamiento de potencial medio-alto', 'points', points));
    elsif reference_price >= (config #>> '{weights,treatment,standard_price}')::numeric
       or treatment_text ~ '(blanqueamiento|estetica)' then
      points := (config #>> '{weights,treatment,standard}')::integer;
      reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'treatment', 'label', 'Tratamiento definido', 'points', points));
    else
      points := (config #>> '{weights,treatment,basic}')::integer;
      reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'treatment', 'label', 'Interés de tratamiento registrado', 'points', points));
    end if;
    total := total + points;
  end if;

  points := 0;
  if urgency_text ~ '(hoy|urgente|urgencia|dolor|alta)' then
    points := (config #>> '{weights,urgency,today}')::integer;
    reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'urgency', 'label', 'Necesita atención pronto', 'points', points));
  elsif urgency_text ~ '(semana|media)' then
    points := (config #>> '{weights,urgency,week}')::integer;
    reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'urgency', 'label', 'Quiere resolverlo esta semana', 'points', points));
  elsif urgency_text ~ '(mes|baja)' then
    points := (config #>> '{weights,urgency,month}')::integer;
    reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'urgency', 'label', 'Interés para este mes', 'points', points));
  elsif urgency_text ~ '(solo consultando|solo consulta)' then
    points := (config #>> '{weights,urgency,browsing}')::integer;
    reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'urgency', 'label', 'Indicó que sólo está consultando', 'points', points));
  end if;
  total := total + points;

  points := 0;
  if situation_text ~ '(agendar|turno|cita)' then
    points := (config #>> '{weights,situation,booking}')::integer;
    reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'intent', 'label', 'Quiere agendar una evaluación', 'points', points));
  elsif situation_text ~ '(dolor|molestia|urgencia)' then
    points := (config #>> '{weights,situation,pain}')::integer;
    reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'intent', 'label', 'Reportó dolor o urgencia', 'points', points));
  elsif situation_text ~ '(segunda opinion)' then
    points := (config #>> '{weights,situation,second_opinion}')::integer;
    reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'intent', 'label', 'Busca una segunda opinión', 'points', points));
  elsif situation_text ~ '(precio|presupuesto)' then
    points := (config #>> '{weights,situation,price}')::integer;
    reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'intent', 'label', 'Pidió información de precio', 'points', points));
  elsif situation_text ~ '(comparando)' then
    points := (config #>> '{weights,situation,comparing}')::integer;
    reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'intent', 'label', 'Está comparando opciones', 'points', points));
  elsif situation_text ~ '(solo consultando|solo consulta)' then
    points := (config #>> '{weights,situation,browsing}')::integer;
    reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'intent', 'label', 'Intención todavía exploratoria', 'points', points));
  end if;
  total := total + points;

  points := 0;
  if evaluation_text ~ '(estudio|radiografia)' then
    points := (config #>> '{weights,evaluation,studies}')::integer;
    reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'evaluation', 'label', 'Ya cuenta con estudios o radiografía', 'points', points));
  elsif evaluation_text ~ '^si([[:space:],]|$)' then
    points := (config #>> '{weights,evaluation,previous}')::integer;
    reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'evaluation', 'label', 'Tuvo una evaluación previa', 'points', points));
  end if;
  total := total + points;

  points := case status_text
    when 'contactado' then (config #>> '{weights,behavior,contacted}')::integer
    when 'respondio' then (config #>> '{weights,behavior,responded}')::integer
    when 'consulta agendada' then (config #>> '{weights,behavior,booked}')::integer
    when 'confirmado' then (config #>> '{weights,behavior,confirmed}')::integer
    when 'asistio' then (config #>> '{weights,behavior,attended}')::integer
    when 'presupuesto enviado' then (config #>> '{weights,behavior,quote_sent}')::integer
    when 'tratamiento iniciado' then (config #>> '{weights,behavior,treatment_started}')::integer
    when 'no respondio' then (config #>> '{weights,behavior,no_response}')::integer
    when 'no asistio' then (config #>> '{weights,behavior,no_show}')::integer
    else 0
  end;

  if points <> 0 then
    reasons := reasons || jsonb_build_array(jsonb_build_object(
      'key', 'behavior',
      'label', case status_text
        when 'contactado' then 'Contacto registrado'
        when 'respondio' then 'Respondió al contacto'
        when 'consulta agendada' then 'Agendó una cita'
        when 'confirmado' then 'Confirmó su cita'
        when 'asistio' then 'Asistió a la cita'
        when 'presupuesto enviado' then 'Recibió un presupuesto'
        when 'tratamiento iniciado' then 'Inició tratamiento'
        when 'no respondio' then 'No respondió al último intento'
        when 'no asistio' then 'No asistió a la cita'
        else 'Comportamiento registrado'
      end,
      'points', points
    ));
    total := total + points;
  end if;

  if status_text = 'no respondio' and coalesce(p_contact_attempts, 0) > 1 then
    points := greatest(
      (config #>> '{weights,behavior,attempt_cap}')::integer,
      (coalesce(p_contact_attempts, 0) - 1) * (config #>> '{weights,behavior,extra_attempt}')::integer
    );
    reasons := reasons || jsonb_build_array(jsonb_build_object('key', 'attempts', 'label', 'Varios intentos sin respuesta', 'points', points));
    total := total + points;
  end if;

  final_score := greatest(0, least(100, total));
  final_classification := case
    when final_score >= hot_threshold then 'Lead Caliente'
    when final_score >= medium_threshold then 'Lead Medio'
    else 'Lead Frío'
  end;

  return jsonb_build_object(
    'score', final_score,
    'classification', final_classification,
    'reasons', reasons,
    'config_version', config -> 'version',
    'thresholds', config -> 'thresholds'
  );
end;
$$;

create or replace function app_private.derive_lead_score_and_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  score_details jsonb;
begin
  score_details := app_private.calculate_lead_score(
    new.clinic_id,
    new.treatment,
    new.urgency,
    new.situation,
    new.evaluation_previous,
    new.status,
    new.contact_attempts
  );

  new.score := (score_details ->> 'score')::integer;
  new.classification := score_details ->> 'classification';
  new.score_breakdown := coalesce(score_details -> 'reasons', '[]'::jsonb);
  new.score_updated_at := now();
  new.source_normalized := app_private.normalize_lead_source(new.source, new.utm_source);
  return new;
end;
$$;

drop trigger if exists zz_derive_lead_score_and_source on public.leads;
create trigger zz_derive_lead_score_and_source
before insert or update on public.leads
for each row execute function app_private.derive_lead_score_and_source();

-- Backfill every historical opportunity through the same canonical trigger.
update public.leads set updated_at = updated_at;

alter table public.leads drop constraint if exists leads_score_check;
alter table public.leads
  add constraint leads_score_check check (score between 0 and 100);

create index if not exists leads_clinic_source_normalized_created_idx
  on public.leads (clinic_id, source_normalized, created_at desc);

create index if not exists leads_clinic_utm_campaign_created_idx
  on public.leads (clinic_id, utm_campaign, created_at desc)
  where utm_campaign is not null;

create or replace function public.create_manual_lead_v2(
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
  p_situation text,
  p_evaluation_previous text,
  p_estimated_value numeric
)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_profile public.profiles;
  score_details jsonb;
begin
  select p.* into current_profile
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active is true
    and p.role in ('admin', 'owner', 'receptionist')
  limit 1;

  if not found then
    raise exception using errcode = '42501', message = 'Tu usuario no tiene un profile activo autorizado';
  end if;

  score_details := app_private.calculate_lead_score(
    current_profile.clinic_id,
    p_treatment,
    p_urgency,
    p_situation,
    p_evaluation_previous,
    'Nuevo',
    0
  );

  return public.create_manual_lead(
    p_name,
    p_phone,
    p_phone_plus,
    p_treatment,
    p_urgency,
    p_consultation_reason,
    p_source,
    p_consent_contact,
    p_notes,
    p_next_action,
    p_next_followup_at,
    p_assigned_to,
    score_details ->> 'classification',
    (score_details ->> 'score')::integer,
    p_situation,
    p_evaluation_previous,
    p_estimated_value
  );
end;
$$;

revoke all on function public.create_manual_lead(
  text, text, text, text, text, text, text, boolean, text,
  text, timestamptz, uuid, text, integer, text, text, numeric
) from authenticated;

revoke all on function public.create_manual_lead_v2(
  text, text, text, text, text, text, text, boolean, text,
  text, timestamptz, uuid, text, text, numeric
) from public, anon, authenticated, service_role;

grant execute on function public.create_manual_lead_v2(
  text, text, text, text, text, text, text, boolean, text,
  text, timestamptz, uuid, text, text, numeric
) to authenticated;

create or replace function public.create_public_lead_intake_v2(
  p_form_id uuid,
  p_clinic_slug text,
  p_public_token text,
  p_name text,
  p_phone text,
  p_phone_plus text,
  p_treatment text,
  p_urgency text,
  p_situation text,
  p_evaluation_previous text,
  p_consultation_reason text,
  p_whatsapp_link text,
  p_source text,
  p_page text,
  p_notes text,
  p_consent_at timestamptz,
  p_ip_hash text,
  p_phone_hash text,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_utm_content text,
  p_utm_term text,
  p_landing_page text,
  p_referrer text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  form_record public.clinic_public_forms;
  score_details jsonb;
  intake_result jsonb;
  configured_value numeric;
  lead_record public.leads;
begin
  if coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (select auth.jwt() ->> 'role'),
    ''
  ) <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service role required';
  end if;

  select f.* into form_record
  from public.clinic_public_forms f
  where f.id = p_form_id
    and f.clinic_slug = nullif(btrim(p_clinic_slug), '')
    and f.public_token = nullif(btrim(p_public_token), '')
    and f.is_active is true;

  if not found then
    raise exception using errcode = '42501', message = 'Formulario público no autorizado';
  end if;

  score_details := app_private.calculate_lead_score(
    form_record.clinic_id,
    p_treatment,
    p_urgency,
    p_situation,
    p_evaluation_previous,
    'Nuevo',
    0
  );

  select tp.estimated_price
  into configured_value
  from public.treatment_prices tp
  where tp.clinic_id = form_record.clinic_id
    and app_private.normalize_domain_text(tp.treatment) = app_private.normalize_domain_text(p_treatment)
  order by tp.updated_at desc
  limit 1;

  intake_result := public.create_public_lead_intake(
    p_form_id,
    p_clinic_slug,
    p_public_token,
    p_name,
    p_phone,
    p_phone_plus,
    p_treatment,
    p_urgency,
    (score_details ->> 'score')::integer,
    score_details ->> 'classification',
    p_situation,
    p_evaluation_previous,
    p_consultation_reason,
    configured_value,
    'Responder nueva consulta',
    now(),
    p_whatsapp_link,
    p_source,
    p_page,
    p_notes,
    p_consent_at,
    p_ip_hash,
    p_phone_hash
  );

  update public.leads l
  set utm_source = coalesce(nullif(btrim(p_utm_source), ''), l.utm_source),
      utm_medium = coalesce(nullif(btrim(p_utm_medium), ''), l.utm_medium),
      utm_campaign = coalesce(nullif(btrim(p_utm_campaign), ''), l.utm_campaign),
      utm_content = coalesce(nullif(btrim(p_utm_content), ''), l.utm_content),
      utm_term = coalesce(nullif(btrim(p_utm_term), ''), l.utm_term),
      landing_page = coalesce(nullif(btrim(p_landing_page), ''), l.landing_page),
      referrer = coalesce(nullif(btrim(p_referrer), ''), l.referrer)
  where l.id = (intake_result ->> 'lead_id')::uuid
    and l.clinic_id = form_record.clinic_id
  returning l.* into lead_record;

  return intake_result || jsonb_build_object(
    'score', lead_record.score,
    'classification', lead_record.classification,
    'score_breakdown', lead_record.score_breakdown
  );
end;
$$;

revoke all on function public.create_public_lead_intake_v2(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, timestamptz, text, text, text,
  text, text, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.create_public_lead_intake_v2(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, timestamptz, text, text, text,
  text, text, text, text, text, text
) to service_role;

revoke all on function app_private.normalize_domain_text(text) from public, anon, authenticated, service_role;
revoke all on function app_private.normalize_lead_source(text, text) from public, anon, authenticated, service_role;
revoke all on function app_private.lead_score_config(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.calculate_lead_score(uuid, text, text, text, text, text, integer) from public, anon, authenticated, service_role;
revoke all on function app_private.derive_lead_score_and_source() from public, anon, authenticated, service_role;

comment on column public.leads.score is 'Calidad/intención automática 0-100. No representa prioridad operativa.';
comment on column public.leads.score_breakdown is 'Explicación generada por app_private.calculate_lead_score.';
comment on column public.leads.source_normalized is 'Fuente normalizada sin sobrescribir el valor histórico de source.';
comment on function app_private.lead_score_config(uuid) is 'Única configuración de pesos y thresholds del scoring automático.';
comment on function app_private.calculate_lead_score(uuid, text, text, text, text, text, integer) is 'Única fórmula de score y clasificación; devuelve score, temperatura y breakdown.';

notify pgrst, 'reload schema';
