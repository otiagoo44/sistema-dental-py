# lead-intake Edge Function

Backend real del formulario publico. Recibe leads de landing/iframe, valida `clinic_slug` + `landing_token`, resuelve `clinic_id` desde `clinic_public_forms`, guarda o actualiza el lead y deja jobs asincronicos para n8n.

Endpoint:

```text
https://unybqqzhgqxhrwucrofm.supabase.co/functions/v1/lead-intake
```

## Secrets

```powershell
npx.cmd supabase secrets set FORM_HASH_SALT=REEMPLAZAR_SALT_LARGO --project-ref unybqqzhgqxhrwucrofm
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son variables reservadas/inyectadas por Supabase Edge Runtime en este proyecto. No usar secrets en frontend, landing, Vercel public env vars ni snippets.

## Deploy

```powershell
npx.cmd supabase functions deploy lead-intake --no-verify-jwt --project-ref unybqqzhgqxhrwucrofm
```

`verify_jwt=false` es intencional: el endpoint recibe formularios publicos sin sesion Supabase. La compensacion obligatoria es validar `clinic_slug` + `landing_token`, resolver `clinic_id` solo desde `clinic_public_forms`, aplicar `allowed_origins`, honeypot, validacion de inputs y rate limit por IP/telefono. Nunca confiar en `clinic_id` enviado por el navegador.

La funcion no refleja origins arbitrarios: antes de responder un preflight consulta formularios activos y solo devuelve `Access-Control-Allow-Origin` cuando el origin esta registrado. `OPTIONS`, errores funcionales y respuestas exitosas mantienen CORS para origins permitidos; origins desconocidos o requests sin `Origin` reciben `403` sin ese header.

## Payload Publico

```json
{
  "clinic_slug": "dentalpro",
  "landing_token": "lf_xxxxx",
  "nombre": "Laura",
  "telefono": "+595981000000",
  "tratamiento": "Implante dental",
  "urgencia": "Hoy",
  "evaluacion_previa": "No",
  "situacion": "Quiero agendar una consulta",
  "consultation_reason": "Le falta una pieza",
  "origen": "Landing odontologia",
  "pagina": "implantes",
  "consentimiento_contacto": true
}
```

Se ignora cualquier `clinic_id` del body.

## Respuestas

- `200`: lead guardado o actualizado.
- `400`: JSON invalido, payload gigante, telefono invalido, consentimiento ausente o datos incompletos.
- `403`: token/origin/formulario no autorizado o honeypot.
- `405`: metodo no permitido.
- `429`: rate limit.
- `500`: error interno generico sin stack trace ni SQL.

## Tests

Configurar un token real:

```powershell
$env:TOKEN = "lf_TOKEN_REAL"
$env:SLUG = "dentalpro"
.\tests\lead-intake-test.ps1
.\tests\load-30-leads.ps1
```

Verificar resultados con `tests/sql-verification.sql`.

Los POST sin `Origin` se bloquean siempre. No existe una excepcion de runtime para saltear esta validacion en el deploy publico.
