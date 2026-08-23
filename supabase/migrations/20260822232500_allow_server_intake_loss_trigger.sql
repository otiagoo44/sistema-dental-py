-- The validation trigger calls the private role helper. It must run as its owner
-- so server-side service_role intake can insert ordinary (non-lost) leads while
-- the trigger function itself remains non-executable by API roles.

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

revoke all on function app_private.enforce_lead_loss_reason() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
