import { useEffect, useState } from 'react';
import { Clipboard, Eye, Loader2, Plus, RotateCcw, Save } from 'lucide-react';
import { slugify, generatePublicToken, formatAllowedOrigins, publicFormPayloadExample, publicFormFetchSnippet, publicFormIframeSnippet } from '../lib/crmDomain';
import { buildMessageFromTemplate, WHATSAPP_TEMPLATE_DEFINITIONS, WHATSAPP_VARIABLES } from '../lib/messages';
import { humanizeCrmError } from '../lib/errors';
import { Info, Field, TextArea } from '../components/crm/CrmPrimitives';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';

export default function SettingsView({
  clinic,
  profile,
  publicFormConfig,
  savingPublicForm,
  onSavePublicForm,
  messageTemplates,
  savingTemplates,
  onSaveMessageTemplates,
  treatmentPrices,
  savingPrices,
  onSaveTreatmentPrice,
  clinicSettings,
  profiles = [],
  setNotice,
}) {
  const [section, setSection] = useState('clinic');
  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Administración" title="Configuración" subtitle="Datos de la clínica, plantillas y conexión segura del formulario público. Sólo visible para owner/admin." />
      <div className="scrollbar-soft flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-card p-2">
        {[["clinic", "Clínica"], ["treatments", "Tratamientos y precios"], ["hours", "Horarios"], ["messages", "Mensajes"], ["team", "Equipo"], ["capture", "Captación"]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setSection(id)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${section === id ? 'bg-mint text-inverse' : 'text-textSoft hover:bg-elevated hover:text-cream'}`}>{label}</button>
        ))}
      </div>
      {section === 'clinic' ? <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold">Datos de la clínica</h2>
          <div className="grid gap-4">
            <Info label="Nombre" value={clinic?.name || 'Sin dato'} />
            <Info label="Doctor" value={clinic?.doctor_name || 'Sin dato'} />
            <Info label="WhatsApp" value={clinic?.whatsapp || 'Sin dato'} />
            <Info label="Link de agenda" value={clinic?.calendar_link || 'Sin dato'} />
            <Info label="Direccion" value={clinic?.address_link || 'Sin dato'} />
            <Info label="Color principal" value={clinic?.primary_color || 'Sin dato'} />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold">Usuario actual</h2>
          <div className="grid gap-4">
            <Info label="Nombre" value={profile?.full_name || 'Sin dato'} />
            <Info label="Email" value={profile?.email || 'Sin dato'} />
            <Info label="Rol" value={profile?.role || 'Sin dato'} />
          </div>
        </Card>
      </div> : null}

      {section === 'capture' ? <PublicFormSettings clinic={clinic} config={publicFormConfig} saving={savingPublicForm} onSave={onSavePublicForm} setNotice={setNotice} /> : null}
      {section === 'messages' ? <WhatsAppTemplatesSettings
        templates={messageTemplates}
        saving={savingTemplates}
        onSave={onSaveMessageTemplates}
        clinic={clinic}
        setNotice={setNotice}
      /> : null}
      {section === 'treatments' ? <TreatmentPricesSettings prices={treatmentPrices} saving={savingPrices} onSave={onSaveTreatmentPrice} /> : null}
      {section === 'hours' ? <Card className="p-5"><h2 className="text-lg font-semibold text-cream">Horarios de atención</h2><p className="mt-2 text-sm leading-6 text-textMuted">La Agenda usa este horario para proponer turnos disponibles.</p><div className="mt-4"><Info label="Horario configurado" value={clinicSettings?.opening_hours || 'Sin horario configurado'} /></div></Card> : null}
      {section === 'team' ? <TeamSettings profiles={profiles} /> : null}
    </section>
  );
}

function TeamSettings({ profiles }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-cream">Equipo activo</h2>
      <p className="mt-1 text-sm text-textMuted">Personas disponibles para asignación y análisis operativo.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {profiles.map((member) => <Card key={member.id} className="p-4"><p className="font-bold text-cream">{member.full_name || member.email}</p><p className="mt-1 text-sm text-textMuted">{member.email} · {roleLabel(member.role)}</p></Card>)}
        {!profiles.length ? <Card className="p-4 text-sm text-textMuted">No hay integrantes activos para mostrar.</Card> : null}
      </div>
    </section>
  );
}

function roleLabel(role) {
  return { owner: 'Owner', admin: 'Administración', receptionist: 'Recepción' }[role] || role || 'Sin rol';
}

function TreatmentPricesSettings({ prices = [], saving, onSave }) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(prices.map((price) => [price.id, { treatment: price.treatment || '', estimated_price: price.estimated_price ?? '' }])));
  const [newTreatment, setNewTreatment] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setDrafts(Object.fromEntries(prices.map((price) => [price.id, { treatment: price.treatment || '', estimated_price: price.estimated_price ?? '' }])));
  }, [prices]);

  async function saveExisting(id) {
    setFormError('');
    try { await onSave(drafts[id]); } catch (saveError) { setFormError(saveError.message || 'No se pudo guardar el precio.'); }
  }

  async function addTreatment() {
    setFormError('');
    try {
      await onSave({ treatment: newTreatment, estimated_price: newPrice });
      setNewTreatment('');
      setNewPrice('');
    } catch (saveError) { setFormError(saveError.message || 'No se pudo agregar el tratamiento.'); }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-card p-5 text-cream shadow-glow">
      <div className="mb-5 border-b border-slate-200 pb-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-mint">Configuración comercial</p>
        <h2 className="mt-1 text-xl font-semibold">Tratamientos y precios</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-textMuted">Son precios de referencia para autocompletar presupuestos. Cada presupuesto puede modificarse y conserva su monto histórico.</p>
      </div>
      {formError ? <div role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{formError}</div> : null}
      <div className="space-y-3">
        {prices.map((price) => (
          <div key={price.id} className="grid gap-3 rounded-xl border border-slate-200 bg-soft p-3 md:grid-cols-[1fr_220px_auto] md:items-end">
            <Field label="Tratamiento" value={drafts[price.id]?.treatment || ''} onChange={(value) => setDrafts((current) => ({ ...current, [price.id]: { ...current[price.id], treatment: value } }))} disabled={saving} />
            <Field label="Precio de referencia (Gs.)" type="number" min="0" value={drafts[price.id]?.estimated_price ?? ''} onChange={(value) => setDrafts((current) => ({ ...current, [price.id]: { ...current[price.id], estimated_price: value } }))} disabled={saving} />
            <Button size="sm" type="button" onClick={() => saveExisting(price.id)} loading={saving}><Save className="h-4 w-4" />Guardar</Button>
          </div>
        ))}
        {!prices.length ? <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-textMuted">Todavía no hay precios configurados. Agregá el primero abajo.</p> : null}
      </div>
      <div className="mt-5 rounded-xl border border-mint/20 bg-mint/[0.05] p-4">
        <h3 className="font-semibold text-cream">Agregar tratamiento</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
          <Field label="Tratamiento" value={newTreatment} onChange={setNewTreatment} disabled={saving} placeholder="Ej. Implantes" />
          <Field label="Precio de referencia (Gs.)" type="number" min="1" value={newPrice} onChange={setNewPrice} disabled={saving} placeholder="Ej. 8500000" />
          <Button size="sm" type="button" onClick={addTreatment} loading={saving}><Plus className="h-4 w-4" />Agregar</Button>
        </div>
      </div>
    </section>
  );
}

function buildTemplateDraft(templates = []) {
  return Object.fromEntries(WHATSAPP_TEMPLATE_DEFINITIONS.map((definition) => {
    const stored = templates.find((template) => template.template_key === definition.key);
    return [definition.key, stored?.message || definition.message];
  }));
}

function WhatsAppTemplatesSettings({ templates, saving, onSave, clinic, setNotice }) {
  const [draft, setDraft] = useState(() => buildTemplateDraft(templates));
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setDraft(buildTemplateDraft(templates));
    setFormError('');
  }, [templates]);

  async function handleSave() {
    setFormError('');
    try {
      await onSave(WHATSAPP_TEMPLATE_DEFINITIONS.map((definition) => ({
        template_key: definition.key,
        name: definition.name,
        situation: definition.situation,
        message: String(draft[definition.key] || '').trim(),
      })));
    } catch (saveError) {
      setFormError(humanizeCrmError(saveError, 'No se pudieron guardar las plantillas. Intentá de nuevo.'));
    }
  }

  const exampleLead = { name: 'Laura', treatment: 'Implante dental', urgency: 'Esta semana', situation: 'Quiere agendar una consulta', source: 'WhatsApp directo' };
  const exampleAppointment = { appointment_date: 'viernes 28', appointment_time: '10:00' };

  function previewMessage(definition) {
    return buildMessageFromTemplate(
      draft[definition.key] || definition.message,
      exampleLead,
      exampleAppointment,
      { name: clinic?.name, whatsapp: clinic?.whatsapp, calendar_link: clinic?.calendar_link },
    );
  }

  async function copyPreview(definition) {
    await navigator.clipboard.writeText(previewMessage(definition));
    setNotice?.(`Vista previa de “${definition.name}” copiada.`);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-card p-5 text-cream shadow-glow">
      <div className="mb-5 border-b border-slate-200 pb-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-mint">Mensajes por clínica</p>
        <h2 className="mt-1 text-xl font-semibold">Plantillas de WhatsApp</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-textMuted">
          Recepción usa estas plantillas al abrir WhatsApp. El sistema sólo prepara el texto: nunca lo envía automáticamente.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {WHATSAPP_VARIABLES.map((variable) => (
            <code key={variable} className="rounded-lg border border-mint/20 bg-mint/10 px-2 py-1 text-xs text-mint">{variable}</code>
          ))}
        </div>
      </div>

      {formError ? <div role="alert" aria-live="assertive" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{formError}</div> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        {WHATSAPP_TEMPLATE_DEFINITIONS.map((definition) => (
          <article key={definition.key} className="rounded-2xl border border-slate-200 bg-soft p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-cream">{definition.name}</h3>
                <p className="mt-1 text-xs leading-5 text-textMuted">{definition.description}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => setDraft((current) => ({ ...current, [definition.key]: definition.message }))}
                disabled={saving}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restaurar
              </Button>
            </div>
            <TextArea
              label="Mensaje"
              value={draft[definition.key] || ''}
              onChange={(value) => setDraft((current) => ({ ...current, [definition.key]: value }))}
              disabled={saving}
              className="min-h-56"
            />
            <details className="mt-3 rounded-xl border border-slate-200 bg-card p-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold text-mint"><Eye className="h-3.5 w-3.5" />Vista previa con datos de ejemplo</summary>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-textSoft">{previewMessage(definition)}</p>
              <Button className="mt-3" size="sm" variant="secondary" type="button" onClick={() => copyPreview(definition)}><Clipboard className="h-3.5 w-3.5" />Copiar mensaje</Button>
            </details>
          </article>
        ))}
      </div>

      <div className="mt-5 flex justify-end border-t border-slate-200 pt-5">
        <Button type="button" onClick={handleSave} loading={saving}>
          {!saving ? <Save className="h-4 w-4" /> : null}
          Guardar plantillas
        </Button>
      </div>
    </section>
  );
}

function getPublicFormDefaults(clinic, config) {
  return {
    clinic_slug: config?.clinic_slug || slugify(clinic?.name || 'dentalpro'),
    public_token: config?.public_token || generatePublicToken(),
    landing_url: config?.landing_url || '',
    allowed_origins: formatAllowedOrigins(config?.allowed_origins),
    is_active: config?.is_active ?? true,
  };
}

function PublicFormSettings({ clinic, config, saving, onSave, setNotice }) {
  const [form, setForm] = useState(() => getPublicFormDefaults(clinic, config));
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setForm(getPublicFormDefaults(clinic, config));
    setFormError('');
  }, [clinic?.id, config?.id]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function copyText(label, value) {
    await navigator.clipboard.writeText(value);
    setNotice(`${label} copiado.`);
  }

  async function handleSave() {
    setFormError('');

    try {
      await onSave(form);
    } catch (submitError) {
      setFormError(humanizeCrmError(submitError, 'No se pudo guardar la configuración. Intentá de nuevo.'));
    }
  }

  const currentConfig = {
    clinic_slug: slugify(form.clinic_slug),
    public_token: form.public_token,
  };
  const payload = JSON.stringify(publicFormPayloadExample(currentConfig), null, 2);
  const iframe = publicFormIframeSnippet(currentConfig);
  const fetchSnippet = publicFormFetchSnippet(currentConfig);

  return (
    <section className="rounded-2xl border border-slate-200 bg-card p-5 text-cream shadow-glow">
      <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Landing / Formulario</h2>
          <p className="mt-1 text-sm text-cream/55">Snippets publicos con clinic_slug y landing_token. Nunca incluyen clinic_id ni service role.</p>
        </div>
        <StatusBadge value={form.is_active ? 'Activo' : 'Inactivo'} />
      </div>

      {formError ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="clinic_slug" value={form.clinic_slug} onChange={(value) => updateField('clinic_slug', slugify(value))} disabled={saving} />
        <div className="grid gap-2">
          <Field label="public_token / landing_token" value={form.public_token} onChange={(value) => updateField('public_token', value.trim())} disabled={saving} />
          <button className="w-fit rounded-lg border border-slate-200 bg-card px-3 py-2 text-xs font-semibold text-textSoft transition hover:border-mint/30 hover:bg-elevated disabled:cursor-not-allowed disabled:border-slate-200/60 disabled:text-slate-500" type="button" onClick={() => updateField('public_token', generatePublicToken())} disabled={saving}>
            Generar token
          </button>
        </div>
        <Field label="landing_url" value={form.landing_url} onChange={(value) => updateField('landing_url', value)} disabled={saving} />
        <label className="inline-flex items-center gap-2 pt-6 text-sm text-cream/70">
          <input className="h-4 w-4 accent-mint" type="checkbox" checked={form.is_active} onChange={(event) => updateField('is_active', event.target.checked)} disabled={saving} />
          Formulario activo
        </label>
        <TextArea label="allowed_origins (uno por linea)" value={form.allowed_origins} onChange={(value) => updateField('allowed_origins', value)} disabled={saving} className="md:col-span-2" />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button className="button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:cursor-not-allowed" type="button" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar configuracion
        </button>
        <SnippetCopyButton label="Copiar payload ejemplo" onClick={() => copyText('Payload ejemplo', payload)} />
        <SnippetCopyButton label="Copiar embed iframe" onClick={() => copyText('Embed iframe', iframe)} />
        <SnippetCopyButton label="Copiar fetch ejemplo" onClick={() => copyText('Fetch ejemplo', fetchSnippet)} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <SnippetBlock title="Payload ejemplo" value={payload} />
        <SnippetBlock title="Embed iframe" value={iframe} />
        <SnippetBlock title="Fetch ejemplo" value={fetchSnippet} />
      </div>
    </section>
  );
}

function SnippetCopyButton({ label, onClick }) {
  return (
    <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-card px-3 py-2 text-sm text-textSoft transition hover:border-mint/30 hover:bg-elevated hover:text-cream" type="button" onClick={onClick}>
      <Clipboard className="h-4 w-4" />
      {label}
    </button>
  );
}

function SnippetBlock({ title, value }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-ink/70 p-4">
      <h3 className="mb-3 text-sm font-semibold text-cream">{title}</h3>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-cream/70 scrollbar-soft">{value}</pre>
    </div>
  );
}
