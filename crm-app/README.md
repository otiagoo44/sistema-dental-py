# CRM React/Vite

Frontend operativo del producto dental CRM. Supabase aporta Auth, Postgres, RLS, Realtime y la Edge Function publica `lead-intake`.

## Desarrollo

```powershell
npm install
npm run dev
```

Crear `.env.local` a partir de `.env.example`:

```env
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
```

El endpoint publico se deriva como `${VITE_SUPABASE_URL}/functions/v1/lead-intake`; no necesita otra variable. Nunca usar `service_role`, `FORM_HASH_SALT` ni otra clave privada en Vite o Vercel.

## Verificacion

```powershell
npm test
npm run build
```

`npm run build` genera el build de produccion en `dist` con sourcemaps desactivados. Para el entorno QA existente se conserva `npm run build:staging`.

## Vercel

- Root Directory: `crm-app`
- Framework Preset: `Vite`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

`vercel.json` conserva el fallback SPA hacia `index.html` y headers publicos seguros.

## Supabase

Configurar en Auth:

- Site URL: `https://TU-CRM.vercel.app`
- Redirect URLs: `http://localhost:5173/**` y `https://TU-CRM.vercel.app/**`

La app deriva `clinic_id` del perfil autenticado y RLS aplica el aislamiento real. Las landings externas solo envian `clinic_slug`, `landing_token`, datos comerciales y consentimiento al intake publico.
