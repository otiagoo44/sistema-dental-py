# n8n Asincronico - Leads Multi-Clinica

n8n no recibe el formulario publico y no decide donde guardar leads.

Flujo de produccion:

```text
Landing / iframe
  -> Supabase Edge Function lead-intake
  -> Supabase Postgres
  -> public.automation_jobs
  -> n8n worker asincronico
```

Si n8n, email, WhatsApp o cualquier API externa falla, el lead ya debe estar guardado en Supabase y visible en el CRM.

## Responsabilidad De n8n

n8n procesa jobs no criticos:

- `lead_created`: bienvenida, enriquecimiento liviano o notificacion normal.
- `lead_hot_alert`: alerta inmediata a recepcion/admin.
- `daily_summary`: reporte diario por clinica.
- `no_contact_alert`: aviso si un lead caliente no tuvo contacto.
- `no_show_recovery`: seguimiento despues de una inasistencia.

## Credenciales

Usar credenciales server-side en n8n. Nunca exponerlas en landing, Vercel ni snippets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- proveedor WhatsApp/email si aplica

## Worker Basico

1. Leer jobs pendientes:

```sql
select *
from public.automation_jobs
where status = 'pending'
  and (next_retry_at is null or next_retry_at <= now())
order by created_at asc
limit 20;
```

2. Marcar job como `processing` antes de ejecutar:

```sql
update public.automation_jobs
set status = 'processing',
    attempts = attempts + 1,
    updated_at = now()
where id = :job_id
  and status = 'pending';
```

3. Ejecutar accion externa segun `workflow_name`.

4. Si sale bien:

```sql
update public.automation_jobs
set status = 'completed',
    last_error = null,
    updated_at = now()
where id = :job_id;
```

5. Si falla:

```sql
update public.automation_jobs
set status = case when attempts >= 5 then 'failed' else 'pending' end,
    last_error = :error_message,
    next_retry_at = now() + interval '15 minutes',
    updated_at = now()
where id = :job_id;
```

## Payload Esperado

La Edge Function crea jobs con un payload minimo:

```json
{
  "lead_id": "uuid",
  "clinic_id": "uuid",
  "classification": "Lead Caliente",
  "score": 120
}
```

n8n debe volver a consultar Supabase por datos actuales del lead y la clinica antes de enviar mensajes. No confiar en datos viejos del payload para decisiones criticas.

## Reglas De Seguridad

- No escribir leads desde n8n como intake publico.
- No hard delete.
- No guardar IP ni telefono crudos en logs de rate limit.
- No bloquear la respuesta del formulario por errores externos.
- Registrar fallos en `automation_jobs.last_error`.
- Mantener retries controlados para evitar loops.
