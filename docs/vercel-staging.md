# Vercel Staging Y Auth URLs

No promover a produccion hasta completar QA manual con usuarios reales.

## CRM

Proyecto creado: `crm-odontologia-staging`.

Preview verificado a nivel de deploy/configuracion:

```text
https://crm-odontologia-staging-hsghneld5-ortegatiago733-2656s-projects.vercel.app
```

Este Preview tiene Deployment Protection y todavia requiere QA visual. No usar el primer deployment estable del proyecto para QA: Vercel lo asigno automaticamente al target production del proyecto nuevo antes de que existiera un Preview, aunque no se ejecuto `--prod`.

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

Configuracion manual pendiente para el Preview actual:

```text
Site URL:
https://crm-odontologia-staging-hsghneld5-ortegatiago733-2656s-projects.vercel.app

Redirect URLs:
http://localhost:5173/**
https://crm-odontologia-staging-hsghneld5-ortegatiago733-2656s-projects.vercel.app/**
```

## Landing

El archivo local y el Preview de landing apuntan al proyecto nuevo y exigen consentimiento. Preview probado:

```text
https://sistema-dental-n0vygq1wm-ortegatiago733-2656s-projects.vercel.app
```

La produccion `https://sistema-dental-py.vercel.app` sigue sirviendo la version anterior porque no se promovio sin QA visual. Comprobar despues de una promocion autorizada:

```powershell
curl.exe -sS https://sistema-dental-py.vercel.app/js/lead-intake-form.js | Select-String "unybqqzhgqxhrwucrofm|consentimiento_contacto"
```

La prueba HTTP del Preview ya verifico rechazo sin consentimiento y creacion con consentimiento de lead, event, task, dos jobs y accepted log. Sigue pendiente repetirlo desde navegador y verlo con un usuario CRM real.
