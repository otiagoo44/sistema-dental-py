# Checklist Produccion

Fecha de verificacion tecnica: 2026-08-21. Proyecto: `unybqqzhgqxhrwucrofm`.

Leyenda: `[x]` verificado, `[!]` parcial/riesgo o requiere accion manual, `[ ]` pendiente.

## Supabase Y Base De Datos

- [x] Proyecto nuevo responde por CLI y reporta `ACTIVE_HEALTHY`.
- [x] Repo linkeado a `unybqqzhgqxhrwucrofm`.
- [x] Seis migraciones locales/remotas alineadas.
- [x] 16 tablas CRM creadas.
- [x] RLS activo en las 16 tablas sensibles.
- [x] 38 policies finales revisadas por rol.
- [x] Cero policies `DELETE` en tablas CRM.
- [x] Privilegios Data API explicitados; `anon` sin acceso directo a tablas CRM.
- [x] Helpers privados `app_private` instalados.
- [x] RPCs `schedule_lead_appointment`, `update_appointment_outcome` y `complete_task` instaladas.
- [x] Doble reserva activa bloqueada por indice unico parcial.
- [x] No-show probado: seguimiento manana 09:00 `America/Asuncion`.
- [x] Consentimiento guardado con timestamp, source y page.
- [x] Seed QA idempotente ejecutada dos veces sin duplicar appointments.
- [x] Clinicas `dentalpro` y `qa-clinic-b` creadas.
- [x] Public forms, settings, precios, templates y datos sinteticos creados.
- [x] Tres usuarios Auth QA confirmados, con credencial y profiles permanentes activos.

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
- [x] Suite HTTP remota: 29 passed, 0 failed.
- [x] Intake posterior al fix crea lead, event, task, 2 jobs y log accepted.
- [x] Logs sin columnas de IP/telefono crudos; accepted logs con `phone_hash`.
- [x] n8n no participa del guardado inicial; jobs quedan `pending`.

## RLS, Agenda Y Roles

- [x] Test transaccional con JWT/roles sinteticos y rollback: PASS.
- [x] Test RLS/RPC con los tres UUID Auth reales y rollback: PASS.
- [x] DentalPro owner aislado de QA Clinic B.
- [x] QA Clinic B owner aislado de DentalPro.
- [x] Receptionist no archiva, no ve forms/audit y no inserta appointments directamente.
- [x] Receptionist agenda y completa tareas por RPC segura.
- [x] Owner archiva y gestiona su public form.
- [x] Doble reserva devuelve mensaje claro.
- [x] Agenda, no-show y task completed sincronizan lead/event/audit en transaccion.
- [!] Login visual con los usuarios Auth permanentes pendiente de QA manual en navegador; RLS/RPC ya pasaron en DB.

## CRM, Landing Y Vercel

- [x] CRM local configurado con URL/publishable key/endpoint del proyecto nuevo.
- [x] CRM usa RPCs para agenda, outcomes y completar tareas.
- [x] Helpers `datetime-local` para `America/Asuncion` probados ida/vuelta.
- [x] `/form/:slug` existe en el CRM e incluye consentimiento y aviso de privacidad.
- [x] Build Vite 7.3.6 final: OK.
- [x] `npm audit`: 0 vulnerabilidades.
- [x] `dist`: 0 sourcemaps, 0 proyecto viejo, 0 marcadores de secrets server-side.
- [x] Landing local apunta al endpoint nuevo y no envia key ni `clinic_id`.
- [!] Chrome headless local no devolvio DOM; flujo de navegador queda manual.
- [ ] Landing Vercel real actualizada: el deploy publicado aun sirve el endpoint viejo y no tiene consentimiento.
- [ ] CRM staging publicado en Vercel con env vars nuevas.
- [ ] Supabase Auth Site URL/Redirect URLs configuradas para el dominio CRM final.
- [ ] Lead enviado desde la landing real publicada y visto en CRM con usuario real.

## Operacion Y Privacidad

- [x] Privacidad minima y proceso manual de acceso/exportacion/eliminacion documentados.
- [x] Backups, monitoreo e incidentes documentados.
- [x] MFA y rotacion de contrasenas recomendados.
- [!] Cierre automatico por inactividad pendiente; hasta implementarlo, cierre manual obligatorio.
- [!] Workflow n8n incluido no tiene nodos operativos; automatizaciones no se presentan como activas.

No publicar como produccion ni prospectar hasta completar los items pendientes de Auth, navegador, staging y landing real.
