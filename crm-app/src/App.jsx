import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Check, Clipboard, ExternalLink, Loader2, Phone, Plus, Save, Search } from 'lucide-react';
import AppLayout from './components/AppLayout';
import Login from './components/Login';
import EmptyState from './components/ui/EmptyState';
import StatCard from './components/ui/StatCard';
import StatusBadge from './components/ui/StatusBadge';
import { CLASSIFICATIONS, CONTACT_ATTEMPT_STATUSES, CONTACTED_STATUSES, LEAD_STATUSES, SCHEDULED_STATUSES } from './lib/constants';
import { formatDate, formatDateTime, formatMoney, formatTime, normalizeText, todayIsoDate, toLocalIsoDate } from './lib/formatters';
import { buildLeadMessage, buildWhatsappUrl } from './lib/messages';
import { supabase } from './lib/supabase';

const terminalStatuses = ['Perdido', 'Tratamiento Iniciado'];
const statusContactDates = [...CONTACTED_STATUSES, 'No Respondió'];

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [bootLoading, setBootLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [clinic, setClinic] = useState(null);
  const [activeView, setActiveView] = useState('dashboard');
  const [leads, setLeads] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [leadEvents, setLeadEvents] = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;

    if (!supabase) {
      setAuthLoading(false);
      return undefined;
    }

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        console.error('Error restoring Supabase session', sessionError);
        setError(sessionError.message);
      }

      if (active) {
        setSession(data.session);
        setAuthLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setClinic(null);
        setLeads([]);
        setAppointments([]);
        setTasks([]);
        setLeadEvents([]);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    bootstrapUser(session.user.id);
  }, [session?.user?.id]);

  const selectedLead = useMemo(() => leads.find((lead) => lead.id === selectedLeadId) || null, [leads, selectedLeadId]);

  async function bootstrapUser(userId) {
    setBootLoading(true);
    setError('');

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('Error loading user profile', profileError);
      setError('No se pudo cargar el profile del usuario. Verifica public.profiles y las politicas RLS.');
      setBootLoading(false);
      return;
    }

    if (!profileData) {
      setError('Tu usuario no tiene perfil asignado. Pedí al administrador que cree tu profile.');
      setBootLoading(false);
      return;
    }

    const { data: clinicData, error: clinicError } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', profileData.clinic_id)
      .single();

    if (clinicError) {
      console.error('Error loading clinic', clinicError);
      setError('No se pudo cargar la clinica asociada al usuario.');
      setBootLoading(false);
      return;
    }

    setProfile(profileData);
    setClinic(clinicData);
    await refreshClinicData(profileData.clinic_id);
    setBootLoading(false);
  }

  async function refreshClinicData(clinicId = profile?.clinic_id) {
    if (!clinicId) return;
    setError('');

    const [leadsResult, appointmentsResult, tasksResult] = await Promise.all([
      supabase
        .from('leads')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false }),
      supabase
        .from('appointments')
        .select('*, leads(name, phone, treatment)')
        .eq('clinic_id', clinicId)
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true }),
      supabase
        .from('tasks')
        .select('*, leads(name)')
        .eq('clinic_id', clinicId)
        .order('due_at', { ascending: true, nullsFirst: false }),
    ]);

    const firstError = leadsResult.error || appointmentsResult.error || tasksResult.error;
    if (firstError) {
      console.error('Error loading clinic data', firstError);
      setError(firstError.message);
      return;
    }

    setLeads(leadsResult.data || []);
    setAppointments(appointmentsResult.data || []);
    setTasks(tasksResult.data || []);
  }

  async function loadLeadEvents(leadId) {
    if (!profile?.clinic_id || !leadId) return;

    const { data, error: eventsError } = await supabase
      .from('lead_events')
      .select('*')
      .eq('clinic_id', profile.clinic_id)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (eventsError) {
      console.error('Error loading lead events', eventsError);
      setError(eventsError.message);
      return;
    }

    setLeadEvents(data || []);
  }

  async function handleLeadSelect(leadId) {
    setSelectedLeadId(leadId);
    setActiveView('lead-detail');
    await loadLeadEvents(leadId);
  }

  async function updateLead(leadId, patch) {
    if (!profile?.clinic_id) return;
    setError('');

    const before = leads.find((lead) => lead.id === leadId);
    const statusChanged = patch.status && patch.status !== before?.status;
    const leadPatch = { ...patch };

    if (statusChanged && statusContactDates.includes(patch.status) && !leadPatch.last_contact_at) {
      leadPatch.last_contact_at = new Date().toISOString();
    }

    if (statusChanged && CONTACT_ATTEMPT_STATUSES.includes(patch.status) && leadPatch.contact_attempts === undefined) {
      leadPatch.contact_attempts = Number(before?.contact_attempts || 0) + 1;
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update(leadPatch)
      .eq('id', leadId)
      .eq('clinic_id', profile.clinic_id);

    if (updateError) {
      console.error('Error updating lead', updateError);
      setError(updateError.message);
      return;
    }

    let eventErrorMessage = '';

    if (statusChanged) {
      const { error: eventError } = await supabase.from('lead_events').insert({
        clinic_id: profile.clinic_id,
        lead_id: leadId,
        event_type: 'status_changed',
        title: 'Estado actualizado',
        description: `Estado cambiado a ${patch.status}`,
        created_by: session.user.id,
      });

      if (eventError) {
        console.error('Error creating lead event', eventError);
        eventErrorMessage = `El lead se actualizo, pero no se pudo crear el evento: ${eventError.message}`;
      }
    }

    await refreshClinicData();
    await loadLeadEvents(leadId);
    if (eventErrorMessage) {
      setError(eventErrorMessage);
      return;
    }
    setNotice('Lead actualizado.');
  }

  async function completeTask(taskId) {
    if (!profile?.clinic_id) return;

    const { error: taskError } = await supabase
      .from('tasks')
      .update({ status: 'hecho' })
      .eq('id', taskId)
      .eq('clinic_id', profile.clinic_id);

    if (taskError) {
      console.error('Error completing task', taskError);
      setError(taskError.message);
      return;
    }

    await refreshClinicData();
    setNotice('Tarea marcada como hecha.');
  }

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  if (authLoading) {
    return <FullScreenLoader label="Cargando sesion..." />;
  }

  if (!session) {
    return <Login />;
  }

  if (bootLoading) {
    return <FullScreenLoader label="Cargando clinica..." />;
  }

  return (
    <AppLayout activeView={activeView} setActiveView={setActiveView} clinic={clinic} profile={profile} onLogout={handleLogout}>
      {error ? <Banner tone="danger" text={error} onClose={() => setError('')} /> : null}
      {notice ? <Banner tone="mint" text={notice} onClose={() => setNotice('')} /> : null}

      {activeView === 'dashboard' ? <Dashboard leads={leads} appointments={appointments} /> : null}
      {activeView === 'today' ? <TodayPriority leads={leads} onOpenLead={handleLeadSelect} /> : null}
      {activeView === 'leads' ? <LeadsView leads={leads} onOpenLead={handleLeadSelect} onUpdateLead={updateLead} setNotice={setNotice} /> : null}
      {activeView === 'lead-detail' ? (
        <LeadDetail lead={selectedLead} events={leadEvents} onBack={() => setActiveView('leads')} onSave={updateLead} setNotice={setNotice} />
      ) : null}
      {activeView === 'agenda' ? <AgendaView appointments={appointments} /> : null}
      {activeView === 'tasks' ? <TasksView tasks={tasks} onComplete={completeTask} /> : null}
      {activeView === 'settings' ? <SettingsView clinic={clinic} profile={profile} /> : null}
    </AppLayout>
  );
}

function FullScreenLoader({ label }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink text-cream">
      <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-panel px-5 py-4">
        <Loader2 className="h-5 w-5 animate-spin text-mint" />
        {label}
      </div>
    </main>
  );
}

function Banner({ text, tone, onClose }) {
  const styles = tone === 'danger' ? 'border-danger/40 bg-danger/10 text-red-100' : 'border-mint/40 bg-mint/10 text-mint';

  return (
    <div className={`mb-5 flex items-center justify-between gap-4 rounded-lg border p-3 text-sm ${styles}`}>
      <span>{text}</span>
      <button className="text-xs opacity-75 hover:opacity-100" type="button" onClick={onClose}>
        Cerrar
      </button>
    </div>
  );
}

function Dashboard({ leads, appointments }) {
  const metrics = useMemo(() => {
    const today = todayIsoDate();
    const totalLeads = leads.length;
    const newToday = leads.filter((lead) => toLocalIsoDate(lead.created_at) === today).length;
    const hotLeads = leads.filter((lead) => lead.classification === 'Lead Caliente').length;
    const noContact = leads.filter((lead) => ['Nuevo', 'No Contactado'].includes(lead.status) && !lead.last_contact_at).length;
    const scheduledAppointments = appointments.filter((appointment) => ['Agendado', 'Confirmado'].includes(appointment.status)).length;
    const pipeline = leads.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
    const contacted = leads.filter((lead) => CONTACTED_STATUSES.includes(lead.status) || lead.last_contact_at).length;
    const scheduledLeads = leads.filter((lead) => SCHEDULED_STATUSES.includes(lead.status)).length;

    return {
      totalLeads,
      newToday,
      hotLeads,
      noContact,
      scheduledAppointments,
      pipeline,
      contactRate: totalLeads ? Math.round((contacted / totalLeads) * 100) : 0,
      scheduleRate: totalLeads ? Math.round((scheduledLeads / totalLeads) * 100) : 0,
    };
  }, [leads, appointments]);

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Leads totales" value={metrics.totalLeads} />
      <StatCard label="Leads nuevos hoy" value={metrics.newToday} tone="gold" />
      <StatCard label="Leads calientes" value={metrics.hotLeads} tone="danger" />
      <StatCard label="No contactados" value={metrics.noContact} tone="cream" />
      <StatCard label="Consultas agendadas" value={metrics.scheduledAppointments} />
      <StatCard label="Pipeline potencial" value={formatMoney(metrics.pipeline)} tone="gold" />
      <StatCard label="Tasa de contacto" value={`${metrics.contactRate}%`} />
      <StatCard label="Tasa de agendamiento" value={`${metrics.scheduleRate}%`} tone="gold" />
    </section>
  );
}

function TodayPriority({ leads, onOpenLead }) {
  const groups = useMemo(() => {
    const now = Date.now();
    const today = todayIsoDate();
    const isUncontacted = (lead) => ['Nuevo', 'No Contactado'].includes(lead.status) && !lead.last_contact_at;
    const byUpdated = (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    const hasUrgencyToday = (lead) => normalizeText(`${lead.urgency} ${lead.next_action}`).includes('hoy') || toLocalIsoDate(lead.next_followup_at) === today;
    const hasPainOrUrgency = (lead) => normalizeText(`${lead.urgency} ${lead.situation} ${lead.consultation_reason}`).match(/dolor|urgencia|molestia/);
    const hasOverdueFollowup = (lead) => lead.next_followup_at && new Date(lead.next_followup_at).getTime() <= now && !terminalStatuses.includes(lead.status);

    return [
      {
        title: 'Leads calientes no contactados',
        items: leads.filter((lead) => lead.classification === 'Lead Caliente' && isUncontacted(lead)).sort(byUpdated),
      },
      {
        title: 'Urgencia hoy',
        items: leads.filter((lead) => hasUrgencyToday(lead) && !terminalStatuses.includes(lead.status)).sort(byUpdated),
      },
      {
        title: 'Dolor o urgencia',
        items: leads.filter(hasPainOrUrgency).sort(byUpdated),
      },
      {
        title: 'Proximo seguimiento vencido',
        items: leads.filter(hasOverdueFollowup).sort((a, b) => new Date(a.next_followup_at) - new Date(b.next_followup_at)),
      },
      {
        title: 'Leads de implantes',
        items: leads.filter((lead) => normalizeText(lead.treatment).includes('implante')).sort(byUpdated),
      },
      {
        title: 'Contactados pero no agendados',
        items: leads.filter((lead) => ['Contactado', 'Respondió', 'Presupuesto Enviado'].includes(lead.status)).sort(byUpdated),
      },
    ];
  }, [leads]);

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.title} className="rounded-lg border border-white/10 bg-panel/80 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{group.title}</h2>
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-cream/60">{group.items.length}</span>
          </div>
          {group.items.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {group.items.map((lead) => <LeadMiniCard key={`${group.title}-${lead.id}`} lead={lead} onOpenLead={onOpenLead} />)}
            </div>
          ) : (
            <EmptyState title="Sin pendientes en esta categoria" />
          )}
        </section>
      ))}
    </div>
  );
}

function LeadsView({ leads, onOpenLead, onUpdateLead, setNotice }) {
  const [filters, setFilters] = useState({ status: '', classification: '', treatment: '', q: '' });
  const treatmentOptions = useMemo(() => [...new Set(leads.map((lead) => lead.treatment).filter(Boolean))].sort(), [leads]);
  const filteredLeads = useMemo(() => {
    const q = normalizeText(filters.q);

    return leads.filter((lead) => {
      const matchesStatus = !filters.status || lead.status === filters.status;
      const matchesClassification = !filters.classification || lead.classification === filters.classification;
      const matchesTreatment = !filters.treatment || lead.treatment === filters.treatment;
      const matchesQuery = !q || normalizeText(`${lead.name} ${lead.phone} ${lead.phone_plus}`).includes(q);

      return matchesStatus && matchesClassification && matchesTreatment && matchesQuery;
    });
  }, [leads, filters]);

  async function copyMessage(lead) {
    await navigator.clipboard.writeText(buildLeadMessage(lead));
    setNotice('Mensaje copiado.');
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-3 rounded-lg border border-white/10 bg-panel/80 p-4 md:grid-cols-2 xl:grid-cols-4">
        <Select label="Estado" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={LEAD_STATUSES} placeholder="Todos" />
        <Select label="Clasificacion" value={filters.classification} onChange={(value) => setFilters({ ...filters, classification: value })} options={CLASSIFICATIONS} placeholder="Todas" />
        <Select label="Tratamiento" value={filters.treatment} onChange={(value) => setFilters({ ...filters, treatment: value })} options={treatmentOptions} placeholder="Todos" />
        <label className="block">
          <span className="mb-2 block text-xs text-cream/55">Buscar</span>
          <span className="flex items-center gap-2 rounded-lg border border-white/10 bg-ink px-3 py-2">
            <Search className="h-4 w-4 text-mint" />
            <input className="w-full bg-transparent text-sm outline-none" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Nombre o telefono" />
          </span>
        </label>
      </div>

      {filteredLeads.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredLeads.map((lead) => (
            <article key={lead.id} className="rounded-lg border border-white/10 bg-panel/90 p-4 shadow-glow">
              <button className="w-full text-left" type="button" onClick={() => onOpenLead(lead.id)}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-cream">{lead.name}</h3>
                    <p className="mt-1 flex items-center gap-2 text-sm text-cream/55">
                      <Phone className="h-4 w-4 text-mint" />
                      {lead.phone_plus || lead.phone || 'Sin telefono'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge value={lead.classification} />
                    <StatusBadge value={lead.status} />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                  <Info label="Tratamiento" value={lead.treatment || 'Sin dato'} />
                  <Info label="Urgencia" value={lead.urgency || 'Sin dato'} />
                  <Info label="Score" value={lead.score} />
                  <Info label="Proxima accion" value={lead.next_action || 'Sin definir'} />
                  <Info label="Valor estimado" value={formatMoney(lead.estimated_value)} />
                  <Info label="Seguimiento" value={lead.next_followup_at ? formatDateTime(lead.next_followup_at) : 'Sin fecha'} />
                </div>
              </button>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                <a className="inline-flex items-center gap-2 rounded-lg bg-mint px-3 py-2 text-sm font-semibold text-ink hover:bg-mint/90" href={buildWhatsappUrl(lead)} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Abrir WhatsApp
                </a>
                <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-cream/80 hover:bg-white/5" type="button" onClick={() => copyMessage(lead)}>
                  <Clipboard className="h-4 w-4" />
                  Copiar mensaje
                </button>
                <select className="rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-cream" value={lead.status} onChange={(event) => onUpdateLead(lead.id, { status: event.target.value })}>
                  {LEAD_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="No hay leads para estos filtros" text="Ajusta los filtros o verifica que el usuario tenga datos visibles por RLS." />
      )}
    </section>
  );
}

function LeadDetail({ lead, events, onBack, onSave, setNotice }) {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (lead) {
      setForm({
        status: lead.status || 'Nuevo',
        notes: lead.notes || '',
        next_action: lead.next_action || '',
        next_followup_at: lead.next_followup_at ? lead.next_followup_at.slice(0, 16) : '',
      });
    }
  }, [lead]);

  if (!lead || !form) {
    return <EmptyState title="Lead no encontrado" text="Volver a Leads y seleccionar un registro." />;
  }

  async function copyMessage() {
    await navigator.clipboard.writeText(buildLeadMessage(lead));
    setNotice('Mensaje copiado.');
  }

  function saveForm() {
    onSave(lead.id, {
      status: form.status,
      notes: form.notes,
      next_action: form.next_action,
      next_followup_at: form.next_followup_at ? new Date(form.next_followup_at).toISOString() : null,
    });
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="rounded-lg border border-white/10 bg-panel/90 p-5 shadow-glow">
        <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <button className="mb-3 text-sm text-mint hover:text-mint/80" type="button" onClick={onBack}>
              Volver a leads
            </button>
            <h2 className="text-2xl font-semibold">{lead.name}</h2>
            <p className="mt-1 text-cream/55">{lead.phone_plus || lead.phone || 'Sin telefono'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge value={lead.classification} />
            <StatusBadge value={lead.status} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Info label="Tratamiento" value={lead.treatment || 'Sin dato'} />
          <Info label="Urgencia" value={lead.urgency || 'Sin dato'} />
          <Info label="Score" value={lead.score} />
          <Info label="Situacion" value={lead.situation || 'Sin dato'} />
          <Info label="Evaluacion previa" value={lead.evaluation_previous || 'Sin dato'} />
          <Info label="Motivo consulta" value={lead.consultation_reason || 'Sin dato'} />
          <Info label="Valor estimado" value={formatMoney(lead.estimated_value)} />
          <Info label="Fuente" value={lead.source || 'Sin dato'} />
          <Info label="Pagina" value={lead.page || 'Sin dato'} />
          <Info label="Ultimo contacto" value={lead.last_contact_at ? formatDateTime(lead.last_contact_at) : 'Sin registro'} />
          <Info label="Intentos" value={lead.contact_attempts} />
          <Info label="Creado" value={formatDateTime(lead.created_at)} />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Select label="Estado" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={LEAD_STATUSES} />
          <Field label="Proxima accion" value={form.next_action} onChange={(value) => setForm({ ...form, next_action: value })} />
          <Field label="Proximo seguimiento" type="datetime-local" value={form.next_followup_at} onChange={(value) => setForm({ ...form, next_followup_at: value })} />
          <label className="block md:col-span-2">
            <span className="mb-2 block text-xs text-cream/55">Notas</span>
            <textarea className="min-h-32 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-cream outline-none" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg bg-mint px-4 py-2 font-semibold text-ink hover:bg-mint/90" type="button" onClick={saveForm}>
            <Save className="h-4 w-4" />
            Guardar cambios
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-cream/80 hover:bg-white/5" type="button" onClick={() => onSave(lead.id, { last_contact_at: new Date().toISOString(), contact_attempts: Number(lead.contact_attempts || 0) + 1 })}>
            <CalendarPlus className="h-4 w-4" />
            Registrar ultimo contacto
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-cream/80 hover:bg-white/5" type="button" onClick={() => onSave(lead.id, { contact_attempts: Number(lead.contact_attempts || 0) + 1 })}>
            <Plus className="h-4 w-4" />
            Aumentar intentos
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-cream/80 hover:bg-white/5" type="button" onClick={copyMessage}>
            <Clipboard className="h-4 w-4" />
            Copiar mensaje
          </button>
        </div>
      </div>

      <aside className="rounded-lg border border-white/10 bg-panel/90 p-5">
        <h3 className="mb-4 text-lg font-semibold">Eventos</h3>
        {events.length ? (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border border-white/10 bg-ink/60 p-3">
                <p className="font-semibold">{event.title}</p>
                <p className="mt-1 text-xs text-cream/45">{formatDateTime(event.created_at)}</p>
                {event.description ? <p className="mt-2 text-sm text-cream/60">{event.description}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Sin eventos" />
        )}
      </aside>
    </section>
  );
}

function AgendaView({ appointments }) {
  return (
    <section className="rounded-lg border border-white/10 bg-panel/90 p-4 shadow-glow">
      {appointments.length ? (
        <div className="overflow-x-auto scrollbar-soft">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.18em] text-cream/45">
              <tr>
                <th className="px-3 py-3">Fecha</th>
                <th className="px-3 py-3">Hora</th>
                <th className="px-3 py-3">Paciente</th>
                <th className="px-3 py-3">Doctor</th>
                <th className="px-3 py-3">Tratamiento</th>
                <th className="px-3 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {appointments.map((appointment) => (
                <tr key={appointment.id} className="hover:bg-white/[0.03]">
                  <td className="px-3 py-3">{formatDate(appointment.appointment_date)}</td>
                  <td className="px-3 py-3">{formatTime(appointment.appointment_time)}</td>
                  <td className="px-3 py-3 font-semibold">{appointment.leads?.name || 'Sin lead'}</td>
                  <td className="px-3 py-3">{appointment.doctor_assigned || 'Sin asignar'}</td>
                  <td className="px-3 py-3">{appointment.treatment_scheduled || appointment.leads?.treatment || 'Sin dato'}</td>
                  <td className="px-3 py-3"><StatusBadge value={appointment.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Sin appointments visibles" text="Verifica RLS, clinic_id y datos de agenda." />
      )}
    </section>
  );
}

function TasksView({ tasks, onComplete }) {
  return (
    <section className="space-y-3">
      {tasks.length ? (
        tasks.map((task) => (
          <article key={task.id} className="flex flex-col gap-4 rounded-lg border border-white/10 bg-panel/90 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{task.title}</h3>
                <StatusBadge value={task.priority} />
                <StatusBadge value={task.status} />
              </div>
              {task.description ? <p className="mt-2 text-sm text-cream/60">{task.description}</p> : null}
              <p className="mt-2 text-xs text-cream/45">
                {task.due_at ? formatDateTime(task.due_at) : 'Sin vencimiento'} {task.leads?.name ? `- ${task.leads.name}` : ''}
              </p>
            </div>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-mint px-4 py-2 font-semibold text-ink hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              onClick={() => onComplete(task.id)}
              disabled={task.status === 'hecho'}
            >
              <Check className="h-4 w-4" />
              Marcar hecho
            </button>
          </article>
        ))
      ) : (
        <EmptyState title="Sin tareas" text="Las tareas de la clinica apareceran aca." />
      )}
    </section>
  );
}

function SettingsView({ clinic, profile }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-white/10 bg-panel/90 p-5 shadow-glow">
        <h2 className="mb-4 text-lg font-semibold">Datos de la clinica</h2>
        <div className="grid gap-4">
          <Info label="Nombre" value={clinic?.name || 'Sin dato'} />
          <Info label="Doctor" value={clinic?.doctor_name || 'Sin dato'} />
          <Info label="WhatsApp" value={clinic?.whatsapp || 'Sin dato'} />
          <Info label="Link de agenda" value={clinic?.calendar_link || 'Sin dato'} />
          <Info label="Direccion" value={clinic?.address_link || 'Sin dato'} />
          <Info label="Color principal" value={clinic?.primary_color || 'Sin dato'} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-panel/90 p-5">
        <h2 className="mb-4 text-lg font-semibold">Usuario actual</h2>
        <div className="grid gap-4">
          <Info label="Nombre" value={profile?.full_name || 'Sin dato'} />
          <Info label="Email" value={profile?.email || 'Sin dato'} />
          <Info label="Rol" value={profile?.role || 'Sin dato'} />
          <Info label="Clinic ID" value={profile?.clinic_id || 'Sin dato'} />
        </div>
      </div>
    </section>
  );
}

function LeadMiniCard({ lead, onOpenLead }) {
  return (
    <button className="rounded-lg border border-white/10 bg-ink/60 p-4 text-left transition hover:border-mint/40" type="button" onClick={() => onOpenLead(lead.id)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{lead.name}</h3>
          <p className="mt-1 text-sm text-cream/55">{lead.treatment || 'Sin tratamiento'}</p>
        </div>
        <StatusBadge value={lead.status} />
      </div>
      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <Info label="Urgencia" value={lead.urgency || 'Sin dato'} />
        <Info label="Seguimiento" value={lead.next_followup_at ? formatDateTime(lead.next_followup_at) : 'Sin fecha'} />
      </div>
    </button>
  );
}

function Info({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-[0.16em] text-cream/40">{label}</p>
      <p className="mt-1 break-words text-sm text-cream/85">{value}</p>
    </div>
  );
}

function Select({ label, value, onChange, options, placeholder }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs text-cream/55">{label}</span>
      <select className="w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-cream outline-none" value={value} onChange={(event) => onChange(event.target.value)}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs text-cream/55">{label}</span>
      <input className="w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-cream outline-none" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
