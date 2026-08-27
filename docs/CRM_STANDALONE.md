# Corte del CRM standalone

## Decision

No se mueven fisicamente las carpetas en este repositorio: la raiz publica actual y `crm-app/` son dos proyectos Vercel distintos. Moverlas ahora cambiaria sus Root Directory y agregaria riesgo sin mejorar el producto. El nuevo repositorio debe crearse con el corte siguiente.

## Mapa de dependencias

| Parte | Necesita en runtime | No necesita |
| --- | --- | --- |
| `crm-app/` | su `package.json`, variables publicas de Supabase, Auth/Data API/Realtime | HTML, CSS, imagenes o JavaScript de la landing actual |
| `supabase/` | `migrations/`, `functions/lead-intake/`, `config.toml`, secrets server-side | una copia por landing |
| `lead-intake` | `clinic_public_forms`, RPCs y tablas creadas por migraciones; `FORM_HASH_SALT` y variables reservadas de Supabase | codigo React, assets comerciales o `clinic_id` enviado por navegador |
| Landing externa | HTML/assets propios, URL publica de `lead-intake`, `clinic_slug`, `landing_token`, origin autorizado y consentimiento | Auth, RLS, service role, migraciones o logica interna de CRM |
| `tests/` | `crm-app/` y `supabase/` como carpetas hermanas | archivos de la landing actual |

No existe codigo runtime compartido entre la landing estatica actual y React. `js/lead-intake-form.js` pertenece a esa landing; el contrato compartido es solamente HTTP.

## Contenido del nuevo repositorio

```text
dental-crm/
  crm-app/       # excluir node_modules, dist, .env, .env.local, .vercel y .agents
  supabase/      # excluir .temp
  tests/
  docs/
  README.md
  AGENTS.md
  .gitignore
```

En `docs/` conservar la documentacion CRM/backend. No copiar al repositorio CRM estos documentos acoplados al deploy o contenido de la landing actual:

- `checklist-produccion.md`
- `demo-interna.md`
- `qa-manual-crm.md`
- `qa-rls-multiclinica.md`
- `vercel-staging.md`

`MANUAL_ACCEPTANCE_TEST.md`, `PRODUCTION_RELEASE_CHECKLIST.md`, `QA_STAGING_DEPLOY.md`, `ROLLBACK_PLAN.md` y este archivo cubren el release del CRM standalone.

## Contenido que queda en la landing

```text
index.html
assets/
css/
js/
favicon.ico
tailwind.landing.config.js
package.json
package-lock.json
.vercelignore
```

Tambien quedan fuera del CRM `estrategia.html`, el workflow n8n exportado de la landing y cualquier imagen o texto comercial especifico.
