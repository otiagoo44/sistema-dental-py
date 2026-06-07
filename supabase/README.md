# Supabase CRM Dental

Estos archivos preparan la base de datos de un CRM dental multi-clinica con Supabase Auth, PostgreSQL, RLS por `clinic_id`, datos demo opcionales y ejemplo de insercion desde n8n.

## Archivos

- `schema.sql`: crea tablas, constraints, indices, triggers `updated_at`, funciones privadas y politicas RLS.
- `security_rls.sql`: migracion segura propuesta para archivado de leads, rol `admin/receptionist`, `Archivado` en status y bloqueo de DELETE operativo.
- `clinic_public_forms.sql`: crea la configuracion publica por landing (`clinic_slug` + `public_token`) con RLS y seed demo `dentalpro`.
- `seed_demo.sql`: inserta datos demo para la clinica `DentalPro Paraguay`.
- `n8n_insert_example.sql`: ejemplo de `INSERT` para crear un lead desde n8n.

## Orden De Ejecucion

1. Abrir Supabase SQL Editor.
2. Pegar y ejecutar completo `supabase/schema.sql`.
3. Si ya tenes una base existente, revisar y ejecutar `supabase/security_rls.sql`.
4. Ejecutar `supabase/clinic_public_forms.sql` para habilitar formularios multi-clinica.
5. Opcionalmente pegar y ejecutar `supabase/seed_demo.sql`.
6. Usar `supabase/n8n_insert_example.sql` y `n8n-universal-workflow.md` como referencia para n8n.

No ejecutes `seed_demo.sql` si ya tenes datos reales y no queres cargar la clinica demo.

## Bootstrap Del Primer Usuario

1. Crear primero un usuario real desde Supabase Auth.
2. Copiar el `id` real de `auth.users.id`.
3. Insertar un registro en `public.profiles` usando ese `id`, el `clinic_id` correspondiente y `role = 'admin'`.
4. No insertar usuarios manualmente en `auth.users`.

Ejemplo:

```sql
insert into public.profiles (id, clinic_id, full_name, email, role)
values (
  'AUTH_USERS_ID_REAL',
  '00000000-0000-0000-0000-000000000101',
  'Nombre del Owner',
  'owner@example.com',
  'admin'
);
```

## Roles

Roles soportados por el CRM:

- `admin`: configuracion, crear lead manual, editar lead completo, archivar, crear/editar tareas.
- `receptionist`: operacion diaria, cambios de estado, agenda, notas, proxima accion, proximo seguimiento y marcar tareas como hechas.

Si un perfil no tiene `role = 'admin'`, el frontend lo trata como `receptionist` por seguridad.

Si tenes datos antiguos con `role = 'owner'` o `role = 'doctor'`, actualizalos manualmente:

```sql
update public.profiles
set role = 'admin'
where id = 'AUTH_USERS_ID_REAL'
  and clinic_id = 'CLINIC_ID_REAL';
```

## Proceso Multi-Clinica

1. Crear una fila en `public.clinics`.
2. Crear el usuario en Supabase Auth.
3. Crear `public.profiles` con el `id` del usuario, `clinic_id` de la clinica y `role` (`admin` o `receptionist`).
4. Crear `public.clinic_public_forms` con `clinic_slug`, `public_token`, `allowed_origins` e `is_active = true`.
5. Configurar la landing con `CLINIC_SLUG`, `LANDING_TOKEN` y webhook universal n8n.
6. Enviar un lead de prueba y verificar que aparece solo para usuarios de esa clinica.

No aceptes un `clinic_id` arbitrario enviado desde el navegador sin validarlo en n8n/Railway contra una configuracion interna.

Ejemplo de formulario publico:

```sql
insert into public.clinic_public_forms (
  clinic_id,
  clinic_slug,
  public_token,
  landing_url,
  allowed_origins,
  is_active
)
values (
  'CLINIC_ID_REAL',
  'clinica-demo',
  'lf_REEMPLAZAR_POR_TOKEN_LARGO',
  'https://clinica-demo.com',
  array['https://clinica-demo.com']::text[],
  true
);
```

## Fallback Para Motivo De Consulta

En landing/n8n, mapear `consultation_reason` asi:

```js
body.consultation_reason ||
body.motivo_consulta ||
body.situacion ||
body.tratamiento ||
null
```

Esto evita que leads comerciales lleguen sin motivo cuando el formulario usa otro nombre de campo.

## Seguridad Y Keys

n8n debe usar la `service_role key` solo desde backend/server-side. Esa key salta RLS, por lo que nunca debe estar en frontend, landing publica, app web, variables expuestas ni navegador.

n8n debe validar el `clinic_id` antes de insertar leads. No aceptes un `clinic_id` arbitrario enviado desde el formulario publico sin validarlo contra la landing, dominio, token interno o configuracion del workflow.

El frontend debe usar la `anon key` con Supabase Auth. El aislamiento de datos del panel web queda delegado a RLS: cada usuario autenticado solo ve datos de su clinica segun su registro en `profiles`.

## Datos Sensibles

La tabla `leads` esta pensada para informacion comercial y seguimiento. No guardar diagnosticos, historia clinica, imagenes clinicas, documentos medicos ni datos sensibles innecesarios.

## Pruebas Recomendadas

Antes de produccion, crear dos clinicas y dos usuarios en Supabase Auth, asignar cada usuario a una clinica distinta en `profiles`, y verificar que no puedan leer ni modificar datos de la otra clinica.
