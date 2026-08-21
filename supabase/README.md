# Supabase

Supabase es el backend principal del sistema: Auth, Postgres, RLS y Edge Function `lead-intake`.

Regla central: Supabase guarda primero el lead. n8n automatiza despues desde `automation_jobs`.

## Orden De Migraciones

Aplicar en este orden:

1. `supabase/migrations/20260515021456_create_dental_crm_schema.sql`
2. `supabase/migrations/20260612140000_production_schema_hardening.sql`
3. `supabase/migrations/20260612141000_rls_professional_policies.sql`
4. `supabase/migrations/20260612142000_edge_function_support_indexes.sql`
5. `supabase/migrations/20260821180858_rebuild_new_supabase_production_schema.sql`

Comando:

```powershell
npx.cmd supabase db push --dry-run --linked
npx.cmd supabase db push --linked
```

Para una instalacion QA nueva ejecutar `supabase/seed_qa.sql` una vez aplicadas las migraciones. Es idempotente y solo carga datos sinteticos; no ejecutar seeds en bases con datos reales.

## Secrets Edge Function

Configurar sin imprimir valores reales:

```powershell
npx.cmd supabase secrets set FORM_HASH_SALT=REEMPLAZAR_SALT_LARGO --project-ref unybqqzhgqxhrwucrofm
npx.cmd supabase functions deploy lead-intake --no-verify-jwt --project-ref unybqqzhgqxhrwucrofm
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

Para `dentalpro`, la landing real actual es `https://sistema-dental-py.vercel.app` sin slash final. `http://localhost:5173` se mantiene para pruebas locales.

```sql
insert into public.clinic_public_forms (
  clinic_id, clinic_slug, public_token, landing_url, allowed_origins, is_active
) values (
  'CLINIC_ID_REAL',
  'clinica-demo',
  'lf_REEMPLAZAR_TOKEN_LARGO_SEGURO_1234567890',
  'https://sistema-dental-py.vercel.app',
  array['https://sistema-dental-py.vercel.app', 'http://localhost:5173'],
  true
);
```

La landing envia `clinic_slug`, `landing_token`, los datos comerciales y `consentimiento_contacto=true`. La Edge Function resuelve el `clinic_id` real y descarta cualquier `clinic_id` enviado por el navegador.

El dominio CRM se configura aparte en Supabase Auth. No confundir landing publica con `https://TU-CRM.vercel.app`.

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

Para probar RPCs y aislamiento con claims `authenticated` sin dejar usuarios de test, ejecutar `tests/rls-rpc-transactional.sql`; el script finaliza con `ROLLBACK`.
