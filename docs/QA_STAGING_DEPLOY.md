# Despliegue seguro a staging

Esta secuencia evita que `lead-intake` invoque RPC o tablas que todavía no existen. No debe ejecutarse primero en producción.

## 1. Preparar y vincular staging

```bash
supabase login
supabase link --project-ref <STAGING_PROJECT_REF>
supabase migration list --linked
supabase db push --linked --dry-run
```

Confirmar que el plan incluye `20260824162341_enforce_operational_integrity_and_quotes.sql` y no contiene operaciones inesperadas. Nunca usar `supabase db reset --linked`.

## 2. Aplicar solamente las migraciones pendientes

```bash
supabase db push --linked
supabase migration list --linked
```

La migración debe figurar como aplicada antes de desplegar la función o el frontend.

## 3. Verificar PostgreSQL, RPC, RLS y presupuestos

Usar una conexión directa a la base de staging con permisos de administración. Ambos scripts abren una transacción y terminan con `rollback`.

```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/operational-integrity.sql
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/operational-workflows-e2e.sql
```

Verificación de objetos y Realtime:

```sql
select to_regprocedure('public.create_public_lead_intake(uuid,text,text,text,text,text,text,text,integer,text,text,text,text,numeric,text,timestamp with time zone,text,text,text,text,timestamp with time zone,text,text)') as intake_rpc;
select to_regclass('public.quotes') as quotes_table;
select policyname, roles, cmd from pg_policies where schemaname = 'public' and tablename = 'quotes';
select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('leads', 'appointments', 'tasks', 'quotes') order by tablename;
```

Resultado esperado: RPC y tabla no nulos; `quotes_select_same_clinic`; cuatro tablas publicadas. Ejecutar además pruebas manuales con un owner y una recepcionista reales de staging para confirmar que ninguno puede leer otra clínica.

## 4. Desplegar `lead-intake`

La captación es pública y valida su propio token, origen, consentimiento y antiabuso. Por eso el despliegue debe conservar la invocación sin JWT de usuario:

```bash
supabase functions deploy lead-intake --project-ref <STAGING_PROJECT_REF> --no-verify-jwt
```

Confirmar antes que staging tenga `FORM_HASH_SALT`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` configurados como secretos de la función. No copiar sus valores a archivos ni al frontend.

## 5. Prueba de captación en staging

Enviar un formulario real desde un origen permitido y comprobar, en este orden:

1. una sola fila abierta en `leads`;
2. `assigned_to` activo y de la misma clínica, o alerta `lead_assignment_required` si la clínica no tiene usuarios válidos;
3. un `lead_event` de captación;
4. una sola tarea abierta de contacto;
5. `next_action` y `next_followup_at` coherentes;
6. log de formulario aceptado;
7. aparición en Inicio sin recargar la página.

Repetir con teléfono abierto, terminal, token inválido, honeypot, dos recepcionistas, sin recepcionista y otra clínica.

## 6. Desplegar el frontend al final

```bash
cd crm-app
npm test
npm run build:staging
```

Publicar `crm-app/dist` usando el procedimiento habitual del hosting de staging, con las variables públicas de Supabase de staging. No desplegar el frontend antes de que las verificaciones anteriores pasen.

## Criterio de detención

No continuar al paso siguiente si falla una migración, una RPC, RLS, Realtime o cualquier flujo SQL. No implementar una tolerancia permanente que oculte que el backend está desactualizado.
