# Demo interna del CRM odontológico

Objetivo: validar el relato y el flujo operativo con el equipo interno. No es una demo a prospectos y no sustituye `docs/qa-manual-crm.md`.

## Estado del release 2026-08-21

- CRM Preview disponible: `https://crm-odontologia-staging-preview.vercel.app`.
- Landing Preview validada por HTTP: `https://sistema-dental-py-preview.vercel.app`.
- La landing de produccion no fue promovida.
- Auth URLs y QA visual por roles siguen pendientes; por lo tanto, la demo interna todavia no esta aprobada.

## Condiciones para hacerla

- Build y migraciones del mismo commit desplegados en staging.
- SQL verification y RLS real-users en PASS.
- Usuarios QA de DentalPro owner/admin, receptionist y QA Clinic B disponibles por canal seguro.
- Teléfonos y nombres exclusivamente sintéticos.
- Landing pública sólo se muestra si su deploy real ya pasó el bloque correspondiente de QA.
- Consola/Network abiertas para detectar errores, con tokens y datos sensibles redactados.

## Datos preparados

- Un teléfono único para formulario.
- Un teléfono único para `Nuevo lead`.
- Dos leads para probar doble reserva.
- Un appointment que pueda marcarse No Asistió.
- Una task pendiente.
- Una ventana privada adicional para QA Clinic B.

## Guion de 12–15 minutos

### 0. Qué necesita atención ahora

Abrir Dashboard y explicar que la pantalla prioriza leads calientes sin contactar, seguimientos vencidos, citas de hoy, no-shows y tareas atrasadas. Con owner/admin, usar `Ver impacto comercial` para conectar la operación diaria con Métricas. Entrar a `Seguimientos` para mostrar la cola agrupada por vencimiento y no por simple fecha de creación.

### 1. Entrada del lead

Mostrar una de estas entradas:

- formulario `/form/dentalpro` con consentimiento, o
- `Nuevo lead` con fuente `WhatsApp directo`.

En carga manual, mostrar que recepción elige fuente, tratamiento, urgencia, situación, responsable, próxima acción y fecha desde menús. Usar `Guardar lead` o `Guardar y agendar`; el objetivo operativo es completar el registro en menos de 45 segundos.

Explicar claramente la diferencia:

- formulario: crea lead, event, task, jobs y log de intake;
- manual: crea lead, event y task en transacción, sin jobs críticos.

No mostrar tokens completos ni paneles con secret/service role.

### 2. Score y prioridad

Abrir el lead y mostrar tratamiento, urgencia, clasificación y próxima acción. En formulario público, el intake calcula score/clasificación. En carga manual, recepción elige la clasificación; el score queda con el valor interno por defecto hasta que un admin lo ajuste. No presentarlo como cálculo automático.

### 3. Task

Mostrar la task inicial y su responsable. Completarla y abrir eventos para ver `task_completed`.

### 4. Agenda

Elegir día en el calendario, profesional y un slot disponible de 30 minutos. Mostrar los ocupados deshabilitados y que se sincronizan appointment, lead, event y task. Intentar la misma reserva activa para otro lead y mostrar el bloqueo de la RPC/DB.

### 5. No-show

Marcar un appointment `No Asistió`. Mostrar:

- estado del turno y lead;
- event `appointment_no_show`;
- próxima acción;
- task de recuperación para mañana 09:00 `America/Asuncion`.

Reprogramar para cerrar el relato de recuperación.

### 6. Métricas y roles

Con owner/admin, abrir la pestaña exacta `Métricas` y recorrer Captación, Seguimiento, Agenda, Conversión comercial y Valor percibido. Mostrar las tablas por fuente/tratamiento y `Valor potencial estimado`. Decir explícitamente que es una estimación interna y no ingreso confirmado, y que `Tratamiento iniciado` es el estado disponible más cercano a ganado.

Mostrar también Configuración y Archivado. Cambiar a receptionist y mostrar:

- `Nuevo lead`, Seguimientos, Agenda y completar task disponibles;
- Métricas, Configuración y Archivado ausentes;
- public forms/tokens no visibles.

### 7. Multi-clínica

Abrir QA Clinic B en otra ventana privada. Mostrar que sus dashboard, leads, agenda, tareas, responsables y configuración no contienen DentalPro. Crear un lead sintético en Clinic B y confirmar que no cambia DentalPro.

### 8. n8n no requerido

Cerrar con la arquitectura:

```text
Formulario -> lead-intake -> Postgres -> lead/event/task/jobs
Nuevo lead -> RPC autenticada -> Postgres -> lead/event/task
n8n futuro -> consume jobs después del guardado
```

El lead y la tarea existen antes de cualquier procesamiento n8n. No presentar automatizaciones de WhatsApp/Instagram como activas.

## Mensajes clave

- La clínica puede trabajar formularios y entradas directas desde el primer día.
- La recepción no puede elegir otra clínica ni acceder a configuración crítica.
- Agenda, no-show y completar tasks usan RPCs transaccionales.
- Marcar contacto y posponer seguimiento usa `save_lead_followup`, con event y tarea anti-duplicado.
- No hay hard delete operativo.
- El formulario público no envía `clinic_id` ni secretos.
- El piloto no es historia clínica ni integración automática con mensajería.

## Criterio de cierre

- [ ] El guion se completó sin errores de Console/Network.
- [ ] Cada transición quedó visible después de recargar.
- [ ] Los roles coincidieron con la matriz.
- [ ] El aislamiento multi-clínica quedó demostrado.
- [ ] No se expusieron credenciales, tokens completos ni PII real.
- [ ] Las dudas o defectos se registraron con pasos reproducibles.

Si la QA visual y el redeploy aún están pendientes, la decisión sigue siendo `A) Listo para QA manual visual`, no listo para prospectar.
## Escena: contacto enlazado

1. Abrir un lead caliente con tarea de contacto pendiente.
2. Mostrar el mensaje de WhatsApp prearmado desde el detalle del lead.
3. Volver a la CRM y elegir **Sí, respondió**.
4. Mostrar que el lead queda `Contactado`, la tarea inicial se completa y aparece un seguimiento futuro.
5. En otro lead, elegir **No respondió** y mostrar que el estado no cambia a `Contactado`.
6. Como owner/admin, abrir Configuración y mostrar las plantillas editables por clínica.

Mensaje comercial correcto: el sistema reduce pasos duplicados y mantiene oportunidades bajo seguimiento. No afirmar que envía WhatsApp automáticamente ni prometer pacientes o ingresos.
