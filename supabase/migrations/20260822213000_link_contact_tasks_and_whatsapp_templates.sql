-- Keep lead contact state, operational tasks and audit events in one transaction.
-- WhatsApp remains a user-initiated wa.me link; this migration does not send messages.

alter table public.tasks
  add column if not exists completed_by uuid references auth.users(id) on delete set null;

alter table public.message_templates
  add column if not exists template_key text;

update public.message_templates
set template_key = case
  when lower(name) like '%primer contacto%' then 'first_contact'
  when lower(name) like '%urgencia%' then 'urgency'
  when lower(name) like '%sin respuesta%' then 'no_response'
  when lower(name) like '%no-show%' or lower(name) like '%no show%' then 'no_show'
  when lower(name) like '%recordatorio%' then 'appointment_reminder'
  else 'legacy_' || replace(id::text, '-', '')
end
where template_key is null;

alter table public.message_templates
  alter column template_key set not null;

create unique index if not exists message_templates_clinic_key_unique_idx
  on public.message_templates (clinic_id, template_key);

insert into public.message_templates (clinic_id, template_key, name, treatment, situation, message)
select
  c.id,
  defaults.template_key,
  defaults.name,
  null,
  defaults.situation,
  defaults.message
from public.clinics c
cross join (values
  (
    'first_contact',
    'Primer contacto',
    'Nuevo lead',
    E'Hola {{nombre}}, soy de {{clinica}}.\n\nVimos tu consulta sobre {{tratamiento}} y te escribo para ayudarte a avanzar sin perder tiempo.\n\nPara orientarte bien, lo más práctico es agendar una evaluación breve y revisar tu caso con el odontólogo.\n\n¿Te queda mejor coordinar para hoy o para mañana?'
  ),
  (
    'urgency',
    'Urgencia o dolor',
    'Urgencia/dolor',
    E'Hola {{nombre}}, soy de {{clinica}}.\n\nVimos que consultaste por {{tratamiento}} y que necesitás atención {{urgencia}}.\n\nPara ayudarte rápido, podemos coordinar una evaluación y confirmar el mejor horario disponible.\n\n¿Preferís que te agendemos hoy o mañana?'
  ),
  (
    'no_response',
    'Seguimiento sin respuesta',
    'Sin respuesta',
    E'Hola {{nombre}}, soy de {{clinica}}.\n\nTe escribo nuevamente por tu consulta sobre {{tratamiento}}. Quiero asegurarme de que tengas una opción clara para avanzar.\n\n¿Preferís que veamos un horario mañana de mañana o de tarde?'
  ),
  (
    'no_show',
    'No-show y reprogramación',
    'No Asistió',
    E'Hola {{nombre}}, soy de {{clinica}}.\n\nVimos que no pudiste asistir a tu evaluación por {{tratamiento}}. Podemos ayudarte a reprogramarla sin complicaciones.\n\n¿Te queda mejor mañana o esta semana?'
  ),
  (
    'appointment_reminder',
    'Recordatorio de cita',
    'Consulta Agendada',
    E'Hola {{nombre}}, soy de {{clinica}}.\n\nTe recordamos tu evaluación por {{tratamiento}}. Si necesitás ajustar el horario, respondé este mensaje y te ayudamos.\n\n¡Te esperamos!'
  )
) as defaults(template_key, name, situation, message)
on conflict (clinic_id, template_key) do nothing;

create or replace function app_private.is_contact_task(p_type text, p_title text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select case
    when lower(coalesce(p_type, '')) in (
      'contact', 'contact_lead', 'initial_contact', 'follow_up_contact', 'manual_contact'
    ) then true
    when nullif(btrim(coalesce(p_type, '')), '') is not null then false
    else lower(coalesce(p_title, '')) ~ '(contactar|contacto|whatsapp|llamar)'
  end;
$function$;

revoke all on function app_private.is_contact_task(text, text) from public, anon, authenticated;

create or replace function public.mark_lead_contacted(
  p_lead_id uuid,
  p_contact_channel text default 'manual',
  p_note text default null,
  p_next_action text default null,
  p_next_followup_at timestamptz default null
)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  lead_record public.leads;
  previous_status text;
  completed_task_ids uuid[] := array[]::uuid[];
  followup_at timestamptz;
  followup_action text;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select l.* into lead_record
  from public.leads l
  where l.id = p_lead_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Lead no encontrado';
  end if;

  if not app_private.has_role(lead_record.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a este lead';
  end if;

  previous_status := lead_record.status;
  followup_at := coalesce(
    p_next_followup_at,
    case when lead_record.next_followup_at > now() then lead_record.next_followup_at end,
    (date_trunc('day', now() at time zone 'America/Asuncion') + interval '1 day 9 hours') at time zone 'America/Asuncion'
  );
  followup_action := coalesce(nullif(btrim(p_next_action), ''), 'Hacer seguimiento');

  with completed as (
    update public.tasks t
    set status = 'hecho',
        completed_at = now(),
        completed_by = current_user_id,
        updated_at = now()
    where t.clinic_id = lead_record.clinic_id
      and t.lead_id = lead_record.id
      and lower(t.status) in ('pendiente', 'vencido', 'vencida')
      and app_private.is_contact_task(t.type, t.title)
    returning t.id
  )
  select coalesce(array_agg(id), array[]::uuid[])
  into completed_task_ids
  from completed;

  update public.leads
  set status = 'Contactado',
      last_contact_at = now(),
      contact_attempts = contact_attempts + 1,
      next_action = followup_action,
      next_followup_at = followup_at
  where id = lead_record.id
  returning * into lead_record;

  insert into public.tasks (
    clinic_id, lead_id, title, description, type, priority,
    status, due_at, assigned_to, created_by, completed_at, completed_by
  ) values (
    lead_record.clinic_id,
    lead_record.id,
    followup_action,
    'Seguimiento generado después de registrar el contacto.',
    'followup',
    case lead_record.classification when 'Lead Caliente' then 'alta' else 'media' end,
    'pendiente',
    followup_at,
    lead_record.assigned_to,
    current_user_id,
    null,
    null
  )
  on conflict (clinic_id, lead_id, type)
    where lead_id is not null and type is not null
      and status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
  do update set
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    status = 'pendiente',
    due_at = excluded.due_at,
    assigned_to = coalesce(excluded.assigned_to, tasks.assigned_to),
    completed_at = null,
    completed_by = null,
    updated_at = now();

  if cardinality(completed_task_ids) > 0 then
    insert into public.lead_events (
      clinic_id, lead_id, event_type, title, description, metadata, created_by
    ) values (
      lead_record.clinic_id,
      lead_record.id,
      'task_completed_auto',
      'Tarea de contacto completada automáticamente',
      format('%s tarea(s) de contacto cerradas al marcar el lead como Contactado.', cardinality(completed_task_ids)),
      jsonb_build_object(
        'reason', 'lead_marked_contacted',
        'previous_status', previous_status,
        'new_status', 'Contactado',
        'task_ids', to_jsonb(completed_task_ids)
      ),
      current_user_id
    );
  end if;

  insert into public.lead_events (
    clinic_id, lead_id, event_type, title, description, metadata, created_by
  ) values (
    lead_record.clinic_id,
    lead_record.id,
    'lead_contacted',
    'Paciente contactado',
    nullif(btrim(p_note), ''),
    jsonb_build_object(
      'channel', coalesce(nullif(btrim(p_contact_channel), ''), 'manual'),
      'previous_status', previous_status,
      'new_status', 'Contactado',
      'next_followup_at', followup_at,
      'completed_contact_tasks', cardinality(completed_task_ids)
    ),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    lead_record.clinic_id,
    current_user_id,
    'lead_marked_contacted',
    'leads',
    lead_record.id,
    jsonb_build_object(
      'channel', coalesce(nullif(btrim(p_contact_channel), ''), 'manual'),
      'previous_status', previous_status,
      'completed_contact_tasks', cardinality(completed_task_ids)
    )
  );

  return lead_record;
end;
$function$;

create or replace function public.complete_contact_task(
  p_task_id uuid,
  p_outcome text,
  p_note text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  task_record public.tasks;
  lead_record public.leads;
  normalized_outcome text := lower(btrim(coalesce(p_outcome, '')));
  followup_at timestamptz;
  event_type_value text;
  event_title text;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if normalized_outcome not in ('respondio', 'no_respondio', 'numero_invalido', 'posponer') then
    raise exception using errcode = '22023', message = 'Resultado de contacto inválido';
  end if;

  select t.* into task_record
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Tarea no encontrada';
  end if;

  if task_record.lead_id is null or not app_private.is_contact_task(task_record.type, task_record.title) then
    raise exception using errcode = '22023', message = 'La tarea no es una tarea de contacto';
  end if;

  if not app_private.has_role(task_record.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a esta tarea';
  end if;

  select l.* into lead_record
  from public.leads l
  where l.id = task_record.lead_id
    and l.clinic_id = task_record.clinic_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Lead asociado no encontrado';
  end if;

  if lower(task_record.status) in ('hecho', 'completada') then
    return task_record;
  end if;

  if normalized_outcome = 'respondio' then
    select * into lead_record
    from public.mark_lead_contacted(
      lead_record.id,
      'task',
      p_note,
      'Hacer seguimiento',
      null
    );

    select * into task_record from public.tasks where id = p_task_id;
    event_type_value := 'contact_responded';
    event_title := 'El paciente respondió';
  elsif normalized_outcome = 'posponer' then
    followup_at := (date_trunc('day', now() at time zone 'America/Asuncion') + interval '1 day 9 hours') at time zone 'America/Asuncion';

    update public.tasks
    set due_at = followup_at,
        status = 'pendiente',
        completed_at = null,
        completed_by = null,
        updated_at = now()
    where id = task_record.id
    returning * into task_record;

    update public.leads
    set next_action = 'Reintentar contacto',
        next_followup_at = followup_at
    where id = lead_record.id;

    event_type_value := 'contact_postponed';
    event_title := 'Contacto pospuesto';
  else
    followup_at := (date_trunc('day', now() at time zone 'America/Asuncion') + interval '1 day 9 hours') at time zone 'America/Asuncion';

    update public.tasks
    set status = 'hecho',
        completed_at = now(),
        completed_by = current_user_id,
        updated_at = now()
    where id = task_record.id
    returning * into task_record;

    update public.leads
    set contact_attempts = contact_attempts + 1,
        next_action = case normalized_outcome
          when 'numero_invalido' then 'Verificar número de contacto'
          else 'Reintentar contacto'
        end,
        next_followup_at = followup_at
    where id = lead_record.id
    returning * into lead_record;

    insert into public.tasks (
      clinic_id, lead_id, title, description, type, priority,
      status, due_at, assigned_to, created_by
    ) values (
      lead_record.clinic_id,
      lead_record.id,
      case normalized_outcome
        when 'numero_invalido' then 'Verificar número y reintentar contacto'
        else 'Reintentar contacto'
      end,
      'Seguimiento creado después de un intento sin respuesta.',
      'contact',
      case lead_record.classification when 'Lead Caliente' then 'alta' else 'media' end,
      'pendiente',
      followup_at,
      lead_record.assigned_to,
      current_user_id
    )
    on conflict (clinic_id, lead_id, type)
      where lead_id is not null and type is not null
        and status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
    do update set
      title = excluded.title,
      description = excluded.description,
      priority = excluded.priority,
      due_at = excluded.due_at,
      status = 'pendiente',
      completed_at = null,
      completed_by = null,
      updated_at = now();

    event_type_value := 'contact_attempted';
    event_title := case normalized_outcome
      when 'numero_invalido' then 'Número inválido registrado'
      else 'Intento de contacto sin respuesta'
    end;

    insert into public.lead_events (
      clinic_id, lead_id, event_type, title, description, metadata, created_by
    ) values (
      task_record.clinic_id,
      task_record.lead_id,
      'task_completed',
      'Tarea de contacto completada',
      task_record.title,
      jsonb_build_object('task_id', task_record.id, 'outcome', normalized_outcome),
      current_user_id
    );
  end if;

  insert into public.lead_events (
    clinic_id, lead_id, event_type, title, description, metadata, created_by
  ) values (
    task_record.clinic_id,
    task_record.lead_id,
    event_type_value,
    event_title,
    nullif(btrim(p_note), ''),
    jsonb_build_object('task_id', task_record.id, 'outcome', normalized_outcome),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    task_record.clinic_id,
    current_user_id,
    'contact_task_outcome',
    'tasks',
    task_record.id,
    jsonb_build_object('lead_id', task_record.lead_id, 'outcome', normalized_outcome)
  );

  return task_record;
end;
$function$;

create or replace function public.record_contact_attempt(
  p_lead_id uuid,
  p_outcome text default 'no_respondio',
  p_note text default null,
  p_contact_channel text default 'whatsapp'
)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  lead_record public.leads;
  task_record public.tasks;
  normalized_outcome text := lower(btrim(coalesce(p_outcome, '')));
  followup_at timestamptz;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if normalized_outcome not in ('no_respondio', 'numero_invalido') then
    raise exception using errcode = '22023', message = 'Resultado de intento inválido';
  end if;

  select l.* into lead_record
  from public.leads l
  where l.id = p_lead_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Lead no encontrado';
  end if;

  if not app_private.has_role(lead_record.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a este lead';
  end if;

  select t.* into task_record
  from public.tasks t
  where t.clinic_id = lead_record.clinic_id
    and t.lead_id = lead_record.id
    and lower(t.status) in ('pendiente', 'vencido', 'vencida')
    and app_private.is_contact_task(t.type, t.title)
  order by t.created_at
  limit 1;

  if found then
    perform public.complete_contact_task(task_record.id, normalized_outcome, p_note);
    select l.* into lead_record from public.leads l where l.id = p_lead_id;
    return lead_record;
  end if;

  followup_at := (date_trunc('day', now() at time zone 'America/Asuncion') + interval '1 day 9 hours') at time zone 'America/Asuncion';

  update public.leads
  set contact_attempts = contact_attempts + 1,
      next_action = case normalized_outcome
        when 'numero_invalido' then 'Verificar número de contacto'
        else 'Reintentar contacto'
      end,
      next_followup_at = followup_at
  where id = lead_record.id
  returning * into lead_record;

  insert into public.tasks (
    clinic_id, lead_id, title, description, type, priority,
    status, due_at, assigned_to, created_by
  ) values (
    lead_record.clinic_id,
    lead_record.id,
    case normalized_outcome
      when 'numero_invalido' then 'Verificar número y reintentar contacto'
      else 'Reintentar contacto'
    end,
    'Seguimiento creado después de un intento sin respuesta.',
    'contact',
    case lead_record.classification when 'Lead Caliente' then 'alta' else 'media' end,
    'pendiente',
    followup_at,
    lead_record.assigned_to,
    current_user_id
  )
  on conflict (clinic_id, lead_id, type)
    where lead_id is not null and type is not null
      and status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
  do update set
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    due_at = excluded.due_at,
    status = 'pendiente',
    completed_at = null,
    completed_by = null,
    updated_at = now();

  insert into public.lead_events (
    clinic_id, lead_id, event_type, title, description, metadata, created_by
  ) values (
    lead_record.clinic_id,
    lead_record.id,
    'contact_attempted',
    case normalized_outcome
      when 'numero_invalido' then 'Número inválido registrado'
      else 'Intento de contacto sin respuesta'
    end,
    nullif(btrim(p_note), ''),
    jsonb_build_object(
      'outcome', normalized_outcome,
      'channel', coalesce(nullif(btrim(p_contact_channel), ''), 'whatsapp')
    ),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    lead_record.clinic_id,
    current_user_id,
    'contact_attempted',
    'leads',
    lead_record.id,
    jsonb_build_object('outcome', normalized_outcome, 'channel', p_contact_channel)
  );

  return lead_record;
end;
$function$;

create or replace function public.record_whatsapp_opened(
  p_lead_id uuid,
  p_template_key text default 'first_contact'
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  lead_record public.leads;
  normalized_template_key text := coalesce(nullif(btrim(p_template_key), ''), 'first_contact');
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select l.* into lead_record
  from public.leads l
  where l.id = p_lead_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Lead no encontrado';
  end if;

  if not app_private.has_role(lead_record.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a este lead';
  end if;

  insert into public.lead_events (
    clinic_id, lead_id, event_type, title, description, metadata, created_by
  ) values (
    lead_record.clinic_id,
    lead_record.id,
    'whatsapp_opened',
    'WhatsApp abierto',
    'El usuario abrió WhatsApp con un mensaje prearmado. No implica que el mensaje haya sido enviado.',
    jsonb_build_object('channel', 'whatsapp', 'template_key', normalized_template_key),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    lead_record.clinic_id,
    current_user_id,
    'whatsapp_opened',
    'leads',
    lead_record.id,
    jsonb_build_object('template_key', normalized_template_key)
  );
end;
$function$;

-- Existing callers of save_lead_followup also receive the linked contact behavior.
create or replace function public.save_lead_followup(
  p_lead_id uuid,
  p_status text default null,
  p_next_action text default null,
  p_next_followup_at timestamptz default null
)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  lead_record public.leads;
  existing_task public.tasks;
  normalized_status text;
  normalized_action text;
  normalized_due_at timestamptz;
  status_changed boolean;
  task_title text;
  task_type text;
  task_priority text;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select l.* into lead_record
  from public.leads l
  where l.id = p_lead_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Lead no encontrado';
  end if;

  if not app_private.has_role(lead_record.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a este lead';
  end if;

  normalized_status := coalesce(nullif(btrim(p_status), ''), lead_record.status);
  if p_status is not null and normalized_status in ('Consulta Agendada', 'Confirmado', 'Asistió', 'No Asistió', 'Archivado') then
    raise exception using errcode = '22023', message = 'Ese estado se gestiona desde Agenda o Archivado';
  end if;
  if p_status is not null and normalized_status not in (
    'Nuevo', 'No Contactado', 'Contactado', 'Respondió',
    'Presupuesto Enviado', 'Tratamiento Iniciado', 'No Respondió',
    'Perdido', 'Reactivar 30d'
  ) then
    raise exception using errcode = '22023', message = 'Estado comercial inválido';
  end if;

  if p_status is not null and normalized_status = 'Contactado' then
    select * into lead_record
    from public.mark_lead_contacted(
      p_lead_id,
      'crm_status',
      null,
      p_next_action,
      p_next_followup_at
    );
    return lead_record;
  end if;

  normalized_due_at := coalesce(p_next_followup_at, lead_record.next_followup_at, now());
  if normalized_due_at < now() - interval '5 minutes' then
    raise exception using errcode = '22023', message = 'El seguimiento no puede posponerse a una fecha pasada';
  end if;

  normalized_action := coalesce(
    nullif(btrim(p_next_action), ''),
    case normalized_status
      when 'Respondió' then 'Definir próximo paso'
      when 'Presupuesto Enviado' then 'Dar seguimiento al presupuesto'
      when 'No Respondió' then 'Intentar contacto nuevamente'
      when 'Reactivar 30d' then 'Reactivar lead'
      else lead_record.next_action
    end,
    'Contactar lead'
  );
  status_changed := normalized_status is distinct from lead_record.status;

  update public.leads
  set status = normalized_status,
      next_action = normalized_action,
      next_followup_at = normalized_due_at,
      last_contact_at = case
        when normalized_status in ('Respondió', 'No Respondió') then now()
        else last_contact_at
      end,
      contact_attempts = case
        when status_changed and normalized_status in ('Respondió', 'No Respondió') then contact_attempts + 1
        else contact_attempts
      end
  where id = lead_record.id
  returning * into lead_record;

  if p_status is null then
    select t.* into existing_task
    from public.tasks t
    where t.clinic_id = lead_record.clinic_id
      and t.lead_id = lead_record.id
      and t.status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
    order by
      case
        when lead_record.status = 'No Asistió' and t.type = 'no_show_recovery' then 0
        when t.type = 'followup' then 1
        when t.type = 'contact' then 2
        else 3
      end,
      t.created_at desc
    limit 1
    for update;

    if found then
      update public.tasks
      set due_at = normalized_due_at,
          status = 'pendiente',
          completed_at = null,
          completed_by = null,
          updated_at = now()
      where id = existing_task.id;
    else
      task_title := normalized_action;
      task_type := 'followup';
      task_priority := case lead_record.classification
        when 'Lead Caliente' then 'alta'
        when 'Lead Frío' then 'baja'
        else 'media'
      end;
    end if;
  else
    task_title := normalized_action;
    task_type := case when normalized_status in ('Nuevo', 'No Contactado', 'No Respondió') then 'contact' else 'followup' end;
    task_priority := case lead_record.classification
      when 'Lead Caliente' then 'alta'
      when 'Lead Frío' then 'baja'
      else 'media'
    end;
  end if;

  if task_type is not null then
    insert into public.tasks (
      clinic_id, lead_id, title, description, type, priority,
      status, due_at, assigned_to, created_by
    ) values (
      lead_record.clinic_id, lead_record.id, task_title,
      'Seguimiento generado desde el flujo comercial del CRM.',
      task_type, task_priority, 'pendiente', normalized_due_at,
      lead_record.assigned_to, current_user_id
    )
    on conflict (clinic_id, lead_id, type)
      where lead_id is not null and type is not null
        and status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
    do update set
      title = excluded.title,
      description = excluded.description,
      priority = excluded.priority,
      status = 'pendiente',
      due_at = excluded.due_at,
      assigned_to = coalesce(excluded.assigned_to, tasks.assigned_to),
      completed_at = null,
      completed_by = null,
      updated_at = now();
  end if;

  insert into public.lead_events (
    clinic_id, lead_id, event_type, title, description, metadata, created_by
  ) values (
    lead_record.clinic_id,
    lead_record.id,
    case when status_changed then 'status_changed' else 'followup_postponed' end,
    case when status_changed then 'Estado comercial actualizado' else 'Seguimiento pospuesto' end,
    case when status_changed
      then format('Estado cambiado a %s. Próxima acción: %s', normalized_status, normalized_action)
      else format('Próximo seguimiento: %s', normalized_due_at at time zone 'America/Asuncion')
    end,
    jsonb_build_object('status', normalized_status, 'next_followup_at', normalized_due_at),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    lead_record.clinic_id,
    current_user_id,
    case when status_changed then 'lead_status_changed' else 'followup_postponed' end,
    'leads',
    lead_record.id,
    jsonb_build_object('status', normalized_status, 'next_followup_at', normalized_due_at)
  );

  return lead_record;
end;
$function$;

create or replace function public.complete_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  task_record public.tasks;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select t.* into task_record
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Tarea no encontrada';
  end if;

  if not app_private.has_role(task_record.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a esta tarea';
  end if;

  if task_record.lead_id is not null and app_private.is_contact_task(task_record.type, task_record.title) then
    raise exception using errcode = '22023', message = 'Indicá si el paciente respondió para completar esta tarea de contacto';
  end if;

  if lower(task_record.status) in ('hecho', 'completada') then
    return task_record;
  end if;

  update public.tasks
  set status = 'hecho',
      completed_at = now(),
      completed_by = current_user_id,
      updated_at = now()
  where id = task_record.id
  returning * into task_record;

  if task_record.lead_id is not null then
    insert into public.lead_events (
      clinic_id, lead_id, event_type, title, description, metadata, created_by
    ) values (
      task_record.clinic_id,
      task_record.lead_id,
      'task_completed',
      'Tarea completada',
      coalesce(task_record.title, 'Tarea marcada como hecha'),
      jsonb_build_object('task_id', task_record.id),
      current_user_id
    );
  end if;

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    task_record.clinic_id,
    current_user_id,
    'task_completed',
    'tasks',
    task_record.id,
    jsonb_build_object('lead_id', task_record.lead_id)
  );

  return task_record;
end;
$function$;

revoke all on function public.mark_lead_contacted(uuid, text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_contact_task(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_contact_attempt(uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_whatsapp_opened(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.save_lead_followup(uuid, text, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_task(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.mark_lead_contacted(uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.complete_contact_task(uuid, text, text) to authenticated;
grant execute on function public.record_contact_attempt(uuid, text, text, text) to authenticated;
grant execute on function public.record_whatsapp_opened(uuid, text) to authenticated;
grant execute on function public.save_lead_followup(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.complete_task(uuid) to authenticated;

notify pgrst, 'reload schema';
