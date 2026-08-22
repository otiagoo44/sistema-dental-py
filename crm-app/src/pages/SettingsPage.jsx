import { useEffect, useState } from 'react';
import { Clipboard, Loader2, Save } from 'lucide-react';
import { slugify, generatePublicToken, formatAllowedOrigins, publicFormPayloadExample, publicFormFetchSnippet, publicFormIframeSnippet } from '../lib/crmDomain';
import { Info, Field, TextArea } from '../components/crm/CrmPrimitives';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';

export default function SettingsView({ clinic, profile, publicFormConfig, savingPublicForm, onSavePublicForm, setNotice }) {
  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Administración" title="Configuración" subtitle="Datos de la clínica y conexión segura del formulario público. Sólo visible para owner/admin." />
      <div className="grid gap-4 lg:grid-cols-2">
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
      </div>

      <PublicFormSettings clinic={clinic} config={publicFormConfig} saving={savingPublicForm} onSave={onSavePublicForm} setNotice={setNotice} />
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
      setFormError(submitError.message || 'No se pudo guardar la configuracion.');
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-glow">
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
          <button className="w-fit rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-cream/80 hover:bg-white/5 disabled:cursor-not-allowed disabled:border-slate-200/60 disabled:text-slate-500" type="button" onClick={() => updateField('public_token', generatePublicToken())} disabled={saving}>
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
        <button className="inline-flex items-center gap-2 rounded-xl border border-mint/70 bg-mint px-4 py-2 text-sm font-semibold text-ink hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-elevated disabled:text-slate-500" type="button" onClick={handleSave} disabled={saving}>
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
    <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-cream/80 hover:bg-white/5" type="button" onClick={onClick}>
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
