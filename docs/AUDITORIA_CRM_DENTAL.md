# AUDITORÍA CRM DENTAL

> Fecha de auditoría: 24 de agosto de 2026  
> Alcance: repositorio completo, frontend estático, CRM React, integración Supabase, migraciones, Edge Function, seguridad, roles, automatizaciones documentadas, pruebas y experiencia de usuario.  
> Método: inspección de código y comandos de solo lectura. No se modificaron datos, Supabase, migraciones ni código durante la auditoría original.

## Convenciones del informe

- **HECHO:** comportamiento comprobado directamente en el código del repositorio.
- **RIESGO:** consecuencia probable derivada de ese comportamiento.
- **RECOMENDACIÓN:** propuesta futura; no está implementada.
- Cuando una capacidad no está presente se indica expresamente **NO EXISTE**.
- La auditoría describe el esquema esperado por las migraciones. No se consultó una base Supabase productiva ni se alteraron datos.

---

## 1. Rama analizada

* **rama:** `rebuild-new-supabase`
* **último commit relevante:** `287fa6a Add CRM retention insights and owner scorecard`
* **diferencias importantes frente a main:** la rama está 12 commits por delante y 0 por detrás de `main`. La comparación muestra 146 archivos diferentes, aproximadamente 14.456 inserciones y 2.786 eliminaciones. Incluye la reconstrucción de la CRM React, el nuevo esquema Supabase, RPC transaccionales, endurecimiento de RLS, seguimiento seguro, tareas de contacto enlazadas, insights de retención y scorecard del dueño. `main` termina en `a06b533 Update landing origin to Vercel and refresh QA tests` y no contiene la versión funcional más reciente de esta CRM.
* **estado del working tree:** limpio antes y después de la auditoría original. `git status --short --branch` devolvió `## rebuild-new-supabase...origin/rebuild-new-supabase`. `git diff --check` no encontró diferencias.

### Por qué esta es la rama correcta

**HECHO:** la rama actual ya era `rebuild-new-supabase`. Su historial contiene la serie coherente y más reciente de cambios específicos de la CRM: reconstrucción del frontend, nuevo backend Supabase, RPC operativos, seguridad multi-clínica, conexión entre contactos y tareas, métricas e insights para el dueño.

Se inspeccionaron también las ramas remotas. `origin/feature/production-edge-intake`, en `74378fc`, es anterior y divergente desde una base común; no contiene el conjunto completo de cambios posteriores de la CRM. Por eso no se hizo checkout, merge, rebase ni regreso a `main`: la rama actual era la referencia correcta.

---

## 2. Stack y arquitectura actual

### Stack

- Landing pública estática en [`index.html`](../index.html) y [`js/lead-intake-form.js`](../js/lead-intake-form.js).
- CRM como SPA con React 18 en [`crm-app`](../crm-app).
- Vite 7 como desarrollo y build.
- Tailwind CSS 3 como sistema principal de estilos.
- Motion 13 para animaciones; `MotionConfig` respeta la preferencia de movimiento reducido y CSS contempla `prefers-reduced-motion`.
- Iconos con Lucide.
- Cliente Supabase JS 2.45.
- Supabase Auth, Postgres, RLS, funciones RPC y Edge Function en Deno/TypeScript.
- Frontend escrito en JavaScript/JSX; **TypeScript en la CRM NO EXISTE**. La Edge Function sí utiliza TypeScript.

### Organización

- [`crm-app/src/App.jsx`](../crm-app/src/App.jsx) es el orquestador central: sesión, workspace, navegación, mutaciones, modales y coordinación entre páginas. Tiene aproximadamente 1.226 líneas y concentra demasiadas responsabilidades.
- Las páginas están separadas en `src/pages` y se cargan con `lazy`, lo cual es una base saludable.
- Hay componentes compartidos, modales, hooks, servicios y librerías de dominio separados.
- No se utiliza React Router. La pantalla activa vive en estado local `activeView`; el formulario público embebido se reconoce mediante una expresión regular sobre la URL.
- [`useClinicWorkspace.js`](../crm-app/src/hooks/useClinicWorkspace.js) carga el workspace una vez al iniciar y lo vuelve a pedir después de mutaciones locales.
- [`crmApi.js`](../crm-app/src/services/crmApi.js) ejecuta en paralelo siete consultas completas: `leads`, `appointments`, `tasks`, `profiles`, `clinic_settings`, `treatment_prices` y `message_templates`.
- **Paginación NO EXISTE. Realtime NO EXISTE. Polling NO EXISTE. Botón de actualización manual NO EXISTE.**
- No hay N+1 de red en esa carga porque las siete consultas se ejecutan por entidad; sí hay repetición de filtros y búsquedas en memoria, y `getLeadPriority` vuelve a recorrer tareas y citas para cada lead.

### Backend y seguridad

- El tenant se modela con `clinics`; el perfil autenticado determina la clínica.
- La base usa RLS y funciones auxiliares para membresía y roles.
- Los flujos sensibles de recepción se canalizan en buena medida por RPC.
- No se observó `service_role` expuesto al frontend. La Edge Function toma secretos desde variables del entorno.
- La arquitectura multi-clínica y el principio de derivar `clinic_id` desde la sesión son buenas bases que deben conservarse.
- `build.sourcemap` permanece en `false`.

### Calidad y pruebas

- Hay dos pruebas utilitarias de frontend ejecutables directamente con Node; ambas pasaron durante la auditoría.
- Existen scripts SQL y guías manuales de QA/RLS, pero no se ejecutaron contra una instancia real de Supabase.
- **Pruebas de componentes React NO EXISTEN. Pruebas end-to-end automatizadas NO EXISTEN.**
- **Script de lint NO EXISTE** en el frontend inspeccionado.
- No se ejecutó build: no había `node_modules`, instalar dependencias habría modificado el workspace y el usuario había prohibido cualquier cambio en la fase de auditoría. La primera invocación a `npm` fue además bloqueada por la política de ejecución de PowerShell antes de ejecutar el script.
- **Error boundary global NO EXISTE.**

### Diagnóstico arquitectónico breve

La arquitectura tecnológica es válida y no necesita una reescritura. El problema está en la coordinación del dominio: `lead`, `appointment` y `task` conservan partes de la misma verdad operativa, pero no todas las transiciones se realizan de forma atómica ni cierran el estado anterior. La interfaz expone esa fragmentación en lugar de traducirla a una única próxima acción.

---

## 3. Mapa actual de pantallas

| Pantalla | Archivo/ruta interna | Componentes principales | Datos principales | Propósito real actual |
| --- | --- | --- | --- | --- |
| Login | [`crm-app/src/components/Login.jsx`](../crm-app/src/components/Login.jsx) | formulario de acceso, feedback | Supabase Auth | autenticar al usuario |
| Dashboard | vista `dashboard`, [`DashboardPage.jsx`](../crm-app/src/pages/DashboardPage.jsx) | `PageHeader`, `StatCard`, alertas, cola priorizada | leads, citas, tareas, perfiles | mezclar resumen, riesgo y trabajo operativo |
| Leads | vista `leads`, [`LeadsPage.jsx`](../crm-app/src/pages/LeadsPage.jsx) | filtros, tarjetas, detalle, timeline, modales | leads, citas, tareas, perfiles, plantillas | administrar personas/oportunidades y todas sus acciones |
| Seguimientos | vista `followups`, [`FollowupsPage.jsx`](../crm-app/src/pages/FollowupsPage.jsx) | grupos por vencimiento, filtros, acciones | lead.next_followup_at, next_action y tareas abiertas | mostrar próximas acciones centradas en el lead |
| Agenda | vista `agenda`, [`AgendaPage.jsx`](../crm-app/src/pages/AgendaPage.jsx) | calendario, resumen diario, tarjetas de cita, acciones | appointments y leads | programar y registrar resultados de citas |
| Tareas | vista `tasks`, [`TasksPage.jsx`](../crm-app/src/pages/TasksPage.jsx) | filtros/listado, prioridad, completar | tasks, leads, appointments | administrar unidades internas de trabajo |
| Métricas | vista `metrics`, adminOnly, [`MetricsPage.jsx`](../crm-app/src/pages/MetricsPage.jsx) | resumen, embudo, fuentes, tratamientos, responsables, reportes | leads, appointments, tasks, treatment_prices, profiles | análisis comercial del dueño/administrador |
| Configuración | vista `settings`, adminOnly, [`SettingsPage.jsx`](../crm-app/src/pages/SettingsPage.jsx) | datos de clínica, plantillas, integraciones/configuración visible | profile, clinic settings, templates | mostrar configuración y editar plantillas disponibles |
| Formulario público React | ruta detectada manualmente, [`PublicEmbedLeadForm.jsx`](../crm-app/src/features/public-form/PublicEmbedLeadForm.jsx) | formulario de captación | Edge Function `lead-intake` | ingresar consultas desde páginas públicas |
| Formulario landing | landing raíz, [`index.html`](../index.html), [`lead-intake-form.js`](../js/lead-intake-form.js) | modal/formulario estático | Edge Function `lead-intake` | captación pública fuera de la SPA |

### Navegación

La navegación se define en [`constants.js`](../crm-app/src/lib/constants.js): Dashboard, Leads, Seguimientos, Agenda, Tareas, Métricas y Configuración. Métricas y Configuración son `adminOnly`; recepción sigue viendo cinco módulos operativos.

**HECHO:** no hay rutas reales por módulo; cambiar de pantalla cambia estado interno. Esto simplifica la implementación actual, pero impide enlaces profundos, historial del navegador por pantalla y una estructura de navegación más robusta.

---

## 4. Mapa de entidades

### Relaciones principales

```text
clinics
├── profiles ── auth.users
├── leads
│   ├── appointments
│   ├── tasks
│   ├── lead_events
│   └── messages
├── treatment_prices
├── message_templates
├── clinic_settings
├── clinic_public_forms
│   └── form_submission_logs
├── automation_jobs
├── audit_logs
├── daily_reports
└── campaigns
```

### Entidades observadas

#### Clínicas y responsables

- `clinics`: tenant principal.
- `profiles`: usuario de la clínica, enlazado a `auth.users`, con rol y estado activo.
- `leads.assigned_to` y `tasks.assigned_to` apuntan a `auth.users`.
- **RIESGO:** el FK no garantiza por sí solo que el usuario asignado pertenezca a la misma clínica. El RPC de creación manual sí lo valida, pero una actualización administrativa directa depende de RLS y de que el cliente envíe un valor correcto.

#### Pacientes/leads

- `leads` es simultáneamente persona, consulta y oportunidad comercial.
- Contiene identidad, contacto, tratamiento, origen, situación, evaluación, urgencia, score, clasificación, estado comercial, estimación, responsable, notas, intentos, última interacción, próxima acción, próxima fecha, pérdida y archivado.
- No existe una entidad separada `patients`; hoy `lead` cumple ese papel operativo.
- El tratamiento se guarda como texto; no es FK a un catálogo.

#### Citas

- `appointments` pertenece a un lead y a una clínica.
- Tiene fecha, hora, tipo/tratamiento, profesional textual, estado y notas.
- Existe protección contra doble reserva mediante índice/validación en RPC.
- `doctor_assigned` es texto. **Entidad estructurada de profesionales NO EXISTE.**

#### Seguimientos

- **Tabla `followups` NO EXISTE.**
- El concepto se representa con `leads.next_action` + `leads.next_followup_at` y, frecuentemente, con una fila relacionada en `tasks`.
- La página Seguimientos deriva su lista combinando esos campos con la siguiente tarea abierta.

#### Tareas

- `tasks` pertenece a clínica y normalmente a lead.
- Tiene título, descripción, tipo, estado, prioridad, vencimiento, responsable, creador y datos de finalización.
- Tipos observados: `contact`, `contact_lead`, `initial_contact`, `follow_up_contact`, `manual_contact`, `followup`, `confirm`, `attendance`, `no_show_recovery`, `cancelled_recovery`; una tarea manual puede tener `type = null`.
- Estados y prioridades admiten variantes de mayúsculas/minúsculas por compatibilidad histórica.

#### Eventos y auditoría

- `lead_events` registra el historial comercial.
- `audit_logs` registra operaciones sensibles.
- Esta separación es útil y debe conservarse como historial inmutable, no como otra pantalla operativa independiente.

#### Tratamientos y precios

- `treatment_prices` ofrece precio estimado por tratamiento y clínica.
- `clinic_settings.treatment_prices` también existe como JSONB: hay duplicación de configuración potencial.
- La Edge Function mantiene además importes estimados codificados por tratamiento.

#### Presupuestos

- **Tabla o entidad de presupuestos reales NO EXISTE.**
- **Estado de presupuesto individual NO EXISTE.**
- **Monto cotizado histórico NO EXISTE.**
- **Ingreso/cobro real NO EXISTE.**
- Solo existen `leads.estimated_value`, `treatment_prices.estimated_price`, el estado `Presupuesto Enviado` y tareas textuales de seguimiento.

#### Otras entidades

- `clinic_public_forms` y `form_submission_logs`: formularios públicos, token, actividad, rate limit y trazabilidad.
- `automation_jobs`: cola que la Edge Function alimenta para automatizaciones.
- `daily_reports`, `campaigns` y `messages`: existen en esquema, pero la CRM actual no los consume como módulos funcionales completos.
- La integración n8n activa está documentada, pero el worker ejecutable no vive en este repositorio. Hay un flujo antiguo/deprecado que no debe reactivarse sin rediseño.

---

## 5. Problemas críticos encontrados

| Problema | Evidencia en código | Archivo | Impacto | Prioridad |
| --- | --- | --- | --- | --- |
| Las consultas públicas nuevas no aparecen en una sesión CRM ya abierta | El workspace carga al iniciar y tras mutaciones locales; no hay Realtime, polling ni refresh manual | [`useClinicWorkspace.js`](../crm-app/src/hooks/useClinicWorkspace.js), [`crmApi.js`](../crm-app/src/services/crmApi.js) | Recepción puede no ver una consulta urgente hasta recargar manualmente | **P0** |
| Alta pública no transaccional | La Edge Function inserta/actualiza lead y luego crea evento, tarea y jobs por operaciones separadas; errores secundarios solo se registran en consola y se devuelve éxito | [`lead-intake/index.ts`](../supabase/functions/lead-intake/index.ts) | Puede existir lead sin tarea/evento/automatización aunque el formulario informe éxito | **P0** |
| La alta pública deja lead y tarea sin encargado | No se asigna `assigned_to` en la inserción pública | [`lead-intake/index.ts`](../supabase/functions/lead-intake/index.ts) | Viola la regla “toda oportunidad abierta tiene encargado” y permite consultas invisibles operativamente | **P0** |
| Un lead existente no se puede reasignar desde la interfaz | El selector se deshabilita cuando no es creación y `assigned_to` no está en campos editables | [`LeadFormModal.jsx`](../crm-app/src/components/modals/LeadFormModal.jsx), [`crmDomain.js`](../crm-app/src/lib/crmDomain.js) | Un lead público sin responsable puede quedar así indefinidamente | **P0** |
| Transiciones de agenda sin máquina de estados | La UI muestra Confirmar, Asistió y No asistió en casi cualquier estado; RPC admite el resultado sin validar estado anterior ni que la fecha haya ocurrido | [`AgendaPage.jsx`](../crm-app/src/pages/AgendaPage.jsx), [`20260821180858_rebuild_new_supabase_production_schema.sql`](../supabase/migrations/20260821180858_rebuild_new_supabase_production_schema.sql) | Estados regresivos o contradictorios: Asistió → Confirmado, futuro → Asistió, Confirmado → No asistió | **P0** |
| Las transiciones no cierran tareas anteriores | Agendar, confirmar, asistencia y no-show crean tareas contextuales sin cerrar siempre contacto/confirmación/asistencia previas | [`App.jsx`](../crm-app/src/App.jsx), RPC de agenda en la migración de reconstrucción | Una misma oportunidad queda con varias tareas abiertas que representan pasos ya superados | **P0** |
| Completar tarea genérica no sincroniza el lead | `complete_task` marca la tarea hecha, pero no limpia/actualiza `lead.next_action` ni `next_followup_at` | [`20260821180858_rebuild_new_supabase_production_schema.sql`](../supabase/migrations/20260821180858_rebuild_new_supabase_production_schema.sql) | El seguimiento continúa apareciendo vencido aunque la tarea se haya completado | **P0** |
| Cierre terminal incompleto | `mark_lead_lost` cancela solo familias de contacto/seguimiento; iniciar tratamiento por actualización directa no limpia próximas acciones ni todas las tareas | [`20260822230000_add_retention_insights.sql`](../supabase/migrations/20260822230000_add_retention_insights.sql), [`App.jsx`](../crm-app/src/App.jsx) | Leads perdidos o ganados pueden conservar trabajo operativo abierto | **P0** |
| Reenvío del formulario puede reabrir lógicamente un lead terminal | Dedupe por teléfono actualiza score/clasificación/valor y puede crear tarea sin excluir Perdido, Archivado o Tratamiento Iniciado | [`lead-intake/index.ts`](../supabase/functions/lead-intake/index.ts) | Historial terminal contaminado y tareas nuevas sobre oportunidades cerradas | **P0** |
| La fuente de verdad de “próxima acción” está duplicada | Existen campos en lead y filas en tasks; las sincronizaciones cubren algunos flujos, no todos | [`FollowupsPage.jsx`](../crm-app/src/pages/FollowupsPage.jsx), [`20260822120000_secure_followup_workflow.sql`](../supabase/migrations/20260822120000_secure_followup_workflow.sql) | Desincronización y decisiones ambiguas sobre qué debe hacer recepción | **P0** |
| Métricas ejecutivas mezclan cohortes y unidades | El período filtra por `created_at`; asistencia usa citas creadas en período, “tratamiento iniciado” usa leads creados en período con estado actual y Perdido se presenta como etapa posterior | [`MetricsPage.jsx`](../crm-app/src/pages/MetricsPage.jsx) | El dueño puede tomar decisiones sobre un embudo matemáticamente engañoso | **P1** |
| Valor potencial parece dinero real | Se suma `estimated_value` o precio estándar, no un presupuesto emitido | [`MetricsPage.jsx`](../crm-app/src/pages/MetricsPage.jsx), [`lead-intake/index.ts`](../supabase/functions/lead-intake/index.ts) | Riesgo comercial y de confianza: una estimación puede interpretarse como facturación o pipeline real | **P1** |
| Carga completa sin paginación ni actualización incremental | Siete `select *` completos y recálculo cliente después de mutaciones | [`crmApi.js`](../crm-app/src/services/crmApi.js), [`useClinicWorkspace.js`](../crm-app/src/hooks/useClinicWorkspace.js) | Rendimiento decreciente a medida que crece la clínica | **P1/P2** |

### Fortalezas que reducen el riesgo

- El alta manual por RPC es transaccional, deriva clínica del usuario, valida el responsable dentro de la clínica y crea lead, evento, tarea y auditoría en una operación.
- Los flujos específicos de contacto (`complete_contact_task` y `mark_lead_contacted`) sincronizan mejor lead y tareas que el flujo genérico.
- El RPC de agenda protege doble reserva.
- RLS, auditoría, eventos y ausencia de borrado físico son buenas defensas.

---

## 6. Duplicaciones

### Seguimientos vs Tareas

#### ¿Un seguimiento genera también una tarea?

**Sí, en varios flujos.** `save_lead_followup` actualiza `lead.next_action`/`next_followup_at` y crea o actualiza una tarea. Agendar, marcar contacto, registrar no respuesta, no-show y otros resultados también pueden producir tareas.

#### ¿Una tarea puede representar un seguimiento?

**Sí.** Los tipos `followup`, `follow_up_contact`, `contact`, `no_show_recovery` y otros representan una acción futura. Una tarea manual también puede cumplir ese propósito aunque carezca de tipo.

#### ¿Hay datos duplicados?

**Sí.** Título/acción, vencimiento y responsable pueden existir simultáneamente en:

- `leads.next_action`;
- `leads.next_followup_at`;
- `leads.assigned_to`;
- `tasks.title`;
- `tasks.due_at`;
- `tasks.assigned_to`.

#### ¿Se pueden desincronizar?

**Sí.** No todas las mutaciones usan el mismo RPC. Completar una tarea genérica no actualiza el lead. Cambiar el lead desde administración puede hacer update, evento y sincronización en llamadas separadas. Agendar no cierra todas las tareas anteriores. Los estados terminales no cancelan todas las familias de tarea.

#### ¿Qué ocurre si completo uno pero no el otro?

- Si se completa una tarea genérica, el lead puede seguir mostrando una próxima fecha vencida.
- Si se cambia el seguimiento del lead, `save_lead_followup` intenta sincronizar una tarea, pero cuando no recibe tipo explícito elige una tarea abierta priorizada; puede no ser la que el usuario imaginó.
- Si se completa una tarea de contacto por el flujo específico, la sincronización es mejor y obliga a registrar resultado.

#### ¿Hay lógica repetida?

Sí: selección de tarea activa, clasificación de vencimiento, fecha efectiva, prioridad y terminalidad se calcula en `App.jsx`, `DashboardPage`, `FollowupsPage`, `TasksPage`, `MetricsPage`, `commercialInsights.js` y RPC SQL.

#### ¿Qué depende de cada entidad?

- `lead.next_*`: Dashboard, Seguimientos, Leads, navegación, métricas, prioridad.
- `tasks`: Dashboard, Seguimientos, Tareas, Métricas, timeline, contadores y automatizaciones.
- Los dos conceptos alimentan la misma pregunta operativa.

#### ¿Se puede ocultar la complejidad sin eliminar las tablas?

**Sí, y es la estrategia recomendada.** Mantener `tasks` como mecanismo interno auditable y construir una proyección canónica de “próxima acción” por oportunidad. Recepción vería una sola cola y una sola acción; el backend resolvería qué tarea/campos/eventos actualizar.

### Scoring vs semáforo vs urgencia

Hoy conviven:

1. `score` numérico calculado en entrada pública o editable por admin.
2. `classification`: Lead Caliente/Medio/Frío, automática en alta pública o manual en alta/edición.
3. `urgency`: respuesta declarada en el formulario.
4. prioridad de tarea: baja/media/alta/urgente.
5. semáforo derivado `urgent`, `attention`, `controlled`, `closed`.
6. seguimiento/tarea vencidos.

El semáforo usa clasificación, fechas, tareas, no-show, texto urgente, falta de responsable y cita del día; **no usa directamente `score`**. Por eso el score y el semáforo pueden contradecirse sin estar técnicamente “mal”: miden cosas diferentes, pero la UI no explica esa diferencia.

### Estados duplicados

- `lead.status = No Respondió` y un resultado de contacto `no_response` no siempre producen exactamente los mismos timestamps/efectos.
- `lead.status = Consulta Agendada` y `appointment.status = Agendado` modelan el mismo avance desde dos entidades.
- `lead.status = Confirmado/Asistió/No Asistió` repite el outcome de la cita.
- `lead.status = Archivado` y `leads.is_archived` modelan archivado por campo y bandera.
- Estado de tarea “vencida” puede ser almacenado o derivado por `due_at`, y admite variantes de casing.

### Dashboard vs módulos individuales

Un seguimiento vencido puede aparecer simultáneamente como:

1. alerta de riesgo del Dashboard;
2. tarjeta/contador del Dashboard;
3. elemento de la cola del Dashboard;
4. fila en Seguimientos;
5. tarea abierta/vencida en Tareas;
6. badge/fecha en Leads y contador de navegación.

Es el mismo problema presentado entre tres y seis veces.

### Métricas repetidas

- Seguimientos vencidos, tareas abiertas, leads sin contactar y oportunidades “en riesgo” son cortes parcialmente solapados.
- Calientes/medios/fríos y prioridad derivada compiten como indicadores de atención.
- `activeLeads`, tareas abiertas, followups pendientes y “protegidos” cuentan universos superpuestos.
- “Recuperaciones no-show” se cuenta como recuperada si existe una tarea de recuperación, aunque aún no haya recuperación real.

---

## 7. Auditoría por pantalla

### Dashboard

#### Qué consulta y muestra

Usa leads, citas, tareas y perfiles ya cargados en el workspace. Calcula seguimientos vencidos, citas de hoy, tareas vencidas, no-shows históricos, leads sin responsable, alertas de riesgo y una cola ordenada por prioridad. La cola toma una razón derivada del lead y una tarea abierta elegida por separado.

**RIESGO:** la tarea mostrada puede no ser la que originó la razón prioritaria; completarla puede no resolver el problema que el texto anuncia.

#### Conservar:

- Una vista inicial orientada a la acción.
- Citas del día.
- Alertas de falta de respuesta, vencimiento, no-show y ausencia de responsable.
- Botón directo a WhatsApp y registro de resultado.
- Estados de carga, error y vacío.

#### Simplificar:

- Sustituir las múltiples tarjetas y listas por una única cola priorizada con un elemento por oportunidad.
- Traducir prioridad a “Atender ahora”, “Atender hoy” y “Puede esperar”.
- Mostrar una explicación humana, no una combinación de badges.
- Para recepción, reducir el resumen numérico a lo necesario para trabajar hoy.
- Corregir `noShows`: hoy cuenta todas las citas con estado no-show, no solo casos aún pendientes de recuperación.

#### Eliminar:

- Duplicación entre alerta, stat y fila para el mismo seguimiento/tarea.
- Clasificación caliente/media/fría visible cuando la prioridad ya explica qué hacer.
- Métricas históricas o ejecutivas en el Inicio de recepción.

#### Agregar:

- Actualización en tiempo real o polling confiable.
- Resultado único y contextual: Agendó, No respondió, Volver a contactar, Presupuesto pendiente, Aceptó tratamiento, No continuará.
- Indicador claro de nuevas consultas no atendidas.
- Propiedad garantizada: encargado y próxima acción.

### Leads/Pacientes

#### Información y carga cognitiva actual

Cada tarjeta muestra nombre/teléfono, hasta tres badges principales —prioridad, clasificación y estado— y seis bloques informativos: tratamiento, fuente, responsable, próxima acción, próximo seguimiento y alta. Para administración puede ofrecer hasta nueve controles: ver detalle, contactado, agendar, WhatsApp, copiar mensaje, crear tarea, editar, selector de estado y archivar. Recepción puede ver hasta seis.

El detalle agrega doce o más campos, tres badges, timeline y controles adicionales.

#### Conservar:

- Búsqueda por identidad/contacto.
- Tratamiento, teléfono, encargado y próxima acción.
- Acceso al historial comercial.
- WhatsApp y agenda.
- Archivado sin borrado físico.
- Motivo estructurado al marcar pérdida.

#### Simplificar:

- Cambiar el foco visual de “qué es el lead” a “qué hay que hacer”.
- Reducir la tarjeta a persona, tratamiento/presupuesto, motivo de atención y dos acciones principales.
- Mover edición, archivo, tarea manual y campos técnicos a menú secundario/detalle.
- Reemplazar el selector libre de estado por resultados guiados que actualicen el dominio.
- Ocultar score, clasificación y valor estimado a recepción.
- Reorganizar filtros: visibles búsqueda, estado y tratamiento; fuente, encargado, clasificación, fecha, prioridad y orden dentro de “Más filtros”. Hoy hay búsqueda, siete selects avanzados, cuatro filtros rápidos para admin y ordenamiento: hasta trece controles.

#### Eliminar:

- Badges redundantes en la tarjeta.
- Botón separado “Contactado” si “Registrar resultado” cubre contacto y consecuencia.
- Crear tarea como decisión cotidiana de recepción.
- Selector de todos los estados comerciales en cada tarjeta.
- “Valor potencial” sin la palabra “estimado” y sin explicar su fuente.

#### Agregar:

- Reasignación segura de encargado para leads existentes.
- Registro universal de resultado.
- Presupuesto real cuando exista la entidad.
- Validación de oportunidad abierta sin encargado/próxima acción.
- Vistas guardadas o filtros avanzados solo si la evidencia de uso los justifica.

### Seguimientos

#### Comportamiento actual

Combina `lead.next_followup_at` con la próxima tarea abierta. Da siempre preferencia a la fecha del lead aunque exista una tarea anterior. Agrupa Vencidos, Para hoy, Próximos 7 días, No-shows y Sin fecha. La regla de bucket evalúa no-show antes que vencimiento; un no-show vencido puede terminar en el grupo No-shows, después de Próximos 7 días, aunque la prioridad derivada sea urgente. En escritorio muestra siete filtros visibles.

#### Conservar:

- La lógica de vencimientos.
- Agrupación temporal.
- Razón humana de la acción.
- Acciones rápidas.

#### Simplificar:

- Convertirlo conceptualmente en la proyección “Próxima acción”.
- Elegir una fecha efectiva canónica y una tarea canónica, no mezclar por precedencia accidental.
- Reducir filtros y badges.
- Resolver primero vencimiento y luego subtipo no-show.

#### Fusionar:

- Fusionar la experiencia visible con Tareas y la cola del Dashboard.
- No borrar inicialmente `tasks`; fusionar el concepto de interfaz.

#### Eliminar:

- Módulo separado para recepción cuando la cola única esté validada.
- Campos técnicos y filtros de clasificación no necesarios para ejecutar la acción.

### Agenda

#### Conservar:

- La Agenda como módulo principal.
- Vista mensual + detalle del día.
- Protección de doble reserva.
- Relación con lead.
- Estados Confirmado, Asistió, No asistió y Reprogramado.
- Creación/edición mediante RPC.

#### Simplificar:

- Mostrar acciones según estado y tiempo:
  - Agendada y futura: Confirmar, Reprogramar, Cancelar.
  - Confirmada y futura: Reprogramar, Cancelar; no volver a mostrar Confirmar.
  - Cita ocurrida: Asistió, No asistió, Reprogramar.
  - Asistió: siguiente acción comercial, no acciones de cita anteriores.
  - No asistió: Reprogramar o registrar que no continuará.
- Corregir tarjetas “Confirmadas”, “No-shows” y “Reprogramaciones”: hoy cuentan todo el historial, no el período/día visible.
- Usar mensajes de WhatsApp con contexto real de cita. El botón actual arma una URL sin pasar siempre el contexto/plantilla específica y no registra resultado.
- Derivar horarios de `clinic_settings.opening_hours`; hoy los slots están codificados como 08:00–12:00 y 14:00–18:00 y la propia UI reconoce esa limitación.

#### Agregar:

- Máquina de estados en backend.
- Validación de que Asistió/No asistió solo se registre cuando corresponda.
- Cierre automático de tareas de confirmación al confirmar o registrar resultado.
- Recuperación explícita de no-show con dueño y fecha.
- Opción Cancelar visible si el backend la soporta.
- Próxima acción posterior a asistencia: presupuesto, seguimiento o tratamiento iniciado.

#### Qué pasa técnicamente hoy

- **Asistió:** la cita y el lead pasan a Asistió; se propone “Enviar presupuesto o iniciar tratamiento” y puede crearse tarea de seguimiento. No existe presupuesto real. Tareas anteriores pueden quedar abiertas.
- **No asistió:** cita y lead pasan a No Asistió; se crea tarea de recuperación y próxima acción de reprogramar. Esa tarea no queda necesariamente asignada. Si se completa sin reprogramar, el lead puede conservar estado/fecha desincronizados.
- **Reprogramó:** actualiza/crea cita y cambia lead a Consulta Agendada con acción de confirmación. Puede conservar `next_followup_at` anterior por uso de `coalesce`, y no necesariamente cierra trabajo previo.

### Tareas

#### Conservar:

- Entidad interna para ejecución, auditoría, responsable, vencimiento y automatización.
- Capacidad administrativa de tarea manual para excepciones.
- RPC de completar y permisos RLS.

#### Fusionar:

- Fusionar su presentación diaria con Seguimientos e Inicio bajo “Próximas acciones”.
- Hacer que cada resultado comercial cierre/reemplace tareas automáticamente.

#### Eliminar:

- Módulo independiente para recepción una vez que exista cola canónica.
- Decisión cotidiana de elegir tipo/estado/prioridad de tarea.
- Variantes visibles de casing y terminología técnica.

### Métricas

#### Problemas de cálculo

- “Esta semana” es una ventana móvil de siete días, no semana calendario; “semana anterior” son días 7–14.
- Citas del período se filtran por `appointments.created_at`, no por fecha de cita ni timestamp del outcome.
- Tratamientos iniciados cuentan leads creados en el período cuyo estado actual es Tratamiento Iniciado, no transiciones ocurridas en el período.
- El embudo usa leads únicos para agendados pero cantidad de registros de citas para asistencias.
- `Perdido` se agrega como sexta etapa después de ganado, aunque es una salida lateral y usa otra cohorte.
- `activeLeads` excluye archivados, pero incluye Perdido y Tratamiento Iniciado.
- Salud comercial se vuelve crítica con más de tres leads calientes del período, aunque estén atendidos o cerrados.
- “Recuperación no-show” se atribuye por existencia de tarea o cita posterior; crear automáticamente la tarea ya puede inflar la métrica.
- “Seguimientos recuperados” infiere causalidad por tarea completada + estado actual; no demuestra que esa tarea causó el avance.
- “High ticket” usa palabras clave, no un umbral monetario.
- Respuesta usa `last_contact_at`, campo que no representa lo mismo en todos los flujos.

#### Conservar — A. Fundamental para el dueño:

- Consultas ingresadas.
- Contactadas, después de corregir definición temporal.
- Agendadas, por oportunidad única.
- Asistieron, por fecha/outcome correcto.
- Iniciaron tratamiento, mediante evento/transición fechada.
- Punto de caída del embudo.
- Sin contacto y acciones vencidas.
- Motivos de pérdida.
- Presupuestos abiertos, aceptados, rechazados y en riesgo cuando exista dato real.
- Una lista breve de oportunidades que requieren atención.

#### Mover — B. Útil pero secundaria:

- Tiempo medio de respuesta.
- Fuentes.
- Demanda por tratamiento.
- Tasas de asistencia, no-show y reprogramación.
- Actividad por responsable/equipo.
- Reporte semanal.
- Seguimientos completados.
- Estimación de valor por tratamiento, claramente rotulada y fuera del headline.

#### Ocultar:

- Métricas ejecutivas completas para recepción.
- Detalle de rendimiento de responsables a quienes no administran el equipo.
- Score/clasificación agregada en el resumen principal del dueño.

#### Eliminar — C. Ruido o cálculo engañoso:

- “Activos” con la definición actual.
- Calientes/medios/fríos como tres KPI principales.
- Tareas abiertas y seguimientos pendientes como KPI separados si miden la misma cola.
- “Seguimientos recuperados” como causalidad.
- “Recuperaciones no-show” con la fórmula actual.
- “Manual tracked”, “protegidos” y high-ticket por palabra clave como indicadores ejecutivos.
- Valor potencial como dinero principal.
- Perdido como último escalón secuencial del embudo.

#### Agregar:

- Cohortes y timestamps de transición bien definidos.
- Embudo de oportunidad única.
- Presupuestos reales y dinero en riesgo con lenguaje no contable.
- Explicación/tooltip de fórmula y período.
- Comparación temporal homogénea.

### Configuración

#### Conservar:

- Separación por rol.
- Plantillas de mensajes.
- Información de clínica y settings cargados desde Supabase.
- Políticas RLS de modificación administrativa.

#### Simplificar:

- Organizar por secciones comprensibles: Clínica, Equipo y permisos, Tratamientos y valores de referencia, Horarios, Mensajes, Captación.
- Resolver la duplicación entre tabla `treatment_prices` y JSONB de `clinic_settings`.
- Hoy los datos de clínica son principalmente de solo lectura; **gestión completa de usuarios, precios y horarios NO EXISTE en la interfaz**.
- No mostrar configuración técnica de automatizaciones a recepción.

---

## 8. Flujo real actual del paciente

```text
Nueva consulta
↓
Lead creado / deduplicado
↓
Intento de contacto
├── No respondió → nuevo intento / seguimiento
└── Respondió
    ↓
    Consulta agendada
    ↓
    Confirmada
    ↓
    Resultado de cita
    ├── No asistió → recuperación / reprogramación
    └── Asistió
        ↓
        “Presupuesto Enviado” como estado, sin presupuesto real
        ↓
        Tratamiento Iniciado o Perdido
```

### Flujo A — Consulta nueva

#### Desde formulario público

1. El formulario llama a la Edge Function `lead-intake`.
2. Se valida origen/token, consentimiento, formato y controles de abuso.
3. Se busca duplicado por teléfono.
4. Se calcula score, clasificación y valor estimado con reglas codificadas.
5. Se crea o actualiza lead.
6. Se intenta insertar evento, tarea de contacto y jobs de automatización.

**Problemas:** no es una única transacción, no se asigna encargado y una CRM ya abierta no recibe el nuevo lead automáticamente.

#### Desde alta manual en CRM

El RPC `create_manual_lead` deriva la clínica del perfil, valida el responsable, usa al usuario actual como responsable por defecto y crea lead, evento, tarea y auditoría transaccionalmente. Este es el patrón que debería extenderse, no reemplazarse.

### Flujo B — No responde

Hay dos caminos:

- Modal de resultado `No respondió`: completa/actualiza tarea de contacto y programa reintento, pero conserva el estado anterior del lead y no siempre actualiza `last_contact_at` de la misma forma.
- Cambio manual a estado `No Respondió`: pasa por `save_lead_followup`, establece estado/fecha y puede producir otra semántica.

El caso vuelve a aparecer por tarea o `next_followup_at`. Puede quedar desincronizado si se completa la tarea genérica sin limpiar el lead. No desaparece necesariamente, pero puede reaparecer con una razón antigua o quedar en el módulo equivocado.

### Flujo C — Agenda una cita

`schedule_lead_appointment` crea o actualiza la cita, lleva el lead a `Consulta Agendada`, define `Confirmar asistencia`, crea evento/auditoría y tarea de confirmación. Protege doble reserva.

**Inconsistencias:** la tarea puede quedar sin asignar, las tareas de contacto anteriores no se cierran y `next_followup_at` previo puede quedar desalineado.

### Flujo D — Confirma

El outcome cambia cita y lead a Confirmado y la siguiente acción a esperar asistencia. No hay validación estricta del estado previo y pueden sobrevivir tareas de confirmación o contacto antiguas.

### Flujo E — Asiste

La cita y el lead pasan a Asistió. Se plantea “Enviar presupuesto o iniciar tratamiento” y se genera trabajo de seguimiento. **Presupuesto estructurado NO EXISTE**, por lo que el flujo posterior depende de estado, nota, fecha y tarea. El paciente puede quedar sin una próxima acción coherente si las llamadas parciales fallan o se completa la tarea equivocada.

### Flujo F — No-show

La cita y el lead pasan a No Asistió. Se crea recuperación y se solicita reprogramar. El caso aparece por prioridad/no-show/tarea/seguimiento. Puede quedar olvidado si la tarea no tiene responsable; si se completa sin reprogramar, no necesariamente se resuelve el estado del lead.

### Flujo G — Presupuesto pendiente

Hoy existe:

- estado `Presupuesto Enviado`;
- `estimated_value`;
- próxima acción textual;
- tarea de seguimiento de presupuesto.

Esto no es suficiente para saber monto real, fecha, profesional, vigencia, aceptación, rechazo ni múltiples presupuestos.

### Flujo H — Acepta tratamiento

La situación se representa con `lead.status = Tratamiento Iniciado`. No hay presupuesto aceptado ni ingreso real. Al cambiar directamente el estado pueden quedar tareas y próximas acciones abiertas.

### Flujo I — No continúa

Se representa como `Perdido`, mediante `mark_lead_lost`. Se exige un motivo y puede conservarse nota; esto permite análisis de pérdidas. El RPC limpia próxima acción/fecha y cancela tareas de contacto/seguimiento, pero no todas las familias contextuales.

### Evaluación de la regla fundamental

> Toda oportunidad abierta debe tener un encargado y una próxima acción.

El sistema está conceptualmente cerca porque ya contiene `assigned_to`, `next_action`, `next_followup_at`, tasks, automatizaciones y alertas. Sin embargo, **la regla no se cumple actualmente**:

- la entrada pública crea leads sin responsable;
- la tarea pública también puede quedar sin responsable;
- no se puede reasignar un lead existente desde la UI;
- un lead puede no tener próxima acción/fecha;
- una mutación parcial puede crear lead sin tarea;
- tareas y campos del lead pueden desincronizarse;
- cierre terminal no limpia siempre todo el trabajo abierto.

La solución futura debe ser transaccional y de backend, no una simple advertencia visual.

---

## 9. Estados actuales

| Estado/campo | Tabla | Uso | Automático/manual | Problema |
| --- | --- | --- | --- | --- |
| `Nuevo` | leads.status | consulta recién ingresada | ambos | se solapa con `No Contactado` |
| `No Contactado` | leads.status | aún no hubo intento/contacto | ambos | distinción con Nuevo poco útil para recepción |
| `Contactado` | leads.status | se registró contacto | automático o manual | no expresa si respondió |
| `Respondió` | leads.status | contacto con respuesta | resultado/manual | puede coexistir con tareas antiguas |
| `Consulta Agendada` | leads.status | existe cita activa | RPC/manual | duplica appointment Agendado |
| `Confirmado` | leads.status | cita confirmada | outcome/manual | duplica appointment Confirmado |
| `Asistió` | leads.status | cita asistida | outcome/manual | duplica appointment Asistió; no obliga presupuesto/próxima acción |
| `Presupuesto Enviado` | leads.status | indica presupuesto de forma nominal | manual | no hay entidad ni monto real asociado |
| `Tratamiento Iniciado` | leads.status | cierre ganado | manual | no timestamp de transición específico ni presupuesto aceptado/ingreso; puede dejar tareas |
| `No Respondió` | leads.status | intento fallido | manual/RPC según camino | dos caminos con efectos diferentes |
| `Perdido` | leads.status | no continúa | RPC | tareas no relacionadas con contacto pueden quedar abiertas |
| `Reactivar 30d` | leads.status | intención de recontacto | manual | mezcla estado comercial con instrucción temporal |
| `No Asistió` | leads.status | no-show | outcome/manual | duplica appointment; puede persistir tras completar tarea |
| `Archivado` | leads.status | fuera de vistas activas | RPC admin | duplica `is_archived` |
| `is_archived` | leads | bandera de archivado | RPC admin | doble fuente con status Archivado |
| `lost_reason`, `lost_at`, `lost_by` | leads | cierre perdido y análisis | RPC | buena estructura; debe mantenerse sincronizada con status |
| `score` | leads | puntaje de intención | automático en intake/manual admin | no usa threshold configurable y no alimenta directamente el semáforo |
| `classification` Caliente/Medio/Frío | leads | temperatura comercial | automático/manual | visible junto con prioridad y urgencia; puede contradecirlas |
| `urgency` | leads | respuesta del formulario | manual por paciente/operador | se interpreta también por texto en prioridad |
| `next_action` | leads | resumen de trabajo siguiente | ambos | duplica task.title |
| `next_followup_at` | leads | fecha de seguimiento | ambos | duplica task.due_at |
| `assigned_to` | leads | encargado de oportunidad | manual/RPC | público queda null; UI no reasigna existente |
| `Agendado` | appointments.status | cita creada | RPC | lead usa Consulta Agendada |
| `Confirmado` | appointments.status | cita confirmada | outcome | transición insuficientemente validada |
| `Asistió` | appointments.status | asistencia positiva | outcome | puede marcarse antes de tiempo/regresar luego |
| `No Asistió` | appointments.status | no-show | outcome | crea recuperación, no garantiza resolución |
| `Reprogramado` | appointments.status | cita movida | RPC | puede conservar fecha de seguimiento antigua |
| `Cancelado` | appointments.status | cita cancelada | backend | opción visible completa NO EXISTE en Agenda |
| `Pendiente` | appointments.status | valor histórico permitido | legado/manual | no es el principal usado por UI |
| `Consulta Agendada` | appointments.status | valor permitido por compatibilidad | legado | duplica `Agendado` y lead status |
| `Perdido` | appointments.status | valor permitido | legado/manual | mezcla cierre comercial con estado de cita |
| `pendiente` / `Pendiente` | tasks.status | trabajo abierto | automático/manual | casing duplicado |
| `vencido` / `Vencida` | tasks.status | trabajo vencido | almacenado/derivado | género/casing duplicado; vencimiento también deriva de fecha |
| `hecho` / `Completada` | tasks.status | trabajo terminado | RPC/legado | algunos contadores comparan valores exactos |
| `cancelado` / `Cancelada` | tasks.status | tarea anulada | RPC/legado | `navCounts` puede tratar variantes no contempladas como abiertas |
| baja/media/alta/urgente y variantes capitalizadas | tasks.priority | prioridad de tarea | automático/manual | duplica clasificación y semáforo; casing mixto |
| tipos de tarea | tasks.type | contacto, seguimiento, confirmación, asistencia, recuperación | automático/manual | vocabulario heterogéneo y algunos null |
| urgent/attention/controlled/closed | derivado, no tabla | semáforo comercial | automático | no usa score; agrega otra capa visible |
| admin/owner/receptionist | profiles.role | autorización | manual/configuración | frontend normaliza owner/admin a admin; otros roles históricos se reducen a recepción |
| active | profiles | habilitación de usuario | manual | correcto como estado de acceso |
| active/is_active/status | clinics | actividad del tenant | administrativo | varias convenciones históricas |
| is_active | clinic_public_forms | formulario público habilitado | admin/backend | necesario para captación |
| accepted/rate_limited/invalid_token/spam/error | form_submission_logs.status | resultado de intake | automático | correcto para observabilidad, no debe exponerse a recepción |
| pending/processing/completed/failed | automation_jobs.status | ejecución asíncrona documentada | automático | worker operativo no está en este repositorio |
| messages.status | messages | mensajería futura/histórica | no determinado | sin constraint ni consumo real en CRM |

### Inventario del cálculo de scoring público

La Edge Function codifica aproximadamente estas ponderaciones:

- Tratamiento: implante +40, dolor/urgencia +35, ortodoncia +25, blanqueamiento +15, limpieza +10, otro +5.
- Urgencia: hoy +35, esta semana +25, este mes +10, solo consulta -10.
- Evaluación: estudios +20, sí +15, no +5.
- Situación: agendar +30, dolor +25, precio +5, comparando -10.
- Base +10 y +5 si el nombre tiene más de una palabra.
- Clasificación: 80 o más Caliente; 45 o más Medio; menos de 45 Frío.

`clinic_settings.hot_lead_threshold` existe, pero **no participa en ese cálculo**. La alta manual permite elegir clasificación y parte de score 0. Administración puede editar score y clasificación.

---

## 10. Riesgos de simplificar

### Si fusionamos tareas/seguimientos

- Borrar una tabla o mapear todo 1:1 perdería tareas paralelas legítimas y el historial.
- Automatizaciones, métricas, navegación, timeline y RPC dependen de `tasks`.
- Una oportunidad puede necesitar más de una tarea interna, aunque la UI deba mostrar solo la siguiente.
- Antes de ocultar módulos se necesita una proyección canónica, reglas de cierre y pruebas de cada resultado.

**Camino seguro:** fusionar primero la experiencia, no el almacenamiento. Mantener `tasks` y normalizar quién es la “próxima acción efectiva”.

### Si simplificamos estados

- Cambiar strings directamente rompe constraints SQL, RPC, RLS, filtros, métricas, seeds, reportes y datos históricos.
- Los estados de lead y cita están acoplados por RPC.
- Datos históricos pueden conservar variantes de casing.

**Camino seguro:** introducir un modelo canónico/mapeo interno, migrar progresivamente y cambiar etiquetas visibles antes que valores almacenados.

### Si cambiamos el Dashboard

- Los contadores y colas actuales sirven como red de seguridad ante desincronización.
- Ocultarlos antes de garantizar encargado/próxima acción podría hacer menos visibles casos perdidos.
- La cola actual permite completar una tarea; una nueva cola debe conservar todos los callbacks y permisos.

**Camino seguro:** construir y comparar la nueva proyección con las listas actuales; ocultar lo duplicado solo después de QA.

### Si introducimos presupuestos

- Reutilizar `estimated_value` como monto real destruiría la distinción histórica entre estimación y cotización.
- Un lead puede tener más de un tratamiento/presupuesto.
- La moneda, estado, rechazo, aceptación y fechas requieren integridad y RLS.
- No debe inferirse ingreso a partir de aceptación.

**Camino seguro:** entidad nueva, eventos propios, migración aditiva y compatibilidad temporal con la estimación actual.

---

## 11. Propuesta de arquitectura UX futura

### Recepción

#### Menú recomendado:

```text
Inicio
Pacientes
Agenda
```

#### Inicio

Una cola inteligente única, ordenada por:

1. **Atender ahora** — consulta nueva sin respuesta, seguimiento vencido, no-show sin recuperación, cita inmediata sin confirmar, oportunidad importante sin encargado.
2. **Atender hoy** — acciones con vencimiento hoy, confirmaciones próximas, seguimiento de presupuesto.
3. **Puede esperar** — acciones futuras ya asignadas.

Cada persona aparece una sola vez:

```text
Carlos Gómez
Implantes · presupuesto pendiente

Pidió información hace 25 minutos y todavía no recibió respuesta.

[WhatsApp] [Registrar resultado]
```

“Registrar resultado” debe ofrecer opciones en lenguaje cotidiano y ejecutar una transición transaccional. Recepción no elige score, tipo de tarea, estado técnico ni prioridad.

### Dueño

#### Menú recomendado:

```text
Resumen
Pacientes
Agenda
Configuración
```

#### Resumen de 30 segundos

- Consultas entrantes.
- Contactadas.
- Agendadas.
- Asistieron.
- Iniciaron tratamiento.
- Caída principal.
- Presupuestos abiertos y monto.
- Presupuestos/oportunidades con riesgo.
- Acciones sin encargado o vencidas.

El detalle por fuente, tratamiento, responsable y motivo de pérdida puede vivir debajo o en una sección de análisis expandible.

### Reutilización arquitectónica

- Una sola aplicación React.
- Un solo `AppLayout`, Auth y servicio Supabase.
- Menús y contenido adaptados por rol, no aplicaciones duplicadas.
- Mismas tablas y RPC, ampliados progresivamente.
- `tasks` y campos técnicos continúan internos.
- Una proyección común de próxima acción alimenta Inicio, Pacientes y contadores.

**NO IMPLEMENTAR EN ESTA FASE.**

---

## 12. Presupuestos

### Qué existe actualmente

- `leads.estimated_value`.
- `treatment_prices.estimated_price` por clínica.
- `clinic_settings.treatment_prices` como JSONB potencialmente duplicado.
- Valores codificados en `lead-intake` que se guardan como estimación.
- Estado de lead `Presupuesto Enviado`.
- Tareas/acciones textuales de seguimiento de presupuesto.
- `daily_reports.pipeline_value`, no consumido por la CRM actual.

### Qué falta

- Entidad de presupuesto.
- Monto cotizado real e histórico.
- Moneda.
- Fecha de emisión.
- Estado pendiente/aceptado/rechazado.
- Fecha de aceptación/rechazo.
- Profesional.
- Relación opcional con cita.
- Próxima acción del presupuesto.
- Historial de múltiples presupuestos.
- Motivo de rechazo.
- Separación entre aceptado y cobrado.

### Arquitectura recomendada

Nueva tabla aditiva `budgets` o `quotes`:

| Campo | Propósito |
| --- | --- |
| `id` | identidad |
| `clinic_id` | tenant con RLS |
| `lead_id` | paciente/oportunidad |
| `appointment_id` nullable | consulta donde se emitió |
| `treatment` | snapshot descriptivo |
| `amount` numeric | monto real cotizado |
| `currency` | `PYG` por defecto, explícito |
| `status` | pending/accepted/rejected |
| `issued_at` | emisión |
| `accepted_at` / `rejected_at` | transición fechada |
| `professional_name` o futuro `professional_id` | responsable clínico; hoy solo puede guardarse snapshot porque la entidad profesional NO EXISTE |
| `next_action_at` | seguimiento propio |
| `created_by`, `updated_by` | auditoría |
| `notes`, `rejection_reason` | contexto |

Recomendaciones de relación:

- Un lead puede tener muchos presupuestos.
- Un presupuesto puede vincularse opcionalmente a una cita.
- El tratamiento debe guardarse como snapshot aunque luego exista catálogo.
- Las transiciones deben producir `lead_events` y, si corresponde, una tarea canónica.
- Puede agregarse `tasks.budget_id` en una migración posterior para seguimiento inequívoco.
- No sobrescribir `estimated_value`; conservarlo como estimación heredada claramente rotulada.

### Confiabilidad actual del valor potencial

`MetricsPage` usa primero `lead.estimated_value` y, si no existe, el precio configurado por tratamiento. La Edge Function suele rellenar `estimated_value` con su tabla codificada, por lo que un valor configurado por clínica puede no aplicarse a esos leads. El monto es una aproximación de demanda, no una propuesta emitida.

---

## 13. Dinero en riesgo

### Definiciones correctas

- **Presupuestos abiertos:** suma de `amount` de presupuestos reales con estado `pending`.
- **Presupuestos sin seguimiento al día:** presupuestos `pending` cuyo lead no tiene encargado, no tiene próxima acción o la acción está vencida.
- **Aceptados este mes:** suma de presupuestos que transicionaron a `accepted` durante el período según `accepted_at`.
- **Rechazados:** suma de presupuestos que transicionaron a `rejected` según `rejected_at`, con conteo y motivos.
- **Monto de oportunidades abiertas en riesgo:** suma única de presupuestos pendientes vinculados a oportunidades abiertas que cumplen al menos una señal de riesgo.

### Señales posibles de riesgo

- sin encargado;
- sin próxima acción;
- próxima acción vencida;
- varios intentos sin respuesta;
- no-show sin recuperación;
- presupuesto pendiente sin contacto durante un umbral definido;
- cita vencida sin outcome.

Cada presupuesto debe sumarse una sola vez aunque tenga varias señales.

### Lo que no debe afirmarse

- Presupuesto abierto **no es ingreso**.
- Presupuesto aceptado **no es cobro**.
- Oportunidad en riesgo **no es dinero perdido**.
- Valor estimado **no es presupuesto**.
- **Ingreso real NO EXISTE** en el modelo actual y no debe mostrarse hasta integrar una fuente explícita de pagos/cobros, probablemente fuera del alcance central del producto.

### Fórmula conceptual

```text
dinero_en_riesgo = SUM(presupuesto.amount)
para cada presupuesto pendiente y vigente
vinculado a un lead no terminal
que tenga una o más señales operativas de riesgo
contando cada presupuesto una sola vez
```

La interfaz debería usar lenguaje prudente: “monto cotizado en oportunidades que necesitan atención”, con tooltip de fórmula y fecha de actualización.

---

## 14. Accesibilidad y facilidad de uso

### Aspectos positivos

- Preferencia de movimiento reducido respetada tanto en Motion como en CSS.
- Foco visible global.
- Formularios con labels en la mayoría de los casos.
- Inputs y botones principales generalmente cercanos a 44 px.
- Estados de carga, vacío y error presentes en componentes centrales.
- Contraste oscuro razonable en gran parte de la interfaz.
- Badges incluyen texto además del color.
- Grids responsivos y contenedores con scroll para tablas.

### Problemas encontrados

#### Tipografía

- Uso frecuente de `text-[10px]`, `text-[11px]` y `text-xs` para datos secundarios importantes.
- Para una persona de 60 años, responsable, fechas y contexto pueden resultar demasiado pequeños.

#### Contraste

- Textos secundarios gris/pizarra sobre superficies oscuras pueden quedar por debajo de una lectura cómoda, especialmente en tamaños de 10–12 px.
- Placeholders y metadata tienen poco protagonismo aunque a veces contienen la acción o fecha crítica.

#### Tamaño y proximidad de botones

- Hay controles `min-h-9` de 36 px.
- Muchas acciones se agrupan en poco espacio dentro de tarjetas.
- En móvil aumenta el riesgo de toque equivocado.

#### Jerarquía visual

- Demasiadas cards, badges, colores y métricas compiten.
- Estado, clasificación, semáforo, prioridad y vencimiento se presentan simultáneamente.
- La acción principal no domina consistentemente.

#### Color

- La información no depende exclusivamente de color porque suele incluir texto, lo cual es positivo.
- Sin embargo, la cantidad de colores agrega carga cognitiva. Reducir categorías visibles mejoraría comprensión.

#### Formularios

- La cantidad de campos del lead es excesiva para una recepción ocupada.
- Los errores de modal no siempre tienen `aria-describedby`/`aria-live`.
- Campos técnicos como score, clasificación y estados completos no deberían formar parte del flujo diario.

#### Mobile/responsive

- La navegación móvil es horizontal con scrollbar oculto; cinco o siete opciones pueden quedar fuera de vista.
- Calendario de siete columnas a 320 px produce celdas y textos muy pequeños.
- Tablas dependen de scroll horizontal.
- Reducir tamaños no basta; hacen falta variantes de composición por breakpoint.

#### Modales

- [`ModalShell.jsx`](../crm-app/src/components/ui/ModalShell.jsx) usa `role="dialog"` y `aria-modal`, pero no se comprobó `aria-labelledby`, trampa de foco, restauración del foco, cierre por Escape completo ni fondo inerte.
- Acciones importantes dentro de modales necesitan foco inicial y retorno al disparador.

#### Interacciones y seguridad de acción

- Asistió/No asistió/Confirmar se ejecutan con un clic y pueden ser contextualmente inválidas.
- No hay undo; las confirmaciones deben reservarse para acciones irreversibles o facilitar corrección controlada.
- El WhatsApp de Agenda no siempre incorpora contexto real de la cita ni registra el resultado.

### Recomendaciones concretas

1. Mínimo de 14 px para información operativa; 16 px para contenido principal.
2. Targets de 44–48 px con separación clara.
3. Un solo CTA primario por tarjeta y una acción secundaria.
4. Metadatos dentro de detalle progresivo.
5. Reemplazar badges múltiples por una frase accionable.
6. Contraste AA verificado en texto secundario, placeholder y disabled.
7. Focus trap, Escape, `aria-labelledby`, `aria-describedby`, `aria-live` y restauración de foco en modales.
8. Calendario móvil como lista de días/citas, no miniatura comprimida de escritorio.
9. Tablas críticas transformadas en cards/listas en móvil.
10. QA en 320, 375, tablet y escritorio, además de prueba moderada con usuarios de 55–65 años.

### Auditoría de lenguaje

| Término interno | Recomendación visible para recepción |
| --- | --- |
| Leads | Pacientes / Consultas |
| Nuevo lead | Nueva consulta |
| Dashboard | Inicio |
| Seguimientos | Qué hacer después / Próximas acciones |
| Tareas | oculto como concepto técnico |
| Lead Caliente/Medio/Frío | mantener interno |
| Semáforo | Prioridad |
| Urgente/Atención/Ordenado | Atender ahora/Hoy/Puede esperar |
| Ganado / Tratamiento Iniciado | Inició tratamiento |
| Perdido | No continuó |
| Responsable | Encargado |
| Próxima acción | Qué hacer después |
| Conversión | Pacientes que avanzaron |
| No-show | No asistió |
| Valor potencial | Estimación por tratamiento |
| owner/admin | Dueño/Administrador |

`lead`, `lead_id`, score, pipeline, task types y estados técnicos pueden mantenerse internamente. “Oportunidad” es razonable en el panel del dueño, pero innecesariamente comercial para recepción. “Paciente” es familiar, aunque una persona que apenas consultó quizá todavía no sea paciente clínico; “Consultas y pacientes” es la denominación más precisa si se necesita distinguir ambos momentos.

---

## 15. Archivos que probablemente habría que modificar

| Archivo | Qué hace hoy | Cambio futuro probable | Riesgo |
| --- | --- | --- | --- |
| [`crm-app/src/App.jsx`](../crm-app/src/App.jsx) | orquesta navegación, permisos, mutaciones y modales | extraer controladores/hooks, incorporar resultado universal y refresco | alto por concentración de lógica |
| [`crm-app/src/lib/constants.js`](../crm-app/src/lib/constants.js) | estados, opciones y navegación | menú por rol y etiquetas simplificadas | medio; muchos consumidores |
| [`crm-app/src/lib/crmDomain.js`](../crm-app/src/lib/crmDomain.js) | normalización, estados, patches y tareas derivadas | estado canónico, máquina de transición cliente y compatibilidad | alto |
| [`crm-app/src/lib/commercialInsights.js`](../crm-app/src/lib/commercialInsights.js) | prioridad/riesgo/timeline | proyección única Atender ahora/Hoy/Puede esperar | alto; alimenta varias pantallas |
| [`crm-app/src/components/AppLayout.jsx`](../crm-app/src/components/AppLayout.jsx) | navegación y shell | navegación diferenciada por rol y móvil accesible | medio |
| [`crm-app/src/pages/DashboardPage.jsx`](../crm-app/src/pages/DashboardPage.jsx) | stats, alertas y cola | Inicio de recepción o Resumen según rol | alto UX |
| [`crm-app/src/pages/LeadsPage.jsx`](../crm-app/src/pages/LeadsPage.jsx) | listado, filtros, tarjeta y detalle | Pacientes simplificado y disclosure progresivo | medio/alto |
| [`crm-app/src/pages/FollowupsPage.jsx`](../crm-app/src/pages/FollowupsPage.jsx) | seguimiento derivado | integrar en cola canónica y luego ocultar por rol | alto por datos duplicados |
| [`crm-app/src/pages/TasksPage.jsx`](../crm-app/src/pages/TasksPage.jsx) | tareas visibles | convertir en vista avanzada/admin u ocultar | medio |
| [`crm-app/src/pages/AgendaPage.jsx`](../crm-app/src/pages/AgendaPage.jsx) | calendario y outcomes | acciones contextuales y resumen por período | alto por transiciones |
| [`crm-app/src/pages/MetricsPage.jsx`](../crm-app/src/pages/MetricsPage.jsx) | métricas ejecutivas cliente | cohortes correctas, presupuesto real y panel 30 s | alto por confianza del dato |
| [`crm-app/src/pages/SettingsPage.jsx`](../crm-app/src/pages/SettingsPage.jsx) | configuración parcial | organizar clínica/equipo/precios/horarios/mensajes | medio |
| [`crm-app/src/components/modals/LeadFormModal.jsx`](../crm-app/src/components/modals/LeadFormModal.jsx) | alta/edición completa | simplificar, permitir reasignación autorizada | medio/alto |
| [`crm-app/src/components/modals/ContactOutcomeModal.jsx`](../crm-app/src/components/modals/ContactOutcomeModal.jsx) | resultado de contacto | convertirse en resultado universal contextual | alto |
| [`crm-app/src/components/modals/AppointmentModal.jsx`](../crm-app/src/components/modals/AppointmentModal.jsx) | alta/reprogramación de cita | horarios configurados y estados válidos | medio |
| [`crm-app/src/components/ui/ModalShell.jsx`](../crm-app/src/components/ui/ModalShell.jsx) | contenedor modal | foco, Escape, labeling y retorno | medio |
| [`crm-app/src/hooks/useClinicWorkspace.js`](../crm-app/src/hooks/useClinicWorkspace.js) | carga/refresco workspace | Realtime/polling, actualización incremental | alto |
| [`crm-app/src/services/crmApi.js`](../crm-app/src/services/crmApi.js) | siete consultas y mutations | paginación, proyección y nuevos RPC | alto |
| [`supabase/functions/lead-intake/index.ts`](../supabase/functions/lead-intake/index.ts) | captación/dedupe/scoring/jobs | asignación, terminalidad y RPC transaccional | muy alto; entrada pública |
| nueva migración Supabase | NO EXISTE todavía | corregir contratos sin editar migraciones previas; presupuesto/RPC/constraints | muy alto |
| pruebas en [`crm-app/tests`](../crm-app/tests) y QA SQL | cobertura utilitaria/manual | estados, colas, outcomes, métricas, RLS y E2E | bajo riesgo, alto valor |

---

## 16. Archivos/tablas que NO deberíamos tocar

“No tocar” significa no modificar destructivamente ni reescribir; se pueden extender mediante contratos compatibles si una fase futura lo exige.

- Migraciones históricas ya aplicadas: no editarlas; crear migraciones nuevas y aditivas.
- `clinics`, `profiles`, relación con `auth.users` y helpers de membresía: proteger identidad multi-clínica.
- Políticas RLS existentes: no desactivarlas ni reemplazarlas por control visual.
- Secretos y variables `service_role`: nunca mover al frontend.
- `lead_events` y `audit_logs`: no borrar ni reescribir historial.
- Datos de leads, citas y tareas: no hard-delete; mantener archivo/cancelación trazable.
- Índice/contrato de doble reserva de citas: conservar la garantía.
- Contrato público de `lead-intake`: evolucionarlo con compatibilidad para landing y formulario React.
- `supabase/.temp` o metadatos locales: no usarlos como fuente de verdad ni versionarlos por accidente.
- Workflow n8n de captación deprecado: no reactivarlo como segunda entrada de verdad.
- Framework actual React/Vite/Tailwind y Supabase: no hay razón demostrable para reemplazarlos.

---

## 17. Plan recomendado de implementación

### Fase 1

#### Simplificación estructural

1. Definir formalmente “oportunidad abierta”, “encargado” y “próxima acción efectiva”.
2. Crear una proyección canónica reutilizable de próxima acción.
3. Hacer transaccional la entrada pública mediante RPC/backend y asignar encargado por regla de clínica.
4. Incorporar reasignación segura para leads existentes.
5. Implementar Realtime o polling con recuperación de errores.
6. Definir máquina de estados de cita y validar transiciones en RPC.
7. Cerrar/reemplazar tareas previas al avanzar etapa.
8. Limpiar tareas/next action al cerrar como perdido o tratamiento iniciado.
9. Normalizar estados/prioridades con compatibilidad para datos históricos.
10. Agregar pruebas de dominio, RPC y RLS.

**Dependencia:** esta fase debe terminar antes de ocultar Seguimientos/Tareas, porque hoy esas vistas sirven para detectar inconsistencias.

### Fase 2

#### Flujo operativo

1. Inicio de recepción como cola única.
2. Menú de recepción Inicio/Pacientes/Agenda.
3. Acción universal “Registrar resultado”.
4. Tarjetas de paciente reducidas.
5. Filtros esenciales + “Más filtros”.
6. Agenda con acciones contextuales.
7. Ocultar módulos Seguimientos/Tareas a recepción cuando la cola esté validada.
8. Mantener vista avanzada de tareas para administración/soporte si aporta valor.

**Dependencia:** consume la proyección y RPC de Fase 1.

### Fase 3

#### Presupuestos

1. Diseñar entidad, estados y RLS.
2. Migración aditiva.
3. RPC de crear/actualizar/transicionar presupuesto.
4. Eventos y tareas de seguimiento vinculadas.
5. Mostrar presupuesto real en Pacientes e Inicio.
6. Mantener estimación antigua claramente separada.
7. Tests multi-clínica y de montos.

**Dependencia:** necesita próxima acción canónica para que un presupuesto pendiente no cree otro concepto operativo.

### Fase 4

#### Panel dueño

1. Definir timestamps/cohortes del embudo.
2. Rehacer métricas con unidades homogéneas.
3. Resumen de 30 segundos.
4. Presupuestos abiertos/aceptados/rechazados/en riesgo.
5. Pérdidas y oportunidades sin seguimiento.
6. Detalle secundario por fuente, tratamiento y encargado.

**Dependencia:** para cifras monetarias confiables necesita Fase 3; para salud operativa necesita Fase 1.

### Fase 5

#### Pulido UX/accesibilidad

1. Tipografía y contraste.
2. Targets de 44–48 px.
3. Focus management completo en modales.
4. Diseños específicos de calendario, cards y tablas para móvil/tablet.
5. Estados de éxito/error consistentes y recuperación.
6. Pruebas con teclado, lector de pantalla y movimiento reducido.
7. Pruebas con recepcionistas reales, especialmente 55–65 años.
8. Component tests y E2E de flujos A–I.

**Dependencia:** puede empezar transversalmente, pero el test con usuarios debe hacerse sobre los flujos estabilizados.

---

## 18. Top 10 cambios por impacto

| # | Cambio | Por qué | Dificultad 1–10 | Riesgo 1–10 | Impacto 1–10 |
| --- | --- | --- | ---: | ---: | ---: |
| 1 | Garantizar encargado + próxima acción en una transacción | evita oportunidades invisibles y establece la regla central del producto | 8 | 8 | 10 |
| 2 | Cola única de recepción | responde inmediatamente “¿a quién atiendo ahora?” y elimina duplicación visible | 7 | 6 | 10 |
| 3 | “Registrar resultado” universal | evita que recepción tenga que decidir entre estados, tareas y seguimientos | 8 | 7 | 10 |
| 4 | Máquina de estados y acciones contextuales de Agenda | impide resultados imposibles y cierra trabajo anterior | 7 | 8 | 9 |
| 5 | Realtime o polling confiable | hace visibles las consultas públicas sin depender de recarga | 5 | 4 | 9 |
| 6 | Entidad de presupuestos reales | reemplaza una estimación ambigua con dato comercial verificable | 8 | 7 | 9 |
| 7 | Panel del dueño en 30 segundos | convierte datos dispersos en decisiones comerciales confiables | 7 | 6 | 9 |
| 8 | Navegación y lenguaje por rol | reduce conceptos sin duplicar la aplicación | 4 | 3 | 8 |
| 9 | Simplificar tarjetas, acciones y filtros | reduce tiempo de lectura y errores de decisión | 5 | 4 | 8 |
| 10 | Accesibilidad de modales, tamaños y móvil | vuelve el sistema viable para una recepcionista mayor y uso bajo presión | 5 | 3 | 8 |

---

## 19. Qué NO cambiarías

1. React + Vite + Tailwind: son adecuados para evolucionar progresivamente.
2. Supabase como backend: Auth, Postgres, RLS, RPC y Edge Functions encajan con el producto.
3. Arquitectura multi-clínica y derivación de clínica desde perfil/sesión.
4. RLS como última línea de autorización.
5. Patrón de RPC transaccional del alta manual.
6. `lead_events` y `audit_logs` como trazabilidad.
7. Archivado/pérdida sin borrado físico.
8. Motivos estructurados de pérdida.
9. Protección de doble reserva de citas.
10. Agenda como módulo principal.
11. WhatsApp como acción humana directa; automatizar el envío no es necesario para simplificar.
12. Consentimiento, validación de origen/token, rate limit y controles antiabuso de la entrada pública.
13. Lazy loading de páginas.
14. Estados de carga/error/vacío y componentes UI reutilizables ya existentes.
15. Respeto por `prefers-reduced-motion` y `build.sourcemap: false`.
16. Separación landing estática / CRM React / Supabase.

La dirección correcta es proteger estas bases y reducir el acoplamiento de `App.jsx`, la duplicación operativa y la complejidad expuesta. No hay evidencia que justifique una reescritura total, otro framework o reemplazar Supabase.

---

## 20. Conclusión

### ¿Cuál es hoy el mayor problema UX?

La misma oportunidad aparece como lead, seguimiento, tarea, cita, alerta y métrica, acompañada por estado comercial, clasificación, semáforo, prioridad y vencimiento. La usuaria debe interpretar el modelo interno antes de saber qué hacer. Para una recepcionista de 60 años atendiendo teléfono y pacientes, el costo cognitivo es demasiado alto.

### ¿Cuál es hoy el mayor problema de arquitectura?

No existe una única fuente transaccional de verdad para **encargado + próxima acción**. La realidad operativa está repartida entre `leads`, `tasks` y `appointments`; solo algunos flujos sincronizan todo, otros dejan llamadas parciales, tareas antiguas o fechas obsoletas. La captación pública agrava el problema porque no asigna responsable, no es atómica y no se actualiza en vivo en la CRM.

### ¿Cuál es el cambio individual que más mejoraría la experiencia de recepción?

Una cola única de “Atender ahora / Atender hoy / Puede esperar”, con una sola aparición por persona y dos acciones: WhatsApp y Registrar resultado. Debe estar respaldada por una transición de backend que actualice lead, cita, tarea, responsable, próxima fecha y evento automáticamente.

### ¿Cuál es el cambio individual que más valor aportaría al dueño?

Introducir presupuestos reales y un Resumen confiable que distinga monto abierto, aceptado, rechazado y en riesgo de la estimación y del ingreso. Eso permitiría ver en 30 segundos dónde se frena el embudo y cuánto monto cotizado necesita atención sin prometer dinero inexistente.

### ¿Qué deberíamos hacer primero?

Primero corregir integridad operativa: entrada pública transaccional y asignada, actualización en vivo, reasignación, máquina de estados de Agenda, cierre de tareas anteriores y sincronización de la próxima acción. Después simplificar la interfaz alrededor de esa verdad única. Ocultar módulos antes de resolver la consistencia podría esconder los mismos casos que el sistema pretende rescatar.

---

## Clasificación global por valor

| Módulo/funcionalidad | Clasificación | Motivo |
| --- | --- | --- |
| Dashboard actual | **SIMPLIFICAR / DIVIDIR POR ROL** | mezcla operación y análisis |
| Leads | **SIMPLIFICAR** | entidad central valiosa con demasiada carga |
| Seguimientos | **FUSIONAR** | misma necesidad que próxima acción/tareas |
| Tareas | **FUSIONAR / OCULTAR POR ROL** | infraestructura útil, concepto diario innecesario |
| Agenda | **CONSERVAR / SIMPLIFICAR** | módulo fundamental con acciones inválidas |
| Métricas | **OCULTAR POR ROL / SIMPLIFICAR** | útil al dueño, cálculos actuales requieren corrección |
| Configuración | **CONSERVAR / SIMPLIFICAR** | base correcta, interfaz incompleta |
| Scoring | **CONSERVAR INTERNAMENTE** | inteligencia útil, no debe exigir interpretación |
| Clasificación caliente/media/fría | **OCULTAR EN RECEPCIÓN** | duplica prioridad visible |
| Semáforo | **SIMPLIFICAR** | traducir a prioridad humana |
| Lead events/audit logs | **CONSERVAR** | trazabilidad valiosa |
| Entrada pública | **CONSERVAR / CORREGIR P0** | canal esencial con brechas de atomicidad/asignación |
| Presupuestos reales | **AGREGAR** | necesidad comercial no cubierta |
| Dinero en riesgo | **AGREGAR DESPUÉS DE PRESUPUESTOS** | no se puede calcular honestamente hoy |
| Realtime/polling | **AGREGAR** | requisito operativo para nuevas consultas |
| Gestión de profesionales | **NO AGREGAR AHORA** | fuera del objetivo inmediato; snapshot textual basta para presupuesto inicial |
| Historia clínica/odontograma/inventario/contabilidad/facturación/ERP | **NO AGREGAR** | fuera del propósito del producto |

## Prioridades consolidadas

### P0 — Problemas críticos

- Captación pública no transaccional y sin responsable.
- Nuevas consultas no visibles en vivo.
- Imposibilidad de reasignar leads existentes desde UI.
- Transiciones de cita inválidas/regresivas.
- Tareas anteriores que sobreviven a avances/cierres.
- `complete_task` sin sincronización de próxima acción.
- Duplicados públicos que pueden afectar leads terminales.
- Falta de una verdad canónica para la próxima acción.

### P1 — Máximo impacto UX/comercial

- Cola única de recepción.
- Resultado universal.
- Menú por rol.
- Simplificación de tarjetas/filtros.
- Corrección de métricas ejecutivas.
- Presupuestos reales y separación de estimación.

### P2 — Importantes

- Paginación/actualización incremental.
- Configuración real de horarios y precios.
- Normalización de casing/estados históricos.
- Descomposición de `App.jsx`.
- Accesibilidad de modales y responsive específico.
- Cobertura de componentes/E2E.

### P3 — Opcionales

- Deep links con router.
- Vistas guardadas de filtros avanzados.
- Análisis detallado adicional por fuente/tratamiento.
- Mejoras visuales secundarias que no cambian el flujo operativo.

