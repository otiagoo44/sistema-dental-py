# QA Manual De Release

Fecha de preparacion: 2026-08-21. Rama objetivo: `rebuild-new-supabase`.

Esta checklist valida el comportamiento visible del CRM y de la landing. Usar solamente datos sinteticos, no reutilizar telefonos de pacientes y guardar capturas o notas de cada resultado. No promover a produccion ni prospectar mientras quede un caso obligatorio sin aprobar.

## Evidencia Del Ciclo

- URL CRM local: `http://localhost:5173`
- URL CRM preview/staging: `PENDIENTE`
- URL landing publica: `https://sistema-dental-py.vercel.app`
- Fecha y responsable: `PENDIENTE`
- Commit probado: `PENDIENTE`

## Preparacion

1. Configurar `crm-app/.env.local` con la URL, publishable key y endpoint del proyecto `unybqqzhgqxhrwucrofm`. No copiar service role ni salts.
2. Confirmar que los tres usuarios QA conservan sus credenciales temporales y que cada uno puede iniciar sesion.
3. Iniciar el CRM:

   ```powershell
   cd C:\htdocs\Repositorio-Odontologia-Tiago\sistema-dental-py\crm-app
   npm.cmd run dev
   ```

4. Abrir `http://localhost:5173` en una ventana privada. Cerrar sesion antes de cambiar de usuario.

## DentalPro Owner/Admin

- [ ] Iniciar sesion con `admin-dentalpro@example.test`.
- [ ] Ver dashboard, leads, agenda y tareas de DentalPro.
- [ ] Confirmar que no aparece informacion de QA Clinic B.
- [ ] Crear un lead manual sintetico con telefono unico.
- [ ] Editar estado, notas, proxima accion y seguimiento del lead.
- [ ] Agendarlo para manana a las 10:00 con un doctor asignado.
- [ ] Confirmar que DB y UI muestran manana 10:00 en `America/Asuncion`.
- [ ] Intentar otra reserva activa para el mismo doctor, fecha y hora; debe mostrar `Ese horario ya esta ocupado para este doctor.`
- [ ] Marcar la cita `Confirmado` y comprobar que lead/cita permanecen sincronizados.
- [ ] Marcar una cita de prueba `Asistio` y comprobar su evento.
- [ ] Marcar otra cita `No Asistio`; debe crear seguimiento para manana 09:00 en `America/Asuncion` y una tarea de recuperacion.
- [ ] Reprogramar una cita y comprobar que no queda una reserva activa duplicada.
- [ ] Completar una tarea y comprobar el evento `task_completed`.
- [ ] Archivar un lead indicando motivo; no debe existir hard delete.
- [ ] Abrir configuracion y public forms de DentalPro.
- [ ] Cerrar sesion.

## DentalPro Receptionist

- [ ] Iniciar sesion con `recepcion-dentalpro@example.test`.
- [ ] Ver leads, agenda y tareas de DentalPro.
- [ ] Confirmar que no aparece informacion de QA Clinic B.
- [ ] Cambiar un estado permitido y editar notas/seguimiento.
- [ ] Agendar mediante el flujo normal del CRM.
- [ ] Completar una tarea mediante el flujo normal del CRM.
- [ ] Confirmar que no puede archivar leads.
- [ ] Confirmar que no puede gestionar public forms ni configuracion critica.
- [ ] Confirmar que no existe opcion de hard delete.
- [ ] Cerrar sesion.

## QA Clinic B Owner/Admin

- [ ] Iniciar sesion con `admin-qab@example.test`.
- [ ] Ver solamente dashboard, leads, agenda y tareas de QA Clinic B.
- [ ] Confirmar que no aparece informacion de DentalPro.
- [ ] Crear, editar y agendar un lead sintetico dentro de QA Clinic B.
- [ ] Confirmar que la operacion no altera conteos ni datos de DentalPro.
- [ ] Cerrar sesion.

## Usuario Sin Profile

- [ ] Iniciar sesion con un usuario Auth de prueba sin fila activa en `public.profiles`.
- [ ] Confirmar que el CRM muestra acceso no configurado y no carga datos de ninguna clinica.

## CRM Preview/Staging

Repetir los cuatro bloques anteriores en la URL de Vercel. Antes de probar login, configurar en Supabase `Authentication -> URL Configuration`:

```text
Site URL:
https://URL-CRM-PREVIEW-O-STAGING.vercel.app

Redirect URLs:
http://localhost:5173/**
https://URL-CRM-PREVIEW-O-STAGING.vercel.app/**
```

- [ ] Build preview corresponde al commit registrado arriba.
- [ ] Login, recarga de pagina y cierre de sesion funcionan por HTTPS.
- [ ] No aparecen errores de CORS, Auth o RLS en consola/red.

## Landing Publica

Ejecutar este bloque solamente despues del redeploy publico.

- [ ] Abrir `https://sistema-dental-py.vercel.app` con cache deshabilitada o en una ventana privada.
- [ ] Confirmar que aparece el checkbox requerido de consentimiento.
- [ ] Confirmar que el aviso indica que no se comparta informacion medica sensible y que el formulario no reemplaza una consulta.
- [ ] Intentar enviar sin consentimiento; el navegador debe bloquear el envio.
- [ ] Enviar con consentimiento:
  - Nombre: `Test Landing Nuevo Supabase QA`
  - Telefono: numero Paraguay sintetico y unico
  - Tratamiento: `Implante dental`
  - Urgencia: `Hoy`
  - Situacion: `Quiero agendar`
- [ ] Ver un mensaje de exito claro.
- [ ] Confirmar en el proyecto nuevo que aparece un solo lead en menos de 10 segundos.
- [ ] Confirmar `lead_event`, tarea pendiente, dos `automation_jobs` y `form_submission_logs.status = accepted` con hashes, sin IP ni telefono crudos.
- [ ] Iniciar sesion como DentalPro owner y confirmar que el lead aparece en el CRM.
- [ ] Confirmar que QA Clinic B no ve ese lead.
- [ ] Confirmar que el guardado no depende de n8n.

## Cierre

- [ ] Adjuntar evidencia o anotar resultado de todos los casos.
- [ ] Registrar cualquier error con usuario, URL, hora de Asuncion y pasos de reproduccion, sin copiar credenciales ni PII.
- [ ] Actualizar `docs/checklist-produccion.md` solamente con los casos realmente aprobados.
- [ ] No hacer merge a `main` hasta aprobar landing publica, CRM preview y aislamiento visual de los tres roles.
