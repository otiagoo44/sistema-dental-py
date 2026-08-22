# Onboarding de la primera clínica

Guía operativa para instalar el CRM desde cero sin agregar integraciones complejas. El alta no termina al crear usuarios: termina cuando un lead sintético y luego un lead real autorizado recorren formulario, CRM, tarea y agenda sin mezcla entre clínicas.

## 1. Alcance del piloto

Incluido:

- CRM multi-clínica con owner/admin y receptionist.
- Leads de formulario y carga manual.
- Agenda, tareas, no-show, archivado y public form.
- Landing mínima, botón, iframe o integración POST según el escenario.
- Capacitación y soporte de primera semana.

No incluido en esta fase: WhatsApp Cloud API, ManyChat, lectura automática de Instagram DM, Meta Lead Ads automático, n8n operativo o historia clínica. El CRM gestiona datos comerciales y de contacto; no se deben pedir diagnósticos ni documentos clínicos sensibles.

## 2. Datos que se piden a la clínica

- Razón/nombre comercial y slug deseado.
- Responsable contractual y de privacidad.
- Doctor/es, responsables de recepción y roles.
- WhatsApp Business, email, dirección y enlaces públicos.
- Horarios, feriados conocidos y zona horaria; para Paraguay usar `America/Asuncion`.
- Tratamientos, valor estimado y criterio de lead caliente.
- Mensajes de primer contacto, seguimiento y no-show.
- Logo, colores y dominio, si existen.
- Situación digital: sin web, web existente o sólo WhatsApp/Instagram.
- Persona con acceso al dominio/webmaster y ventana autorizada de cambios.

No solicitar contraseñas por chat. Usar invitaciones o un gestor seguro y retirar accesos temporales al cerrar el trabajo.

## 3. Alta técnica en Supabase

Realizar desde un entorno administrativo controlado o SQL Editor, nunca desde el frontend y nunca pegando `service_role` en Vercel o el navegador.

1. Crear `public.clinics` con slug único, zona horaria, datos comerciales y estado activo.
2. Crear `public.clinic_settings` con horarios, tratamientos, precios, umbral y mensajes acordados.
3. Crear `public.clinic_public_forms` con:
   - `clinic_id` interno correcto;
   - `clinic_slug` público y único;
   - token aleatorio `lf_...` de alta entropía;
   - `landing_url` exacta;
   - `allowed_origins` exactos, con esquema y sin slash final;
   - `is_active = true` sólo al comenzar las pruebas.
4. Crear usuarios en Supabase Auth por invitación o contraseña temporal.
5. Crear `public.profiles` para cada usuario, con el mismo `clinic_id`, `active = true` y rol `owner`, `admin` o `receptionist`.
6. Comprobar que al menos un owner/admin puede recuperar acceso antes de entregar recepción.
7. Configurar tratamientos, horarios, responsables y mensajes. Si aún no hay UI para un ajuste, hacerlo mediante el proceso SQL versionado y revisado.
   La Agenda muestra por defecto slots cada 30 minutos, 08:00–12:00 y 14:00–18:00; documentar cualquier diferencia entre esa ayuda visual y `opening_hours` hasta parametrizar completamente los slots.
8. Configurar Auth Site URL y Redirect URLs del dominio CRM final o staging.
9. Activar MFA para owner/admin cuando el plan y el flujo operativo lo permitan.
10. Ejecutar la verificación SQL/RLS y registrar fecha/commit, sin exportar secretos.

Controles obligatorios:

- `anon` no tiene acceso directo a tablas CRM.
- RLS está activo y el usuario sólo ve su clínica.
- El frontend usa publishable/anon key, nunca secret/service role.
- El public form resuelve `clinic_id` en servidor; el navegador no lo elige.
- `Nuevo lead` resuelve `clinic_id` desde el profile autenticado.
- No existen policies ni controles de hard delete operativos.

## 4. Escenario A — La clínica no tiene página web

Proceso recomendado:

1. Preparar una mini landing enfocada en un único objetivo: solicitar evaluación.
2. Publicarla en dominio propio si la clínica puede configurarlo; usar subdominio temporal de staging durante la validación.
3. Conectar el formulario a `lead-intake` con `clinic_slug`, token, datos comerciales y consentimiento.
4. Completar el alta de clínica, public form y allowed origins.
5. Crear owner/admin y receptionist.
6. Configurar tratamientos, horarios, responsables y mensajes.
7. Enviar un lead sintético desde el dominio publicado.
8. Confirmar lead, event, task, jobs y log accepted; luego verlo con ambos roles.
9. Capacitar recepción con un lead de práctica y el flujo de no-show.
10. Entregar accesos, URLs, manual y checklist firmada.

Tiempo orientativo: media a una jornada para una landing mínima con contenido aprobado y DNS disponible; DNS o aprobación de textos pueden extender el calendario. Riesgo: bajo a medio, concentrado en dominio, diseño móvil, consentimiento y ownership del contenido.

La clínica debe proveer: marca básica, textos aprobados, datos de contacto, tratamientos, responsable de dominio y aceptación del aviso de privacidad.

Prueba de aceptación:

- móvil y desktop;
- sin consentimiento no envía;
- con consentimiento usa el endpoint nuevo;
- no envía `clinic_id` ni secretos;
- el lead aparece sólo en la clínica correcta;
- recepción puede trabajarlo y agendarlo.

## 5. Escenario B — La clínica ya tiene página web

Elegir una sola opción para el piloto. No reemplazar formularios ni scripts críticos sin backup, acceso técnico autorizado y plan de reversión.

| Opción | Cuándo usarla | Riesgo | Tiempo técnico estimado | Necesita la clínica |
|---|---|---:|---:|---|
| Botón externo | Acceso limitado, web frágil o salida rápida | Bajo | 30–90 min | Acceso para editar CTA y URL destino |
| Iframe | Quiere conservar la página y embeber el formulario | Medio | 1–3 h | Acceso HTML/CMS, dominio exacto, prueba móvil |
| Integración directa | Tiene webmaster y desea mantener su formulario actual | Medio/alto | 4–8 h, según stack | Repo/CMS, backup, staging, contacto técnico |

Los tiempos asumen accesos y contenido listos; no incluyen espera de terceros o DNS.

### Opción 1 — Botón externo

Agregar un CTA `Agendar evaluación` que abra la landing o `/form/{clinic_slug}` por HTTPS.

Usar cuando: se necesita el camino más simple, la web es administrada por un tercero o no conviene tocar el formulario existente.

Riesgo: bajo. Puede haber abandono al cambiar de dominio; mitigarlo con marca consistente y mensaje claro.

Cómo probar:

- abrir el CTA en móvil y desktop;
- confirmar destino y clínica correctos;
- probar regreso a la web;
- enviar sin/con consentimiento;
- confirmar el lead en CRM y aislamiento RLS.

### Opción 2 — Iframe

Insertar el formulario:

```html
<iframe
  src="https://URL-CRM/form/CLINIC_SLUG?landing_token=TOKEN_PUBLICO"
  title="Agendar evaluación"
  width="100%"
  height="720"
  style="border:0; border-radius:16px"
></iframe>
```

El snippet real se obtiene desde Configuración por un owner/admin. No guardarlo en tickets públicos. Registrar el dominio exacto de la clínica y del CRM en la configuración de origins según el flujo desplegado.

Usar cuando: el CMS acepta iframe, la clínica quiere mantener al visitante en su sitio y el diseño se puede probar en varios anchos.

Riesgo: medio por altura, scroll, teclado móvil, cookies/políticas del navegador y políticas `frame-ancestors` del hosting.

Cómo probar:

- 320 px, 375 px, tablet y desktop;
- navegación por teclado y labels;
- sin scroll horizontal ni doble scroll problemático;
- consentimiento y errores visibles;
- request al endpoint nuevo sin `clinic_id`;
- lead sólo en la clínica correcta.

### Opción 3 — Integración directa

Adaptar el formulario existente para hacer POST a `lead-intake`. Enviar únicamente los campos documentados, `clinic_slug`, `landing_token` y consentimiento; jamás `clinic_id` confiable ni claves privadas.

Usar cuando: existe acceso técnico, staging, backup y un webmaster que conoce el stack.

Riesgo: medio/alto porque puede afectar validación, estilos, analítica o formularios actuales.

Proceso:

1. Exportar o versionar un backup verificable.
2. Documentar comportamiento anterior y rollback.
3. Implementar primero en staging.
4. Agregar origin exacto al public form.
5. Probar respuestas 200, 400, 403 y mensaje al usuario.
6. Publicar en ventana acordada.
7. Repetir smoke test y mantener rollback listo.

Cómo probar: formulario vacío/inválido, sin consentimiento, origen correcto/incorrecto, teléfono duplicado, éxito, visibilidad en CRM, event/task/jobs/log y ausencia de secretos en Network/source map.

## 6. Escenario C — Sólo WhatsApp/Instagram y no quiere página

1. Crear una landing/form mínimo; no hace falta un sitio corporativo completo.
2. Publicar un enlace estable y corto en la bio de Instagram.
3. Agregar el enlace al perfil y mensajes rápidos de WhatsApp Business.
4. Usar el texto: `Para no perder tus datos y agendarte bien, completá este formulario.`
5. Si el paciente no quiere abrir el formulario, recepción usa `Nuevo lead` y elige la fuente real.
6. Revisar semanalmente cuántos leads llegaron por enlace versus carga manual.

Tiempo orientativo: 2–4 h si se reutiliza el formulario embebido ya publicado. Riesgo: bajo; el principal riesgo es que recepción omita la carga manual.

No conectar WhatsApp Cloud API ni ManyChat durante este piloto.

## 7. Prueba real controlada

Primero ejecutar un caso sintético con teléfono único. Sólo después usar un lead real con consentimiento/contacto legítimo.

- [ ] El lead aparece en menos de 10 segundos.
- [ ] Nombre, teléfono, tratamiento, fuente y consentimiento son correctos.
- [ ] Score/clasificación y próxima acción son coherentes.
- [ ] Existe event y task; para formulario público existen además jobs/log accepted.
- [ ] Receptionist ve y puede trabajar el lead.
- [ ] Owner/admin ve configuración y puede archivar; recepción no.
- [ ] El otro tenant no ve ninguna fila ni cambio de conteo.
- [ ] Agenda, doble reserva, confirmación, asistencia y no-show funcionan por RPC.

## 8. Capacitación de recepción

Sesión práctica de 45–60 minutos:

1. Dashboard y `Prioridad de hoy`.
2. `Nuevo lead` desde WhatsApp/Instagram/llamada/presencial en menos de 45 segundos.
3. Elegir fuente, tratamiento, urgencia, situación, responsable y próxima acción desde menús.
4. Usar `Guardar lead` o `Guardar y agendar`.
5. Trabajar `Seguimientos`: contactar, posponer, agendar, completar tarea y dejar nota.
6. Agenda visual: día, profesional, slots disponibles/ocupados y doble reserva.
7. Confirmado, Asistió, No Asistió y reprogramación.
8. Completar tareas y dejar notas comerciales breves.
9. Qué no puede tocar: Métricas, tokens, origins, usuarios, archivado y datos de otra clínica.
10. Cierre de sesión y manejo de incidentes.

La capacitación se aprueba cuando la recepcionista completa un caso de punta a punta sin ayuda.

## 9. Entrega

Entregar por canal seguro:

- URL CRM y URL pública.
- Invitaciones de usuarios; nunca una lista de contraseñas en documento compartido.
- Roles y responsables aprobados.
- Guía de recepción y QA firmada.
- Contacto de soporte, horario y severidades.
- Inventario de dominio, hosting y webmaster.
- Fecha de próxima revisión de accesos, backups y privacidad.

No entregar `service_role`, secret keys, salts, tokens internos de administración ni acceso personal del implementador.

## 10. Soporte de la primera semana

- Día 1: acompañar primer lead real y revisar errores de Console/Edge/DB sin copiar PII.
- Día 2: revisar leads sin tarea, tareas vencidas y fuentes manuales.
- Día 3: observar agenda, confirmaciones y un no-show de práctica si no hubo uno real.
- Día 5: revisar permisos, sesiones compartidas y dudas de recepción.
- Día 7: reunión corta con owner; documentar métricas, incidencias y decisión de continuar.

No ampliar alcance durante la estabilización salvo error crítico. Las automatizaciones de mensajería quedan para una fase posterior con consentimiento, plantillas, rate limits y ownership definidos.
