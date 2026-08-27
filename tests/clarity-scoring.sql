do $$
declare
  clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  high_score jsonb;
  medium_score jsonb;
  low_score jsonb;
  changed_score jsonb;
begin
  high_score := app_private.calculate_lead_score(clinic_id, 'Implantes', 'Urgente hoy', 'Quiere agendar una cita', 'Tiene radiografía', 'Nuevo', 0);
  medium_score := app_private.calculate_lead_score(clinic_id, 'Ortodoncia', 'Esta semana', null, 'Sí, tuvo evaluación', 'Nuevo', 0);
  low_score := app_private.calculate_lead_score(clinic_id, null, 'Solo consultando', 'Solo consultando', null, 'Nuevo', 0);
  changed_score := app_private.calculate_lead_score(clinic_id, 'Ortodoncia', 'Esta semana', null, 'Sí, tuvo evaluación', 'Respondió', 0);

  if (high_score ->> 'classification') <> 'Lead Caliente' or (high_score ->> 'score')::integer < 80 then
    raise exception 'El caso alto no es caliente: %', high_score;
  end if;
  if (medium_score ->> 'classification') <> 'Lead Medio' or (medium_score ->> 'score')::integer not between 50 and 79 then
    raise exception 'El caso medio no es medio: %', medium_score;
  end if;
  if (low_score ->> 'classification') <> 'Lead Frío' or (low_score ->> 'score')::integer >= 50 then
    raise exception 'El caso bajo no es frío: %', low_score;
  end if;
  if (changed_score ->> 'score')::integer <= (medium_score ->> 'score')::integer then
    raise exception 'El score no se recalculó al cambiar el comportamiento';
  end if;
  if jsonb_array_length(high_score -> 'reasons') = 0 then
    raise exception 'El score alto no tiene explicación';
  end if;
end;
$$;
