-- RLS/RPC usando los UUID Auth QA permanentes del proyecto nuevo.
-- Todo cambio operativo se revierte al final; los profiles existentes no se modifican.

begin;

select set_config('request.jwt.claim.sub', 'd5a7314e-f4ee-4850-bd04-3fa0c3d961b5', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.clinics) <> 1 then
    raise exception 'DentalPro owner no ve exactamente una clinica';
  end if;
  if exists (select 1 from public.leads where clinic_id <> '00000000-0000-0000-0000-000000000101') then
    raise exception 'DentalPro owner ve datos cross-clinic';
  end if;
  if (select count(*) from public.clinic_public_forms) <> 1 then
    raise exception 'DentalPro owner no ve exactamente su public form';
  end if;

  update public.leads
  set is_archived = true,
      archived_at = now(),
      archived_by = auth.uid(),
      archived_reason = 'RLS real-user test',
      status = 'Archivado'
  where id = '00000000-0000-0000-0000-000000000203';

  if not exists (
    select 1 from public.leads
    where id = '00000000-0000-0000-0000-000000000203' and is_archived
  ) then
    raise exception 'DentalPro owner no pudo archivar';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '326288c0-f3db-463b-997f-1538d41d71c0', true);
set local role authenticated;

do $$
declare
  archive_blocked boolean := false;
  direct_appointment_blocked boolean := false;
  scheduled public.appointments;
  completed public.tasks;
begin
  if exists (select 1 from public.leads where clinic_id <> '00000000-0000-0000-0000-000000000101') then
    raise exception 'DentalPro receptionist ve datos cross-clinic';
  end if;
  if exists (select 1 from public.clinic_public_forms) then
    raise exception 'DentalPro receptionist ve public forms';
  end if;
  if exists (select 1 from public.audit_logs) then
    raise exception 'DentalPro receptionist ve audit logs';
  end if;

  begin
    update public.leads
    set is_archived = true,
        archived_at = now(),
        archived_by = auth.uid(),
        archived_reason = 'Must fail'
    where id = '00000000-0000-0000-0000-000000000202';
  exception when sqlstate '42501' then
    archive_blocked := true;
  end;

  if not archive_blocked then
    raise exception 'Receptionist pudo archivar';
  end if;

  begin
    insert into public.appointments (
      clinic_id, lead_id, appointment_date, appointment_time, doctor_assigned, status
    ) values (
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000202',
      (now() at time zone 'America/Asuncion')::date + 4,
      time '16:00', 'Dra. Direct Real User QA', 'Agendado'
    );
  exception when sqlstate '42501' then
    direct_appointment_blocked := true;
  end;

  if not direct_appointment_blocked then
    raise exception 'Receptionist pudo insertar appointment directo';
  end if;

  select * into scheduled
  from public.schedule_lead_appointment(
    '00000000-0000-0000-0000-000000000202',
    (now() at time zone 'America/Asuncion')::date + 4,
    time '16:00',
    'Dra. RPC Real User QA',
    'Ortodoncia',
    'Real-user RLS test',
    null
  );

  if scheduled.id is null then
    raise exception 'Receptionist no pudo agendar por RPC';
  end if;

  select * into completed
  from public.complete_task((
    select id
    from public.tasks
    where lead_id = scheduled.lead_id and type = 'confirm' and status = 'pendiente'
    limit 1
  ));

  if completed.status <> 'hecho' or completed.completed_at is null then
    raise exception 'Receptionist no pudo completar task por RPC';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '22d78b7a-38d1-4fc8-a0d8-945f44f4ca80', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.clinics) <> 1 then
    raise exception 'QA Clinic B owner no ve exactamente una clinica';
  end if;
  if exists (select 1 from public.leads where clinic_id <> '00000000-0000-0000-0000-000000000102') then
    raise exception 'QA Clinic B owner ve DentalPro';
  end if;
end
$$;

reset role;
rollback;

select 'PASS' as result, 'rls_real_auth_users' as test;
