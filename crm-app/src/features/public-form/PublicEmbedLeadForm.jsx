import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { PUBLIC_LEAD_WEBHOOK_URL, cleanOptionalText } from '../../lib/crmDomain';
import { humanizeCrmError } from '../../lib/errors';
import { captureUrlAttribution } from '../../lib/attribution';
import { Field, TextArea } from '../../components/crm/CrmPrimitives';

export default function PublicEmbedLeadForm({ clinicSlug, landingToken }) {
  const [form, setForm] = useState({
    nombre: '',
    telefono: '',
    tratamiento: '',
    urgencia: '',
    evaluacion_previa: '',
    situacion: '',
    consultation_reason: '',
    consentimiento_contacto: false,
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const name = String(form.nombre || '').trim();
    const phone = String(form.telefono || '').trim();

    if (!landingToken) {
      setError('Falta landing_token en la URL del formulario.');
      return;
    }

    if (!name) {
      setError('Ingresa tu nombre.');
      return;
    }

    if (phone.replace(/\D/g, '').length < 8) {
      setError('Ingresa un WhatsApp valido.');
      return;
    }

    if (!form.consentimiento_contacto) {
      setError('Debés aceptar el consentimiento para que la clínica pueda contactarte.');
      return;
    }

    const consultationReason = cleanOptionalText(form.consultation_reason) || cleanOptionalText(form.situacion) || cleanOptionalText(form.tratamiento);
    const payload = {
      clinic_slug: clinicSlug,
      landing_token: landingToken,
      nombre: name,
      telefono: phone,
      tratamiento: cleanOptionalText(form.tratamiento),
      urgencia: cleanOptionalText(form.urgencia),
      evaluacion_previa: cleanOptionalText(form.evaluacion_previa),
      situacion: cleanOptionalText(form.situacion),
      consultation_reason: consultationReason,
      origen: 'Formulario embebido',
      pagina: `form/${clinicSlug}`,
      fecha_envio: new Date().toISOString(),
      consentimiento_contacto: true,
      website: '',
      ...captureUrlAttribution(window.location, document.referrer),
    };

    setSending(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(PUBLIC_LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || data?.success !== true) {
        throw new Error(data?.message || 'No se pudo enviar el formulario.');
      }

      setSuccess(data?.message || 'Datos enviados correctamente.');
      setForm({
        nombre: '',
        telefono: '',
        tratamiento: '',
        urgencia: '',
        evaluacion_previa: '',
        situacion: '',
        consultation_reason: '',
        consentimiento_contacto: false,
      });
    } catch (submitError) {
      setError(humanizeCrmError(submitError, 'No se pudo enviar el formulario. Intentá de nuevo.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-app px-4 py-6 text-cream">
      <form className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-card p-5 shadow-glow" onSubmit={handleSubmit}>
        <div className="mb-5 border-b border-white/10 pb-4">
          <p className="text-xs uppercase tracking-[0.2em] text-mint">{clinicSlug}</p>
          <h1 className="mt-1 text-2xl font-semibold">Solicitar consulta</h1>
        </div>

        {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="mb-4 rounded-lg border border-mint/40 bg-mint/10 p-3 text-sm text-mint">{success}</div> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre" value={form.nombre} onChange={(value) => updateField('nombre', value)} disabled={sending} />
          <Field label="WhatsApp" value={form.telefono} onChange={(value) => updateField('telefono', value)} disabled={sending} />
          <Field label="Tratamiento" value={form.tratamiento} onChange={(value) => updateField('tratamiento', value)} disabled={sending} />
          <Field label="Urgencia" value={form.urgencia} onChange={(value) => updateField('urgencia', value)} disabled={sending} />
          <Field label="Evaluacion previa" value={form.evaluacion_previa} onChange={(value) => updateField('evaluacion_previa', value)} disabled={sending} />
          <Field label="Situacion" value={form.situacion} onChange={(value) => updateField('situacion', value)} disabled={sending} />
          <TextArea label="Motivo de consulta" value={form.consultation_reason} onChange={(value) => updateField('consultation_reason', value)} disabled={sending} className="md:col-span-2" />
          <label className="md:col-span-2 flex items-start gap-3 rounded-lg border border-white/10 bg-ink/50 p-4 text-sm text-cream/80">
            <input
              className="mt-1 h-4 w-4 accent-mint"
              type="checkbox"
              checked={form.consentimiento_contacto}
              onChange={(event) => updateField('consentimiento_contacto', event.target.checked)}
              disabled={sending}
              required
            />
            <span>Acepto que la clínica me contacte sobre mi consulta.</span>
          </label>
          <p className="md:col-span-2 text-xs leading-relaxed text-cream/55">
            Al enviar este formulario aceptás que la clínica use tus datos para contactarte sobre tu consulta. No compartas información médica sensible por este formulario. Este formulario no reemplaza una consulta odontológica.
          </p>
        </div>

        <button className="button-primary mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold disabled:cursor-not-allowed" type="submit" disabled={sending}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendIcon />}
          Enviar consulta
        </button>
      </form>
    </main>
  );
}

function SendIcon() {
  return <ExternalLink className="h-4 w-4" />;
}
