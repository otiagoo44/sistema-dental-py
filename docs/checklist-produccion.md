# Checklist Produccion

- [ ] Migraciones no destructivas aplicadas.
- [ ] RLS activo en tablas multi-clinica.
- [ ] Policies revisadas por rol.
- [ ] Edge Function `lead-intake` deployada.
- [ ] Secrets configurados solo en Supabase Edge Functions.
- [ ] Landing conectada a Edge Function.
- [ ] Landing real `https://sistema-dental-py.vercel.app` configurada sin slash final.
- [ ] `allowed_origins` incluye `https://sistema-dental-py.vercel.app` y `http://localhost:5173`.
- [ ] Origins viejos o invalidos responden 403.
- [ ] CRM snippets apuntan a Edge Function.
- [ ] Vercel env vars configuradas.
- [ ] Vite build sin sourcemaps.
- [ ] Supabase Auth URLs configuradas.
- [ ] Admin/owner creado.
- [ ] Receptionist creado.
- [ ] Token correcto probado.
- [ ] Origin Vercel real probado.
- [ ] Origin viejo Netlify rechazado con 403.
- [ ] Token falso probado.
- [ ] `clinic_id` manipulado probado.
- [ ] Telefono invalido probado.
- [ ] Formulario incompleto probado.
- [ ] Duplicado probado.
- [ ] Rate limit probado.
- [ ] Lead aparece en Supabase.
- [ ] Lead aparece en CRM.
- [ ] Usuario de Clinica A no ve Clinica B.
- [ ] Receptionist no puede archivar/configurar.
- [ ] Admin puede archivar/editar.
- [ ] Consulta Agendada crea appointment.
- [ ] Confirmar/Asistio/No Asistio actualizan appointment y lead.
- [ ] No Asistio crea seguimiento para maniana.
- [ ] Tareas se crean/actualizan.
- [ ] `lead_events` registra acciones importantes.
- [ ] `automation_jobs` preparado para n8n.
- [ ] n8n procesa jobs sin ser critico para intake.

No vender como produccion si alguno de los tests criticos de intake o RLS falla.
