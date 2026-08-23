-- Commercial retention insights: structured loss reasons and complete per-stage templates.
-- Reports and operational priority remain derived so they cannot become stale.

alter table public.leads
  add column if not exists lost_reason text,
  add column if not exists lost_reason_note text,
  add column if not exists lost_at timestamptz,
  add column if not exists lost_by uuid references auth.users(id) on delete set null;

update public.leads
set lost_reason = coalesce(lost_reason, 'Otro'),
    lost_reason_note = coalesce(lost_reason_note, archived_reason, 'Registro anterior a la clasificación de motivos'),
    lost_at = coalesce(lost_at, archived_at, updated_at, now()),
    lost_by = coalesce(lost_by, archived_by)
where status in ('Perdido', 'Archivado') or is_archived = true;

alter table public.leads drop constraint if exists leads_lost_reason_check;
alter table public.leads
  add constraint leads_lost_reason_check check (
    lost_reason is null or lost_reason in (
      'No responde',
      'Precio',
      'Eligió otra clínica',
      'Fuera de zona',
      'No era el tratamiento adecuado',
      'No tenía disponibilidad',
      'Sólo estaba consultando',
      'Duplicado',
      'Número inválido',
      'Reprogramó muchas veces',
      'Otro'
    )
  );

create index if not exists leads_clinic_lost_reason_idx
  on public.leads (clinic_id, lost_reason, lost_at desc)
  where lost_reason is not null;

create or replace function app_private.enforce_lead_loss_reason()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.is_archived = true
     and auth.uid() is not null
     and not app_private.has_role(new.clinic_id, array['admin', 'owner']) then
    raise exception using errcode = '42501', message = 'Solo owner/admin puede archivar oportunidades';
  end if;

  if (new.status in ('Perdido', 'Archivado') or new.is_archived = true)
     and auth.uid() is not null
     and not app_private.has_role(new.clinic_id, array['admin', 'owner', 'receptionist']) then
    raise exception using errcode = '42501', message = 'No tenés acceso a este lead';
  end if;

  if (new.status in ('Perdido', 'Archivado') or new.is_archived = true)
     and (new.lost_reason is null or btrim(new.lost_reason) = '') then
    raise exception using errcode = '23514', message = 'Seleccioná un motivo de pérdida antes de cerrar la oportunidad';
  end if;

  if new.lost_reason = 'Otro' and (new.lost_reason_note is null or btrim(new.lost_reason_note) = '') then
    raise exception using errcode = '23514', message = 'Escribí una nota cuando el motivo es Otro';
  end if;

  return new;
end;
$function$;

revoke all on function app_private.enforce_lead_loss_reason() from public, anon, authenticated;

drop trigger if exists enforce_lead_loss_reason_before_write on public.leads;
create trigger enforce_lead_loss_reason_before_write
before insert or update of status, is_archived, lost_reason, lost_reason_note on public.leads
for each row execute function app_private.enforce_lead_loss_reason();

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
    raise exception using errcode = 'P0002', message = 'Lead no encontrado';
  end if;

  select p.role into actor_role
  from public.profiles p
  where p.id = current_user_id
    and p.clinic_id = lead_record.clinic_id
    and p.active = true;

  if actor_role is null or actor_role not in ('admin', 'owner', 'receptionist') then
    raise exception using errcode = '42501', message = 'No tenés acceso a este lead';
  end if;

  if p_archive and actor_role not in ('admin', 'owner') then
    raise exception using errcode = '42501', message = 'Solo owner/admin puede archivar oportunidades';
  end if;

  previous_status := lead_record.status;

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
      archived_reason = case when p_archive then concat_ws(': ', normalized_reason, normalized_note) else archived_reason end
  where id = lead_record.id
  returning * into lead_record;

  update public.tasks t
  set status = 'cancelado',
      completed_at = now(),
      completed_by = current_user_id
  where t.clinic_id = lead_record.clinic_id
    and t.lead_id = lead_record.id
    and t.status in ('pendiente', 'vencido', 'Pendiente', 'Vencida')
    and t.type in ('contact', 'contact_lead', 'initial_contact', 'follow_up_contact', 'manual_contact', 'followup');

  insert into public.lead_events (
    clinic_id, lead_id, event_type, title, description, metadata, created_by
  ) values (
    lead_record.clinic_id,
    lead_record.id,
    'lead_lost_reason_set',
    case when p_archive then 'Oportunidad archivada' else 'Oportunidad marcada como perdida' end,
    concat_ws(': ', normalized_reason, normalized_note),
    jsonb_build_object(
      'reason', normalized_reason,
      'note', normalized_note,
      'previous_status', previous_status,
      'new_status', lead_record.status,
      'archived', p_archive
    ),
    current_user_id
  );

  insert into public.audit_logs (clinic_id, actor_id, action, table_name, row_id, metadata)
  values (
    lead_record.clinic_id,
    current_user_id,
    'lead_lost_reason_set',
    'leads',
    lead_record.id,
    jsonb_build_object('reason', normalized_reason, 'archived', p_archive)
  );

  return lead_record;
end;
$function$;

revoke all on function public.mark_lead_lost(uuid, text, text, boolean) from public, anon;
grant execute on function public.mark_lead_lost(uuid, text, text, boolean) to authenticated;

create or replace function public.record_message_copied(
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

  select l.* into lead_record from public.leads l where l.id = p_lead_id;
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
    'message_copied',
    'Mensaje copiado',
    'Se copió una plantilla para contacto manual. No implica que el mensaje haya sido enviado.',
    jsonb_build_object('channel', 'manual', 'template_key', normalized_template_key),
    current_user_id
  );
end;
$function$;

revoke all on function public.record_message_copied(uuid, text) from public, anon;
grant execute on function public.record_message_copied(uuid, text) to authenticated;

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
    'price_inquiry',
    'Consulta por precio',
    'Quiere precio',
    E'Hola {{nombre}}, soy de {{clinica}}.\n\nVimos tu consulta sobre {{tratamiento}}. Para orientarte correctamente, primero necesitamos entender tu caso y revisar qué opción te conviene.\n\n¿Te queda mejor coordinar una evaluación hoy o mañana?'
  ),
  (
    'post_consultation',
    'Post consulta',
    'Seguimiento posterior',
    E'Hola {{nombre}}, soy de {{clinica}}.\n\nQuería saber si te quedó alguna duda después de tu consulta sobre {{tratamiento}}. Podemos ayudarte a definir el próximo paso con claridad.\n\n¿Preferís que lo revisemos hoy o mañana?'
  ),
  (
    'cold_reactivation',
    'Reactivación de lead frío',
    'Reactivar 30d',
    E'Hola {{nombre}}, soy de {{clinica}}.\n\nHace un tiempo consultaste por {{tratamiento}} y quería confirmar si todavía te interesa revisarlo.\n\nSi te sirve, podemos retomar tu caso y buscar un horario esta semana.'
  ),
  (
    'attendance_confirmation',
    'Confirmación de asistencia',
    'Cita próxima',
    E'Hola {{nombre}}, soy de {{clinica}}.\n\nQueremos confirmar tu cita por {{tratamiento}} para el {{fecha_cita}} ({{hora_cita}}).\n\n¿Podés confirmarnos tu asistencia?'
  )
) as defaults(template_key, name, situation, message)
on conflict (clinic_id, template_key) do nothing;

notify pgrst, 'reload schema';
