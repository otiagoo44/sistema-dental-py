# Rollback Plan

## Principio

Priorizar el rollback de aplicación. Las tablas, columnas y filas nuevas se preservan aunque el frontend vuelva al release anterior. No automatizar un rollback destructivo de PostgreSQL.

## Orden de respuesta

1. Detener nuevas promociones y registrar la hora del incidente.
2. Si el frontend falla, volver el alias/deployment al último release estable compatible.
3. Si `lead-intake` falla, volver a desplegar la versión anterior conocida de la Edge Function con `verify_jwt = false`; no cambiar secretos durante el incidente salvo evidencia de compromiso.
4. Mantener la base de datos en la versión migrada cuando la migración fue aditiva y completó correctamente.
5. Verificar login, consulta, agenda y lectura de quotes después del rollback de aplicación.
6. Monitorear logs y reconciliar cualquier submission recibida durante la ventana.

## Objetos que agrega o cambia la migración RC

- tabla `public.quotes`, RLS y policy `quotes_select_same_clinic`;
- columnas `leads.first_contacted_at`, `leads.treatment_started_at`;
- timestamps operativos en `appointments`;
- `tasks.quote_id`;
- índices de oportunidad abierta, quotes, responsable y relaciones compuestas;
- claves foráneas multi-clínica de quotes/tasks;
- helpers privados de oportunidad, asignación y cierre de tareas;
- RPCs de intake, reasignación, resultado, tareas, pérdida, agenda y quotes;
- publicación Realtime de `leads`, `appointments`, `tasks` y `quotes`;
- saneamientos que cierran tareas incoherentes y normalizan próxima acción sin borrar historial.

## Qué no borrar

- `quotes`, aunque el frontend anterior no las muestre;
- columnas nuevas o claves foráneas;
- leads, eventos, tareas, citas, auditoría o logs de formulario;
- migraciones en `supabase_migrations.schema_migrations`;
- secretos o configuración del proyecto mientras se investiga, salvo rotación por incidente de seguridad.

## Preservación de datos

- No ejecutar `DROP TABLE`, `TRUNCATE`, `DELETE` masivo ni `db reset --linked`.
- No convertir quotes aceptados en ingresos ni reconstruir estados desde `estimated_value`.
- Si una RPC nueva causa un incidente, retirar primero el frontend/Edge Function que la invoca y desplegar una corrección forward-compatible.
- Exportar los IDs afectados y conservar el historial antes de cualquier reparación manual.

## Criterio de escalación

Si la migración queda parcialmente aplicada, detener tráfico de escritura, capturar logs y estado de migraciones, y preparar una migración correctiva forward-only. No marcar manualmente una migración como aplicada sin verificar cada objeto.
