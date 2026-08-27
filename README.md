# Dental CRM

Producto CRM odontologico multi-clinica, preparado para vivir en un repositorio independiente de cualquier landing comercial.

## Arquitectura

```text
CRM React/Vite
  -> Supabase Auth + Postgres + RLS + Realtime
  -> Edge Functions
  <- Landings externas por lead-intake publico
```

Supabase es el unico backend del producto. Cada landing usa un `clinic_slug`, un `landing_token` y un origin registrado; el navegador nunca envia un `clinic_id` confiable ni contiene claves privadas.

## Repositorio CRM objetivo

```text
dental-crm/
  crm-app/
  supabase/
    functions/
    migrations/
    config.toml
  tests/
  docs/
  README.md
```

El mapa exacto para separar este repositorio mixto esta en [`docs/CRM_STANDALONE.md`](docs/CRM_STANDALONE.md).

## Desarrollo

```powershell
cd crm-app
npm install
npm run dev
```

Variables de `crm-app/.env.local`:

```env
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
```

La URL de `lead-intake` se deriva del mismo proyecto Supabase. No poner `SUPABASE_SERVICE_ROLE_KEY`, `FORM_HASH_SALT` ni secretos en frontend.

## Verificacion y build

```powershell
cd crm-app
npm test
npm run build
```

Vercel: Root Directory `crm-app`, Framework `Vite`, Build Command `npm run build`, Output Directory `dist`.

## Supabase

La carpeta `supabase/` contiene migraciones, RLS, RPCs, Realtime y `functions/lead-intake`. Flujo habitual:

```powershell
npx.cmd supabase db push --dry-run --linked
npx.cmd supabase db push --linked
npx.cmd supabase functions deploy lead-intake --no-verify-jwt --project-ref PROJECT_REF
```

Configurar `FORM_HASH_SALT` solo como secret de Edge Functions. El intake publico valida token, origin, consentimiento, honeypot y rate limit antes de ejecutar la RPC transaccional.
