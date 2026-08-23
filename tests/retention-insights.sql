-- Retention insight integrity, permissions and multi-clinic isolation.
-- Uses QA identities/data and rolls every mutation back.

begin;

insert into auth.users (id, email, role, aud)
values
  ('10000000-0000-0000-0000-000000000002', 'retention-reception-dentalpro@example.test', 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000003', 'retention-owner-qab@example.test', 'authenticated', 'authenticated');

insert into public.profiles (id, clinic_id, full_name, email, role, active)
values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000101', 'Retention Reception DentalPro', 'retention-reception-dentalpro@example.test', 'receptionist', true),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000102', 'Retention Owner QA B', 'retention-owner-qab@example.test', 'owner', true);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  result_lead public.leads;
  invalid_blocked boolean := false;
  other_note_blocked boolean := false;
  archive_blocked boolean := false;
  direct_bypass_blocked boolean := false;
begin
  if (
    select count(*) from public.message_templates
    where template_key = any(array[
      'first_contact','urgency','price_inquiry','no_response','appointment_reminder',
      'no_show','post_consultation','cold_reactivation','attendance_confirmation'
    ])
  ) <> 9 then
    raise exception 'Receptionist no ve las 9 plantillas comerciales de DentalPro';
  end if;

  begin
    perform public.mark_lead_lost(
      '00000000-0000-0000-0000-000000000202',
      'Motivo inventado',
      null,
      false
    );
  exception when sqlstate '22023' then
    invalid_blocked := true;
  end;
  if not invalid_blocked then raise exception 'RPC acepto motivo invalido'; end if;

  begin
    perform public.mark_lead_lost(
      '00000000-0000-0000-0000-000000000202',
      'Otro',
      null,
      false
    );
  exception when sqlstate '22023' then
    other_note_blocked := true;
  end;
  if not other_note_blocked then raise exception 'RPC acepto Otro sin nota'; end if;

  begin
    update public.leads
    set status = 'Perdido'
    where id = '00000000-0000-0000-0000-000000000202';
  exception when sqlstate '23514' then
    direct_bypass_blocked := true;
  end;
  if not direct_bypass_blocked then raise exception 'Se pudo perder un lead sin motivo estructurado'; end if;

  select * into result_lead
  from public.mark_lead_lost(
    '00000000-0000-0000-0000-000000000202',
    'No responde',
    'QA rollback',
    false
  );

  if result_lead.status <> 'Perdido'
     or result_lead.lost_reason <> 'No responde'
     or result_lead.lost_at is null
     or result_lead.lost_by <> auth.uid() then
    raise exception 'mark_lead_lost no guardo el cierre completo';
  end if;

  if not exists (
    select 1 from public.lead_events
    where lead_id = result_lead.id and event_type = 'lead_lost_reason_set'
  ) then
    raise exception 'mark_lead_lost no creo evento';
  end if;

  begin
    perform public.mark_lead_lost(
      '00000000-0000-0000-0000-000000000202',
      'No responde',
      'QA archive denied',
      true
    );
  exception when sqlstate '42501' then
    archive_blocked := true;
  end;
  if not archive_blocked then raise exception 'Receptionist pudo archivar por RPC'; end if;

  perform public.record_message_copied(
    '00000000-0000-0000-0000-000000000202',
    'first_contact'
  );
  if not exists (
    select 1 from public.lead_events
    where lead_id = '00000000-0000-0000-0000-000000000202'
      and event_type = 'message_copied'
  ) then
    raise exception 'record_message_copied no creo evento';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  cross_clinic_blocked boolean := false;
begin
  if (
       select count(*) from public.message_templates
       where template_key = any(array[
         'first_contact','urgency','price_inquiry','no_response','appointment_reminder',
         'no_show','post_consultation','cold_reactivation','attendance_confirmation'
       ])
     ) <> 9
     or exists (
       select 1 from public.message_templates
       where clinic_id <> '00000000-0000-0000-0000-000000000102'
     ) then
    raise exception 'Templates no estan aislados para QA Clinic B';
  end if;

  begin
    perform public.mark_lead_lost(
      '00000000-0000-0000-0000-000000000201',
      'No responde',
      'Debe fallar cross-clinic',
      false
    );
  exception when sqlstate '42501' then
    cross_clinic_blocked := true;
  end;
  if not cross_clinic_blocked then raise exception 'QA Clinic B modifico DentalPro'; end if;
end
$$;

reset role;
rollback;

select 'PASS' as result, 'retention_insights_loss_templates_multiclinic' as test;
