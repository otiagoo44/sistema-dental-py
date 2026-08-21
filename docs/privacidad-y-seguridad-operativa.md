# Privacidad Y Seguridad Operativa

Este sistema es un CRM comercial de captacion y seguimiento; no es una historia clinica ni reemplaza una consulta odontologica.

## Privacidad Minima

- Finalidad: contacto comercial, respuesta a la consulta y agendamiento.
- Responsable: la clinica que publica el formulario.
- Consentimiento: el formulario exige `consentimiento_contacto=true` y guarda fecha, origen y pagina.
- Minimizacion: no solicitar diagnosticos, estudios ni informacion medica sensible en texto libre.
- Acceso: solo usuarios activos de la misma clinica; logs y configuracion solo admin/owner.
- Conservacion: revisar trimestralmente leads archivados. Hasta definir una politica contractual, exportacion o eliminacion se atiende manualmente por el owner, dejando evidencia en `audit_logs`.
- Derechos: el owner valida identidad y tramita acceso, exportacion o eliminacion. No hacer hard delete desde el navegador; cualquier eliminacion excepcional debe ser aprobada, respaldada y ejecutada server-side.

Texto publico obligatorio:

> Al enviar este formulario aceptas que la clinica use tus datos para contactarte sobre tu consulta. No compartas informacion medica sensible por este formulario. Este formulario no reemplaza una consulta odontologica.

## Acceso

- Recomendar MFA a todos los admins/owners desde Auth.
- Crear contrasenas temporales unicas y exigir rotacion en el primer acceso.
- Receptionist no gestiona usuarios, forms, tokens ni configuracion critica.
- El CRM conserva la sesion con Supabase Auth. El cierre por inactividad todavia requiere implementacion en UI; hasta entonces cerrar sesion al terminar y evitar equipos compartidos.

## Backups

- Habilitar Point-in-Time Recovery o backups del plan de Supabase si estan disponibles.
- Como contingencia, generar una exportacion manual semanal cifrada y conservarla con acceso restringido fuera del equipo de recepcion.
- Probar restauracion antes del piloto y registrar fecha, responsable y resultado.

## Monitoreo

- Edge Function: Supabase Dashboard -> Edge Functions -> `lead-intake` -> Logs.
- Postgres/Auth/API: Supabase Dashboard -> Logs Explorer.
- Vercel: proyecto CRM/landing -> Deployments y Runtime Logs.
- n8n futuro: Executions. n8n no participa del guardado inicial.
- Revisar `automation_jobs` con estado `failed` o reintentos agotados.

## Respuesta A Incidentes

1. **No entra el lead:** revisar Network del navegador, status HTTP, origin, token y logs de Edge Function.
2. **Entra pero no aparece en CRM:** consultar `leads`, validar profile/RLS y refrescar sesion.
3. **Aparece pero no crea task/event/job:** revisar respuesta y logs de la Function; consultar las tablas por `lead_id`.
4. **Usuario no ve datos:** comprobar `auth.users.id = profiles.id`, `active=true`, `clinic_id` y rol.
5. **Rate limit excesivo:** revisar solo hashes y timestamps en `form_submission_logs`; nunca agregar IP o telefono crudos.
6. **Edge Function falla:** el status debe ser generico para el cliente; inspeccionar logs server-side y no exponer stack/SQL.
7. **Sospecha de acceso indebido:** desactivar usuario, rotar credenciales, preservar audit/logs y evaluar alcance por clinica.
