# QA RLS Multi-clinica

Estas pruebas requieren usuarios Auth reales. No se simulan con service role porque eso omite RLS.

Estado del proyecto nuevo al 2026-08-21: los tres usuarios y profiles QA ya fueron creados, confirmados y verificados. `tests/rls-real-users.sql` paso con `ROLLBACK`; las instrucciones siguientes sirven para recrearlos en otra instalacion.

## Usuarios

Crear en Supabase Auth con contrasenas temporales fuertes y copiar cada UUID:

- `admin-dentalpro@example.test` -> DentalPro -> `owner`
- `recepcion-dentalpro@example.test` -> DentalPro -> `receptionist`
- `admin-qab@example.test` -> QA Clinic B -> `owner`

Luego insertar los profiles desde SQL Editor reemplazando los tres UUID:

```sql
insert into public.profiles (id, clinic_id, full_name, email, role, active)
values
  ('UUID_ADMIN_DENTALPRO', '00000000-0000-0000-0000-000000000101', 'Admin DentalPro QA', 'admin-dentalpro@example.test', 'owner', true),
  ('UUID_RECEPCION_DENTALPRO', '00000000-0000-0000-0000-000000000101', 'Recepcion DentalPro QA', 'recepcion-dentalpro@example.test', 'receptionist', true),
  ('UUID_ADMIN_QAB', '00000000-0000-0000-0000-000000000102', 'Admin QA Clinic B', 'admin-qab@example.test', 'owner', true)
on conflict (id) do update set
  clinic_id = excluded.clinic_id,
  full_name = excluded.full_name,
  email = excluded.email,
  role = excluded.role,
  active = true,
  updated_at = now();
```

## Matriz Manual

| Usuario | Debe poder | Debe fallar |
| --- | --- | --- |
| DentalPro owner | Ver/editar/archivar DentalPro; forms/settings; agendar y completar task | Ver QA Clinic B; DELETE |
| DentalPro receptionist | Ver/editar campos permitidos; agendar/completar por RPC | Archivar; forms/settings; ver QA Clinic B; INSERT/UPDATE appointment directo |
| QA Clinic B owner | Ver/editar QA Clinic B | Ver DentalPro; DELETE |

Para cada usuario iniciar sesion en una ventana privada distinta y registrar captura/resultados. Las operaciones de agenda deben usar `schedule_lead_appointment`, `update_appointment_outcome` y `complete_task`.

Casos obligatorios: doble reserva devuelve `Ese horario ya esta ocupado para este doctor.`; No Asistio deja seguimiento manana 09:00 en `America/Asuncion`; usuario sin profile recibe pantalla de acceso no configurado.

Verificacion DB con los usuarios Auth permanentes:

```powershell
npx.cmd supabase db query --linked --file tests/rls-real-users.sql
```
