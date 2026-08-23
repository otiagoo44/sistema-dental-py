# Checklist Produccion

Fecha de verificación técnica: 2026-08-22. Proyecto: `unybqqzhgqxhrwucrofm`.

Leyenda: `[x]` verificado, `[!]` parcial/riesgo o requiere accion manual, `[ ]` pendiente.

## Supabase Y Base De Datos

- [x] Proyecto nuevo responde por CLI y reporta `ACTIVE_HEALTHY`.
- [x] Repo linkeado a `unybqqzhgqxhrwucrofm`.
- [x] Diez migraciones locales/remotas alineadas; la última enlaza contacto/tareas y agrega plantillas multi-clínica.
- [x] 16 tablas CRM creadas.
- [x] RLS activo en las 16 tablas sensibles.
- [x] 38 policies finales revisadas por rol.
- [x] Cero policies `DELETE` en tablas CRM.
- [x] Privilegios Data API explicitados; `anon` sin acceso directo a tablas CRM.
- [x] Helpers privados `app_private` instalados.
- [x] RPCs operativas instaladas, incluyendo `mark_lead_contacted`, `complete_contact_task`, `record_contact_attempt` y `record_whatsapp_opened`.
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
- [x] Origins de Preview, produccion y localhost permitidos con ACAO exacto; origin invalido/viejo y POST sin Origin rechazados sin reflejo.
- [x] Token correcto/falso, `clinic_id` manipulado, telefono invalido y body incompleto probados.
- [x] Consentimiento faltante rechazado y consentimiento presente aceptado.
- [x] Honeypot, XSS y payload grande probados.
- [x] Duplicado conserva el mismo lead.
- [x] Lead caliente, medio y frio probados.
- [x] Rate limit: 3/h por telefono y 60/h por IP/form.
- [x] Suite HTTP remota ampliada despues del hardening CORS: 49 passed, 0 failed.
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
- [x] Tema visual migrado a grafito/champagne con wordmark tipográfico, componentes oscuros y estados semánticos sin azul médico dominante.
- [x] Contraste técnico de texto base/muted y CTA entre 6.92:1 y 18.92:1; pendiente confirmación perceptual en QA visual.
- [x] Pulido final corrige tipografía de sidebar, texto seleccionado de Agenda y estados primary/secondary/ghost/danger/disabled; el ratio mínimo calculado de los estados revisados es 4.99:1.
- [x] Inputs, selects y textareas centralizan texto, placeholder, caret, calendario y estado disabled para tema oscuro sin cambiar validaciones ni payloads.
- [x] Leads incluye búsqueda, ocho filtros/atajos y cuatro ordenamientos.
- [x] Agenda visual incluye calendario de 14 días, selección de responsable y slots de 30 minutos con ocupados deshabilitados.
- [x] Métricas usa cards, barras, embudo CSS y tablas por fuente/tratamiento sin dependencia de charts; valor potencial se etiqueta como estimación, no ingreso.
- [x] Dashboard conecta owner/admin con `Ver impacto comercial`; receptionist conserva un CTA operativo a Seguimientos.
- [x] Nuevo lead usa secciones y selects; `Guardar lead` y `Guardar y agendar` conservan la RPC transaccional.
- [x] Helpers `datetime-local` para `America/Asuncion` probados ida/vuelta.
- [x] `/form/:slug` existe en el CRM e incluye consentimiento y aviso de privacidad.
- [x] Build Vite 7.3.6 posterior a `Nuevo lead`: OK.
- [x] `npm audit`: 0 vulnerabilidades.
- [x] Suite 2026-08-22: SQL verification, RLS real-users, RLS/RPC transaccional y `lead-intake` 49/49 PASS.
- [x] Build final de pulido: 2056 módulos transformados; `npm audit` 0 vulnerabilidades; no existe script lint en `package.json`.
- [x] `dist`: 0 sourcemaps, 0 proyecto viejo, 0 marcadores de secrets server-side.
- [x] Landing local apunta al endpoint nuevo y no envia key ni `clinic_id`.
- [x] Preview estable de landing creado y verificado: `https://sistema-dental-py-preview.vercel.app`; el origin anterior que reproducia CORS tambien permanece autorizado.
- [x] Tailwind CDN reemplazado por CSS compilado con Tailwind CLI y `/favicon.ico` responde HTTP 200.
- [x] Preview de landing sirve el proyecto nuevo, consentimiento y mensajes de error/exito; no contiene proyecto viejo, `clinic_id`, anon key ni `service_role`.
- [x] Prueba HTTP desde el origin preview: sin consentimiento 400 y cero leads; con consentimiento 200, `Lead Caliente`, 1 event, 1 task, 2 jobs y log `accepted` con hashes.
- [x] Packaging de landing reducido con `.vercelignore`; `.env`, CRM, Supabase, tests y docs devuelven 404 en el preview.
- [x] Proyecto Vercel `crm-odontologia-staging` publicado como Preview estable en `https://crm-odontologia-staging-preview.vercel.app`.
- [x] CRM Preview construida como Vite con `npm run build`, salida `dist` y variables Preview; bundle usa Supabase/webhook nuevos y no contiene `service_role`.
- [!] Chrome headless local no devolvio DOM; flujo de navegador queda manual.
- [!] El navegador integrado no estuvo disponible en la sesión 2026-08-22; el rediseño compiló pero la checklist visual por roles y responsive sigue pendiente.
- [!] Landing Vercel de produccion no promovida: `https://sistema-dental-py.vercel.app` sigue sirviendo el deploy anterior, que referencia el proyecto Supabase viejo, carga Tailwind por CDN y devuelve 404 para `/favicon.ico`. No usarla para captar leads hasta QA visual, aprobacion y promocion del build Preview actual.
- [!] El primer deployment del proyecto CRM staging fue asignado automaticamente por Vercel al target production del proyecto nuevo; no se uso `--prod`. La URL aprobada para QA es exclusivamente el alias Preview estable indicado arriba.
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

## Contacto y plantillas

- [x] `mark_lead_contacted` cierra sólo tareas de contacto abiertas.
- [x] `complete_contact_task` exige un resultado y no afecta tareas de cita, no-show o presupuesto.
- [x] `record_whatsapp_opened` registra apertura sin marcar contacto.
- [x] El enlace `wa.me` incluye teléfono normalizado y mensaje codificado.
- [x] Las plantillas son propias de cada clínica y sólo owner/admin puede editarlas.
- [x] Receptionist puede usar plantillas y registrar resultados.
- [x] No hay envío automático, WhatsApp API, ManyChat ni Instagram automático.
- [x] `supabase/reset_qa_leads.sql` dejó 13 leads y preservó el único registro no clasificable como sintético.
