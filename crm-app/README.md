# CRM Dental

Aplicacion React/Vite para operar el CRM dental multi-clinica conectado a Supabase Auth y tablas protegidas con RLS por `clinic_id`.

## Desarrollo

```bash
npm install
npm run dev
npm run build
```

## Variables

Crear las variables en local y en Vercel:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_PUBLIC_LEAD_WEBHOOK_URL=https://TU-N8N.up.railway.app/webhook/dental-lead-universal
```

Usar solo la anon key en frontend. `VITE_PUBLIC_LEAD_WEBHOOK_URL` es una URL publica de webhook. La service role key no debe estar en esta app ni en variables expuestas al navegador.

## Login Y Roles

1. Crear un usuario en Supabase Auth.
2. Crear su registro en `public.profiles` con el mismo `id`, un `clinic_id` valido y `role = 'admin'` o `role = 'receptionist'`.
3. Iniciar sesion con email y password.

La app carga `profiles` por `auth.users.id`, obtiene `clinic_id` desde el perfil y filtra todas las consultas por esa clinica. Si `role` falta o no es `admin`, el CRM lo trata como `receptionist`.

## Deploy En Vercel

Configuracion del proyecto:

- Framework Preset: `Vite`
- Root Directory: `crm-app`
- Build Command: `npm run build`
- Output Directory: `dist`

Variables de entorno en Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PUBLIC_LEAD_WEBHOOK_URL`

El archivo `vercel.json` incluye rewrite SPA hacia `index.html`.

## Supabase Auth

En Supabase Auth configurar:

- Site URL: `https://TU-CRM.vercel.app`
- Redirect URLs:
  - `http://localhost:5173/**`
  - `https://TU-CRM.vercel.app/**`

## Multi-Clinica

Proceso operativo:

1. Crear clinic en `public.clinics`.
2. Crear auth user en Supabase Auth.
3. Crear profile con `clinic_id` y `role`.
4. Crear `clinic_public_forms` con `clinic_slug`, `public_token`, `allowed_origins` e `is_active`.
5. Configurar landing con `CLINIC_SLUG`, `LANDING_TOKEN` y `WEBHOOK_URL` universal de n8n.
6. Enviar un lead de prueba.
7. Login CRM admin y verificar que el lead aparece.
8. Login recepcionista y verificar permisos.
9. Probar otra clinica y confirmar aislamiento por RLS.

Para n8n/landing, mapear motivo de consulta con este fallback:

```js
body.consultation_reason ||
body.motivo_consulta ||
body.situacion ||
body.tratamiento ||
null
```

## Landing Reusable

En la landing publica no enviar `clinic_id`. Configurar solo:

```js
const CLINIC_SLUG = "dentalpro";
const LANDING_TOKEN = "lf_xxxxx";
```

El webhook universal n8n debe validar esos dos campos contra `public.clinic_public_forms` y obtener desde ahi el `clinic_id` real.

## Embed Iframe

Opcion para una clinica con web propia:

```html
<iframe
  src="https://TU-DOMINIO.vercel.app/form/CLINIC_SLUG?landing_token=lf_xxxxx"
  width="100%"
  height="720"
  style="border:0; border-radius:16px;"
></iframe>
```

Version base sin token, para documentar la ruta publica:

```html
<iframe
  src="https://TU-DOMINIO.vercel.app/form/CLINIC_SLUG"
  width="100%"
  height="720"
  style="border:0; border-radius:16px;"
></iframe>
```

Para envio real, incluir `landing_token` en la URL o configurar el formulario host para inyectarlo. El dominio debe estar en `allowed_origins`.

## Fetch Para Web Propia

```js
const WEBHOOK_URL = "https://TU-N8N.up.railway.app/webhook/dental-lead-universal";

const payload = {
  clinic_slug: "dentalpro",
  landing_token: "lf_xxxxx",
  nombre: "Laura",
  telefono: "+595981000000",
  tratamiento: "Implante dental",
  urgencia: "Hoy",
  evaluacion_previa: "No",
  situacion: "Quiero agendar una consulta",
  consultation_reason: "Le falta una pieza",
  origen: "Landing odontologia",
  pagina: "implantes",
  fecha_envio: "auto",
};

const response = await fetch(WEBHOOK_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

const data = await response.json();
```

## n8n Universal

Ver `../n8n-universal-workflow.md`.

Reglas criticas:

- Ignorar cualquier `clinic_id` que venga del frontend.
- Validar `clinic_slug` y `landing_token`.
- Si el token es invalido, responder 403 y no crear lead.
- Usar service role solo en n8n/Railway, nunca en frontend.

## Checklist Manual

- Token correcto crea lead en la clinica correcta.
- Token falso responde error y no crea lead.
- Body con `clinic_id` manipulado se ignora.
- Slug/token A crea lead solo en Clinica A.
- Slug/token B crea lead solo en Clinica B.
- Usuario A no ve datos de B y usuario B no ve datos de A.
- `consultation_reason` se guarda; si falta, usa fallback.
- `npm.cmd run build` pasa.
