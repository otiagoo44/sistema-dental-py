# Onboarding De Clinica

Datos necesarios antes del alta:

- Nombre comercial de la clinica.
- Slug publico, por ejemplo `dentalpro`.
- Token publico `lf_...` para landing/iframe.
- Doctor principal.
- WhatsApp comercial.
- Email del duenio.
- Email o telefono de recepcion.
- Link de direccion o Google Maps.
- Link de agenda/calendario si existe.
- Horarios de atencion.
- Tratamientos ofrecidos.
- Tickets estimados por tratamiento.
- Color principal o marca.
- URL de landing. Para `dentalpro`: `https://sistema-dental-py.vercel.app` sin slash final.
- `allowed_origins` exactos: dominio de landing y dominio CRM si usa iframe.
- Usuarios admin/owner.
- Usuarios receptionist.

## Alta En Supabase

1. Crear fila en `public.clinics`.
2. Crear o actualizar `public.clinic_settings`.
3. Crear fila en `public.clinic_public_forms`.
4. Crear usuarios en Supabase Auth.
5. Crear `public.profiles` con rol `admin`, `owner` o `receptionist`.
6. Verificar que `profiles.clinic_id` apunta a la clinica correcta.
7. Para `dentalpro`, confirmar `allowed_origins = ['https://sistema-dental-py.vercel.app', 'http://localhost:5173']` mientras no exista dominio CRM real.

## Prueba Inicial

- Token correcto crea lead.
- Origin real Vercel responde 200.
- Origin viejo o invalido responde 403.
- Token falso responde 403.
- Body con `clinic_id` manipulado se ignora.
- Telefono invalido responde 400.
- Duplicado actualiza el lead existente sin romper estado avanzado.
- Lead aparece en CRM.
- `lead_events`, `tasks`, `form_submission_logs` y `automation_jobs` quedan poblados.

## Capacitacion

- Explicar Lead Caliente, Medio y Frio.
- Practicar contacto por WhatsApp.
- Practicar cambio de estado.
- Practicar agenda y confirmacion.
- Practicar No Asistio.
- Practicar completar tareas.
- Aclarar que recepcion no edita tokens ni archiva leads.
