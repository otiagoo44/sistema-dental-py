# Staging Release Verification

## Entorno autorizado

- Supabase project ref: `unybqqzhgqxhrwucrofm`.
- Proyecto Supabase: `CRM-Clinicas-Odontologias-BD`.
- Frontend QA: proyecto Vercel `crm-odontologia-staging`; preview RC `https://crm-odontologia-staging-irzf70y0n-ortegatiago733-2656s-projects.vercel.app` (`READY`, HTTP 200, `noindex`).
- Evidencia de aislamiento: el frontend de producción continúa en el release/proyecto anterior y este proyecto contiene clínicas y usuarios QA sintéticos.
- Prohibido usar este procedimiento contra el proyecto anterior `kfpdworxksqofipmjijz` o cualquier ref no documentado.

## Decisión sobre `rls_auto_enable`

El remoto staging contiene `public.rls_auto_enable()` como event-trigger helper legacy, creado fuera del historial versionado. Todas las tablas de la cadena versionada habilitan RLS explícitamente, por lo que el helper no es requisito para reconstruir el esquema. La migración histórica conserva su hardening, pero la revocación ahora es condicional: revoca el helper donde existe y permite un replay limpio donde no existe. El runner ya no crea un stub.

Clasificación: dependencia accidental de una migración histórica sobre estado remoto no versionado (Caso D), con helper legacy legítimo en el remoto (evidencia del Caso A) pero no necesario como source of truth.

## Estrategia de entornos frontend

| Entorno | Comando | Configuración |
|---|---|---|
| development | `npm run dev` | Variables locales ignoradas por Git; localhost permitido |
| staging | `npm run build:staging` | `--mode staging` con las variables públicas del proyecto QA |
| production | `npm run build` | build Vite estándar listo para Vercel |

Variables públicas: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. La URL de `lead-intake` se deriva del mismo origin Supabase. Secretos Edge: `SUPABASE_SERVICE_ROLE_KEY` y `FORM_HASH_SALT`; nunca deben entrar en Vite/Vercel público.

## Preflight y dry-run

```powershell
npx.cmd supabase projects list --output-format json
npx.cmd supabase migration list --linked
npx.cmd supabase db push --linked --dry-run
```

Continuar sólo si la ref linked es la de staging y el plan contiene exclusivamente migraciones RC esperadas. Nunca usar `db reset --linked`.

## Verificación automatizada

```powershell
$env:PGLITE_ENTRY='RUTA_ABSOLUTA_A_PGLITE_DIST_INDEX_JS'
node tests/postgres-migration-smoke.mjs
npm.cmd --prefix crm-app test
npm.cmd --prefix crm-app run build:staging
```

Para staging real, configurar las variables QA descritas por `tests/staging-smoke.mjs`; no guardar sus valores. Ejecutar además `tests/operational-integrity.sql`, `tests/operational-workflows-e2e.sql`, `tests/rls-real-users.sql` y `tests/rls-rpc-transactional.sql` dentro de transacciones con rollback.

Evidencia RC del 24 de agosto de 2026:

- dry-run: sólo `20260824162341_enforce_operational_integrity_and_quotes.sql`;
- migración aplicada y registrada en staging;
- cuatro suites SQL remotas: PASS con rollback;
- Edge Function `lead-intake` versión 5: ACTIVE, `verify_jwt=false`;
- HTTP real: válido, token/origin/consentimiento/payload/spam, duplicado abierto y teléfono terminal: PASS;
- consulta válida: 1 lead, 1 encargado válido, 1 evento, 1 tarea y 2 automation jobs;
- Realtime con login/JWT Auth temporal: PASS sin F5; 17,2 s observados desde el armado del harness (incluye el arranque de la CLI del emisor);
- desconexión de Realtime + polling cada 5 s: PASS en 6 consultas, sin duplicado visual observado por ID;
- usuario Auth y leads exclusivos de Realtime eliminados al terminar; no se conservaron credenciales temporales.

## Fuente de verdad de Owner Summary

| KPI | Unidad | Tabla/fuente | Timestamp/período | Deduplicación |
|---|---|---|---|---|
| Consultas | oportunidades | `leads` | `created_at`, mes Asunción | `lead.id` |
| Contactadas | oportunidades | `lead_events` `lead_contacted/contact_responded` | `created_at`, mes | `lead_id`; un intento sin respuesta no cuenta |
| Agendaron | oportunidades | `appointment_scheduled/rescheduled` | evento del mes | `lead_id` |
| Asistieron | oportunidades | `appointment_attended` | evento del mes | `lead_id` |
| Iniciaron tratamiento | oportunidades | `treatment_started` | evento del mes | `lead_id` |
| Emitidos | PYG | `quotes` | `issued_at`, mes | `quote.id` |
| Pendientes | PYG | `quotes.status = pending` | estado actual | `quote.id` |
| Aceptados | PYG | `quotes.status = accepted` | `accepted_at`, mes | `quote.id` |
| Rechazados | PYG | `quotes.status = rejected` | `rejected_at`, mes | `quote.id` |
| Monto cotizado que necesita atención | PYG | quotes pending + cola canónica | estado actual | cada `quote.id` máximo una vez |

`first_contacted_at` es la marca explícita de primer contacto. Los eventos conservan la auditoría; `last_contact_at` no se usa para inferir velocidad inicial cuando existe `first_contacted_at`.

## Inventario previo a migrar

La migración RC es aditiva salvo el reemplazo seguro del índice de teléfono abierto y saneamientos no destructivos. Agrega quotes, timestamps, relaciones, índices, policy, publicación Realtime y RPCs; cierra tareas incompatibles sin borrar historia. El rollback operativo está en `ROLLBACK_PLAN.md`.

## Matriz de evidencia

Marcar PASS únicamente con ejecución observada.

| Área | Local | Staging | Resultado |
|---|---|---|---|
| Migraciones | PASS | PASS | Replay vacío de 15 migraciones y push linked |
| RLS | PASS | PASS | Usuarios Auth QA y RPC transactional |
| Intake | PASS | PASS | Contrato unitario + HTTP real |
| Realtime | PASS | PASS | WebSocket sin F5 + fallback real |
| Contacto | PASS | PASS | Workflow SQL remoto |
| Agenda | PASS | PASS | Workflow SQL remoto |
| No-show | PASS | PASS | Workflow SQL remoto |
| Quotes | PASS | PASS | Incluye multipresupuesto A accepted/B pending |
| Métricas | PASS | NO EJECUTADO | Dataset 20/15/10/8/4 y Gs. 50M validado en dominio; falta contraste visual manual en staging |
| Multi-clínica | PASS | PASS | SELECT/INSERT/UPDATE/RPC y reasignación cruzada bloqueada |
| Build | PASS | N/A | Build staging local y Vercel |
| Responsive | PASS | NO EJECUTADO | Viewports locales sin overflow; falta recorrido autenticado de la preview |

El runner responsive confirmó las páginas en 320, 375, 768, 1024 y 1440 px. Su bloque legacy de modales no se ejecutó porque dependía de una ruta QA `?page=modal` que ya no existe; no se reintrodujo una ruta de test en la SPA de release.
