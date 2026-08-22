-- Address Supabase security advisor warnings on legacy helpers.
-- Trigger/event-trigger execution does not require Data API clients to call them.

alter function public.set_updated_at() set search_path = '';
alter function public.update_updated_at_column() set search_path = '';

revoke all on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;
