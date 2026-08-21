# n8n Asincronico

n8n no es backend del formulario publico y no guarda leads directamente desde la landing.

Flujo correcto:

```text
Landing -> Edge Function -> Supabase -> automation_jobs -> n8n
```

## Tabla De Entrada

n8n procesa `public.automation_jobs`:

- `lead_created`
- `lead_hot_alert`
- `daily_summary`
- `no_contact_alert`
- `no_show_recovery`
- `weekly_report`

## Reglas

- Leer solo jobs `status = 'pending'` y `next_retry_at is null or next_retry_at <= now()`.
- Marcar `processing` antes de ejecutar.
- Si sale bien, marcar `completed`.
- Si falla, incrementar `attempts`, guardar `last_error` y calcular `next_retry_at`.
- Cortar retries despues de un maximo definido.
- No exponer service role en frontend.
- No bloquear la creacion del lead por errores de WhatsApp/email.

## Errores Visibles

Los errores deben quedar en `automation_jobs.last_error`. Admin/owner puede revisar jobs fallidos desde SQL o una vista futura del CRM.

El workflow incluido en este repositorio es solo una referencia de configuracion y no contiene nodos operativos. Hasta implementar, probar y habilitar un workflow real, ninguna automatizacion n8n debe presentarse como activa. Los jobs pendientes no afectan el guardado ni la visibilidad del lead.
