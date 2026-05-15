# Supabase CRM Dental

Estos archivos preparan la base de datos de un CRM dental multi-clinica con Supabase Auth, PostgreSQL, RLS por `clinic_id`, datos demo opcionales y ejemplo de insercion desde n8n.

## Archivos

- `schema.sql`: crea tablas, constraints, indices, triggers `updated_at`, funciones privadas y politicas RLS.
- `seed_demo.sql`: inserta datos demo para la clinica `DentalPro Paraguay`.
- `n8n_insert_example.sql`: ejemplo de `INSERT` para crear un lead desde n8n.

## Orden De Ejecucion

1. Abrir Supabase SQL Editor.
2. Pegar y ejecutar completo `supabase/schema.sql`.
3. Opcionalmente pegar y ejecutar `supabase/seed_demo.sql`.
4. Usar `supabase/n8n_insert_example.sql` como referencia para el nodo de PostgreSQL o Supabase en n8n.

No ejecutes `seed_demo.sql` si ya tenes datos reales y no queres cargar la clinica demo.

## Bootstrap Del Primer Usuario

1. Crear primero un usuario real desde Supabase Auth.
2. Copiar el `id` real de `auth.users.id`.
3. Insertar un registro en `public.profiles` usando ese `id`, el `clinic_id` correspondiente y `role = 'owner'`.
4. No insertar usuarios manualmente en `auth.users`.

Ejemplo:

```sql
insert into public.profiles (id, clinic_id, full_name, email, role)
values (
  'AUTH_USERS_ID_REAL',
  '00000000-0000-0000-0000-000000000101',
  'Nombre del Owner',
  'owner@example.com',
  'owner'
);
```

## Seguridad Y Keys

n8n debe usar la `service_role key` solo desde backend/server-side. Esa key salta RLS, por lo que nunca debe estar en frontend, landing publica, app web, variables expuestas ni navegador.

n8n debe validar el `clinic_id` antes de insertar leads. No aceptes un `clinic_id` arbitrario enviado desde el formulario publico sin validarlo contra la landing, dominio, token interno o configuracion del workflow.

El frontend debe usar la `anon key` con Supabase Auth. El aislamiento de datos del panel web queda delegado a RLS: cada usuario autenticado solo ve datos de su clinica segun su registro en `profiles`.

## Datos Sensibles

La tabla `leads` esta pensada para informacion comercial y seguimiento. No guardar diagnosticos, historia clinica, imagenes clinicas, documentos medicos ni datos sensibles innecesarios.

## Pruebas Recomendadas

Antes de produccion, crear dos clinicas y dos usuarios en Supabase Auth, asignar cada usuario a una clinica distinta en `profiles`, y verificar que no puedan leer ni modificar datos de la otra clinica.
