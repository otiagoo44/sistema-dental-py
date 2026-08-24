# Manual Acceptance Test — CRM Dental

Duración objetivo: 15–25 minutos. Usar únicamente datos marcados `QA`. Anotar hora de inicio, navegador, rol y URL probada.

## Recepción

| # | Qué tocar | Qué debería pasar | Qué sería un error |
|---|---|---|---|
| 1 | Abrir la CRM e iniciar sesión como recepción | Aparecen sólo Inicio, Pacientes y Agenda | Navegación administrativa, error técnico o datos de otra clínica |
| 2 | En Inicio, abrir la consulta QA nueva | Está en `ATENDER AHORA`, una sola vez y con encargado | Duplicado, sin encargado o escondida en “Puede esperar” |
| 3 | Tocar WhatsApp | Se abre el contacto correcto sin marcar respuesta automáticamente | Teléfono/mensaje incorrecto o el lead desaparece |
| 4 | Registrar resultado → No respondió | Se registra el intento y queda un próximo contacto | Cambia a Contactado o crea tareas duplicadas |
| 5 | Elegir volver a contactar mañana | Queda una sola próxima acción para mañana | Dos cards o dos tareas equivalentes |
| 6 | Registrar que respondió y tocar Agendar | Se abre el formulario contextual de cita | Pide score, semáforo o estados técnicos |
| 7 | Elegir fecha/hora futura y guardar | Se crea una cita y se cierra la tarea de contacto | Doble reserva o sobreviven acciones anteriores |
| 8 | En Agenda, confirmar la cita | La acción visible pasa a esperar/registrar asistencia | Sigue visible “Confirmar” o aparecen controles imposibles |
| 9 | Cuando la cita QA esté en pasado, marcar Asistió | Se cierra asistencia y aparece Registrar presupuesto | Permite asistencia futura o quedan tareas superadas |
| 10 | Registrar presupuesto QA | Se ve monto, tratamiento, estado pending y seguimiento | Usa `estimated_value` como presupuesto o duplica el quote |
| 11 | Aceptar el presupuesto | Queda accepted y aparece Iniciar tratamiento; otro quote independiente sigue pending | Otro quote se cancela o rechaza automáticamente |
| 12 | Registrar Inició tratamiento | La oportunidad queda terminal y con 0 tareas comerciales abiertas | Continúan contacto, confirmación, asistencia o seguimiento |

## No-show

| # | Qué tocar | Qué debería pasar | Qué sería un error |
|---|---|---|---|
| 13 | Crear una cita QA separada | La nueva cita queda en Agenda | Sobrescribe una cita histórica |
| 14 | Con la hora QA ya pasada, marcar No asistió | La cita histórica queda no-show y aparece Recuperar | Permite no-show futuro o borra la cita |
| 15 | Registrar recuperación | Queda un próximo contacto claro | Más de una acción visible por paciente |
| 16 | Reprogramar | Se conserva la cita no-show y se crea una nueva | La cita anterior cambia de historia o la nueva duplica slot |

## Dueño

| # | Qué tocar | Qué debería pasar | Qué sería un error |
|---|---|---|---|
| 17 | Entrar como owner y abrir Resumen | Se entiende el estado general en unos 30 segundos | Pantalla saturada o términos técnicos |
| 18 | Revisar Este mes | Consultas, contactadas, agendaron, asistieron e iniciaron coinciden con QA | Conteos duplicados o período incorrecto |
| 19 | Revisar Presupuestos | Emitidos, pendientes, aceptados y rechazados coinciden con quotes | Aceptado se presenta como cobrado/ingreso |
| 20 | Revisar Monto cotizado que necesita atención y Principales fugas | Cada quote pending suma una vez y la fuga coincide con eventos QA | Usa `estimated_value`, duplica monto o dice “dinero perdido” |

## Prueba especial de usabilidad

Entregar la CRM a una persona sin explicación y pedir, en orden:

1. “Hay una persona nueva que preguntó por implantes. Atendela.”
2. “No respondió. Volvé a contactarla mañana.”
3. “Quiere venir el miércoles.”
4. “Vino y le presupuestamos Gs. 8.500.000.”

No guiar la navegación. Si pide ayuda para encontrar una pantalla, botón o resultado, registrar el punto exacto como problema UX.

## Métricas de usabilidad

Anotar aproximadamente:

| Métrica | Observación |
|---|---|
| Tiempo para encontrar nueva consulta | |
| Tiempo para registrar no respuesta | |
| Tiempo para agendar | |
| Errores de clic | |
| Preguntas del usuario | |

## Resultado

- [ ] PASS sin errores bloqueantes.
- [ ] FAIL; registrar paso, rol, hora, captura y resultado observado.
