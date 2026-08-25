# Auditoría de recuperación de capacidades

## Historia revisada

Se revisaron los cambios de `36138e9`, `287fa6a`, `01ca290`, `37e33c1`, `1b9295d` y `d91906a`, además de la historia completa de `crm-app/src/`, `tests/` y `supabase/migrations/`.

## Matriz de decisión

| Capacidad | Antes | Ahora | Valor operativo | Decisión |
| --- | --- | --- | --- | --- |
| Inicio/cola priorizada | Dashboard y followups separados | Inicio + `effectiveNextAction` | Muy alto | Reemplazada correctamente |
| Tareas comerciales | Vista completa y tareas por estado | Se generan por automatización; vista avanzada oculta | Muy alto | Conservar oculta |
| Tareas manuales extraordinarias | Crear/editar tareas | Sigue disponible para owner/admin en vista avanzada | Medio/alto | Conservar sin competir con próxima acción |
| Plantillas WhatsApp | Plantillas por situación | `message_templates` + selección contextual + copiar mensaje | Muy alto | Recuperada/conservada |
| Fuentes y filtros | Leads filtrables por fuente, tratamiento y responsable | Pacientes y Análisis conservan filtros | Alto para owner | Conservar oculta para recepción |
| Timeline y notas | Historial de eventos y notas | Detalle de paciente conserva ambos | Alto | Conservar |
| Reactivación | Estado/seguimiento a 30 días | Próxima acción futura y plantilla `cold_reactivation` | Alto | Simplificada correctamente |
| Horarios | `opening_hours` usado por Agenda | Se usa para slots; no se agregó una pantalla nueva | Alto | Conservar; UI de edición queda pendiente si no existe contrato estable |
| Métricas/reportes | Scorecard, fuentes, tratamientos y reporte | Owner Summary + Análisis | Alto | Reemplazada correctamente |
| Tratamientos/precios | Tabla `treatment_prices`, sin flujo operativo completo | UI de configuración + autocompletado de quote | Muy alto | Recuperada |

## Fuente de verdad de precios

`public.treatment_prices` es la única fuente editable utilizada por la CRM. `clinic_settings.treatment_prices` queda fuera del flujo de edición y no se consulta para autocompletar presupuestos. El precio de referencia nunca se escribe en `quotes`; `quotes.amount` conserva el monto real de cada cotización.

## Límites deliberados

No se reintrodujeron un módulo principal de Tareas, un sistema de grupos de presupuestos, campañas, historia clínica, facturación ni dashboards duplicados. La capacidad interna existente sigue alimentando automatizaciones, prioridades, WhatsApp, timeline y métricas sin aumentar la navegación de recepción.
