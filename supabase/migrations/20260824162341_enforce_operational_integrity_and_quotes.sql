-- Operational integrity, canonical next actions and real treatment quotes.
-- Additive migration: no business row is deleted and historical migrations stay untouched.

-- Allow a new opportunity after a terminal one without rewriting the old history.
drop index if exists public.leads_clinic_phone_plus_unique;

create unique index if not exists leads_clinic_open_phone_plus_unique_idx
  on public.leads (clinic_id, phone_plus)
  where phone_plus is not null
    and coalesce(is_archived, false) is false
    and coalesce(status, 'Nuevo') not in ('Perdido', 'Tratamiento Iniciado', 'Archivado');

alter table public.leads
  add column if not exists first_contacted_at timestamptz,
  add column if not exists treatment_started_at timestamptz;

alter table public.appointments
  add column if not exists confirmed_at timestamptz,
  add column if not exists attended_at timestamptz,
  add column if not exists no_show_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists rescheduled_at timestamptz;

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  lead_id uuid not null references public.leads(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  treatment text not null,
  amount numeric(14, 2) not null,
  currency text not null default 'PYG',
  status text not null default 'pending',
  issued_at timestamptz not null default now(),
  accepted_at timestamptz,
  rejected_at timestamptz,
  professional_name text,
  next_action_at timestamptz,
  rejection_reason text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_amount_positive_check check (amount > 0),
  constraint quotes_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint quotes_status_check check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  constraint quotes_transition_dates_check check (
    (status <> 'accepted' or accepted_at is not null)
    and (status <> 'rejected' or rejected_at is not null)
  )
);

alter table public.tasks
  add column if not exists quote_id uuid references public.quotes(id) on delete set null;

create unique index if not exists leads_clinic_id_id_unique_idx
  on public.leads (clinic_id, id);
create unique index if not exists appointments_clinic_lead_id_unique_idx
  on public.appointments (clinic_id, lead_id, id);
create unique index if not exists quotes_clinic_id_id_unique_idx
  on public.quotes (clinic_id, id);

do $do$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'quotes_clinic_lead_fk') then
    alter table public.quotes
      add constraint quotes_clinic_lead_fk
      foreign key (clinic_id, lead_id) references public.leads (clinic_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'quotes_clinic_lead_appointment_fk') then
    alter table public.quotes
      add constraint quotes_clinic_lead_appointment_fk
      foreign key (clinic_id, lead_id, appointment_id)
      references public.appointments (clinic_id, lead_id, id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'tasks_clinic_quote_fk') then
    alter table public.tasks
      add constraint tasks_clinic_quote_fk
      foreign key (clinic_id, quote_id) references public.quotes (clinic_id, id);
  end if;
end;
$do$;

create index if not exists quotes_clinic_lead_issued_idx
  on public.quotes (clinic_id, lead_id, issued_at desc);
create index if not exists quotes_clinic_status_next_action_idx
  on public.quotes (clinic_id, status, next_action_at)
  where status = 'pending';
create index if not exists quotes_appointment_id_idx
  on public.quotes (appointment_id)
  where appointment_id is not null;
create index if not exists tasks_quote_id_idx
  on public.tasks (quote_id)
  where quote_id is not null;
create index if not exists leads_clinic_assigned_open_idx
  on public.leads (clinic_id, assigned_to, next_followup_at)
  where coalesce(is_archived, false) is false
    and coalesce(status, 'Nuevo') not in ('Perdido', 'Tratamiento Iniciado', 'Archivado');

drop trigger if exists set_quotes_updated_at on public.quotes;
create trigger set_quotes_updated_at
before update on public.quotes
for each row execute function public.update_updated_at_column();

alter table public.quotes enable row level security;

drop policy if exists quotes_select_same_clinic on public.quotes;
create policy quotes_select_same_clinic
on public.quotes for select
to authenticated
using ((select app_private.is_clinic_member(clinic_id)));

revoke all on table public.quotes from public, anon, authenticated;
grant select on table public.quotes to authenticated;
grant select, insert, update on table public.quotes to service_role;

create or replace function app_private.is_open_opportunity(p_status text, p_is_archived boolean)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select coalesce(p_is_archived, false) is false
    and coalesce(p_status, 'Nuevo') not in ('Perdido', 'Tratamiento Iniciado', 'Archivado');
$function$;

create or replace function app_private.default_clinic_assignee(p_clinic_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select p.id
  from public.profiles p
  where p.clinic_id = p_clinic_id
    and p.active is true
    and p.role in ('receptionist', 'owner', 'admin')
  order by
    case p.role when 'receptionist' then 0 when 'owner' then 1 else 2 end,
    p.id
  limit 1;
$function$;

create or replace function app_private.resolve_clinic_assignee(
  p_clinic_id uuid,
  p_candidate_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (
      select p.id
      from public.profiles p
      where p.id = p_candidate_id
        and p.clinic_id = p_clinic_id
        and p.active is true
        and p.role in ('receptionist', 'owner', 'admin')
      limit 1
    ),
    app_private.default_clinic_assignee(p_clinic_id)
  );
$function$;

create or replace function app_private.cancel_open_lead_tasks(
  p_clinic_id uuid,
  p_lead_id uuid,
  p_actor_id uuid,
  p_types text[] default null
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cancelled_ids uuid[] := array[]::uuid[];
begin
  with cancelled as (
    update public.tasks t
    set status = 'cancelado',
        completed_at = now(),
        completed_by = p_actor_id,
        updated_at = now()
    where t.clinic_id = p_clinic_id
      and t.lead_id = p_lead_id
      and lower(t.status) in ('pendiente', 'vencido', 'vencida')
      and (p_types is null or lower(coalesce(t.type, '')) = any(p_types))
    returning t.id
  )
  select coalesce(array_agg(id), array[]::uuid[])
  into cancelled_ids
  from cancelled;

  return cancelled_ids;
end;
$function$;

revoke all on function app_private.is_open_opportunity(text, boolean) from public, anon, authenticated, service_role;
revoke all on function app_private.default_clinic_assignee(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.resolve_clinic_assignee(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.cancel_open_lead_tasks(uuid, uuid, uuid, text[]) from public, anon, authenticated, service_role;

-- Repair historical operational inconsistencies without deleting business history.
-- Terminal opportunities keep their events, appointments and completed tasks; only
-- obsolete open work and mirrored next-action fields are closed.
with cancelled as (
  update public.tasks t
  set status = 'cancelado',
      completed_at = coalesce(t.completed_at, now()),
      completed_by = null,
      updated_at = now()
  from public.leads l
  where l.id = t.lead_id
    and l.clinic_id = t.clinic_id
    and not app_private.is_open_opportunity(l.status, l.is_archived)
    and lower(t.status) in ('pendiente', 'vencido', 'vencida')
  returning t.clinic_id, t.lead_id, t.id
), grouped as (
  select clinic_id, lead_id, count(*)::integer as task_count, array_agg(id) as task_ids
  from cancelled
  group by clinic_id, lead_id
), events as (
  insert into public.lead_events (
    clinic_id, lead_id, event_type, title, description, metadata, created_by
  )
  select
    clinic_id,
    lead_id,
    'terminal_tasks_repaired',
    'Acciones terminales saneadas',
    format('Se cancelaron %s acciones abiertas que ya no correspondían.', task_count),
    jsonb_build_object('task_ids', to_jsonb(task_ids), 'migration', '20260824162341'),
    null
  from grouped
  returning clinic_id, lead_id
)
insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
select
  clinic_id,
  null,
  'terminal_tasks_repaired',
  'leads',
  lead_id,
  jsonb_build_object('migration', '20260824162341')
from events;

with repaired as (
  update public.leads l
  set next_action = null,
      next_followup_at = null,
      updated_at = now()
  where not app_private.is_open_opportunity(l.status, l.is_archived)
    and (l.next_action is not null or l.next_followup_at is not null)
  returning l.clinic_id, l.id as lead_id
), events as (
  insert into public.lead_events (
    clinic_id, lead_id, event_type, title, description, metadata, created_by
  )
  select
    clinic_id,
    lead_id,
    'terminal_next_action_cleared',
    'Próxima acción terminal cerrada',
    'Se limpiaron campos operativos incompatibles con una oportunidad cerrada.',
    jsonb_build_object('migration', '20260824162341'),
    null
  from repaired
  returning clinic_id, lead_id
)
insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
select
  clinic_id,
  null,
  'terminal_next_action_cleared',
  'leads',
  lead_id,
  jsonb_build_object('migration', '20260824162341')
from events;

-- Every historical open opportunity gets a deterministic same-clinic owner when
-- one exists and a usable next-action mirror for backwards-compatible screens.
with repaired as (
  update public.leads l
  set assigned_to = app_private.resolve_clinic_assignee(l.clinic_id, l.assigned_to),
      next_action = coalesce(nullif(btrim(l.next_action), ''), 'Definir próximo paso'),
      next_followup_at = coalesce(l.next_followup_at, now()),
      updated_at = now()
  where app_private.is_open_opportunity(l.status, l.is_archived)
    and (
      nullif(btrim(l.next_action), '') is null
      or l.next_followup_at is null
      or l.assigned_to is distinct from app_private.resolve_clinic_assignee(l.clinic_id, l.assigned_to)
    )
  returning l.clinic_id, l.id as lead_id, l.assigned_to, l.next_action, l.next_followup_at
), events as (
  insert into public.lead_events (
    clinic_id, lead_id, event_type, title, description, metadata, created_by
  )
  select
    clinic_id,
    lead_id,
    'operational_integrity_repaired',
    'Continuidad operativa saneada',
    'Se aseguró encargado y próxima acción usando la configuración disponible de la clínica.',
    jsonb_build_object(
      'assigned_to', assigned_to,
      'next_action', next_action,
      'next_followup_at', next_followup_at,
      'migration', '20260824162341'
    ),
    null
  from repaired
  returning clinic_id, lead_id
)
insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
select
  clinic_id,
  null,
  'operational_integrity_repaired',
  'leads',
  lead_id,
  jsonb_build_object('migration', '20260824162341')
from events;

with created as (
  insert into public.tasks (
    clinic_id, lead_id, title, description, type, priority,
    status, due_at, assigned_to, created_by
  )
  select
    l.clinic_id,
    l.id,
    coalesce(nullif(btrim(l.next_action), ''), 'Definir próximo paso'),
    'Acción de seguridad creada para que una oportunidad abierta no quede olvidada.',
    'safety_followup',
    case when l.assigned_to is null then 'alta' else 'media' end,
    'pendiente',
    coalesce(l.next_followup_at, now()),
    l.assigned_to,
    null
  from public.leads l
  where app_private.is_open_opportunity(l.status, l.is_archived)
    and not exists (
      select 1
      from public.tasks t
      where t.clinic_id = l.clinic_id
        and t.lead_id = l.id
        and lower(t.status) in ('pendiente', 'vencido', 'vencida')
    )
  returning clinic_id, lead_id, id as task_id, assigned_to
), events as (
  insert into public.lead_events (
    clinic_id, lead_id, event_type, title, description, metadata, created_by
  )
  select
    clinic_id,
    lead_id,
    'safety_next_action_created',
    'Próxima acción de seguridad creada',
    'La oportunidad estaba abierta sin trabajo pendiente; se creó una acción operativa.',
    jsonb_build_object(
      'task_id', task_id,
      'assigned_to', assigned_to,
      'assignment_required', assigned_to is null,
      'migration', '20260824162341'
    ),
    null
  from created
  returning clinic_id, lead_id
)
insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
select
  clinic_id,
  null,
  'safety_next_action_created',
  'leads',
  lead_id,
  jsonb_build_object('migration', '20260824162341')
from events;

-- Called only by the Edge Function with the service role. The form determines the
-- clinic; callers cannot supply clinic_id directly. All domain writes commit or roll back together.
create or replace function public.create_public_lead_intake(
  p_form_id uuid,
  p_clinic_slug text,
  p_public_token text,
  p_name text,
  p_phone text,
  p_phone_plus text,
  p_treatment text,
  p_urgency text,
  p_score integer,
  p_classification text,
  p_situation text,
  p_evaluation_previous text,
  p_consultation_reason text,
  p_estimated_value numeric,
  p_next_action text,
  p_next_followup_at timestamptz,
  p_whatsapp_link text,
  p_source text,
  p_page text,
  p_notes text,
  p_consent_at timestamptz,
  p_ip_hash text,
  p_phone_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  form_record public.clinic_public_forms;
  lead_record public.leads;
  previous_terminal public.leads;
  assigned_user_id uuid;
  normalized_name text := nullif(btrim(p_name), '');
  normalized_phone text := nullif(btrim(p_phone), '');
  normalized_phone_plus text := nullif(btrim(p_phone_plus), '');
  normalized_classification text := coalesce(nullif(btrim(p_classification), ''), 'Lead Medio');
  normalized_action text := coalesce(nullif(btrim(p_next_action), ''), 'Responder nueva consulta');
  normalized_due_at timestamptz := coalesce(p_next_followup_at, now());
  event_type_value text;
  event_title text;
  task_priority text;
  created_new boolean := false;
  created_after_terminal boolean := false;
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

  if normalized_name is null or length(normalized_name) > 160 then
    raise exception using errcode = '22023', message = 'Nombre inválido';
  end if;
  if normalized_phone_plus is null or length(normalized_phone_plus) > 64 then
    raise exception using errcode = '22023', message = 'Teléfono inválido';
  end if;
  if normalized_classification not in ('Lead Caliente', 'Lead Medio', 'Lead Frío') then
    raise exception using errcode = '22023', message = 'Clasificación inválida';
  end if;
  if coalesce(p_score, 0) < 0 or coalesce(p_score, 0) > 1000 then
    raise exception using errcode = '22023', message = 'Score inválido';
  end if;
  if p_estimated_value is not null and p_estimated_value < 0 then
    raise exception using errcode = '22023', message = 'Estimación inválida';
  end if;
  if p_consent_at is null then
    raise exception using errcode = '23514', message = 'El consentimiento es obligatorio';
  end if;

  -- Serialize duplicate submissions for this form/phone pair.
  perform pg_advisory_xact_lock(hashtextextended(form_record.clinic_id::text || ':' || normalized_phone_plus, 0));

  assigned_user_id := app_private.default_clinic_assignee(form_record.clinic_id);
  task_priority := case normalized_classification
    when 'Lead Caliente' then 'alta'
    when 'Lead Frío' then 'baja'
    else 'media'
  end;

  select l.* into lead_record
  from public.leads l
  where l.clinic_id = form_record.clinic_id
    and l.phone_plus = normalized_phone_plus
    and app_private.is_open_opportunity(l.status, l.is_archived)
  order by l.created_at desc
  limit 1
  for update;

  if found then
    event_type_value := 'lead_duplicate_submission';
    event_title := 'Nueva consulta sobre oportunidad abierta';

    update public.leads l
    set name = normalized_name,
        phone = coalesce(normalized_phone, l.phone),
        treatment = coalesce(nullif(btrim(p_treatment), ''), l.treatment),
        urgency = coalesce(nullif(btrim(p_urgency), ''), l.urgency),
        score = greatest(coalesce(l.score, 0), coalesce(p_score, 0)),
        classification = case
          when l.classification = 'Lead Caliente' or normalized_classification = 'Lead Caliente' then 'Lead Caliente'
          when l.classification = 'Lead Medio' or normalized_classification = 'Lead Medio' then 'Lead Medio'
          else 'Lead Frío'
        end,
        situation = coalesce(nullif(btrim(p_situation), ''), l.situation),
        evaluation_previous = coalesce(nullif(btrim(p_evaluation_previous), ''), l.evaluation_previous),
        consultation_reason = coalesce(nullif(btrim(p_consultation_reason), ''), l.consultation_reason),
        estimated_value = coalesce(l.estimated_value, p_estimated_value),
        next_action = 'Responder nueva consulta',
        next_followup_at = least(coalesce(l.next_followup_at, normalized_due_at), normalized_due_at),
        whatsapp_link = coalesce(nullif(btrim(p_whatsapp_link), ''), l.whatsapp_link),
        source = coalesce(nullif(btrim(p_source), ''), l.source),
        page = coalesce(nullif(btrim(p_page), ''), l.page),
        notes = coalesce(l.notes, nullif(btrim(p_notes), '')),
        assigned_to = app_private.resolve_clinic_assignee(l.clinic_id, l.assigned_to),
        consent_contact = true,
        consent_at = p_consent_at,
        consent_source = nullif(btrim(p_source), ''),
        consent_page = nullif(btrim(p_page), ''),
        updated_at = now()
    where l.id = lead_record.id
    returning l.* into lead_record;
  else
    select l.* into previous_terminal
    from public.leads l
    where l.clinic_id = form_record.clinic_id
      and l.phone_plus = normalized_phone_plus
      and not app_private.is_open_opportunity(l.status, l.is_archived)
    order by l.created_at desc
    limit 1;

    created_after_terminal := found;
    created_new := true;
    event_type_value := case when created_after_terminal then 'new_opportunity_after_terminal' else 'lead_created_from_landing' end;
    event_title := case when created_after_terminal then 'Nueva oportunidad con historial anterior' else 'Consulta creada desde landing' end;

    insert into public.leads (
      clinic_id, name, phone, phone_plus, treatment, urgency,
      score, classification, status, situation, evaluation_previous,
      consultation_reason, estimated_value, next_action, next_followup_at,
      contact_attempts, whatsapp_link, source, page, notes, assigned_to,
      consent_contact, consent_at, consent_source, consent_page
    ) values (
      form_record.clinic_id, normalized_name, normalized_phone, normalized_phone_plus,
      nullif(btrim(p_treatment), ''), nullif(btrim(p_urgency), ''),
      coalesce(p_score, 0), normalized_classification, 'Nuevo',
      nullif(btrim(p_situation), ''), nullif(btrim(p_evaluation_previous), ''),
      nullif(btrim(p_consultation_reason), ''), p_estimated_value,
      normalized_action, normalized_due_at, 0,
      nullif(btrim(p_whatsapp_link), ''), nullif(btrim(p_source), ''),
      nullif(btrim(p_page), ''), nullif(btrim(p_notes), ''), assigned_user_id,
      true, p_consent_at, nullif(btrim(p_source), ''), nullif(btrim(p_page), '')
    )
    returning * into lead_record;
  end if;

  insert into public.tasks (
    clinic_id, lead_id, title, description, type, priority,
    status, due_at, assigned_to, created_by
  ) values (
    lead_record.clinic_id,
    lead_record.id,
    case when created_new then normalized_action else 'Responder nueva consulta' end,
    'Acción creada por una consulta pública validada.',
    'contact',
    task_priority,
    'pendiente',
    least(coalesce(lead_record.next_followup_at, normalized_due_at), normalized_due_at),
    lead_record.assigned_to,
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
    due_at = least(coalesce(tasks.due_at, excluded.due_at), excluded.due_at),
    assigned_to = app_private.resolve_clinic_assignee(excluded.clinic_id, tasks.assigned_to),
    completed_at = null,
    completed_by = null,
    updated_at = now();

  insert into public.lead_events (
    clinic_id, lead_id, event_type, title, description, metadata, created_by
  ) values (
    lead_record.clinic_id,
    lead_record.id,
    event_type_value,
    event_title,
    case when created_after_terminal
      then 'Se creó una oportunidad nueva sin reabrir ni sobrescribir la oportunidad terminal anterior.'
      when created_new then 'Consulta creada desde formulario público.'
      else 'El paciente volvió a enviar el formulario; se priorizó la oportunidad abierta existente.'
    end,
    jsonb_build_object(
      'form_id', form_record.id,
      'classification', normalized_classification,
      'score', coalesce(p_score, 0),
      'previous_terminal_lead_id', previous_terminal.id,
      'created_new_opportunity', created_new,
      'assigned_to', lead_record.assigned_to
    ),
    null
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    lead_record.clinic_id,
    null,
    event_type_value,
    'leads',
    lead_record.id,
    jsonb_build_object(
      'form_id', form_record.id,
      'previous_terminal_lead_id', previous_terminal.id,
      'created_new_opportunity', created_new,
      'assigned_to', lead_record.assigned_to
    )
  );

  insert into public.automation_jobs (clinic_id, lead_id, workflow_name, status, payload)
  values (
    lead_record.clinic_id,
    lead_record.id,
    'lead_created',
    'pending',
    jsonb_build_object('lead_id', lead_record.id, 'classification', normalized_classification, 'score', coalesce(p_score, 0))
  );

  if normalized_classification = 'Lead Caliente' then
    insert into public.automation_jobs (clinic_id, lead_id, workflow_name, status, payload)
    values (
      lead_record.clinic_id,
      lead_record.id,
      'lead_hot_alert',
      'pending',
      jsonb_build_object('lead_id', lead_record.id, 'classification', normalized_classification, 'score', coalesce(p_score, 0))
    );
  end if;

  if lead_record.assigned_to is null then
    insert into public.automation_jobs (clinic_id, lead_id, workflow_name, status, payload)
    values (
      lead_record.clinic_id,
      lead_record.id,
      'lead_assignment_required',
      'pending',
      jsonb_build_object('lead_id', lead_record.id, 'severity', 'p0')
    );
  end if;

  insert into public.form_submission_logs (
    clinic_public_form_id, clinic_id, ip_hash, phone_hash, status
  ) values (
    form_record.id, form_record.clinic_id, nullif(btrim(p_ip_hash), ''), nullif(btrim(p_phone_hash), ''), 'accepted'
  );

  return jsonb_build_object(
    'lead_id', lead_record.id,
    'classification', lead_record.classification,
    'score', lead_record.score,
    'assigned_to', lead_record.assigned_to,
    'created', created_new,
    'duplicate_open', not created_new,
    'new_after_terminal', created_after_terminal
  );
end;
$function$;

revoke all on function public.create_public_lead_intake(
  uuid, text, text, text, text, text, text, text, integer, text,
  text, text, text, numeric, text, timestamptz, text, text, text,
  text, timestamptz, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_public_lead_intake(
  uuid, text, text, text, text, text, text, text, integer, text,
  text, text, text, numeric, text, timestamptz, text, text, text,
  text, timestamptz, text, text
) to service_role;

create or replace function public.reassign_lead_owner(p_lead_id uuid, p_assigned_to uuid)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  lead_record public.leads;
  previous_assignee uuid;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select l.* into lead_record
  from public.leads l
  where l.id = p_lead_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Paciente no encontrado';
  end if;
  if not app_private.has_role(lead_record.clinic_id, array['admin', 'owner']) then
    raise exception using errcode = '42501', message = 'Solo owner/admin puede cambiar el encargado';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_assigned_to
      and p.clinic_id = lead_record.clinic_id
      and p.active is true
      and p.role in ('admin', 'owner', 'receptionist')
  ) then
    raise exception using errcode = '42501', message = 'El encargado debe ser un usuario activo de la clínica';
  end if;

  previous_assignee := lead_record.assigned_to;
  update public.leads
  set assigned_to = p_assigned_to,
      updated_at = now()
  where id = lead_record.id
  returning * into lead_record;

  update public.tasks t
  set assigned_to = p_assigned_to,
      updated_at = now()
  where t.clinic_id = lead_record.clinic_id
    and t.lead_id = lead_record.id
    and lower(t.status) in ('pendiente', 'vencido', 'vencida');

  insert into public.lead_events (clinic_id, lead_id, event_type, title, description, metadata, created_by)
  values (
    lead_record.clinic_id, lead_record.id, 'lead_reassigned', 'Encargado actualizado',
    'La oportunidad y sus acciones abiertas fueron reasignadas.',
    jsonb_build_object('previous_assignee', previous_assignee, 'assigned_to', p_assigned_to),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    lead_record.clinic_id, current_user_id, 'lead_reassigned', 'leads', lead_record.id,
    jsonb_build_object('previous_assignee', previous_assignee, 'assigned_to', p_assigned_to)
  );

  return lead_record;
end;
$function$;

revoke all on function public.reassign_lead_owner(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.reassign_lead_owner(uuid, uuid) to authenticated;

create or replace function public.register_lead_outcome(
  p_lead_id uuid,
  p_outcome text,
  p_note text default null,
  p_followup_at timestamptz default null
)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  lead_record public.leads;
  active_quote public.quotes;
  normalized_outcome text := lower(btrim(coalesce(p_outcome, '')));
  followup_at timestamptz;
  next_action_value text;
  next_status text;
  next_task_type text;
  next_task_priority text := 'media';
  assigned_user_id uuid;
  cancelled_task_ids uuid[] := array[]::uuid[];
  cancelled_quote_ids uuid[] := array[]::uuid[];
  event_type_value text;
  event_title text;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if normalized_outcome not in ('responded', 'no_response', 'follow_up', 'treatment_started') then
    raise exception using errcode = '22023', message = 'Resultado inválido';
  end if;

  select l.* into lead_record
  from public.leads l
  where l.id = p_lead_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Paciente no encontrado';
  end if;
  if not app_private.has_role(lead_record.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a este paciente';
  end if;
  if not app_private.is_open_opportunity(lead_record.status, lead_record.is_archived) then
    if normalized_outcome = 'treatment_started' and lead_record.status = 'Tratamiento Iniciado' then
      return lead_record;
    end if;
    raise exception using errcode = '22023', message = 'La oportunidad ya está cerrada';
  end if;

  assigned_user_id := app_private.resolve_clinic_assignee(lead_record.clinic_id, lead_record.assigned_to);

  -- A rapid repeated submit must not increment attempts or duplicate timeline
  -- events. Domain-changing outcomes use their own idempotent branches below.
  if normalized_outcome <> 'treatment_started' and exists (
    select 1
    from public.lead_events e
    where e.clinic_id = lead_record.clinic_id
      and e.lead_id = lead_record.id
      and e.created_by = current_user_id
      and e.created_at >= now() - interval '10 seconds'
      and e.metadata ->> 'outcome' = normalized_outcome
  ) then
    return lead_record;
  end if;

  if lead_record.status = 'Presupuesto Enviado' then
    select q.* into active_quote
    from public.quotes q
    where q.clinic_id = lead_record.clinic_id
      and q.lead_id = lead_record.id
      and q.status = 'pending'
    order by q.issued_at desc
    limit 1
    for update;
  end if;

  if normalized_outcome = 'treatment_started' then
    cancelled_task_ids := app_private.cancel_open_lead_tasks(lead_record.clinic_id, lead_record.id, current_user_id, null);

    with cancelled_quotes as (
      update public.quotes q
      set status = 'cancelled',
          next_action_at = null,
          updated_by = current_user_id,
          updated_at = now()
      where q.clinic_id = lead_record.clinic_id
        and q.lead_id = lead_record.id
        and q.status = 'pending'
      returning q.id
    )
    select coalesce(array_agg(id), array[]::uuid[])
    into cancelled_quote_ids
    from cancelled_quotes;

    update public.leads
    set status = 'Tratamiento Iniciado',
        assigned_to = assigned_user_id,
        treatment_started_at = now(),
        next_action = null,
        next_followup_at = null,
        updated_at = now()
    where id = lead_record.id
    returning * into lead_record;

    event_type_value := 'treatment_started';
    event_title := 'Tratamiento iniciado';
  else
    followup_at := coalesce(
      p_followup_at,
      (date_trunc('day', now() at time zone 'America/Asuncion') + interval '1 day 9 hours') at time zone 'America/Asuncion'
    );
    if followup_at < now() - interval '5 minutes' then
      raise exception using errcode = '22023', message = 'La próxima acción no puede quedar en el pasado';
    end if;

    case normalized_outcome
      when 'responded' then
        next_status := case when active_quote.id is not null then 'Presupuesto Enviado' else 'Contactado' end;
        next_action_value := case when active_quote.id is not null then 'Definir resultado del presupuesto' else 'Definir próximo paso' end;
        next_task_type := case when active_quote.id is not null then 'quote_followup' else 'followup' end;
        event_type_value := 'lead_contacted';
        event_title := 'El paciente respondió';
        cancelled_task_ids := app_private.cancel_open_lead_tasks(
          lead_record.clinic_id, lead_record.id, current_user_id,
          array['contact', 'contact_lead', 'initial_contact', 'follow_up_contact', 'manual_contact', 'followup', 'no_show_recovery', 'cancelled_recovery', 'quote_followup']
        );
      when 'no_response' then
        next_status := case when active_quote.id is not null then 'Presupuesto Enviado' else 'No Respondió' end;
        next_action_value := case when active_quote.id is not null then 'Reintentar seguimiento del presupuesto' else 'Reintentar contacto' end;
        next_task_type := case when active_quote.id is not null then 'quote_followup' else 'contact' end;
        next_task_priority := case lead_record.classification when 'Lead Caliente' then 'alta' else 'media' end;
        event_type_value := 'contact_attempted';
        event_title := 'Intento sin respuesta';
        cancelled_task_ids := app_private.cancel_open_lead_tasks(
          lead_record.clinic_id, lead_record.id, current_user_id,
          array['contact', 'contact_lead', 'initial_contact', 'follow_up_contact', 'manual_contact', 'followup', 'no_show_recovery', 'cancelled_recovery', 'quote_followup']
        );
      when 'follow_up' then
        next_status := lead_record.status;
        next_action_value := case
          when lead_record.status = 'Presupuesto Enviado' then 'Dar seguimiento al presupuesto'
          else 'Volver a contactar'
        end;
        next_task_type := case when lead_record.status = 'Presupuesto Enviado' then 'quote_followup' else 'followup' end;
        event_type_value := 'followup_scheduled';
        event_title := 'Próximo contacto programado';
        cancelled_task_ids := app_private.cancel_open_lead_tasks(
          lead_record.clinic_id, lead_record.id, current_user_id,
          array['contact', 'contact_lead', 'initial_contact', 'follow_up_contact', 'manual_contact', 'followup', 'no_show_recovery', 'cancelled_recovery', 'quote_followup']
        );
    end case;

    update public.leads
    set status = next_status,
        assigned_to = assigned_user_id,
        last_contact_at = case when normalized_outcome in ('responded', 'no_response') then now() else last_contact_at end,
        first_contacted_at = case when normalized_outcome = 'responded' then coalesce(first_contacted_at, now()) else first_contacted_at end,
        contact_attempts = case when normalized_outcome in ('responded', 'no_response') then coalesce(contact_attempts, 0) + 1 else contact_attempts end,
        next_action = next_action_value,
        next_followup_at = followup_at,
        updated_at = now()
    where id = lead_record.id
    returning * into lead_record;

    insert into public.tasks (
      clinic_id, lead_id, quote_id, title, description, type, priority,
      status, due_at, assigned_to, created_by
    ) values (
      lead_record.clinic_id, lead_record.id, active_quote.id, next_action_value,
      'Próxima acción generada al registrar un resultado.',
      next_task_type, next_task_priority, 'pendiente', followup_at,
      assigned_user_id, current_user_id
    )
    on conflict (clinic_id, lead_id, type)
      where lead_id is not null and type is not null
        and status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
    do update set
      quote_id = excluded.quote_id,
      title = excluded.title,
      description = excluded.description,
      priority = excluded.priority,
      status = 'pendiente',
      due_at = excluded.due_at,
      assigned_to = excluded.assigned_to,
      completed_at = null,
      completed_by = null,
      updated_at = now();

    if active_quote.id is not null then
      update public.quotes
      set next_action_at = followup_at,
          updated_by = current_user_id,
          updated_at = now()
      where id = active_quote.id;
    end if;
  end if;

  insert into public.lead_events (clinic_id, lead_id, event_type, title, description, metadata, created_by)
  values (
    lead_record.clinic_id, lead_record.id, event_type_value, event_title,
    nullif(btrim(p_note), ''),
    jsonb_build_object(
      'outcome', normalized_outcome,
      'next_followup_at', lead_record.next_followup_at,
      'cancelled_task_ids', to_jsonb(cancelled_task_ids),
      'cancelled_quote_ids', to_jsonb(cancelled_quote_ids),
      'assigned_to', lead_record.assigned_to
    ),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    lead_record.clinic_id, current_user_id, event_type_value, 'leads', lead_record.id,
    jsonb_build_object(
      'outcome', normalized_outcome,
      'cancelled_task_ids', to_jsonb(cancelled_task_ids),
      'cancelled_quote_ids', to_jsonb(cancelled_quote_ids)
    )
  );

  return lead_record;
end;
$function$;

revoke all on function public.register_lead_outcome(uuid, text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.register_lead_outcome(uuid, text, text, timestamptz)
  to authenticated;

create or replace function public.complete_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  task_record public.tasks;
  lead_record public.leads;
  next_task public.tasks;
  assigned_user_id uuid;
  protected_type text;
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
  if lower(task_record.status) in ('hecho', 'completada') then
    return task_record;
  end if;

  protected_type := lower(coalesce(task_record.type, ''));
  if task_record.lead_id is not null and (
    app_private.is_contact_task(task_record.type, task_record.title)
    or protected_type in ('confirm', 'attendance', 'no_show_recovery', 'cancelled_recovery', 'quote_registration', 'quote_followup', 'treatment_start')
  ) then
    raise exception using errcode = '22023', message = 'Registrá qué ocurrió para completar esta acción';
  end if;

  update public.tasks
  set status = 'hecho',
      completed_at = now(),
      completed_by = current_user_id,
      updated_at = now()
  where id = task_record.id
  returning * into task_record;

  if task_record.lead_id is not null then
    select l.* into lead_record
    from public.leads l
    where l.id = task_record.lead_id
      and l.clinic_id = task_record.clinic_id
    for update;

    if found and app_private.is_open_opportunity(lead_record.status, lead_record.is_archived) then
      assigned_user_id := app_private.resolve_clinic_assignee(lead_record.clinic_id, lead_record.assigned_to);

      select t.* into next_task
      from public.tasks t
      where t.clinic_id = lead_record.clinic_id
        and t.lead_id = lead_record.id
        and lower(t.status) in ('pendiente', 'vencido', 'vencida')
      order by t.due_at asc nulls last, t.created_at asc
      limit 1
      for update;

      if not found then
        insert into public.tasks (
          clinic_id, lead_id, title, description, type, priority,
          status, due_at, assigned_to, created_by
        ) values (
          lead_record.clinic_id, lead_record.id, 'Definir próximo paso',
          'Acción de seguridad creada porque la oportunidad sigue abierta.',
          'followup', 'media', 'pendiente', app_private.tomorrow_at_asuncion(9),
          assigned_user_id, current_user_id
        )
        returning * into next_task;
      end if;

      update public.leads
      set assigned_to = assigned_user_id,
          next_action = next_task.title,
          next_followup_at = next_task.due_at,
          updated_at = now()
      where id = lead_record.id;
    elsif found then
      update public.leads
      set next_action = null,
          next_followup_at = null,
          updated_at = now()
      where id = lead_record.id;
    end if;

    insert into public.lead_events (clinic_id, lead_id, event_type, title, description, metadata, created_by)
    values (
      task_record.clinic_id, task_record.lead_id, 'task_completed', 'Tarea completada',
      coalesce(task_record.title, 'Tarea marcada como hecha'),
      jsonb_build_object('task_id', task_record.id, 'next_task_id', next_task.id),
      current_user_id
    );
  end if;

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    task_record.clinic_id, current_user_id, 'task_completed', 'tasks', task_record.id,
    jsonb_build_object('lead_id', task_record.lead_id, 'next_task_id', next_task.id)
  );

  return task_record;
end;
$function$;

revoke all on function public.complete_task(uuid) from public, anon, authenticated, service_role;
grant execute on function public.complete_task(uuid) to authenticated;

create or replace function public.mark_lead_lost(
  p_lead_id uuid,
  p_reason text,
  p_reason_note text default null,
  p_archive boolean default false
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
  normalized_reason text := nullif(btrim(p_reason), '');
  normalized_note text := nullif(btrim(p_reason_note), '');
  actor_role text;
  cancelled_task_ids uuid[] := array[]::uuid[];
  cancelled_quote_ids uuid[] := array[]::uuid[];
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if normalized_reason is null or normalized_reason not in (
    'No responde', 'Precio', 'Eligió otra clínica', 'Fuera de zona',
    'No era el tratamiento adecuado', 'No tenía disponibilidad',
    'Sólo estaba consultando', 'Duplicado', 'Número inválido',
    'Reprogramó muchas veces', 'Otro'
  ) then
    raise exception using errcode = '22023', message = 'Motivo de pérdida inválido';
  end if;
  if normalized_reason = 'Otro' and normalized_note is null then
    raise exception using errcode = '22023', message = 'Escribí una nota cuando el motivo es Otro';
  end if;

  select l.* into lead_record
  from public.leads l
  where l.id = p_lead_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Paciente no encontrado';
  end if;

  select p.role into actor_role
  from public.profiles p
  where p.id = current_user_id
    and p.clinic_id = lead_record.clinic_id
    and p.active is true;

  if actor_role is null or actor_role not in ('admin', 'owner', 'receptionist') then
    raise exception using errcode = '42501', message = 'No tenés acceso a este paciente';
  end if;
  if p_archive and actor_role not in ('admin', 'owner') then
    raise exception using errcode = '42501', message = 'Solo owner/admin puede archivar oportunidades';
  end if;

  previous_status := lead_record.status;
  cancelled_task_ids := app_private.cancel_open_lead_tasks(lead_record.clinic_id, lead_record.id, current_user_id, null);

  with cancelled_quotes as (
    update public.quotes q
    set status = 'cancelled',
        next_action_at = null,
        updated_by = current_user_id,
        updated_at = now()
    where q.clinic_id = lead_record.clinic_id
      and q.lead_id = lead_record.id
      and q.status = 'pending'
    returning q.id
  )
  select coalesce(array_agg(id), array[]::uuid[])
  into cancelled_quote_ids
  from cancelled_quotes;

  update public.leads
  set status = case when p_archive then 'Archivado' else 'Perdido' end,
      lost_reason = normalized_reason,
      lost_reason_note = normalized_note,
      lost_at = now(),
      lost_by = current_user_id,
      next_action = null,
      next_followup_at = null,
      is_archived = case when p_archive then true else is_archived end,
      archived_at = case when p_archive then now() else archived_at end,
      archived_by = case when p_archive then current_user_id else archived_by end,
      archived_reason = case when p_archive then concat_ws(': ', normalized_reason, normalized_note) else archived_reason end,
      updated_at = now()
  where id = lead_record.id
  returning * into lead_record;

  insert into public.lead_events (clinic_id, lead_id, event_type, title, description, metadata, created_by)
  values (
    lead_record.clinic_id, lead_record.id, 'lead_lost_reason_set',
    case when p_archive then 'Oportunidad archivada' else 'Oportunidad marcada como no continuó' end,
    concat_ws(': ', normalized_reason, normalized_note),
    jsonb_build_object(
      'reason', normalized_reason,
      'note', normalized_note,
      'previous_status', previous_status,
      'new_status', lead_record.status,
      'archived', p_archive,
      'cancelled_task_ids', to_jsonb(cancelled_task_ids),
      'cancelled_quote_ids', to_jsonb(cancelled_quote_ids)
    ),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    lead_record.clinic_id, current_user_id, 'lead_lost_reason_set', 'leads', lead_record.id,
    jsonb_build_object(
      'reason', normalized_reason,
      'archived', p_archive,
      'cancelled_task_ids', to_jsonb(cancelled_task_ids),
      'cancelled_quote_ids', to_jsonb(cancelled_quote_ids)
    )
  );

  return lead_record;
end;
$function$;

revoke all on function public.mark_lead_lost(uuid, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_lead_lost(uuid, text, text, boolean)
  to authenticated;

-- Scheduling is the only write path exposed to authenticated users. It keeps the
-- appointment, lead and operational task in the same transaction.
create or replace function public.schedule_lead_appointment(
  p_lead_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_doctor_assigned text,
  p_treatment_scheduled text default null,
  p_notes text default null,
  p_appointment_id uuid default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  lead_record public.leads;
  appointment_record public.appointments;
  previous_appointment_id uuid;
  normalized_doctor text := nullif(btrim(p_doctor_assigned), '');
  appointment_due_at timestamptz;
  assigned_user_id uuid;
  is_reschedule boolean := false;
  cancelled_task_ids uuid[] := array[]::uuid[];
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_appointment_date is null or p_appointment_time is null or normalized_doctor is null then
    raise exception using errcode = '22023', message = 'Fecha, hora y profesional son obligatorios';
  end if;
  if app_private.asuncion_timestamp(p_appointment_date, p_appointment_time) <= now() then
    raise exception using errcode = '22023', message = 'La cita debe programarse en el futuro';
  end if;

  select l.* into lead_record
  from public.leads l
  where l.id = p_lead_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Paciente no encontrado';
  end if;
  if not app_private.has_role(lead_record.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a este paciente';
  end if;
  if not app_private.is_open_opportunity(lead_record.status, lead_record.is_archived) then
    raise exception using errcode = '22023', message = 'La oportunidad está cerrada; reactivala explícitamente antes de agendar';
  end if;

  assigned_user_id := app_private.resolve_clinic_assignee(lead_record.clinic_id, lead_record.assigned_to);

  if p_appointment_id is not null then
    select a.* into appointment_record
    from public.appointments a
    where a.id = p_appointment_id
      and a.clinic_id = lead_record.clinic_id
      and a.lead_id = lead_record.id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Cita no encontrada para este paciente';
    end if;

    previous_appointment_id := appointment_record.id;
    is_reschedule := true;

    -- Preserve terminal attendance history. Reprogramming a terminal appointment
    -- creates a new row instead of rewriting the no-show/cancellation.
    if appointment_record.status in ('Asistió', 'No Asistió', 'Cancelado', 'Perdido') then
      appointment_record := null;
    end if;
  else
    select a.* into appointment_record
    from public.appointments a
    where a.clinic_id = lead_record.clinic_id
      and a.lead_id = lead_record.id
      and a.status in ('Agendado', 'Consulta Agendada', 'Confirmado', 'Pendiente', 'Reprogramado')
    order by a.appointment_date desc, a.appointment_time desc, a.created_at desc
    limit 1
    for update;
    is_reschedule := found;
    previous_appointment_id := appointment_record.id;
  end if;

  -- The lead row lock serializes rapid submits. If the same appointment was
  -- already saved, return it without turning a double click into a reprogramming.
  if appointment_record.id is not null
    and appointment_record.appointment_date = p_appointment_date
    and appointment_record.appointment_time = p_appointment_time
    and appointment_record.doctor_assigned = normalized_doctor
    and coalesce(appointment_record.treatment_scheduled, '') = coalesce(nullif(btrim(p_treatment_scheduled), ''), lead_record.treatment, '')
    and coalesce(appointment_record.notes, '') = coalesce(nullif(btrim(p_notes), ''), '')
  then
    return appointment_record;
  end if;

  begin
    if appointment_record.id is not null then
      update public.appointments
      set appointment_date = p_appointment_date,
          appointment_time = p_appointment_time,
          doctor_assigned = normalized_doctor,
          treatment_scheduled = coalesce(nullif(btrim(p_treatment_scheduled), ''), lead_record.treatment),
          status = case when is_reschedule then 'Reprogramado' else 'Agendado' end,
          notes = nullif(btrim(p_notes), ''),
          confirmed_at = null,
          attended_at = null,
          no_show_at = null,
          cancelled_at = null,
          rescheduled_at = case when is_reschedule then now() else null end,
          updated_at = now()
      where id = appointment_record.id
      returning * into appointment_record;
    else
      insert into public.appointments (
        clinic_id, lead_id, appointment_date, appointment_time,
        doctor_assigned, treatment_scheduled, status, notes, rescheduled_at
      ) values (
        lead_record.clinic_id, lead_record.id, p_appointment_date, p_appointment_time,
        normalized_doctor, coalesce(nullif(btrim(p_treatment_scheduled), ''), lead_record.treatment),
        case when is_reschedule then 'Reprogramado' else 'Agendado' end,
        nullif(btrim(p_notes), ''), case when is_reschedule then now() else null end
      ) returning * into appointment_record;
    end if;
  exception
    when unique_violation then
      raise exception using errcode = '23505', message = 'Ese horario ya está ocupado para ese profesional';
  end;

  cancelled_task_ids := app_private.cancel_open_lead_tasks(
    lead_record.clinic_id,
    lead_record.id,
    current_user_id,
    array['contact', 'followup', 'no_response', 'confirm', 'attendance', 'no_show_recovery', 'cancelled_recovery']
  );

  appointment_due_at := greatest(
    now(),
    app_private.asuncion_timestamp(p_appointment_date, p_appointment_time) - interval '1 day'
  );

  insert into public.tasks (
    clinic_id, lead_id, title, description, type, priority,
    status, due_at, assigned_to, created_by
  ) values (
    lead_record.clinic_id, lead_record.id, 'Confirmar asistencia',
    'Confirmar la cita antes del horario programado.', 'confirm', 'media',
    'pendiente', appointment_due_at, assigned_user_id, current_user_id
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
    assigned_to = excluded.assigned_to,
    completed_at = null,
    updated_at = now();

  update public.leads
  set status = 'Consulta Agendada',
      assigned_to = assigned_user_id,
      next_action = 'Confirmar asistencia',
      next_followup_at = appointment_due_at,
      last_contact_at = coalesce(last_contact_at, now()),
      updated_at = now()
  where id = lead_record.id;

  insert into public.lead_events (clinic_id, lead_id, event_type, title, description, metadata, created_by)
  values (
    lead_record.clinic_id, lead_record.id,
    case when is_reschedule then 'appointment_rescheduled' else 'appointment_scheduled' end,
    case when is_reschedule then 'Cita reprogramada' else 'Cita agendada' end,
    format('Cita para %s %s con %s', p_appointment_date, p_appointment_time, normalized_doctor),
    jsonb_build_object(
      'appointment_id', appointment_record.id,
      'previous_appointment_id', previous_appointment_id,
      'cancelled_task_ids', to_jsonb(cancelled_task_ids)
    ),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    lead_record.clinic_id, current_user_id,
    case when is_reschedule then 'appointment_rescheduled' else 'appointment_scheduled' end,
    'appointments', appointment_record.id,
    jsonb_build_object('lead_id', lead_record.id, 'previous_appointment_id', previous_appointment_id)
  );

  return appointment_record;
end;
$function$;

revoke all on function public.schedule_lead_appointment(uuid, date, time, text, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.schedule_lead_appointment(uuid, date, time, text, text, text, uuid)
  to authenticated;

create or replace function public.update_appointment_outcome(
  p_appointment_id uuid,
  p_outcome text,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_doctor_assigned text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  appointment_record public.appointments;
  lead_record public.leads;
  normalized_outcome text := nullif(btrim(p_outcome), '');
  appointment_at timestamptz;
  assigned_user_id uuid;
  next_action_value text;
  next_followup_value timestamptz;
  task_title text;
  task_description text;
  task_type text;
  task_priority text := 'media';
  event_type_value text;
  cancelled_task_ids uuid[] := array[]::uuid[];
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if normalized_outcome not in ('Confirmado', 'Asistió', 'No Asistió', 'Cancelado') then
    raise exception using errcode = '22023', message = 'Resultado de cita inválido';
  end if;

  select a.* into appointment_record
  from public.appointments a
  where a.id = p_appointment_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Cita no encontrada';
  end if;
  if not app_private.has_role(appointment_record.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a esta cita';
  end if;
  if appointment_record.status = normalized_outcome then
    return appointment_record;
  end if;

  select l.* into lead_record
  from public.leads l
  where l.id = appointment_record.lead_id
    and l.clinic_id = appointment_record.clinic_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Paciente de la cita no encontrado';
  end if;

  appointment_at := app_private.asuncion_timestamp(appointment_record.appointment_date, appointment_record.appointment_time);
  assigned_user_id := app_private.resolve_clinic_assignee(lead_record.clinic_id, lead_record.assigned_to);

  if normalized_outcome = 'Confirmado' then
    if appointment_record.status not in ('Agendado', 'Consulta Agendada', 'Pendiente', 'Reprogramado') then
      raise exception using errcode = '22023', message = 'La cita ya no puede confirmarse desde su estado actual';
    end if;
    if appointment_at <= now() then
      raise exception using errcode = '22023', message = 'No se puede confirmar una cita cuya hora ya pasó';
    end if;
  elsif normalized_outcome in ('Asistió', 'No Asistió') then
    if appointment_record.status not in ('Agendado', 'Consulta Agendada', 'Pendiente', 'Reprogramado', 'Confirmado') then
      raise exception using errcode = '22023', message = 'No se puede registrar asistencia desde el estado actual';
    end if;
    if appointment_at > now() then
      raise exception using errcode = '22023', message = 'No se puede registrar asistencia antes de la hora de la cita';
    end if;
  elsif normalized_outcome = 'Cancelado'
    and appointment_record.status not in ('Agendado', 'Consulta Agendada', 'Pendiente', 'Reprogramado', 'Confirmado') then
    raise exception using errcode = '22023', message = 'La cita ya no puede cancelarse desde su estado actual';
  end if;

  cancelled_task_ids := app_private.cancel_open_lead_tasks(
    lead_record.clinic_id,
    lead_record.id,
    current_user_id,
    array['confirm', 'attendance', 'no_show_recovery', 'cancelled_recovery']
  );

  case normalized_outcome
    when 'Confirmado' then
      next_action_value := 'Registrar asistencia';
      next_followup_value := appointment_at;
      task_title := 'Registrar asistencia';
      task_description := 'Al finalizar la cita, registrar si el paciente asistió.';
      task_type := 'attendance';
      event_type_value := 'appointment_confirmed';
    when 'Asistió' then
      next_action_value := 'Registrar presupuesto';
      next_followup_value := now();
      task_title := 'Registrar presupuesto';
      task_description := 'Registrar el presupuesto real o definir el siguiente paso comercial.';
      task_type := 'quote_registration';
      event_type_value := 'appointment_attended';
    when 'No Asistió' then
      next_action_value := 'Recuperar paciente que no asistió';
      next_followup_value := now();
      task_title := 'Recuperar paciente que no asistió';
      task_description := 'Contactar para conocer qué ocurrió y ofrecer una nueva fecha.';
      task_type := 'no_show_recovery';
      task_priority := 'alta';
      event_type_value := 'appointment_no_show';
    when 'Cancelado' then
      next_action_value := 'Volver a ofrecer una cita';
      next_followup_value := app_private.tomorrow_at_asuncion(9);
      task_title := 'Recuperar cita cancelada';
      task_description := 'Contactar para ofrecer una nueva fecha.';
      task_type := 'cancelled_recovery';
      task_priority := 'alta';
      event_type_value := 'appointment_cancelled';
  end case;

  update public.appointments
  set status = normalized_outcome,
      confirmed_at = case when normalized_outcome = 'Confirmado' then now() else confirmed_at end,
      attended_at = case when normalized_outcome = 'Asistió' then now() else attended_at end,
      no_show_at = case when normalized_outcome = 'No Asistió' then now() else no_show_at end,
      cancelled_at = case when normalized_outcome = 'Cancelado' then now() else cancelled_at end,
      updated_at = now()
  where id = appointment_record.id
  returning * into appointment_record;

  update public.leads
  set status = normalized_outcome,
      assigned_to = assigned_user_id,
      next_action = next_action_value,
      next_followup_at = next_followup_value,
      updated_at = now()
  where id = lead_record.id;

  insert into public.tasks (
    clinic_id, lead_id, title, description, type, priority,
    status, due_at, assigned_to, created_by
  ) values (
    lead_record.clinic_id, lead_record.id, task_title, task_description,
    task_type, task_priority, 'pendiente', next_followup_value,
    assigned_user_id, current_user_id
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
    assigned_to = excluded.assigned_to,
    completed_at = null,
    updated_at = now();

  insert into public.lead_events (clinic_id, lead_id, event_type, title, description, metadata, created_by)
  values (
    lead_record.clinic_id, lead_record.id, event_type_value,
    'Cita: ' || normalized_outcome,
    format('Resultado de la cita %s: %s', appointment_record.id, normalized_outcome),
    jsonb_build_object('appointment_id', appointment_record.id, 'cancelled_task_ids', to_jsonb(cancelled_task_ids)),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    lead_record.clinic_id, current_user_id, event_type_value, 'appointments', appointment_record.id,
    jsonb_build_object('lead_id', lead_record.id, 'outcome', normalized_outcome)
  );

  return appointment_record;
end;
$function$;

revoke all on function public.update_appointment_outcome(uuid, text, date, time, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_appointment_outcome(uuid, text, date, time, text)
  to authenticated;

create or replace function public.create_treatment_quote(
  p_lead_id uuid,
  p_appointment_id uuid,
  p_treatment text,
  p_amount numeric,
  p_currency text default 'PYG',
  p_professional_name text default null,
  p_next_action_at timestamptz default null,
  p_notes text default null
)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  lead_record public.leads;
  quote_record public.quotes;
  normalized_treatment text := nullif(btrim(p_treatment), '');
  normalized_currency text := upper(coalesce(nullif(btrim(p_currency), ''), 'PYG'));
  followup_at timestamptz := coalesce(p_next_action_at, app_private.tomorrow_at_asuncion(9));
  assigned_user_id uuid;
  cancelled_task_ids uuid[] := array[]::uuid[];
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if normalized_treatment is null then
    raise exception using errcode = '22023', message = 'El tratamiento es obligatorio';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'El monto debe ser mayor que cero';
  end if;
  if normalized_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode = '22023', message = 'La moneda debe usar un código de tres letras';
  end if;
  if followup_at <= now() then
    raise exception using errcode = '22023', message = 'El seguimiento del presupuesto debe ser futuro';
  end if;

  select l.* into lead_record
  from public.leads l
  where l.id = p_lead_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Paciente no encontrado';
  end if;
  if not app_private.has_role(lead_record.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a este paciente';
  end if;
  if not app_private.is_open_opportunity(lead_record.status, lead_record.is_archived) then
    raise exception using errcode = '22023', message = 'No se puede cotizar una oportunidad cerrada';
  end if;
  if p_appointment_id is not null and not exists (
    select 1
    from public.appointments a
    where a.id = p_appointment_id
      and a.lead_id = lead_record.id
      and a.clinic_id = lead_record.clinic_id
  ) then
    raise exception using errcode = '42501', message = 'La cita no pertenece al paciente y clínica indicados';
  end if;

  assigned_user_id := app_private.resolve_clinic_assignee(lead_record.clinic_id, lead_record.assigned_to);

  select q.* into quote_record
  from public.quotes q
  where q.clinic_id = lead_record.clinic_id
    and q.lead_id = lead_record.id
    and q.status = 'pending'
    and q.treatment = normalized_treatment
    and q.amount = p_amount
    and q.currency = normalized_currency
    and q.appointment_id is not distinct from p_appointment_id
    and q.created_by = current_user_id
    and q.created_at >= now() - interval '10 seconds'
  order by q.created_at desc
  limit 1
  for update;

  if found then
    return quote_record;
  end if;

  cancelled_task_ids := app_private.cancel_open_lead_tasks(
    lead_record.clinic_id,
    lead_record.id,
    current_user_id,
    array['quote_registration', 'quote_followup']
  );

  insert into public.quotes (
    clinic_id, lead_id, appointment_id, treatment, amount, currency,
    status, professional_name, next_action_at, notes, created_by, updated_by
  ) values (
    lead_record.clinic_id, lead_record.id, p_appointment_id, normalized_treatment,
    p_amount, normalized_currency, 'pending', nullif(btrim(p_professional_name), ''),
    followup_at, nullif(btrim(p_notes), ''), current_user_id, current_user_id
  ) returning * into quote_record;

  insert into public.tasks (
    clinic_id, lead_id, quote_id, title, description, type, priority,
    status, due_at, assigned_to, created_by
  ) values (
    lead_record.clinic_id, lead_record.id, quote_record.id,
    'Dar seguimiento al presupuesto',
    format('Seguimiento del presupuesto de %s %s.', quote_record.currency, quote_record.amount),
    'quote_followup', 'alta', 'pendiente', followup_at, assigned_user_id, current_user_id
  )
  on conflict (clinic_id, lead_id, type)
    where lead_id is not null and type is not null
      and status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
  do update set
    quote_id = excluded.quote_id,
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    status = 'pendiente',
    due_at = excluded.due_at,
    assigned_to = excluded.assigned_to,
    completed_at = null,
    updated_at = now();

  update public.leads
  set status = 'Presupuesto Enviado',
      assigned_to = assigned_user_id,
      next_action = 'Dar seguimiento al presupuesto',
      next_followup_at = followup_at,
      updated_at = now()
  where id = lead_record.id;

  insert into public.lead_events (clinic_id, lead_id, event_type, title, description, metadata, created_by)
  values (
    lead_record.clinic_id, lead_record.id, 'quote_created', 'Presupuesto registrado',
    format('Presupuesto %s por %s %s', normalized_treatment, normalized_currency, p_amount),
    jsonb_build_object(
      'quote_id', quote_record.id,
      'appointment_id', p_appointment_id,
      'amount', p_amount,
      'currency', normalized_currency,
      'cancelled_task_ids', to_jsonb(cancelled_task_ids)
    ),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    lead_record.clinic_id, current_user_id, 'quote_created', 'quotes', quote_record.id,
    jsonb_build_object('lead_id', lead_record.id, 'amount', p_amount, 'currency', normalized_currency)
  );

  return quote_record;
end;
$function$;

revoke all on function public.create_treatment_quote(uuid, uuid, text, numeric, text, text, timestamptz, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_treatment_quote(uuid, uuid, text, numeric, text, text, timestamptz, text)
  to authenticated;

create or replace function public.update_treatment_quote(
  p_quote_id uuid,
  p_treatment text,
  p_amount numeric,
  p_currency text default 'PYG',
  p_professional_name text default null,
  p_next_action_at timestamptz default null,
  p_notes text default null
)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  quote_record public.quotes;
  lead_record public.leads;
  normalized_treatment text := nullif(btrim(p_treatment), '');
  normalized_currency text := upper(coalesce(nullif(btrim(p_currency), ''), 'PYG'));
  followup_at timestamptz;
  assigned_user_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if normalized_treatment is null or p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'Tratamiento y monto mayor que cero son obligatorios';
  end if;
  if normalized_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode = '22023', message = 'La moneda debe usar un código de tres letras';
  end if;

  select q.* into quote_record
  from public.quotes q
  where q.id = p_quote_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Presupuesto no encontrado';
  end if;
  if quote_record.status <> 'pending' then
    raise exception using errcode = '22023', message = 'Solo se puede editar un presupuesto pendiente';
  end if;
  if not app_private.has_role(quote_record.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a este presupuesto';
  end if;

  select l.* into lead_record
  from public.leads l
  where l.id = quote_record.lead_id
    and l.clinic_id = quote_record.clinic_id
  for update;

  followup_at := coalesce(p_next_action_at, quote_record.next_action_at, app_private.tomorrow_at_asuncion(9));
  if followup_at <= now() then
    raise exception using errcode = '22023', message = 'El seguimiento del presupuesto debe ser futuro';
  end if;
  assigned_user_id := app_private.resolve_clinic_assignee(lead_record.clinic_id, lead_record.assigned_to);

  update public.quotes
  set treatment = normalized_treatment,
      amount = p_amount,
      currency = normalized_currency,
      professional_name = nullif(btrim(p_professional_name), ''),
      next_action_at = followup_at,
      notes = nullif(btrim(p_notes), ''),
      updated_by = current_user_id,
      updated_at = now()
  where id = quote_record.id
  returning * into quote_record;

  insert into public.tasks (
    clinic_id, lead_id, quote_id, title, description, type, priority,
    status, due_at, assigned_to, created_by
  ) values (
    quote_record.clinic_id, quote_record.lead_id, quote_record.id,
    'Dar seguimiento al presupuesto',
    format('Seguimiento del presupuesto de %s %s.', quote_record.currency, quote_record.amount),
    'quote_followup', 'alta', 'pendiente', followup_at, assigned_user_id, current_user_id
  )
  on conflict (clinic_id, lead_id, type)
    where lead_id is not null and type is not null
      and status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
  do update set
    quote_id = excluded.quote_id,
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    due_at = excluded.due_at,
    assigned_to = excluded.assigned_to,
    status = 'pendiente',
    completed_at = null,
    completed_by = null,
    updated_at = now();

  update public.leads
  set assigned_to = assigned_user_id,
      next_action = 'Dar seguimiento al presupuesto',
      next_followup_at = followup_at,
      updated_at = now()
  where id = lead_record.id;

  insert into public.lead_events (clinic_id, lead_id, event_type, title, description, metadata, created_by)
  values (
    quote_record.clinic_id, quote_record.lead_id, 'quote_updated', 'Presupuesto actualizado',
    format('%s %s', quote_record.currency, quote_record.amount),
    jsonb_build_object('quote_id', quote_record.id, 'amount', quote_record.amount, 'currency', quote_record.currency),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    quote_record.clinic_id, current_user_id, 'quote_updated', 'quotes', quote_record.id,
    jsonb_build_object('lead_id', quote_record.lead_id)
  );

  return quote_record;
end;
$function$;

revoke all on function public.update_treatment_quote(uuid, text, numeric, text, text, timestamptz, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_treatment_quote(uuid, text, numeric, text, text, timestamptz, text)
  to authenticated;

create or replace function public.set_treatment_quote_status(
  p_quote_id uuid,
  p_status text,
  p_rejection_reason text default null,
  p_notes text default null
)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  quote_record public.quotes;
  lead_record public.leads;
  remaining_quote public.quotes;
  normalized_status text := lower(coalesce(nullif(btrim(p_status), ''), ''));
  normalized_reason text := nullif(btrim(p_rejection_reason), '');
  assigned_user_id uuid;
  next_title text;
  next_type text;
  next_due_at timestamptz;
  cancelled_task_ids uuid[] := array[]::uuid[];
  preserved_pending_quote_ids uuid[] := array[]::uuid[];
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if normalized_status not in ('accepted', 'rejected') then
    raise exception using errcode = '22023', message = 'El estado debe ser accepted o rejected';
  end if;
  if normalized_status = 'rejected' and normalized_reason is null then
    raise exception using errcode = '22023', message = 'El motivo de rechazo es obligatorio';
  end if;

  select q.* into quote_record
  from public.quotes q
  where q.id = p_quote_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Presupuesto no encontrado';
  end if;
  if not app_private.has_role(quote_record.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a este presupuesto';
  end if;
  if quote_record.status <> 'pending' then
    if quote_record.status = normalized_status then
      return quote_record;
    end if;
    raise exception using errcode = '22023', message = 'El presupuesto ya tiene un resultado final';
  end if;

  select l.* into lead_record
  from public.leads l
  where l.id = quote_record.lead_id
    and l.clinic_id = quote_record.clinic_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Paciente del presupuesto no encontrado';
  end if;
  if not app_private.is_open_opportunity(lead_record.status, lead_record.is_archived) then
    raise exception using errcode = '22023', message = 'No se puede cambiar un presupuesto de una oportunidad cerrada';
  end if;

  assigned_user_id := app_private.resolve_clinic_assignee(lead_record.clinic_id, lead_record.assigned_to);
  -- Resolve only the task linked to this quote. A patient may have independent
  -- pending treatments, so another quote's follow-up must remain active.
  with cancelled as (
    update public.tasks t
    set status = 'cancelado',
        completed_at = now(),
        completed_by = current_user_id,
        updated_at = now()
    where t.clinic_id = quote_record.clinic_id
      and t.lead_id = quote_record.lead_id
      and t.quote_id = quote_record.id
      and lower(coalesce(t.type, '')) = 'quote_followup'
      and lower(t.status) in ('pendiente', 'vencido', 'vencida')
    returning t.id
  )
  select coalesce(array_agg(id), array[]::uuid[])
  into cancelled_task_ids
  from cancelled;

  if normalized_status = 'accepted' then
    select coalesce(array_agg(q.id), array[]::uuid[])
    into preserved_pending_quote_ids
    from public.quotes q
    where q.clinic_id = quote_record.clinic_id
      and q.lead_id = quote_record.lead_id
      and q.id <> quote_record.id
      and q.status = 'pending';

    next_title := 'Iniciar tratamiento';
    next_type := 'treatment_start';
    next_due_at := app_private.tomorrow_at_asuncion(9);
  else
    select q.* into remaining_quote
    from public.quotes q
    where q.clinic_id = quote_record.clinic_id
      and q.lead_id = quote_record.lead_id
      and q.id <> quote_record.id
      and q.status = 'pending'
    order by q.next_action_at asc nulls last, q.issued_at desc
    limit 1
    for update;

    if found then
      next_title := 'Dar seguimiento al presupuesto';
      next_type := 'quote_followup';
      next_due_at := coalesce(remaining_quote.next_action_at, app_private.tomorrow_at_asuncion(9));
    else
      next_title := 'Definir próximo paso tras rechazo';
      next_type := 'decision_followup';
      next_due_at := app_private.tomorrow_at_asuncion(9);
    end if;
  end if;

  update public.quotes
  set status = normalized_status,
      accepted_at = case when normalized_status = 'accepted' then now() else null end,
      rejected_at = case when normalized_status = 'rejected' then now() else null end,
      rejection_reason = case when normalized_status = 'rejected' then normalized_reason else null end,
      next_action_at = null,
      notes = coalesce(nullif(btrim(p_notes), ''), notes),
      updated_by = current_user_id,
      updated_at = now()
  where id = quote_record.id
  returning * into quote_record;

  insert into public.tasks (
    clinic_id, lead_id, quote_id, title, description, type, priority,
    status, due_at, assigned_to, created_by
  ) values (
    quote_record.clinic_id, quote_record.lead_id, coalesce(remaining_quote.id, quote_record.id),
    next_title, next_title, next_type, 'alta', 'pendiente', next_due_at,
    assigned_user_id, current_user_id
  )
  on conflict (clinic_id, lead_id, type)
    where lead_id is not null and type is not null
      and status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
  do update set
    quote_id = excluded.quote_id,
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    status = 'pendiente',
    due_at = excluded.due_at,
    assigned_to = excluded.assigned_to,
    completed_at = null,
    updated_at = now();

  update public.leads
  set assigned_to = assigned_user_id,
      status = 'Presupuesto Enviado',
      next_action = next_title,
      next_followup_at = next_due_at,
      updated_at = now()
  where id = lead_record.id
    and app_private.is_open_opportunity(status, is_archived);

  insert into public.lead_events (clinic_id, lead_id, event_type, title, description, metadata, created_by)
  values (
    quote_record.clinic_id, quote_record.lead_id,
    case when normalized_status = 'accepted' then 'quote_accepted' else 'quote_rejected' end,
    case when normalized_status = 'accepted' then 'Presupuesto aceptado' else 'Presupuesto rechazado' end,
    case when normalized_status = 'accepted' then 'El paciente aceptó el presupuesto. No implica cobro.' else normalized_reason end,
    jsonb_build_object(
      'quote_id', quote_record.id,
      'amount', quote_record.amount,
      'currency', quote_record.currency,
      'rejection_reason', normalized_reason,
      'cancelled_task_ids', to_jsonb(cancelled_task_ids),
      'preserved_pending_quote_ids', to_jsonb(preserved_pending_quote_ids),
      'remaining_quote_id', remaining_quote.id
    ),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    quote_record.clinic_id, current_user_id,
    case when normalized_status = 'accepted' then 'quote_accepted' else 'quote_rejected' end,
    'quotes', quote_record.id,
    jsonb_build_object(
      'lead_id', quote_record.lead_id,
      'status', normalized_status,
      'preserved_pending_quote_ids', to_jsonb(preserved_pending_quote_ids),
      'remaining_quote_id', remaining_quote.id
    )
  );

  return quote_record;
end;
$function$;

revoke all on function public.set_treatment_quote_status(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_treatment_quote_status(uuid, text, text, text)
  to authenticated;

-- One publication is shared by the workspace. Clients subscribe once and filter
-- by clinic_id; the block is safe when Realtime is not enabled locally.
do $do$
declare
  relation_name text;
begin
  if exists (
    select 1 from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
      and puballtables is false
  ) then
    foreach relation_name in array array['leads', 'appointments', 'tasks', 'quotes']
    loop
      if not exists (
        select 1
        from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = relation_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', relation_name);
      end if;
    end loop;
  end if;
end;
$do$;

notify pgrst, 'reload schema';
