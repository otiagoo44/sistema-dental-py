# Sistema Anti-Perdida de Pacientes de Alto Ticket

CRM odontologico multi-clinica para capturar, priorizar y dar seguimiento a consultas de implantes, ortodoncia, urgencias, estetica y tratamientos de alto valor.

## Arquitectura

```text
Landing / iframe publico
  -> Supabase Edge Function lead-intake
  -> Supabase Postgres con RLS
  -> CRM React/Vite en Vercel
  -> n8n asincronico desde automation_jobs
```

Landing real actual: `https://sistema-dental-py.vercel.app` (sin slash final).

Regla central: Supabase guarda primero el lead. n8n automatiza despues. Si n8n, email, WhatsApp o cualquier alerta falla, el lead ya queda en Supabase y visible en el CRM.

## Carpetas

- `crm-app/`: CRM React/Vite.
- `js/lead-intake-form.js`: formulario publico de la landing.
- `supabase/migrations/`: migraciones no destructivas.
- `supabase/functions/lead-intake/`: Edge Function de intake.
- `tests/`: pruebas PowerShell y SQL de verificacion.
- `docs/`: onboarding, recepcion, produccion y n8n asincronico.

## Desarrollo Local

```powershell
cd crm-app
npm install
npm run dev
npm run build
```

Variables locales del CRM:

```text
VITE_SUPABASE_URL=https://unybqqzhgqxhrwucrofm.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
VITE_PUBLIC_LEAD_WEBHOOK_URL=https://unybqqzhgqxhrwucrofm.supabase.co/functions/v1/lead-intake
```

No poner `SUPABASE_SERVICE_ROLE_KEY`, `FORM_HASH_SALT` ni secretos en frontend.

## Deploy

1. Confirmar que el repo esta linkeado a `unybqqzhgqxhrwucrofm` y aplicar migraciones.
2. Configurar secrets de Edge Function.
3. Deployar `lead-intake`.
4. Configurar Vercel con root `crm-app`.
5. Configurar Auth URLs del CRM en Supabase cuando exista dominio CRM.
6. Configurar `allowed_origins` del formulario publico con `https://sistema-dental-py.vercel.app` y `http://localhost:5173`.
7. Probar consentimiento, token correcto/falso, telefono invalido, duplicado, origins y rate limit.

El formulario es exclusivamente comercial: solicita consentimiento para contacto y advierte que no se comparta informacion medica sensible. No reemplaza una consulta odontologica ni es una historia clinica.

## Checklist Antes De Vender

- RLS activo en tablas multi-clinica.
- Edge Function deployada y con secrets.
- Landing apunta a Edge Function, no a n8n.
- CRM publicado en Vercel sin sourcemaps.
- Usuarios `admin/owner` y `receptionist` creados.
- Recepcionista no archiva ni edita configuracion.
- Lead aparece en Supabase y CRM.
- `automation_jobs` queda poblada para n8n.

Ver detalle en `docs/checklist-produccion.md`.

## Tests

```powershell
$env:TOKEN = "lf_TOKEN_REAL"
$env:SLUG = "dentalpro"
$env:LANDING_ORIGIN = "https://sistema-dental-py.vercel.app"
.\tests\lead-intake-test.ps1
.\tests\load-30-leads.ps1
```

`tests/sql-verification.sql` se ejecuta en Supabase SQL Editor para confirmar RLS, policies, duplicados, tareas, eventos, jobs y logs.

`tests/rls-rpc-transactional.sql` prueba aislamiento multi-clinica, permisos por rol, RPCs, doble reserva, no-show y task completed dentro de una transaccion que termina en `ROLLBACK`.

`tests/rls-real-users.sql` repite el aislamiento y los permisos usando los UUID Auth QA permanentes, tambien con `ROLLBACK`.

Documentacion operativa:

- `docs/privacidad-y-seguridad-operativa.md`
- `docs/qa-rls-multiclinica.md`
- `docs/qa-manual-release.md`
- `docs/vercel-staging.md`
