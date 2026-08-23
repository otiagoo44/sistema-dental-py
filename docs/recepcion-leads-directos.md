# Recepción de leads directos

Procedimiento para mensajes que llegan por WhatsApp, Instagram DM, llamada o recomendación sin pasar por el formulario web.

## Qué pasa hoy

El formulario público registra automáticamente lead, event, task, jobs y log de intake. Un mensaje directo no entra solo en la CRM: hasta una fase de integración futura, recepción debe usar `Nuevo lead`.

`Nuevo lead` está disponible para owner/admin y receptionist. La operación crea en una transacción:

- el lead en la clínica del profile autenticado;
- un event `lead_created_manual`;
- una task `contact` pendiente con responsable.

La pantalla no envía `clinic_id`; la RPC lo obtiene del profile y rechaza responsables de otra clínica. La carga manual no crea `automation_jobs` ni depende de n8n.

## Flujo de recepción

Cuando llega un mensaje directo:

1. Responder rápido y confirmar que es una consulta comercial para la clínica.
2. Pedir nombre, tratamiento buscado y disponibilidad de contacto.
3. Abrir CRM → Leads → `Nuevo lead`.
4. Cargar nombre y teléfono: son los únicos datos básicos de escritura obligatoria.
5. Elegir la fuente exacta, tratamiento, urgencia, evaluación y situación desde menús.
6. Elegir responsable, clasificación, próxima acción y una fecha rápida: Hoy, Mañana, 3 días o 7 días.
7. Agregar una nota breve sólo si aporta contexto comercial; no copiar la conversación completa.
8. Marcar consentimiento sólo si el paciente autorizó contacto por esos datos.
9. Usar `Guardar lead`; si la persona ya quiere turno, usar `Guardar y agendar` y elegir un slot disponible.
10. Completar la task al realizar el contacto; si no responde, dejar el siguiente seguimiento.

No copiar diagnósticos, imágenes, estudios ni información clínica sensible en este CRM comercial.

## Cómo elegir la fuente

| Entrada real | Fuente CRM |
|---|---|
| Conversación iniciada en WhatsApp | WhatsApp directo |
| Mensaje privado de Instagram | Instagram DM |
| Llamada entrante | Llamada |
| Paciente referido por otra persona | Recomendación |
| Formulario ajeno a la landing principal | Formulario externo |
| Lead descargado/copiado manualmente desde Meta Ads | Meta Ads manual |
| Formulario web cargado manualmente por contingencia | Formulario web |
| Persona que llegó físicamente a la clínica | Presencial |
| Caso no cubierto | Otro, explicando el origen en nota interna |

No usar `Formulario web` para WhatsApp o Instagram: la fuente debe permitir medir el canal real.

## Clasificación práctica

- Lead Caliente: implante, ortodoncia, dolor/urgencia o intención clara de agendar. Contactar inmediatamente y usar prioridad alta.
- Lead Medio: interés real, compara opciones o quiere información para esta semana/mes. Contactar hoy.
- Lead Frío: consulta exploratoria sin intención o plazo claro. Dejar seguimiento, no descartarlo sin motivo.

La clasificación es una decisión de recepción en la carga manual; no afirmar que fue calculada automáticamente. El score queda con el valor interno por defecto hasta revisión de un admin. Si hay duda, elegir Lead Medio y pedir revisión.

## Consentimiento y contacto permitido

- Marcar el checkbox si la persona pidió respuesta o autorizó explícitamente el contacto por esos datos.
- Si el dato llegó por recomendación de un tercero y la persona todavía no autorizó contacto, dejarlo sin marcar y confirmar el criterio con el responsable de privacidad antes de contactar.
- No inventar consentimiento ni cambiarlo para completar una métrica.
- En notas, registrar contexto comercial mínimo; no pegar conversaciones completas.

## Mensajes rápidos

Primer mensaje sugerido:

> Hola, gracias por escribirnos. Para agendarte bien y no perder tus datos, te hago 3 preguntas rápidas: ¿tu nombre completo?, ¿qué tratamiento estás buscando?, y ¿preferís que te llamemos hoy o mañana?

Segundo mensaje opcional:

> También podés completar este formulario rápido y ya queda registrado para que recepción te contacte: [LINK]

Mensaje si todavía falta disponibilidad:

> Gracias. ¿Qué día y franja horaria te queda mejor para que recepción te contacte o coordine una evaluación?

Antes de usar los textos, el owner debe aprobar tono, horario y aviso de privacidad de la clínica.

## WhatsApp directo

1. Responder con el primer mensaje.
2. Crear el lead aunque todavía falte algún dato no obligatorio; dejar lo faltante en próxima acción.
3. Fuente `WhatsApp directo`.
4. Si la persona busca implante/ortodoncia, tiene dolor o quiere agendar, clasificar caliente según el criterio acordado.
5. Abrir el enlace de WhatsApp desde el lead y registrar cada intento.

## Instagram DM

1. No depender de que el hilo quede visible en Instagram.
2. Pedir teléfono o enviar el formulario.
3. Fuente `Instagram DM` aunque luego la conversación continúe por WhatsApp.
4. Crear task y responsable antes de cerrar el DM.

## Llamada

1. Confirmar nombre y número repitiéndolos.
2. Registrar tratamiento, urgencia y disponibilidad durante o inmediatamente después de la llamada.
3. Fuente `Llamada`.
4. Si ya coordinó evaluación, crear primero el lead y luego agendar por el flujo de Agenda.

## Recomendación

1. Registrar quién recomendó sólo si es necesario y sin exponer datos innecesarios.
2. Fuente `Recomendación`.
3. Diferenciar dato recibido de autorización de contacto.
4. Si no corresponde contactar todavía, dejar task de revisión al responsable en vez de iniciar mensajería.

## Si no responde

1. Actualizar intento/estado.
2. Mantener una próxima acción concreta y fecha de seguimiento.
3. No crear leads duplicados para cada conversación.
4. Completar la task anterior sólo después de dejar la siguiente acción cuando corresponda.
5. Archivar únicamente por owner/admin, con motivo; recepción no archiva.

## Cola diaria de Seguimientos

1. Abrir `Seguimientos`, no recorrer toda la lista de Leads.
2. Resolver primero Vencidos, luego Para hoy y No-shows.
3. Usar `Marcar contactado` para registrar contacto y generar la siguiente tarea.
4. Si la persona pidió otra fecha, usar `Posponer` una sola vez; la RPC actualiza la tarea abierta en lugar de duplicarla.
5. Agendar desde el mismo item cuando haya intención concreta.
6. Completar la tarea sólo después de dejar definido el próximo paso.

## Control diario de cierre

- [ ] Todos los mensajes directos atendidos tienen lead o motivo documentado de exclusión.
- [ ] Cada lead manual tiene fuente, responsable y task pendiente o completada.
- [ ] No quedan leads calientes sin contacto.
- [ ] Los seguimientos vencidos tienen acción.
- [ ] No se crearon duplicados por el mismo teléfono.
- [ ] No hay datos clínicos sensibles en notas.

## Fase futura — no implementar ahora

Una fase posterior puede evaluar WhatsApp Cloud API, ManyChat o Meta Lead Ads con webhook entrante y una Edge Function `message-intake` o extensión de `lead-intake`. El servidor podría crear un lead al detectar nombre/teléfono; si faltan datos, crear un lead incompleto o una task para recepción. n8n podría consumir `automation_jobs` después del guardado.

Antes de esa fase se deben definir consentimiento, ownership de la cuenta Meta, plantillas, deduplicación, rate limits, observabilidad, costos y procedimiento de baja. Nada de esto está activo hoy.
## Contactar por WhatsApp sin duplicar trabajo

1. Abrí el lead desde Leads, Seguimientos o Tareas.
2. Presioná **Abrir WhatsApp**. La CRM prepara un mensaje con los datos disponibles del paciente y de la clínica.
3. Revisá el texto en WhatsApp y envialo manualmente si corresponde.
4. Al volver a la CRM, elegí el resultado:
   - **Sí, respondió**: marca el lead `Contactado`, cierra la tarea de contacto y crea el siguiente seguimiento.
   - **No respondió**: registra el intento sin marcarlo como contactado y programa otro contacto.
   - **Número inválido**: registra el problema y crea la acción para verificar el número.
   - **Posponer a mañana**: mantiene la tarea pendiente y mueve su vencimiento.

Abrir WhatsApp por sí solo no confirma contacto. Las plantillas las administra owner/admin en **Configuración → Plantillas de WhatsApp**.

No están automatizados el envío de WhatsApp, WhatsApp Cloud API, ManyChat ni Instagram. El botón siempre deja el control final en recepción.

## Rutina con Vista Hoy y semáforo

1. Entrá a **Dashboard → Hoy** al comenzar el turno.
2. Trabajá primero los items `Urgente`, luego los de `Atención`.
3. Usá la plantilla de la etapa; revisá el texto antes de enviarlo manualmente.
4. Registrá `Sí, respondió`, `No respondió`, `Número inválido` o `Posponer`.
5. Dejá cada oportunidad con cita, próxima acción o cierre con motivo.
6. Antes de terminar el turno, verificá que no queden calientes sin contacto ni tareas vencidas.

Si una oportunidad se pierde, seleccioná el motivo real. `Otro` requiere una nota breve. No uses `Perdido` para ocultar duplicados o limpiar la lista: los datos se conservan y alimentan las métricas.

En el detalle, **Historial comercial** permite responder quién contactó, qué tarea se completó y cuándo se agendó sin leer datos técnicos.
