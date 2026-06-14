# CRM App

CRM React/Vite para operar leads, agenda, tareas y configuracion publica por clinica.

## Desarrollo

```powershell
npm install
npm run dev
npm run build
```

## Vercel

- Root Directory: `crm-app`
- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`

Variables:

```text
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=SUPABASE_ANON_KEY
VITE_PUBLIC_LEAD_WEBHOOK_URL=https://kfpdworxksqofipmjijz.supabase.co/functions/v1/lead-intake
```

Solo usar anon key en frontend. No usar service role ni salts en Vercel public env vars.

## Supabase Auth URL Configuration

Configurar en Supabase Auth:

- Site URL: `https://TU-CRM.vercel.app`
- Redirect URLs:
  - `http://localhost:5173/**`
  - `https://TU-CRM.vercel.app/**`

## Seguridad

- La app obtiene `clinic_id` desde `profiles`, no desde formularios publicos.
- Todas las queries filtran por `profile.clinic_id`.
- RLS en Postgres es la barrera real entre clinicas.
- Admin/owner pueden configurar landing y archivar.
- Receptionist no ve settings, no archiva y no edita tokens.
- Build Vite esta configurado con `sourcemap: false`.
- `vercel.json` no usa `X-Frame-Options: DENY` global porque `/form/:slug` puede embeberse como iframe autorizado por `allowed_origins`.

## Formulario Publico / Snippets

Los snippets usan:

```js
const WEBHOOK_URL = "https://kfpdworxksqofipmjijz.supabase.co/functions/v1/lead-intake";
```

Payload publico:

```js
{
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
  pagina: "implantes"
}
```

No incluir `clinic_id`, anon key, service role ni secrets en snippets publicos.

## Test Manual CRM

1. Login como admin.
2. Ver leads de su clinica.
3. Guardar config de `clinic_public_forms`.
4. Enviar lead desde landing.
5. Ver lead, evento, tarea y appointment.
6. Archivar un lead con motivo.
7. Login como receptionist.
8. Ver que no aparece Settings.
9. Cambiar estado, agendar, confirmar/no-show y completar tareas.
10. Verificar que no puede archivar ni configurar tokens.
