# Checklist Produccion

Fecha de verificación técnica: 2026-08-22. Proyecto: `unybqqzhgqxhrwucrofm`.

Leyenda: `[x]` verificado, `[!]` parcial/riesgo o requiere accion manual, `[ ]` pendiente.

## Supabase Y Base De Datos

- [x] Proyecto nuevo responde por CLI y reporta `ACTIVE_HEALTHY`.
- [x] Repo linkeado a `unybqqzhgqxhrwucrofm`.
- [x] Nueve migraciones locales/remotas alineadas; la última agrega seguimiento atómico y fuente manual `Presencial` sin cambios destructivos.
- [x] 16 tablas CRM creadas.
- [x] RLS activo en las 16 tablas sensibles.
- [x] 38 policies finales revisadas por rol.
- [x] Cero policies `DELETE` en tablas CRM.
- [x] Privilegios Data API explicitados; `anon` sin acceso directo a tablas CRM.
- [x] Helpers privados `app_private` instalados.
- [x] RPCs `create_manual_lead`, `save_lead_followup`, `schedule_lead_appointment`, `update_appointment_outcome` y `complete_task` instaladas.
- [x] `create_manual_lead` deriva `clinic_id` del profile autenticado; no acepta ese parámetro desde frontend.
- [x] Owner/admin y receptionist crean lead, event y task manuales en una transacción.
- [x] Responsable manual validado contra profiles activos de la misma clínica; asignación cross-clínica bloqueada.
- [x] Carga manual registra fuente/consentimiento/score/seguimiento y no crea `automation_jobs`.
- [x] Security Advisor: resueltos `search_path` mutable y ejecución anon de `rls_auto_enable()`.
- [!] Security Advisor conserva cuatro warnings intencionales: RPCs transaccionales `SECURITY DEFINER` ejecutables sólo por `authenticated`, cada una con `auth.uid()`, rol/clínica, `search_path = ''` y grants explícitos.
- [x] Doble reserva activa bloqueada por indice unico parcial.
- [x] No-show probado: seguimiento manana 09:00 `America/Asuncion`.
- [x] Consentimiento guardado con timestamp, source y page.
- [x] Seed QA idempotente ejecutada dos veces sin duplicar appointments.
- [x] Clinicas `dentalpro` y `qa-clinic-b` creadas.
- [x] Public forms, settings, precios, templates y datos sinteticos creados.
- [x] Tres usuarios Auth QA confirmados, con credencial y profiles permanentes activos.
- [ ] Activar protección de contraseñas filtradas en Supabase Auth si está disponible para el plan.

## Edge Function E Intake

- [x] `lead-intake` deployada y `ACTIVE`, `verify_jwt=false` intencional.
- [x] `FORM_HASH_SALT` aleatorio configurado; variables reservadas del runtime presentes.
- [x] POST/OPTIONS y GET 405 probados.
- [x] Origin Vercel permitido; origin invalido/viejo y POST sin Origin rechazados.
- [x] Token correcto/falso, `clinic_id` manipulado, telefono invalido y body incompleto probados.
- [x] Consentimiento faltante rechazado y consentimiento presente aceptado.
- [x] Honeypot, XSS y payload grande probados.
- [x] Duplicado conserva el mismo lead.
- [x] Lead caliente, medio y frio probados.
- [x] Rate limit: 3/h por telefono y 60/h por IP/form.
- [x] Suite HTTP remota repetida después de `Nuevo lead`/hardening: 29 passed, 0 failed.
- [x] Intake posterior al fix crea lead, event, task, 2 jobs y log accepted.
- [x] Logs sin columnas de IP/telefono crudos; accepted logs con `phone_hash`.
- [x] n8n no participa del guardado inicial; jobs quedan `pending`.

## RLS, Agenda Y Roles

- [x] Test transaccional con JWT/roles sinteticos y rollback: PASS.
- [x] Test RLS/RPC con los tres UUID Auth reales y rollback: PASS.
- [x] Test RLS de lead manual con owner, receptionist y QA Clinic B: PASS con rollback.
- [x] Receptionist no inserta leads directamente; usa `create_manual_lead`.
- [x] DentalPro owner aislado de QA Clinic B.
- [x] QA Clinic B owner aislado de DentalPro.
- [x] Receptionist no archiva, no ve forms/audit y no inserta appointments directamente.
- [x] Receptionist agenda y completa tareas por RPC segura.
- [x] Owner archiva y gestiona su public form.
- [x] Doble reserva devuelve mensaje claro.
- [x] Agenda, no-show y task completed sincronizan lead/event/audit en transaccion.
- [x] Contacto y posposición sincronizan lead/event/task/audit mediante `save_lead_followup`; índice parcial evita duplicados abiertos por lead/tipo.
- [!] Login visual con los usuarios Auth permanentes pendiente de QA manual en navegador; RLS/RPC ya pasaron en DB.

## CRM, Landing Y Vercel

- [x] CRM local configurado con URL/publishable key/endpoint del proyecto nuevo.
- [x] CRM usa RPCs para agenda, outcomes y completar tareas.
- [x] CRM usa RPC transaccional para `Nuevo lead`; el request no incluye `clinic_id`.
- [x] `Nuevo lead` está visible para owner/admin y receptionist e incluye fuente, consentimiento, responsable, clasificación/score y seguimiento.
- [x] Navegación por rol renovada: Dashboard, Leads, Seguimientos, Agenda y Tareas para recepción; Métricas y Configuración sólo owner/admin.
- [x] Leads incluye búsqueda, ocho filtros/atajos y cuatro ordenamientos.
- [x] Agenda visual incluye calendario de 14 días, selección de responsable y slots de 30 minutos con ocupados deshabilitados.
- [x] Métricas usa cards, barras y embudo CSS sin dependencia de charts; valor potencial se etiqueta como estimación, no ingreso.
- [x] Nuevo lead usa secciones y selects; `Guardar lead` y `Guardar y agendar` conservan la RPC transaccional.
- [x] Helpers `datetime-local` para `America/Asuncion` probados ida/vuelta.
- [x] `/form/:slug` existe en el CRM e incluye consentimiento y aviso de privacidad.
- [x] Build Vite 7.3.6 posterior a `Nuevo lead`: OK.
- [x] `npm audit`: 0 vulnerabilidades.
- [x] Suite 2026-08-22: SQL verification, RLS real-users, RLS/RPC transaccional y `lead-intake` 29/29 PASS.
- [x] `dist`: 0 sourcemaps, 0 proyecto viejo, 0 marcadores de secrets server-side.
- [x] Landing local apunta al endpoint nuevo y no envia key ni `clinic_id`.
- [x] Preview de landing creado y verificado: `https://sistema-dental-n0vygq1wm-ortegatiago733-2656s-projects.vercel.app`.
- [x] Preview de landing sirve el proyecto nuevo, consentimiento y mensajes de error/exito; no contiene proyecto viejo, `clinic_id`, anon key ni `service_role`.
- [x] Prueba HTTP desde el origin preview: sin consentimiento 400 y cero leads; con consentimiento 200, `Lead Caliente`, 1 event, 1 task, 2 jobs y log `accepted` con hashes.
- [x] Packaging de landing reducido con `.vercelignore`; `.env`, CRM, Supabase, tests y docs devuelven 404 en el preview.
- [x] Proyecto Vercel `crm-odontologia-staging` creado; segundo deployment confirmado como Preview en `https://crm-odontologia-staging-hsghneld5-ortegatiago733-2656s-projects.vercel.app`.
- [x] CRM Preview construida como Vite con `npm run build`, salida `dist` y variables Preview; bundle usa Supabase/webhook nuevos y no contiene `service_role`.
- [!] Chrome headless local no devolvio DOM; flujo de navegador queda manual.
- [!] El navegador integrado no estuvo disponible en la sesión 2026-08-22; el rediseño compiló pero la checklist visual por roles y responsive sigue pendiente.
- [!] Landing Vercel de produccion no promovida: `https://sistema-dental-py.vercel.app` sigue sirviendo el deploy anterior hasta QA visual y aprobacion de produccion.
- [!] El primer deployment del proyecto CRM staging fue asignado automaticamente por Vercel al target production del proyecto nuevo; no se uso `--prod`. La URL aprobada para estas pruebas es exclusivamente el segundo Preview indicado arriba.
- [ ] Supabase Auth Site URL/Redirect URLs configuradas para el dominio CRM final.
- [ ] QA visual en navegador del CRM Preview con owner/admin, receptionist, QA Clinic B y usuario sin profile.
- [ ] Lead enviado desde la landing real de produccion y visto visualmente en CRM con usuario real.

## Operacion Y Privacidad

- [x] Privacidad minima y proceso manual de acceso/exportacion/eliminacion documentados.
- [x] Backups, monitoreo e incidentes documentados.
- [x] MFA y rotacion de contrasenas recomendados.
- [!] Cierre automatico por inactividad pendiente; hasta implementarlo, cierre manual obligatorio.
- [!] Workflow n8n incluido no tiene nodos operativos; automatizaciones no se presentan como activas.
- [x] QA visual, onboarding y recepción de leads directos documentados en archivos canónicos.

No publicar como produccion ni prospectar hasta completar los items pendientes de Auth, navegador y landing real.
