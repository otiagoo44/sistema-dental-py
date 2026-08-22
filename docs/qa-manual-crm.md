# QA manual visual de la CRM

Fecha de preparación: 2026-08-21. Proyecto Supabase: `unybqqzhgqxhrwucrofm`.

Estado de este documento: checklist preparada, no ejecutada. La revisión de código y las pruebas automáticas no reemplazan esta pasada visual. No declarar la CRM lista para demo externa o prospección mientras queden casos obligatorios sin evidencia.

## Evidencia tecnica de release 2026-08-21

Esta evidencia permite iniciar la pasada visual, pero no marca ninguno de sus casos como aprobado:

- Landing Preview: `https://sistema-dental-n0vygq1wm-ortegatiago733-2656s-projects.vercel.app`.
- CRM Preview: `https://crm-odontologia-staging-hsghneld5-ortegatiago733-2656s-projects.vercel.app`.
- El navegador de QA no estuvo disponible en la sesion de release; login, layout, navegacion, responsive, Console y Network siguen pendientes.
- La prueba HTTP desde el origin de la landing Preview rechazo el caso sin consentimiento con 400 y no creo lead.
- El caso con consentimiento creo `QA Landing Publica Nuevo Supabase` (`99e6c1e6-97ae-4faf-9126-8a6b0eb4e611`) como `Lead Caliente`, con event, task, dos jobs y log `accepted` con hashes.
- HTTP `lead-intake`: 29 passed, 0 failed. SQL verification, RLS real-users y RLS/RPC transaccional: PASS. Build: OK. Audit: 0 vulnerabilidades.
- La landing de produccion `https://sistema-dental-py.vercel.app` no fue promovida y sigue pendiente de QA visual.
- Supabase Auth Site URL y Redirect URLs del CRM Preview siguen pendientes de configuracion manual.

## 1. Preparación y evidencia

Usar sólo nombres y teléfonos sintéticos. No copiar contraseñas, tokens completos, respuestas Auth, claves ni datos de pacientes en capturas o tickets.

- [ ] Registrar URL probada: local, preview o staging.
- [ ] Registrar commit exacto con `git rev-parse HEAD`.
- [ ] Registrar fecha, hora `America/Asuncion` y responsable de QA.
- [ ] Confirmar que la migración `create_manual_lead_rpc` está aplicada.
- [ ] Ejecutar el build que corresponde al commit probado.
- [ ] Abrir DevTools, pestañas Console y Network, y limpiar los registros.
- [ ] Usar una ventana privada nueva por usuario o cerrar sesión entre roles.
- [ ] Obtener credenciales QA por canal seguro; no escribirlas en este documento.

Iniciar localmente:

```powershell
cd C:\htdocs\Repositorio-Odontologia-Tiago\sistema-dental-py\crm-app
npm.cmd run dev
```

Matriz mínima de evidencia:

| Caso | Usuario | URL | Resultado | Evidencia sin secretos | Incidencia |
|---|---|---|---|---|---|
| Login y aislamiento | DentalPro owner/admin | Pendiente | Pendiente | Pendiente | — |
| Permisos recepción | DentalPro receptionist | Pendiente | Pendiente | Pendiente | — |
| Aislamiento Clinic B | QA Clinic B owner/admin | Pendiente | Pendiente | Pendiente | — |
| Usuario sin profile | Auth QA temporal | Pendiente | Pendiente | Pendiente | — |
| Landing pública | Visitante | `https://sistema-dental-py.vercel.app` | Pendiente | Pendiente | — |

## 2. Login, profiles, roles y aislamiento

### DentalPro owner/admin

- [ ] Iniciar sesión con el owner/admin QA de DentalPro.
- [ ] Ver nombre de DentalPro y rol `admin` u `owner` en el layout.
- [ ] Ver Dashboard, Hoy / Prioridad, Leads, Agenda, Tareas y Configuración.
- [ ] Confirmar que no aparecen clínica, leads, turnos, tareas ni responsables de QA Clinic B.
- [ ] Confirmar que puede abrir Configuración, crear `Nuevo lead` y archivar con motivo.
- [ ] Recargar la página; la sesión y la clínica deben restaurarse sin error.

### DentalPro receptionist

- [ ] Iniciar sesión con el usuario QA de recepción de DentalPro.
- [ ] Ver Dashboard, Hoy / Prioridad, Leads, Agenda y Tareas.
- [ ] Confirmar que Configuración no aparece en desktop ni mobile.
- [ ] Confirmar que no aparecen public forms, audit logs, tokens ni datos de QA Clinic B.
- [ ] Confirmar que `Nuevo lead` sí aparece.
- [ ] Confirmar que Archivar no aparece y que no existe hard delete.

### QA Clinic B owner/admin

- [ ] Iniciar sesión con el owner/admin QA de QA Clinic B.
- [ ] Confirmar nombre y datos de QA Clinic B.
- [ ] Confirmar que sólo ve leads, turnos, tareas, responsables y public form de QA Clinic B.
- [ ] Crear un lead sintético y comprobar, tras volver a DentalPro, que no alteró sus datos ni conteos.

### Usuario Auth sin profile

Prueba segura: crear en Supabase Auth un usuario QA temporal con email de dominio `.test`, sin fila en `public.profiles`. No reutilizar un usuario real ni modificar los tres profiles permanentes.

- [ ] Iniciar sesión con el usuario temporal.
- [ ] Ver el mensaje: `Tu usuario no tiene perfil asignado...` o un texto equivalente claro.
- [ ] Confirmar que no carga clínica, navegación operativa ni datos.
- [ ] Confirmar en Network que las consultas RLS no devuelven filas de otra clínica.
- [ ] Cerrar o revocar la sesión y retirar el usuario temporal según el procedimiento interno de QA.

Falla crítica: cualquier dato visible antes de resolver un profile activo.

## 3. Dashboard y Hoy / Prioridad

- [ ] Cargar Dashboard sin errores visuales, de Console, Auth, CORS, REST o RLS.
- [ ] Comparar `Leads totales` con la lista activa, excluyendo archivados.
- [ ] Comparar `Leads nuevos hoy` usando la fecha de Asunción.
- [ ] Comparar `Leads calientes` con filtro `Lead Caliente`.
- [ ] Comparar `No contactados`, consultas activas, pipeline, tasa de contacto y tasa de agendamiento con los datos visibles.
- [ ] En Leads, filtrar cada estado presente y comprobar sus filas. La UI actual no presenta gráfico de distribución por estado; validar mediante este filtro y registrar esa ausencia como observación, no como dato aprobado del Dashboard.
- [ ] En Hoy / Prioridad, validar `Leads calientes no contactados` y `Próximo seguimiento vencido`.
- [ ] Repetir como DentalPro y QA Clinic B; ningún conteo debe mezclar clínicas.

## 4. Leads

- [ ] Ver la lista y abrir el detalle de un lead.
- [ ] Buscar por nombre o teléfono.
- [ ] Filtrar por estado, tratamiento y clasificación.
- [ ] El filtro de fecha no existe en la UI actual: marcar `N/A — no implementado`, porque el requisito lo pide sólo si existe.
- [ ] Editar nota interna, próxima acción y próximo seguimiento; recargar y comprobar persistencia.
- [ ] Cambiar un estado permitido.
- [ ] Intentar cambiar desde Leads a `Consulta Agendada`; debe abrir Agenda, no desincronizar el lead.
- [ ] Confirmar que `Confirmado`, `Asistió` y `No Asistió` se gestionan desde Agenda.

### Nuevo lead — owner/admin y receptionist

Ejecutar una vez con cada rol y con teléfonos sintéticos únicos.

- [ ] Abrir `Nuevo lead`.
- [ ] Confirmar campos: nombre, teléfono, tratamiento, urgencia, motivo, fuente, consentimiento, nota interna, próxima acción, próximo seguimiento, responsable, clasificación y score.
- [ ] Confirmar fuentes: WhatsApp directo, Instagram DM, Llamada, Recomendación, Formulario externo, Meta Ads manual, Formulario web y Otro.
- [ ] Guardar sin nombre: debe bloquear.
- [ ] Guardar sin teléfono: el servidor debe bloquear.
- [ ] Elegir un responsable de la misma clínica y crear.
- [ ] Confirmar lead con `status = Nuevo`, fuente seleccionada y `page = crm_manual`.
- [ ] Confirmar event `lead_created_manual` y una task `contact` pendiente.
- [ ] Confirmar que responsable y `clinic_id` coinciden en lead y task.
- [ ] Si se marcó consentimiento, comprobar `consent_contact = true` y `consent_at` no nulo; si no, ambos deben reflejar que no se registró autorización explícita.
- [ ] En Network, comprobar que la llamada es RPC `create_manual_lead` y que el body no contiene `clinic_id`.
- [ ] Confirmar que no se crean `automation_jobs` por la carga manual.
- [ ] Intentar un teléfono internacional duplicado; debe devolver un mensaje claro y no dejar event/task huérfanos.

Falla crítica: lead creado sin task/event, escritura parcial o posibilidad de asignar un usuario de otra clínica.

## 5. Agenda

Todas estas acciones deben salir por `schedule_lead_appointment` o `update_appointment_outcome`. En Network no debe existir INSERT/UPDATE directo a `appointments`.

- [ ] Desde un lead, abrir Agendar.
- [ ] Guardar sin fecha: bloqueado.
- [ ] Guardar sin hora: bloqueado.
- [ ] Guardar con fecha, hora y doctor: crea appointment y sincroniza lead, event, task y audit.
- [ ] Reservar el mismo doctor, fecha y hora para otro lead: bloqueado con mensaje claro.
- [ ] Confirmar appointment: turno y lead quedan `Confirmado`.
- [ ] Marcar `Asistió`: crea evento y seguimiento esperado.
- [ ] Marcar otro turno `No Asistió`: crea seguimiento para mañana 09:00 en `America/Asuncion` y task de recuperación.
- [ ] Reprogramar: cambia fecha/hora, registra evento y mantiene una sola reserva activa.
- [ ] Repetir agenda y resultado con receptionist.

## 6. Tareas

- [ ] Ver pendientes, vencidas y completadas.
- [ ] Confirmar que todas las tareas visibles tienen clínica y corresponden al usuario actual.
- [ ] Completar una task como owner/admin.
- [ ] Completar una task como receptionist.
- [ ] Recargar: debe quedar `hecho` con `completed_at`.
- [ ] Abrir el lead asociado y comprobar event `task_completed`.
- [ ] En Network, confirmar RPC `complete_task`, no UPDATE directo.
- [ ] No debe existir ninguna task sin `clinic_id` al verificar la base.

## 7. Archivado

- [ ] Owner/admin intenta archivar sin motivo: bloqueado.
- [ ] Owner/admin archiva con motivo: queda `is_archived`, timestamp, actor, motivo y estado `Archivado`.
- [ ] El lead desaparece de vistas operativas y puede verse con `Ver archivados`.
- [ ] Receptionist no ve la acción y un intento forzado debe ser rechazado por DB.
- [ ] Confirmar que no existe botón, request ni policy de hard delete.

## 8. Configuración

- [ ] Owner/admin puede ver datos de clínica y configuración de formulario.
- [ ] Puede guardar slug, landing URL, allowed origins, estado y token de su propia clínica.
- [ ] Receptionist no puede abrir la vista mediante navegación ni URL/estado manipulado.
- [ ] Receptionist no recibe filas de `clinic_public_forms` por RLS.
- [ ] El token completo sólo puede verlo el owner/admin autorizado que gestiona el formulario; redactarlo en capturas y tickets.
- [ ] Ningún snippet contiene `clinic_id`, `service_role`, salts o secretos server-side.

## 9. Formulario embebido `/form/:slug`

Usar el token QA desde el canal seguro; no pegarlo en la evidencia.

- [ ] Abrir `/form/dentalpro?landing_token=<TOKEN_QA>`; la ruta debe existir y renderizar.
- [ ] Abrir `/form/dentalpro` sin token; debe mostrar un error claro y no enviar.
- [ ] Confirmar checkbox y aviso de consentimiento.
- [ ] Intentar enviar sin consentimiento: bloqueado.
- [ ] Enviar con consentimiento y teléfono único: respuesta de éxito.
- [ ] En Network, confirmar endpoint `https://unybqqzhgqxhrwucrofm.supabase.co/functions/v1/lead-intake`.
- [ ] Confirmar que el payload incluye `clinic_slug` y `landing_token`, pero no `clinic_id` ni claves Supabase privadas.
- [ ] Confirmar lead, event, task, jobs y log accepted en DentalPro.
- [ ] Confirmar que QA Clinic B no ve el lead.
- [ ] Probar ancho móvil del iframe sin scroll horizontal ni campos cortados.

## 10. Landing pública

Este bloque sólo aprueba el deploy real, no el archivo local.

- [ ] Abrir `https://sistema-dental-py.vercel.app` en ventana privada y con caché deshabilitada.
- [ ] Confirmar que el JavaScript publicado apunta al endpoint nuevo.
- [ ] Confirmar checkbox y texto de consentimiento.
- [ ] Sin consentimiento: bloqueado antes del POST.
- [ ] Con consentimiento y teléfono sintético único: éxito visible.
- [ ] Confirmar un solo lead en DentalPro, event, task, dos jobs esperados y `form_submission_logs.status = accepted`.
- [ ] Confirmar hashes presentes y ausencia de IP/teléfono crudos en logs.
- [ ] Confirmar que el lead aparece en CRM y que QA Clinic B no lo ve.
- [ ] Confirmar que el guardado inicial funciona con n8n detenido o sin workflow operativo.

## 11. Cierre

- [ ] Cada caso obligatorio tiene resultado y evidencia redactada.
- [ ] Los defectos incluyen usuario, URL, commit, hora de Asunción, pasos, esperado y observado.
- [ ] Se repitieron los casos afectados después del fix.
- [ ] Se actualizó `docs/checklist-produccion.md` sólo con resultados realmente observados.

Gate: hasta completar esta checklist y la landing pública real, la decisión máxima permitida es `A) Listo para QA manual visual`.
