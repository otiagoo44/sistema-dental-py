# Vercel Staging Y Auth URLs

No promover a produccion hasta completar QA manual con usuarios reales.

## CRM

- Root Directory: `crm-app`
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

Variables:

```env
VITE_SUPABASE_URL=https://unybqqzhgqxhrwucrofm.supabase.co
VITE_SUPABASE_ANON_KEY=PEGAR_PUBLISHABLE_KEY
VITE_PUBLIC_LEAD_WEBHOOK_URL=https://unybqqzhgqxhrwucrofm.supabase.co/functions/v1/lead-intake
```

No agregar `SUPABASE_SERVICE_ROLE_KEY` ni `FORM_HASH_SALT` a Vercel.

## Supabase Auth

Reemplazar `TU-CRM.vercel.app` por el dominio de staging real:

```text
Site URL:
https://TU-CRM.vercel.app

Redirect URLs:
http://localhost:5173/**
https://TU-CRM.vercel.app/**
```

## Landing

El archivo local `js/lead-intake-form.js` ya apunta al proyecto nuevo y exige consentimiento. El deploy real seguia sirviendo la version vieja en la verificacion del 2026-08-21. Hacer commit/push o redeploy del repositorio y comprobar despues:

```powershell
curl.exe -sS https://sistema-dental-py.vercel.app/js/lead-intake-form.js | Select-String "unybqqzhgqxhrwucrofm|consentimiento_contacto"
```

Solo despues enviar un lead sintetico desde navegador y verificar lead, event, task, jobs y accepted log.
