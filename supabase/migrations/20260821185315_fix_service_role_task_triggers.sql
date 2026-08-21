-- PostgreSQL does not guarantee short-circuit evaluation inside boolean
-- expressions. Keep the trusted-role bypass in its own branch so service_role
-- never needs USAGE on the private helper schema.

create or replace function app_private.enforce_tasks_insert_permissions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if app_private.has_role(new.clinic_id, array['admin', 'owner']) then
    return new;
  end if;

  raise exception using errcode = '42501', message = 'Use the secure task RPC';
end;
$$;

create or replace function app_private.enforce_tasks_update_permissions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if app_private.has_role(new.clinic_id, array['admin', 'owner']) then
    return new;
  end if;

  raise exception using errcode = '42501', message = 'Use complete_task to update tasks';
end;
$$;

revoke all on function app_private.enforce_tasks_insert_permissions()
  from public, anon, authenticated, service_role;
revoke all on function app_private.enforce_tasks_update_permissions()
  from public, anon, authenticated, service_role;
