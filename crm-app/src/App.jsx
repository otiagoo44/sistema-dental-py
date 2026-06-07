import { useEffect, useMemo, useState } from 'react';
import { Ban, CalendarPlus, Check, Clipboard, ExternalLink, Loader2, Phone, Plus, RefreshCw, Save, Search, UserCheck } from 'lucide-react';
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
const LEAD_STATUS = {
  scheduled: 'Consulta Agendada',
  confirmed: 'Confirmado',
  attended: 'Asistió',
  noShow: 'No Asistió',
};
const APPOINTMENT_STATUS = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  attended: 'Asistió',
  noShow: 'No Asistió',
  rescheduled: 'Reprogramado',
};
const APPOINTMENT_ACTIVE_STATUSES = [APPOINTMENT_STATUS.scheduled, APPOINTMENT_STATUS.confirmed, APPOINTMENT_STATUS.rescheduled];

function cleanOptionalText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function tomorrowFollowupIso() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

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
  const [appointmentModal, setAppointmentModal] = useState(null);
  const [appointmentSaving, setAppointmentSaving] = useState(false);
  const [appointmentActionId, setAppointmentActionId] = useState('');
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
        setAppointmentModal(null);
        setAppointmentSaving(false);
        setAppointmentActionId('');
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
        .select('*, leads(id, name, phone, phone_plus, treatment, whatsapp_link)')
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

    if (statusChanged && patch.status === LEAD_STATUS.scheduled) {
      if (!before) {
        setError('No se pudo encontrar el lead para agendar la consulta.');
        return;
      }

      openAppointmentModal(before);
      return;
    }

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

  function openAppointmentModal(lead, appointment = null, mode = 'schedule') {
    if (!lead?.id) {
      setError('No se pudo identificar el lead para agendar la consulta.');
      return;
    }

    setError('');
    setAppointmentModal({ lead, appointment, mode });
  }

  function openRescheduleModal(appointment) {
    const leadFromState = leads.find((lead) => lead.id === appointment.lead_id);
    const leadFromAppointment = appointment.leads
      ? { ...appointment.leads, id: appointment.leads.id || appointment.lead_id }
      : { id: appointment.lead_id, name: 'Lead asociado' };

    openAppointmentModal(leadFromState || leadFromAppointment, appointment, 'reschedule');
  }

  async function createLeadEvent(leadId, event) {
    return supabase.from('lead_events').insert({
      clinic_id: profile.clinic_id,
      lead_id: leadId,
      event_type: event.event_type,
      title: event.title,
      description: event.description || null,
      created_by: session.user.id,
    });
  }

  async function saveAppointmentSchedule(form) {
    const modal = appointmentModal;
    const lead = modal?.lead;

    if (!profile?.clinic_id || !lead?.id) {
      throw new Error('No se pudo identificar la clinica o el lead para guardar la consulta.');
    }

    const isReschedule = modal.mode === 'reschedule';
    const appointmentPayload = {
      clinic_id: profile.clinic_id,
      lead_id: lead.id,
      appointment_date: form.appointment_date,
      appointment_time: form.appointment_time,
      doctor_assigned: cleanOptionalText(form.doctor_assigned),
      treatment_scheduled: cleanOptionalText(form.treatment_scheduled),
      status: isReschedule ? APPOINTMENT_STATUS.rescheduled : APPOINTMENT_STATUS.scheduled,
      notes: cleanOptionalText(form.notes),
    };

    setAppointmentSaving(true);
    setError('');
    setNotice('');

    let leadUpdated = false;

    try {
      const leadPatch = {
        status: LEAD_STATUS.scheduled,
        next_action: 'Confirmar asistencia',
      };

      if (!isReschedule) {
        leadPatch.last_contact_at = new Date().toISOString();
      }

      const { error: leadError } = await supabase
        .from('leads')
        .update(leadPatch)
        .eq('id', lead.id)
        .eq('clinic_id', profile.clinic_id);

      if (leadError) {
        throw new Error(`No se pudo actualizar el lead: ${leadError.message}`);
      }

      leadUpdated = true;

      let appointmentId = modal.appointment?.id || null;

      if (!appointmentId) {
        const { data: activeAppointment, error: activeError } = await supabase
          .from('appointments')
          .select('id')
          .eq('clinic_id', profile.clinic_id)
          .eq('lead_id', lead.id)
          .in('status', APPOINTMENT_ACTIVE_STATUSES)
          .order('appointment_date', { ascending: true })
          .order('appointment_time', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (activeError) {
          throw new Error(`El lead se actualizo, pero no se pudo verificar si ya tenia turno activo: ${activeError.message}`);
        }

        appointmentId = activeAppointment?.id || null;
      }

      const appointmentResult = appointmentId
        ? await supabase
            .from('appointments')
            .update(appointmentPayload)
            .eq('id', appointmentId)
            .eq('clinic_id', profile.clinic_id)
        : await supabase.from('appointments').insert(appointmentPayload);

      if (appointmentResult.error) {
        const prefix = leadUpdated ? 'El lead se actualizo, pero ' : '';
        throw new Error(`${prefix}no se pudo guardar el turno: ${appointmentResult.error.message}`);
      }

      const eventType = isReschedule ? 'appointment_rescheduled' : 'appointment_scheduled';
      const eventTitle = isReschedule ? 'Consulta reprogramada' : 'Consulta agendada';
      const { error: eventError } = await createLeadEvent(lead.id, {
        event_type: eventType,
        title: eventTitle,
        description: `${eventTitle} para ${form.appointment_date} ${form.appointment_time}`,
      });

      await refreshClinicData();
      if (selectedLeadId === lead.id) {
        await loadLeadEvents(lead.id);
      }

      setAppointmentModal(null);

      if (eventError) {
        console.error('Error creating appointment lead event', eventError);
        setError(`La consulta se guardo, pero no se pudo crear el evento: ${eventError.message}`);
        return;
      }

      setNotice(isReschedule ? 'Consulta reprogramada.' : 'Consulta agendada.');
    } catch (scheduleError) {
      if (leadUpdated) {
        await refreshClinicData();
        if (selectedLeadId === lead.id) {
          await loadLeadEvents(lead.id);
        }
      }

      setError(scheduleError.message);
      throw scheduleError;
    } finally {
      setAppointmentSaving(false);
    }
  }

  async function updateAppointmentOutcome(appointment, action) {
    if (!profile?.clinic_id || !appointment?.id || !appointment?.lead_id) {
      setError('No se pudo identificar el turno o el lead asociado.');
      return;
    }

    const configs = {
      confirm: {
        appointmentStatus: APPOINTMENT_STATUS.confirmed,
        leadStatus: LEAD_STATUS.confirmed,
        nextAction: 'Esperar asistencia',
        event_type: 'appointment_confirmed',
        title: 'Consulta confirmada',
        notice: 'Turno confirmado.',
      },
      attended: {
        appointmentStatus: APPOINTMENT_STATUS.attended,
        leadStatus: LEAD_STATUS.attended,
        nextAction: 'Enviar presupuesto o iniciar tratamiento',
        event_type: 'appointment_attended',
        title: 'Paciente asistió',
        notice: 'Asistencia registrada.',
      },
      noShow: {
        appointmentStatus: APPOINTMENT_STATUS.noShow,
        leadStatus: LEAD_STATUS.noShow,
        nextAction: 'Reprogramar consulta',
        nextFollowupAt: tomorrowFollowupIso(),
        event_type: 'appointment_no_show',
        title: 'Paciente no asistió',
        notice: 'Inasistencia registrada.',
      },
    };

    const config = configs[action];
    if (!config) return;

    setAppointmentActionId(`${appointment.id}:${action}`);
    setError('');
    setNotice('');

    const leadPatch = {
      status: config.leadStatus,
      next_action: config.nextAction,
    };

    if (config.nextFollowupAt) {
      leadPatch.next_followup_at = config.nextFollowupAt;
    }

    const { error: appointmentError } = await supabase
      .from('appointments')
      .update({ status: config.appointmentStatus })
      .eq('id', appointment.id)
      .eq('clinic_id', profile.clinic_id);

    if (appointmentError) {
      console.error('Error updating appointment', appointmentError);
      setError(appointmentError.message);
      setAppointmentActionId('');
      return;
    }

    const { error: leadError } = await supabase
      .from('leads')
      .update(leadPatch)
      .eq('id', appointment.lead_id)
      .eq('clinic_id', profile.clinic_id);

    if (leadError) {
      console.error('Error updating appointment lead', leadError);
      setError(`El turno se actualizo, pero no se pudo actualizar el lead: ${leadError.message}`);
      await refreshClinicData();
      setAppointmentActionId('');
      return;
    }

    const { error: eventError } = await createLeadEvent(appointment.lead_id, {
      event_type: config.event_type,
      title: config.title,
      description: `${config.title} para ${appointment.appointment_date} ${formatTime(appointment.appointment_time)}`,
    });

    await refreshClinicData();
    if (selectedLeadId === appointment.lead_id) {
      await loadLeadEvents(appointment.lead_id);
    }

    setAppointmentActionId('');

    if (eventError) {
      console.error('Error creating appointment outcome event', eventError);
      setError(`El turno se actualizo, pero no se pudo crear el evento: ${eventError.message}`);
      return;
    }

    setNotice(config.notice);
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
      {activeView === 'leads' ? (
        <LeadsView leads={leads} onOpenLead={handleLeadSelect} onUpdateLead={updateLead} onScheduleAppointment={openAppointmentModal} setNotice={setNotice} />
      ) : null}
      {activeView === 'lead-detail' ? (
        <LeadDetail lead={selectedLead} events={leadEvents} onBack={() => setActiveView('leads')} onSave={updateLead} onScheduleAppointment={openAppointmentModal} setNotice={setNotice} />
      ) : null}
      {activeView === 'agenda' ? (
        <AgendaView appointments={appointments} actionId={appointmentActionId} onOutcome={updateAppointmentOutcome} onReschedule={openRescheduleModal} />
      ) : null}
      {activeView === 'tasks' ? <TasksView tasks={tasks} onComplete={completeTask} /> : null}
      {activeView === 'settings' ? <SettingsView clinic={clinic} profile={profile} /> : null}
      {appointmentModal ? (
        <AppointmentModal
          clinic={clinic}
          lead={appointmentModal.lead}
          appointment={appointmentModal.appointment}
          mode={appointmentModal.mode}
          saving={appointmentSaving}
          onClose={() => setAppointmentModal(null)}
          onSubmit={saveAppointmentSchedule}
        />
      ) : null}
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
    const scheduledAppointments = appointments.filter((appointment) => APPOINTMENT_ACTIVE_STATUSES.includes(appointment.status)).length;
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

function LeadsView({ leads, onOpenLead, onUpdateLead, onScheduleAppointment, setNotice }) {
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
                <select
                  className="rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-cream"
                  value={lead.status}
                  onChange={(event) => {
                    const nextStatus = event.target.value;
                    if (nextStatus === LEAD_STATUS.scheduled && nextStatus !== lead.status) {
                      onScheduleAppointment(lead);
                      return;
                    }

                    onUpdateLead(lead.id, { status: nextStatus });
                  }}
                >
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

function LeadDetail({ lead, events, onBack, onSave, onScheduleAppointment, setNotice }) {
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

  function handleStatusChange(value) {
    if (value === LEAD_STATUS.scheduled && value !== lead.status) {
      onScheduleAppointment(lead);
      return;
    }

    setForm({ ...form, status: value });
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
          <Select label="Estado" value={form.status} onChange={handleStatusChange} options={LEAD_STATUSES} />
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

function AgendaView({ appointments, actionId, onOutcome, onReschedule }) {
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
                <th className="px-3 py-3">Teléfono</th>
                <th className="px-3 py-3">Doctor</th>
                <th className="px-3 py-3">Tratamiento</th>
                <th className="px-3 py-3">Estado</th>
                <th className="px-3 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {appointments.map((appointment) => {
                const lead = appointment.leads || {};
                const phone = lead.phone_plus || lead.phone || 'Sin telefono';
                const isBusy = actionId.startsWith(`${appointment.id}:`);

                return (
                  <tr key={appointment.id} className="hover:bg-white/[0.03]">
                    <td className="px-3 py-3">{formatDate(appointment.appointment_date)}</td>
                    <td className="px-3 py-3">{formatTime(appointment.appointment_time)}</td>
                    <td className="px-3 py-3 font-semibold">{lead.name || 'Sin lead'}</td>
                    <td className="px-3 py-3">{phone}</td>
                    <td className="px-3 py-3">{appointment.doctor_assigned || 'Sin asignar'}</td>
                    <td className="px-3 py-3">{appointment.treatment_scheduled || lead.treatment || 'Sin dato'}</td>
                    <td className="px-3 py-3"><StatusBadge value={appointment.status} /></td>
                    <td className="min-w-[520px] px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <a className="inline-flex items-center gap-2 rounded-lg bg-mint px-3 py-2 text-xs font-semibold text-ink hover:bg-mint/90" href={buildWhatsappUrl(lead)} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          Abrir WhatsApp
                        </a>
                        <AgendaActionButton
                          icon={Check}
                          label="Confirmar"
                          loading={actionId === `${appointment.id}:confirm`}
                          disabled={isBusy || appointment.status === APPOINTMENT_STATUS.confirmed}
                          onClick={() => onOutcome(appointment, 'confirm')}
                        />
                        <AgendaActionButton
                          icon={UserCheck}
                          label="Asistió"
                          loading={actionId === `${appointment.id}:attended`}
                          disabled={isBusy || appointment.status === APPOINTMENT_STATUS.attended}
                          onClick={() => onOutcome(appointment, 'attended')}
                        />
                        <AgendaActionButton
                          icon={Ban}
                          label="No Asistió"
                          loading={actionId === `${appointment.id}:noShow`}
                          disabled={isBusy || appointment.status === APPOINTMENT_STATUS.noShow}
                          onClick={() => onOutcome(appointment, 'noShow')}
                        />
                        <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-cream/80 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-45" type="button" onClick={() => onReschedule(appointment)} disabled={isBusy}>
                          <RefreshCw className="h-4 w-4" />
                          Reprogramar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Sin appointments visibles" text="Verifica RLS, clinic_id y datos de agenda." />
      )}
    </section>
  );
}

function AgendaActionButton({ icon: Icon, label, loading, disabled, onClick }) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-cream/80 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-45"
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}

function getAppointmentFormDefaults({ clinic, lead, appointment }) {
  return {
    appointment_date: appointment?.appointment_date || todayIsoDate(),
    appointment_time: appointment?.appointment_time ? appointment.appointment_time.slice(0, 5) : '',
    doctor_assigned: appointment?.doctor_assigned || clinic?.doctor_name || '',
    treatment_scheduled: appointment?.treatment_scheduled || lead?.treatment || '',
    notes: appointment?.notes || '',
  };
}

function AppointmentModal({ clinic, lead, appointment, mode, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(() => getAppointmentFormDefaults({ clinic, lead, appointment }));
  const [formError, setFormError] = useState('');
  const isReschedule = mode === 'reschedule';

  useEffect(() => {
    setForm(getAppointmentFormDefaults({ clinic, lead, appointment }));
    setFormError('');
  }, [appointment?.id, clinic?.doctor_name, lead?.id, mode]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit() {
    if (!form.appointment_date) {
      setFormError('Selecciona la fecha de consulta.');
      return;
    }

    if (!form.appointment_time) {
      setFormError('Selecciona la hora de consulta.');
      return;
    }

    setFormError('');

    try {
      await onSubmit({
        appointment_date: form.appointment_date,
        appointment_time: form.appointment_time,
        doctor_assigned: form.doctor_assigned.trim(),
        treatment_scheduled: form.treatment_scheduled.trim(),
        notes: form.notes.trim(),
      });
    } catch (submitError) {
      setFormError(submitError.message || 'No se pudo guardar la consulta.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/80 px-4 py-6 backdrop-blur sm:items-center">
      <form
        className="w-full max-w-2xl rounded-lg border border-white/10 bg-panel p-5 shadow-glow"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-mint">{isReschedule ? 'Reprogramar' : 'Agendar'}</p>
            <h2 className="mt-1 text-xl font-semibold text-cream">{isReschedule ? 'Reprogramar consulta' : 'Consulta agendada'}</h2>
            <p className="mt-1 text-sm text-cream/55">{lead?.name || 'Lead asociado'}</p>
          </div>
          <StatusBadge value={LEAD_STATUS.scheduled} />
        </div>

        {formError ? <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-red-100">{formError}</div> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Fecha de consulta" type="date" value={form.appointment_date} onChange={(value) => updateField('appointment_date', value)} disabled={saving} />
          <Field label="Hora de consulta" type="time" value={form.appointment_time} onChange={(value) => updateField('appointment_time', value)} disabled={saving} />
          <Field label="Doctor asignado" value={form.doctor_assigned} onChange={(value) => updateField('doctor_assigned', value)} disabled={saving} />
          <Field label="Tratamiento agendado" value={form.treatment_scheduled} onChange={(value) => updateField('treatment_scheduled', value)} disabled={saving} />
          <label className="block md:col-span-2">
            <span className="mb-2 block text-xs text-cream/55">Notas opcionales</span>
            <textarea
              className="min-h-28 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-cream outline-none disabled:cursor-not-allowed disabled:opacity-60"
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              disabled={saving}
            />
          </label>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-cream/80 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-ink hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isReschedule ? 'Guardar reprogramación' : 'Guardar consulta'}
          </button>
        </div>
      </form>
    </div>
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

function Field({ label, value, onChange, type = 'text', disabled = false }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs text-cream/55">{label}</span>
      <input className="w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-cream outline-none disabled:cursor-not-allowed disabled:opacity-60" type={type} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
    </label>
  );
}
