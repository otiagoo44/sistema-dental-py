# Supabase

Supabase es el backend principal del sistema: Auth, Postgres, RLS y Edge Function `lead-intake`.

Regla central: Supabase guarda primero el lead. n8n automatiza despues desde `automation_jobs`.

## Orden De Migraciones

Aplicar en este orden:

1. `supabase/migrations/20260515021456_create_dental_crm_schema.sql`
2. `supabase/migrations/20260612140000_production_schema_hardening.sql`
3. `supabase/migrations/20260612141000_rls_professional_policies.sql`
4. `supabase/migrations/20260612142000_edge_function_support_indexes.sql`

Comando:

```powershell
npx.cmd supabase db push
```

No ejecutar `seed_demo.sql` en bases con datos reales salvo que quieras cargar datos demo.

## Secrets Edge Function

Configurar sin imprimir valores reales:

```powershell
npx.cmd supabase secrets set FORM_HASH_SALT=REEMPLAZAR_SALT_LARGO --project-ref kfpdworxksqofipmjijz
npx.cmd supabase functions deploy lead-intake --no-verify-jwt --project-ref kfpdworxksqofipmjijz
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son variables reservadas/inyectadas por Supabase Edge Runtime en este proyecto. `FORM_HASH_SALT` es custom y server-side. Nunca poner service role ni salts en Vercel, landing publica, snippets ni navegador.

## Crear Clinica

```sql
insert into public.clinics (
  name, slug, doctor_name, whatsapp, email, owner_email,
  reception_phone, address_link, calendar_link, timezone, status, is_active
) values (
  'Clinica Demo',
  'clinica-demo',
  'Dra. Demo',
  '595981000000',
  'contacto@clinica.test',
  'owner@clinica.test',
  '595981000001',
  'https://maps.example.com',
  'https://calendario.example.com',
  'America/Asuncion',
  'active',
  true
)
returning id;
```

## Crear Formulario Publico

```sql
insert into public.clinic_public_forms (
  clinic_id, clinic_slug, public_token, landing_url, allowed_origins, is_active
) values (
  'CLINIC_ID_REAL',
  'clinica-demo',
  'lf_REEMPLAZAR_TOKEN_LARGO_SEGURO_1234567890',
  'https://clinica-demo.com',
  array['https://clinica-demo.com'],
  true
);
```

La landing envia solo `clinic_slug` y `landing_token`. La Edge Function resuelve el `clinic_id` real y descarta cualquier `clinic_id` enviado por el navegador.

## Crear Settings

```sql
insert into public.clinic_settings (
  clinic_id, opening_hours, treatments, treatment_prices, hot_lead_threshold
) values (
  'CLINIC_ID_REAL',
  'Lunes a viernes 08:00-18:00',
  '["Implante dental", "Ortodoncia / brackets", "Blanqueamiento"]'::jsonb,
  '{"Implante dental": 5000000, "Ortodoncia / brackets": 4000000}'::jsonb,
  80
)
on conflict (clinic_id) do update set
  opening_hours = excluded.opening_hours,
  treatments = excluded.treatments,
  treatment_prices = excluded.treatment_prices,
  hot_lead_threshold = excluded.hot_lead_threshold,
  updated_at = now();
```

## Crear Usuarios

1. Crear usuario en Supabase Auth.
2. Copiar `auth.users.id`.
3. Crear profile:

```sql
insert into public.profiles (id, clinic_id, full_name, email, role, active)
values (
  'AUTH_USER_ID',
  'CLINIC_ID_REAL',
  'Admin Clinica',
  'admin@clinica.test',
  'admin',
  true
);
```

Roles:

- `admin` / `owner`: configura landing, archiva leads, crea/edita leads, agenda y tareas.
- `receptionist`: ve leads, actualiza estado/notas/seguimiento, agenda, confirma/no-show y completa tareas.

## Verificar RLS

Usar `tests/sql-verification.sql` en Supabase SQL Editor o ejecutar consultas equivalentes:

```sql
select n.nspname, c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by c.relname;

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Debe existir RLS en tablas multi-clinica y no debe haber policies DELETE para leads, lead_events, appointments ni tasks desde frontend.
