# CRM Dental

Aplicacion React/Vite para operar el CRM dental conectado a Supabase Auth y tablas protegidas con RLS por `clinic_id`.

## Variables de entorno

Crear `crm-app/.env` con:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Usar solo la anon key en frontend. La service role key no debe estar en esta app.

## Desarrollo

```bash
npm install
npm run dev
```

## Login de prueba

1. Crear un usuario en Supabase Auth.
2. Insertar su registro en `public.profiles` con el mismo `id`, un `clinic_id` valido y un `role`.
3. Iniciar sesion con email y password en la app.

La app carga `profiles` por `auth.users.id`, obtiene `clinic_id` desde el perfil y filtra todas las consultas por esa clinica.
