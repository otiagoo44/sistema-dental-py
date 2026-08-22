# Vercel Staging Y Auth URLs

No promover a produccion hasta completar QA manual con usuarios reales.

## CRM

Proyecto creado: `crm-odontologia-staging`.

Alias estable del Preview UX actual:

```text
https://crm-odontologia-staging-preview.vercel.app
```

Deployment inmutable asociado al pulido final de contraste: `https://crm-odontologia-staging-8cn30gy17-ortegatiago733-2656s-projects.vercel.app`. El deployment está `READY`, responde HTTP 200 y todavía requiere QA visual con usuarios reales. No usar el primer deployment estable del proyecto para QA: Vercel lo asignó automáticamente al target production del proyecto nuevo antes de que existiera un Preview, aunque no se ejecutó `--prod`.

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

Configuracion a validar antes del QA de autenticacion por enlaces:

```text
Site URL:
https://crm-odontologia-staging-preview.vercel.app

Redirect URLs:
http://localhost:5173/**
https://crm-odontologia-staging-preview.vercel.app/**
```

## Landing

El archivo local y el Preview de landing apuntan al proyecto nuevo y exigen consentimiento. Alias estable del build actual:

```text
https://sistema-dental-py-preview.vercel.app
```

Deployment inmutable asociado: `https://sistema-dental-559mik7rg-ortegatiago733-2656s-projects.vercel.app`. El Preview anterior `https://sistema-dental-n0vygq1wm-ortegatiago733-2656s-projects.vercel.app` se conserva como reproduccion del origin que fallo; ya esta autorizado por CORS, pero por ser inmutable no contiene el build nuevo sin CDN.

La produccion `https://sistema-dental-py.vercel.app` sigue sirviendo la version anterior porque no se promovio sin QA visual. La comprobacion del 2026-08-22 detecto alli el proyecto Supabase viejo, Tailwind CDN y `/favicon.ico` 404; el Preview actual no presenta esos problemas. Comprobar despues de una promocion autorizada:

```powershell
curl.exe -sS https://sistema-dental-py.vercel.app/js/lead-intake-form.js | Select-String "unybqqzhgqxhrwucrofm|consentimiento_contacto"
```

La prueba HTTP del alias estable verifico rechazo sin consentimiento y creacion con consentimiento de lead, event, task, dos jobs y accepted log. `OPTIONS` y `POST` validan el origin contra `allowed_origins`; un origin desconocido o ausente recibe 403 sin reflejo CORS. Sigue pendiente repetir el flujo visual desde navegador y verlo con un usuario CRM real.
