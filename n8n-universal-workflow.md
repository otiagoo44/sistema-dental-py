# n8n Universal - Leads Multi-Clinica

Objetivo: una sola landing/webhook reusable para multiples clinicas.

Flujo:

1. Webhook recibe el lead.
2. Code normaliza input y valida `clinic_slug` + `landing_token`.
3. HTTP Supabase busca `clinic_public_forms`.
4. IF: si no existe o no esta activo, responde `403`.
5. Code calcula `score`, `classification`, `phone_plus`, `whatsapp_link`, `consultation_reason`.
6. HTTP Supabase upsert en `public.leads` usando el `clinic_id` real obtenido desde Supabase.
7. Respond `{ success:true, message:"Datos enviados correctamente", classification, score }`.

## Variables n8n

Configurar como credenciales/variables de entorno del workflow, nunca en frontend:

- `SUPABASE_URL`: `https://PROJECT_REF.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`: service role key solo server-side en n8n/Railway

## Webhook

Metodo: `POST`

Body minimo esperado:

```json
{
  "clinic_slug": "dentalpro",
  "landing_token": "lf_xxxxx",
  "nombre": "Laura",
  "telefono": "+595981000000",
  "tratamiento": "Implante dental",
  "urgencia": "Hoy",
  "evaluacion_previa": "No",
  "situacion": "Quiero agendar una consulta",
  "consultation_reason": "Le falta una pieza",
  "origen": "Landing odontologia",
  "pagina": "implantes",
  "fecha_envio": "auto"
}
```

Ignorar siempre cualquier `clinic_id` enviado por frontend.

## Code: normalizar input

```js
const body = $json.body || $json;
const headers = $json.headers || {};
const clinic_slug = String(body.clinic_slug || '').trim().toLowerCase();
const landing_token = String(body.landing_token || '').trim();

if (!clinic_slug || !landing_token) {
  return [{
    json: {
      authorized: false,
      statusCode: 400,
      message: 'clinic_slug y landing_token son obligatorios',
      body,
      headers,
    },
  }];
}

return [{
  json: {
    authorized: true,
    clinic_slug,
    landing_token,
    body,
    headers,
  },
}];
```

## HTTP Supabase: buscar formulario

Metodo: `GET`

URL:

```text
{{$env.SUPABASE_URL}}/rest/v1/clinic_public_forms?select=clinic_id,clinic_slug,allowed_origins,is_active&clinic_slug=eq.{{$json.clinic_slug}}&public_token=eq.{{$json.landing_token}}&is_active=eq.true&limit=1
```

Headers:

```text
apikey: {{$env.SUPABASE_SERVICE_ROLE_KEY}}
Authorization: Bearer {{$env.SUPABASE_SERVICE_ROLE_KEY}}
Content-Type: application/json
```

## IF no autorizado

Condicion: la respuesta del lookup no tiene ningun item.

Responder `403`:

```json
{
  "success": false,
  "message": "Formulario no autorizado"
}
```

## Code opcional: validar Origin

Si el Webhook recibe header `origin`, validar contra `allowed_origins`. Si `allowed_origins` esta vacio, permitir.

```js
const form = $items('HTTP Supabase: buscar formulario')[0].json;
const normalized = $items('Code: normalizar input')[0].json;
const headers = normalized.headers || {};
const origin = headers.origin || headers.Origin || '';
const allowed = Array.isArray(form.allowed_origins) ? form.allowed_origins : [];

if (origin && allowed.length > 0 && !allowed.includes(origin)) {
  return [{
    json: {
      authorized: false,
      statusCode: 403,
      message: 'Origen no autorizado',
    },
  }];
}

return [{ json: { authorized: true } }];
```

## Code: calcular lead

```js
const form = $items('HTTP Supabase: buscar formulario')[0].json;
const input = $items('Code: normalizar input')[0].json.body;

const digits = String(input.telefono || '').replace(/\D/g, '');
let phone_plus = null;
if (digits) {
  phone_plus = digits.startsWith('595') ? `+${digits}` : `+595${digits.replace(/^0+/, '')}`;
}

const treatment = input.tratamiento || input.treatment || null;
const urgency = input.urgencia || input.urgency || null;
const situation = input.situacion || input.situation || null;
const consultation_reason =
  input.consultation_reason ||
  input.motivo_consulta ||
  situation ||
  treatment ||
  null;

let score = 40;
if (/implante|ortodoncia|carilla/i.test(String(treatment || ''))) score += 35;
if (/hoy|urgencia|dolor|molestia/i.test(`${urgency} ${situation} ${consultation_reason}`)) score += 35;
if (phone_plus) score += 20;

const classification = score >= 100 ? 'Lead Caliente' : score >= 70 ? 'Lead Medio' : 'Lead Frío';
const whatsapp_link = phone_plus ? `https://wa.me/${phone_plus.replace(/\D/g, '')}` : null;

return [{
  json: {
    clinic_id: form.clinic_id,
    name: input.nombre || input.name || 'Lead sin nombre',
    phone: input.telefono || input.phone || null,
    phone_plus,
    treatment,
    urgency,
    score,
    classification,
    status: 'Nuevo',
    situation,
    evaluation_previous: input.evaluacion_previa || input.evaluation_previous || null,
    consultation_reason,
    estimated_value: null,
    next_action: 'Contactar por WhatsApp',
    next_followup_at: new Date().toISOString(),
    contact_attempts: 0,
    whatsapp_link,
    source: input.origen || input.source || 'Landing odontologia',
    page: input.pagina || input.page || null,
    notes: 'Creado automaticamente por n8n universal.',
  },
}];
```

## HTTP Supabase: upsert lead

Metodo: `POST`

URL:

```text
{{$env.SUPABASE_URL}}/rest/v1/leads?on_conflict=clinic_id,phone_plus
```

Headers:

```text
apikey: {{$env.SUPABASE_SERVICE_ROLE_KEY}}
Authorization: Bearer {{$env.SUPABASE_SERVICE_ROLE_KEY}}
Content-Type: application/json
Prefer: resolution=merge-duplicates,return=representation
```

Body: JSON del nodo `Code: calcular lead`.

Importante: `clinic_id` debe venir solo desde `clinic_public_forms`, nunca desde el body publico.

## Respond success

```json
{
  "success": true,
  "message": "Datos enviados correctamente",
  "classification": "{{$json.classification}}",
  "score": "{{$json.score}}"
}
```

## Tests obligatorios

- Token correcto crea lead en la clinica correcta.
- Token falso responde 403 y no crea lead.
- `clinic_id` manipulado en body se ignora.
- Slug/token A crea solo en Clinica A.
- Slug/token B crea solo en Clinica B.
- `consultation_reason` se guarda; si falta, usa fallback.
