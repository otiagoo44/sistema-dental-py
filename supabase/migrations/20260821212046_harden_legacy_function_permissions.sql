-- Address Supabase security advisor warnings on legacy helpers.
-- Trigger/event-trigger execution does not require Data API clients to call them.

alter function public.set_updated_at() set search_path = '';
alter function public.update_updated_at_column() set search_path = '';

-- Some legacy hosted projects created this event-trigger helper outside the
-- checked-in migration history. Harden it where it exists without making a
-- clean replay depend on an unversioned database object.
do $do$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end;
$do$;
