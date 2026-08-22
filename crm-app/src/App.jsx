import { useEffect, useMemo, useState } from 'react';
import {
  AlarmClock,
  Archive,
  ArrowDownUp,
  Ban,
  CalendarCheck2,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clipboard,
  Clock3,
  Edit3,
  ExternalLink,
  FilePlus,
  Filter,
  Flame,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Search,
  TrendingUp,
  UserCheck,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import AppLayout from './components/AppLayout';
import Login from './components/Login';
import EmptyState from './components/ui/EmptyState';
import Button from './components/ui/Button';
import Card from './components/ui/Card';
import PageHeader from './components/ui/PageHeader';
import StatCard from './components/ui/StatCard';
import StatusBadge from './components/ui/StatusBadge';
import {
  CLASSIFICATIONS,
  CONTACT_ATTEMPT_STATUSES,
  CONTACTED_STATUSES,
  EVALUATION_OPTIONS,
  LEAD_STATUSES,
  NEXT_ACTION_OPTIONS,
  SCHEDULED_STATUSES,
  SITUATION_OPTIONS,
  TREATMENT_OPTIONS,
  URGENCY_OPTIONS,
} from './lib/constants';
import {
  addDaysAsuncion,
  formatDate,
  formatDateTime,
  formatMoney,
  formatTime,
  fromDatetimeLocalAsuncion,
  normalizeText,
  todayIsoDate,
  toDatetimeLocalAsuncion,
  toLocalIsoDate,
  tomorrowFollowupAsuncion,
} from './lib/formatters';
import { buildLeadMessage, buildWhatsappUrl } from './lib/messages';
import { supabase } from './lib/supabase';

const ROLE = {
  admin: 'admin',
  owner: 'owner',
  receptionist: 'receptionist',
};
const ARCHIVED_STATUS = 'Archivado';
const terminalStatuses = ['Perdido', 'Tratamiento Iniciado', ARCHIVED_STATUS];
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
const APPOINTMENT_OUTCOME_LEAD_STATUSES = [LEAD_STATUS.confirmed, LEAD_STATUS.attended, LEAD_STATUS.noShow];
const TASK_OPEN_STATUSES = ['pendiente', 'vencido', 'Pendiente', 'Vencida'];
const TASK_PRIORITY_BY_CLASSIFICATION = {
  'Lead Caliente': 'alta',
  'Lead Medio': 'media',
  'Lead Frío': 'baja',
};
const MANUAL_LEAD_SOURCES = [
  'WhatsApp directo',
  'Instagram DM',
  'Llamada',
  'Recomendación',
  'Formulario externo',
  'Meta Ads manual',
  'Formulario web',
  'Presencial',
  'Otro',
];
const LEAD_ADMIN_EDIT_FIELDS = [
  'name',
  'phone',
  'phone_plus',
  'treatment',
  'urgency',
  'classification',
  'score',
  'status',
  'situation',
  'evaluation_previous',
  'consultation_reason',
  'estimated_value',
  'next_action',
  'next_followup_at',
  'notes',
];
const LEAD_RECEPTIONIST_EDIT_FIELDS = ['status', 'next_action', 'next_followup_at', 'contact_attempts', 'notes'];
const DEFAULT_PUBLIC_FORM_WEBHOOK_URL = 'https://unybqqzhgqxhrwucrofm.supabase.co/functions/v1/lead-intake';
const PUBLIC_LEAD_WEBHOOK_URL = import.meta.env.VITE_PUBLIC_LEAD_WEBHOOK_URL || DEFAULT_PUBLIC_FORM_WEBHOOK_URL;
const DEFAULT_EMBED_BASE_URL = typeof window === 'undefined' ? 'https://TU-CRM-REAL.vercel.app' : window.location.origin;

function cleanOptionalText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeRole(role) {
  return role === ROLE.admin || role === ROLE.owner ? ROLE.admin : ROLE.receptionist;
}

function isArchivedLead(lead) {
  return Boolean(lead?.is_archived || lead?.status === ARCHIVED_STATUS);
}

function displayConsultationReason(lead) {
  return lead?.consultation_reason || 'Sin especificar';
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function getTreatmentOptions(clinicSettings, treatmentPrices = []) {
  const configured = Array.isArray(clinicSettings?.treatments)
    ? clinicSettings.treatments.map((item) => (typeof item === 'string' ? item : item?.name || item?.treatment))
    : [];
  return uniqueStrings([...configured, ...treatmentPrices.map((item) => item.treatment), ...TREATMENT_OPTIONS]);
}

function isOpenTask(task) {
  return !['hecho', 'cancelado'].includes(normalizeText(task?.status));
}

function startOfAsuncionDate(daysOffset = 0) {
  const base = new Date(`${todayIsoDate()}T12:00:00`);
  base.setDate(base.getDate() + daysOffset);
  return base;
}

function daysBetween(from, to = new Date()) {
  return Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / 86400000));
}

function nowIso() {
  return new Date().toISOString();
}

function addHoursIso(hours) {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function addDaysIso(days, hour = 9) {
  return addDaysAsuncion(days, hour);
}

function appointmentDueIso(appointment, offsetHours = 0) {
  if (!appointment?.appointment_date || !appointment?.appointment_time) return null;
  const iso = fromDatetimeLocalAsuncion(`${appointment.appointment_date}T${String(appointment.appointment_time).slice(0, 5)}`);
  if (!iso) return null;
  const date = new Date(iso);
  date.setHours(date.getHours() + offsetHours);
  return date.toISOString();
}

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function integerOrZero(value) {
  const number = Number(value);
  return Number.isNaN(number) ? 0 : Math.max(0, Math.round(number));
}

function slugify(value) {
  const slug = normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'clinica';
}

function generatePublicToken() {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `lf_${window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}

function parseAllowedOrigins(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function formatAllowedOrigins(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}

function publicFormPayloadExample(config) {
  return {
    clinic_slug: config?.clinic_slug || 'dentalpro',
    landing_token: config?.public_token || 'lf_xxxxx',
    nombre: 'Laura',
    telefono: '+595981000000',
    tratamiento: 'Implante dental',
    urgencia: 'Hoy',
    evaluacion_previa: 'No',
    situacion: 'Quiero agendar una consulta',
    consultation_reason: 'Le falta una pieza',
    origen: 'Landing odontología',
    pagina: 'implantes',
    fecha_envio: 'auto',
    consentimiento_contacto: true,
  };
}

function publicFormFetchSnippet(config) {
  const payload = publicFormPayloadExample(config);
  return `const WEBHOOK_URL = "${PUBLIC_LEAD_WEBHOOK_URL}";

const payload = ${JSON.stringify(payload, null, 2)};

const response = await fetch(WEBHOOK_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

const data = await response.json();`;
}

function publicFormIframeSnippet(config) {
  const slug = config?.clinic_slug || 'CLINIC_SLUG';
  const token = config?.public_token || 'lf_xxxxx';
  return `<iframe
  src="${DEFAULT_EMBED_BASE_URL}/form/${slug}?landing_token=${encodeURIComponent(token)}"
  width="100%"
  height="720"
  style="border:0; border-radius:16px;"
></iframe>`;
}

function priorityForClassification(classification) {
  return TASK_PRIORITY_BY_CLASSIFICATION[classification] || 'media';
}

function taskConfigForLeadStatus(lead, newStatus, appointment) {
  const status = newStatus || lead?.status;

  if (['Nuevo', 'No Contactado'].includes(status)) {
    return {
      title: 'Contactar lead nuevo',
      type: 'contact',
      due_at: nowIso(),
      priority: priorityForClassification(lead?.classification),
    };
  }

  if (status === 'Contactado') {
    return {
      title: 'Hacer seguimiento',
      type: 'followup',
      due_at: lead?.next_followup_at || tomorrowFollowupAsuncion(),
      priority: 'media',
    };
  }

  if (status === LEAD_STATUS.scheduled) {
    return {
      title: 'Confirmar asistencia',
      type: 'confirm',
      due_at: appointmentDueIso(appointment, -24) || nowIso(),
      priority: 'media',
    };
  }

  if (status === LEAD_STATUS.confirmed) {
    return {
      title: 'Esperar asistencia',
      type: 'attendance',
      due_at: appointmentDueIso(appointment, 0) || nowIso(),
      priority: 'media',
    };
  }

  if (status === LEAD_STATUS.attended) {
    return {
      title: 'Enviar presupuesto o iniciar tratamiento',
      type: 'followup',
      due_at: addDaysIso(1),
      priority: 'media',
    };
  }

  if (status === 'Presupuesto Enviado') {
    return {
      title: 'Dar seguimiento al presupuesto',
      type: 'followup',
      due_at: addHoursIso(48),
      priority: 'media',
    };
  }

  if (status === 'No Respondió') {
    return {
      title: 'Intentar contacto nuevamente',
      type: 'contact',
      due_at: tomorrowFollowupAsuncion(),
      priority: 'media',
    };
  }

  if (status === LEAD_STATUS.noShow) {
    return {
      title: 'Reprogramar consulta',
      type: 'followup',
      due_at: tomorrowFollowupAsuncion(),
      priority: 'alta',
    };
  }

  if (status === 'Perdido') {
    return {
      title: 'Revisar motivo perdido',
      type: 'followup',
      due_at: nowIso(),
      priority: 'baja',
    };
  }

  if (status === 'Reactivar 30d') {
    return {
      title: 'Reactivar lead',
      type: 'followup',
      due_at: addDaysIso(30),
      priority: 'media',
    };
  }

  return null;
}

function buildLeadFormPatch(form, fields) {
  const allowed = new Set(fields);
  const patch = {};

  if (allowed.has('name')) patch.name = String(form.name || '').trim();
  if (allowed.has('phone')) patch.phone = cleanOptionalText(form.phone);
  if (allowed.has('phone_plus')) patch.phone_plus = cleanOptionalText(form.phone_plus);
  if (allowed.has('treatment')) patch.treatment = cleanOptionalText(form.treatment);
  if (allowed.has('urgency')) patch.urgency = cleanOptionalText(form.urgency);
  if (allowed.has('classification')) patch.classification = form.classification || 'Lead Medio';
  if (allowed.has('score')) patch.score = integerOrZero(form.score);
  if (allowed.has('status')) patch.status = form.status || 'Nuevo';
  if (allowed.has('situation')) patch.situation = cleanOptionalText(form.situation);
  if (allowed.has('evaluation_previous')) patch.evaluation_previous = cleanOptionalText(form.evaluation_previous);
  if (allowed.has('consultation_reason')) {
    patch.consultation_reason = cleanOptionalText(form.consultation_reason) || cleanOptionalText(form.situation) || cleanOptionalText(form.treatment);
  }
  if (allowed.has('estimated_value')) patch.estimated_value = numberOrNull(form.estimated_value);
  if (allowed.has('next_action')) patch.next_action = cleanOptionalText(form.next_action);
  if (allowed.has('next_followup_at')) patch.next_followup_at = fromDatetimeLocalAsuncion(form.next_followup_at);
  if (allowed.has('notes')) patch.notes = cleanOptionalText(form.notes);

  return patch;
}

function getPublicFormRoute() {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/form\/([a-z0-9-]+)\/?$/);
  if (!match) return null;
  const params = new URLSearchParams(window.location.search);
  return {
    clinicSlug: match[1],
    landingToken: params.get('landing_token') || params.get('token') || '',
  };
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
  const [clinicSettings, setClinicSettings] = useState(null);
  const [treatmentPrices, setTreatmentPrices] = useState([]);
  const [leadEvents, setLeadEvents] = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [appointmentModal, setAppointmentModal] = useState(null);
  const [appointmentSaving, setAppointmentSaving] = useState(false);
  const [appointmentActionId, setAppointmentActionId] = useState('');
  const [leadModal, setLeadModal] = useState(null);
  const [leadFormSaving, setLeadFormSaving] = useState(false);
  const [archiveModal, setArchiveModal] = useState(null);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [taskModal, setTaskModal] = useState(null);
  const [taskFormSaving, setTaskFormSaving] = useState(false);
  const [publicFormConfig, setPublicFormConfig] = useState(null);
  const [publicFormSaving, setPublicFormSaving] = useState(false);
  const [clinicProfiles, setClinicProfiles] = useState([]);
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
        setClinicSettings(null);
        setTreatmentPrices([]);
        setLeadEvents([]);
        setAppointmentModal(null);
        setAppointmentSaving(false);
        setAppointmentActionId('');
        setLeadModal(null);
        setLeadFormSaving(false);
        setArchiveModal(null);
        setArchiveSaving(false);
        setTaskModal(null);
        setTaskFormSaving(false);
        setPublicFormConfig(null);
        setPublicFormSaving(false);
        setClinicProfiles([]);
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
  const normalizedRole = normalizeRole(profile?.role);
  const canAdmin = normalizedRole === ROLE.admin;
  const activeLeads = useMemo(() => leads.filter((lead) => !isArchivedLead(lead)), [leads]);
  const navCounts = useMemo(() => {
    const now = Date.now();
    const today = todayIsoDate();
    const openTasks = tasks.filter((task) => !['hecho', 'cancelado'].includes(task.status));
    const followups = activeLeads.filter((lead) => lead.next_followup_at && new Date(lead.next_followup_at).getTime() <= now && !terminalStatuses.includes(lead.status));
    return {
      leads: activeLeads.filter((lead) => ['Nuevo', 'No Contactado'].includes(lead.status)).length,
      followups: followups.length,
      agenda: appointments.filter((appointment) => appointment.appointment_date === today && APPOINTMENT_ACTIVE_STATUSES.includes(appointment.status)).length,
      tasks: openTasks.filter((task) => !task.due_at || new Date(task.due_at).getTime() <= now).length,
    };
  }, [activeLeads, appointments, tasks]);
  const publicFormRoute = getPublicFormRoute();

  useEffect(() => {
    if (['settings', 'metrics'].includes(activeView) && !canAdmin) {
      setActiveView('dashboard');
    }
  }, [activeView, canAdmin]);

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

    const profileRole = normalizeRole(profileData.role);
    setProfile({ ...profileData, raw_role: profileData.role, role: profileRole });
    setClinic(clinicData);
    await refreshClinicData(profileData.clinic_id);
    if (profileRole === ROLE.admin) {
      await loadPublicFormConfig(profileData.clinic_id);
    } else {
      setPublicFormConfig(null);
    }
    setBootLoading(false);
  }

  async function loadPublicFormConfig(clinicId = profile?.clinic_id) {
    if (!clinicId) return;

    const { data, error: formError } = await supabase
      .from('clinic_public_forms')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (formError) {
      console.warn('Public form config is not available yet', formError);
      setPublicFormConfig(null);
      return;
    }

    setPublicFormConfig(data || null);
  }

  async function refreshClinicData(clinicId = profile?.clinic_id) {
    if (!clinicId) return;
    setError('');

    const [leadsResult, appointmentsResult, tasksResult, profilesResult, settingsResult, pricesResult] = await Promise.all([
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
        .select('*, leads(id, name, phone, phone_plus, whatsapp_link)')
        .eq('clinic_id', clinicId)
        .order('due_at', { ascending: true, nullsFirst: false }),
      supabase
        .from('profiles')
        .select('id, full_name, email, role, active')
        .eq('clinic_id', clinicId)
        .eq('active', true)
        .order('full_name', { ascending: true }),
      supabase
        .from('clinic_settings')
        .select('*')
        .eq('clinic_id', clinicId)
        .maybeSingle(),
      supabase
        .from('treatment_prices')
        .select('treatment, estimated_price')
        .eq('clinic_id', clinicId)
        .order('treatment', { ascending: true }),
    ]);

    const firstError = leadsResult.error || appointmentsResult.error || tasksResult.error || profilesResult.error || settingsResult.error || pricesResult.error;
    if (firstError) {
      console.error('Error loading clinic data', firstError);
      setError(firstError.message);
      return;
    }

    setLeads(leadsResult.data || []);
    setAppointments(appointmentsResult.data || []);
    setTasks(tasksResult.data || []);
    setClinicProfiles(profilesResult.data || []);
    setClinicSettings(settingsResult.data || null);
    setTreatmentPrices(pricesResult.data || []);
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

    if (statusChanged && APPOINTMENT_OUTCOME_LEAD_STATUSES.includes(patch.status)) {
      setError('Confirmado, Asistió y No Asistió se registran desde Agenda para mantener el turno sincronizado.');
      return;
    }

    if (statusChanged && patch.status === LEAD_STATUS.scheduled) {
      if (!before) {
        setError('No se pudo encontrar el lead para agendar la consulta.');
        return;
      }

      openAppointmentModal(before);
      return;
    }

    if (statusChanged && patch.status !== 'Tratamiento Iniciado') {
      const taskConfig = taskConfigForLeadStatus({ ...before, ...leadPatch }, patch.status);
      const workflowSaved = await saveLeadFollowup(before, {
        status: patch.status,
        nextAction: patch.next_action || taskConfig?.title || before?.next_action || 'Definir próximo paso',
        dueAt: patch.next_followup_at || taskConfig?.due_at || before?.next_followup_at || tomorrowFollowupAsuncion(),
      });

      if (!workflowSaved) return;

      if (Object.prototype.hasOwnProperty.call(patch, 'notes')) {
        const { error: notesError } = await supabase
          .from('leads')
          .update({ notes: cleanOptionalText(patch.notes) })
          .eq('id', leadId)
          .eq('clinic_id', profile.clinic_id);
        if (notesError) setError(`El flujo se guardó, pero no se pudo actualizar la nota: ${notesError.message}`);
      }
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

    if (statusChanged) {
      const { error: taskError } = await syncTasksForLeadStatus(
        { ...before, ...leadPatch, id: leadId, clinic_id: profile.clinic_id },
        leadPatch.status,
      );

      if (taskError) {
        eventErrorMessage = eventErrorMessage || `El lead se actualizo, pero no se pudo sincronizar la tarea: ${taskError.message}`;
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

  async function syncTasksForLeadStatus(lead, newStatus, appointment = null) {
    if (!profile?.clinic_id || !lead?.id) return { error: null };

    const config = taskConfigForLeadStatus(lead, newStatus, appointment);
    if (!config) return { error: null };

    const taskPayload = {
      clinic_id: profile.clinic_id,
      lead_id: lead.id,
      title: config.title,
      type: config.type || 'followup',
      description: config.description || null,
      due_at: config.due_at,
      priority: config.priority || 'media',
      status: 'pendiente',
    };

    const { data: existingTask, error: existingError } = await supabase
      .from('tasks')
      .select('id')
      .eq('clinic_id', profile.clinic_id)
      .eq('lead_id', lead.id)
      .eq('title', config.title)
      .in('status', TASK_OPEN_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error('Error checking existing task', existingError);
      return { error: existingError };
    }

    if (existingTask?.id) {
      const { error: updateError } = await supabase
        .from('tasks')
        .update(taskPayload)
        .eq('id', existingTask.id)
        .eq('clinic_id', profile.clinic_id);

      if (updateError) {
        console.error('Error updating task', updateError);
        return { error: updateError };
      }

      return { error: null };
    }

    const { error: insertError } = await supabase.from('tasks').insert(taskPayload);

    if (insertError) {
      console.error('Error creating task', insertError);
      return { error: insertError };
    }

    return { error: null };
  }

  async function saveLeadFollowup(lead, { status = null, nextAction = null, dueAt }) {
    if (!profile?.clinic_id || !lead?.id || !dueAt) return false;

    setError('');
    setNotice('');
    const { error: followupError } = await supabase.rpc('save_lead_followup', {
      p_lead_id: lead.id,
      p_status: status,
      p_next_action: nextAction,
      p_next_followup_at: dueAt,
    });

    if (followupError) {
      console.error('Error saving lead follow-up', followupError);
      setError(followupError.message || 'No se pudo guardar el seguimiento.');
      return false;
    }

    await refreshClinicData();
    if (selectedLeadId === lead.id) await loadLeadEvents(lead.id);
    setNotice(status ? 'Contacto registrado y próximo seguimiento creado.' : 'Seguimiento pospuesto sin perder la tarea.');
    return true;
  }

  async function markLeadContacted(lead) {
    await saveLeadFollowup(lead, {
      status: 'Contactado',
      nextAction: 'Hacer seguimiento',
      dueAt: tomorrowFollowupAsuncion(),
    });
  }

  async function postponeLeadFollowup(lead, days = 1) {
    await saveLeadFollowup(lead, {
      nextAction: lead.next_action || 'Hacer seguimiento',
      dueAt: addDaysAsuncion(days, 9),
    });
  }

  function openCreateLeadModal() {
    setError('');
    setLeadModal({ mode: 'create', lead: null });
  }

  function openEditLeadModal(lead) {
    if (!lead?.id) return;
    setError('');
    setLeadModal({ mode: 'edit', lead });
  }

  function openArchiveLeadModal(lead) {
    if (!canAdmin) {
      setError('Solo un admin puede archivar leads.');
      return;
    }

    if (!lead?.id) return;
    setError('');
    setArchiveModal(lead);
  }

  async function saveLeadForm(form, options = {}) {
    if (!leadModal) return;

    if (leadModal.mode === 'create') {
      await createManualLead(form, options);
      return;
    }

    await saveLeadEdit(leadModal.lead, form);
  }

  async function createManualLead(form, { scheduleAfterSave = false } = {}) {
    if (!profile?.clinic_id) {
      throw new Error('Tu usuario no tiene una clínica activa asignada.');
    }

    const name = String(form.name || '').trim();
    if (!name) {
      throw new Error('El nombre del lead es obligatorio.');
    }

    if (!MANUAL_LEAD_SOURCES.includes(form.source)) {
      throw new Error('Seleccioná una fuente válida.');
    }

    setLeadFormSaving(true);
    setError('');
    setNotice('');

    try {
      const { data, error: insertError } = await supabase.rpc('create_manual_lead', {
        p_name: name,
        p_phone: cleanOptionalText(form.phone),
        p_phone_plus: cleanOptionalText(form.phone_plus),
        p_treatment: cleanOptionalText(form.treatment),
        p_urgency: cleanOptionalText(form.urgency),
        p_consultation_reason: cleanOptionalText(form.consultation_reason),
        p_source: form.source,
        p_consent_contact: Boolean(form.consent_contact),
        p_notes: cleanOptionalText(form.notes),
        p_next_action: cleanOptionalText(form.next_action),
        p_next_followup_at: fromDatetimeLocalAsuncion(form.next_followup_at),
        p_assigned_to: form.assigned_to || null,
        p_classification: form.classification || 'Lead Medio',
        p_score: integerOrZero(form.score),
        p_situation: cleanOptionalText(form.situation),
        p_evaluation_previous: cleanOptionalText(form.evaluation_previous),
        p_estimated_value: numberOrNull(form.estimated_value),
      });

      if (insertError) {
        throw new Error(insertError.message);
      }

      const createdLead = Array.isArray(data) ? data[0] : data;
      if (!createdLead?.id) {
        throw new Error('La RPC no devolvió el lead creado.');
      }

      await refreshClinicData();
      setSelectedLeadId(createdLead.id);
      await loadLeadEvents(createdLead.id);
      setLeadModal(null);
      if (scheduleAfterSave) {
        setActiveView('agenda');
        openAppointmentModal(createdLead);
      } else {
        setActiveView('lead-detail');
      }

      setNotice(scheduleAfterSave ? 'Lead creado. Elegí un horario para agendarlo.' : 'Lead creado y tarea de seguimiento generada.');
    } finally {
      setLeadFormSaving(false);
    }
  }

  async function saveLeadEdit(lead, form) {
    if (!profile?.clinic_id || !lead?.id) return;

    const editableFields = canAdmin ? LEAD_ADMIN_EDIT_FIELDS : LEAD_RECEPTIONIST_EDIT_FIELDS;
    const patch = buildLeadFormPatch(form, editableFields);

    if (canAdmin && !patch.name) {
      throw new Error('El nombre del lead es obligatorio.');
    }

    if (patch.status === ARCHIVED_STATUS && !isArchivedLead(lead)) {
      throw new Error('Para archivar un lead usa el boton Archivar y registra el motivo.');
    }

    const statusChanged = patch.status && patch.status !== lead.status;

    if (statusChanged && APPOINTMENT_OUTCOME_LEAD_STATUSES.includes(patch.status)) {
      throw new Error('Confirmado, Asistió y No Asistió se registran desde Agenda para mantener el turno sincronizado.');
    }

    if (statusChanged && patch.status === LEAD_STATUS.scheduled) {
      const patchWithoutStatus = { ...patch };
      delete patchWithoutStatus.status;

      if (Object.keys(patchWithoutStatus).length) {
        setLeadFormSaving(true);
        try {
          const { error: updateError } = await supabase
            .from('leads')
            .update(patchWithoutStatus)
            .eq('id', lead.id)
            .eq('clinic_id', profile.clinic_id);

          if (updateError) {
            throw new Error(updateError.message);
          }

          await createLeadEvent(lead.id, {
            event_type: 'lead_updated',
            title: 'Lead editado',
            description: 'Datos del lead actualizados',
          });
          await refreshClinicData();
        } finally {
          setLeadFormSaving(false);
        }
      }

      setLeadModal(null);
      openAppointmentModal({ ...lead, ...patchWithoutStatus });
      return;
    }

    const receptionistWorkflowChanged = statusChanged
      || patch.next_action !== lead.next_action
      || patch.next_followup_at !== lead.next_followup_at;

    if (!canAdmin && receptionistWorkflowChanged && (!statusChanged || patch.status !== 'Tratamiento Iniciado')) {
      setLeadFormSaving(true);
      try {
        const taskConfig = statusChanged ? taskConfigForLeadStatus({ ...lead, ...patch }, patch.status) : null;
        const workflowSaved = await saveLeadFollowup(lead, {
          status: statusChanged ? patch.status : null,
          nextAction: patch.next_action || taskConfig?.title || lead.next_action || 'Definir próximo paso',
          dueAt: patch.next_followup_at || taskConfig?.due_at || lead.next_followup_at || tomorrowFollowupAsuncion(),
        });
        if (!workflowSaved) return;

        if (Object.prototype.hasOwnProperty.call(patch, 'notes')) {
          const { error: notesError } = await supabase
            .from('leads')
            .update({ notes: patch.notes })
            .eq('id', lead.id)
            .eq('clinic_id', profile.clinic_id);
          if (notesError) throw new Error(notesError.message);
          await refreshClinicData();
        }
        setLeadModal(null);
        setNotice('Lead actualizado y seguimiento sincronizado.');
      } finally {
        setLeadFormSaving(false);
      }
      return;
    }

    setLeadFormSaving(true);
    setError('');
    setNotice('');

    try {
      const { error: updateError } = await supabase
        .from('leads')
        .update(patch)
        .eq('id', lead.id)
        .eq('clinic_id', profile.clinic_id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      const { error: eventError } = await createLeadEvent(lead.id, {
        event_type: 'lead_updated',
        title: 'Lead editado',
        description: 'Datos del lead actualizados',
      });

      const mergedLead = { ...lead, ...patch, clinic_id: profile.clinic_id };
      const { error: taskError } = statusChanged ? await syncTasksForLeadStatus(mergedLead, patch.status) : { error: null };

      await refreshClinicData();
      if (selectedLeadId === lead.id) {
        await loadLeadEvents(lead.id);
      }

      setLeadModal(null);

      if (eventError) {
        setError(`El lead fue actualizado, pero no se pudo registrar el evento: ${eventError.message}`);
        return;
      }

      if (taskError) {
        setError(`El lead fue actualizado, pero no se pudo sincronizar la tarea: ${taskError.message}`);
        return;
      }

      setNotice('Lead editado.');
    } finally {
      setLeadFormSaving(false);
    }
  }

  async function archiveLead(lead, reason) {
    const cleanReason = cleanOptionalText(reason);

    if (!profile?.clinic_id || !canAdmin || !lead?.id) {
      throw new Error('Solo un admin puede archivar leads.');
    }

    if (!cleanReason) {
      throw new Error('El motivo de archivado es obligatorio.');
    }

    setArchiveSaving(true);
    setError('');
    setNotice('');

    try {
      const { error: archiveError } = await supabase
        .from('leads')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: session.user.id,
          archived_reason: cleanReason,
          status: ARCHIVED_STATUS,
        })
        .eq('id', lead.id)
        .eq('clinic_id', profile.clinic_id);

      if (archiveError) {
        throw new Error(archiveError.message);
      }

      const { error: eventError } = await createLeadEvent(lead.id, {
        event_type: 'lead_archived',
        title: 'Lead archivado',
        description: cleanReason,
      });

      await refreshClinicData();
      if (selectedLeadId === lead.id) {
        await loadLeadEvents(lead.id);
      }

      setArchiveModal(null);

      if (eventError) {
        setError(`El lead fue archivado, pero no se pudo registrar el evento: ${eventError.message}`);
        return;
      }

      setNotice('Lead archivado.');
    } finally {
      setArchiveSaving(false);
    }
  }

  function openCreateTaskModal(lead = null) {
    if (!canAdmin) {
      setError('Solo un admin puede crear tareas manuales.');
      return;
    }

    setTaskModal({ mode: 'create', task: null, leadId: lead?.id || '' });
  }

  function openEditTaskModal(task) {
    if (!canAdmin || !task?.id) {
      setError('Solo un admin puede editar tareas.');
      return;
    }

    setTaskModal({ mode: 'edit', task });
  }

  async function saveTaskForm(form) {
    if (!profile?.clinic_id || !canAdmin || !taskModal) {
      throw new Error('Solo un admin puede guardar tareas.');
    }

    const title = String(form.title || '').trim();
    if (!title) {
      throw new Error('El titulo de la tarea es obligatorio.');
    }

    const payload = {
      clinic_id: profile.clinic_id,
      lead_id: cleanOptionalText(form.lead_id),
      title,
      description: cleanOptionalText(form.description),
      due_at: fromDatetimeLocalAsuncion(form.due_at),
      priority: form.priority || 'media',
      status: form.status || 'pendiente',
    };

    setTaskFormSaving(true);
    setError('');
    setNotice('');

    try {
      const result =
        taskModal.mode === 'edit'
          ? await supabase
              .from('tasks')
              .update(payload)
              .eq('id', taskModal.task.id)
              .eq('clinic_id', profile.clinic_id)
          : await supabase.from('tasks').insert(payload);

      if (result.error) {
        throw new Error(result.error.message);
      }

      await refreshClinicData();
      setTaskModal(null);
      setNotice(taskModal.mode === 'edit' ? 'Tarea actualizada.' : 'Tarea creada.');
    } finally {
      setTaskFormSaving(false);
    }
  }

  async function savePublicFormConfig(form) {
    if (!profile?.clinic_id || !canAdmin) {
      throw new Error('Solo un admin puede guardar la configuracion del formulario.');
    }

    const clinicSlug = slugify(form.clinic_slug);
    const publicToken = String(form.public_token || '').trim();

    if (!/^lf_[A-Za-z0-9_-]{32,}$/.test(publicToken)) {
      throw new Error('El landing_token debe empezar con lf_ y tener al menos 32 caracteres seguros.');
    }

    const payload = {
      clinic_id: profile.clinic_id,
      clinic_slug: clinicSlug,
      public_token: publicToken,
      landing_url: cleanOptionalText(form.landing_url),
      allowed_origins: parseAllowedOrigins(form.allowed_origins),
      is_active: Boolean(form.is_active),
    };

    setPublicFormSaving(true);
    setError('');
    setNotice('');

    try {
      const result = publicFormConfig?.id
        ? await supabase
            .from('clinic_public_forms')
            .update(payload)
            .eq('id', publicFormConfig.id)
            .eq('clinic_id', profile.clinic_id)
            .select('*')
            .single()
        : await supabase.from('clinic_public_forms').insert(payload).select('*').single();

      if (result.error) {
        throw new Error(result.error.message);
      }

      setPublicFormConfig(result.data || null);
      setNotice('Configuración de landing guardada.');
    } finally {
      setPublicFormSaving(false);
    }
  }

  async function saveAppointmentSchedule(form) {
    const modal = appointmentModal;
    const lead = modal?.lead;

    if (!profile?.clinic_id || !lead?.id) {
      throw new Error('No se pudo identificar la clinica o el lead para guardar la consulta.');
    }

    const isReschedule = modal.mode === 'reschedule';

    setAppointmentSaving(true);
    setError('');
    setNotice('');

    try {
      const { error: scheduleError } = await supabase.rpc('schedule_lead_appointment', {
        p_lead_id: lead.id,
        p_appointment_date: form.appointment_date,
        p_appointment_time: form.appointment_time,
        p_doctor_assigned: form.doctor_assigned.trim(),
        p_treatment_scheduled: cleanOptionalText(form.treatment_scheduled),
        p_notes: cleanOptionalText(form.notes),
        p_appointment_id: modal.appointment?.id || null,
      });

      if (scheduleError) {
        const message = /ocupado|unique|appointments_active_slot/i.test(scheduleError.message || '')
          ? 'Ese horario ya está ocupado para este doctor.'
          : scheduleError.message;
        throw new Error(message || 'No se pudo guardar la consulta.');
      }

      await refreshClinicData();
      if (selectedLeadId === lead.id) {
        await loadLeadEvents(lead.id);
      }

      setAppointmentModal(null);
      setNotice(isReschedule ? 'Consulta reprogramada.' : 'Consulta agendada.');
    } catch (scheduleError) {
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
        outcome: APPOINTMENT_STATUS.confirmed,
        notice: 'Turno confirmado.',
      },
      attended: {
        outcome: APPOINTMENT_STATUS.attended,
        notice: 'Asistencia registrada.',
      },
      noShow: {
        outcome: APPOINTMENT_STATUS.noShow,
        notice: 'Inasistencia registrada.',
      },
    };

    const config = configs[action];
    if (!config) return;

    setAppointmentActionId(`${appointment.id}:${action}`);
    setError('');
    setNotice('');

    const { error: outcomeError } = await supabase.rpc('update_appointment_outcome', {
      p_appointment_id: appointment.id,
      p_outcome: config.outcome,
    });

    if (outcomeError) {
      console.error('Error updating appointment outcome', outcomeError);
      setError(outcomeError.message || 'No se pudo actualizar el resultado del turno.');
      setAppointmentActionId('');
      return;
    }

    await refreshClinicData();
    if (selectedLeadId === appointment.lead_id) {
      await loadLeadEvents(appointment.lead_id);
    }

    setAppointmentActionId('');
    setNotice(config.notice);
  }

  async function completeTask(taskId) {
    if (!profile?.clinic_id) return;

    const { error: taskError } = await supabase.rpc('complete_task', {
      p_task_id: taskId,
    });

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

  if (publicFormRoute) {
    return <PublicEmbedLeadForm clinicSlug={publicFormRoute.clinicSlug} landingToken={publicFormRoute.landingToken} />;
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
    <AppLayout activeView={activeView} setActiveView={setActiveView} clinic={clinic} profile={profile} isAdmin={canAdmin} navCounts={navCounts} onLogout={handleLogout}>
      {error ? <Banner tone="danger" text={error} onClose={() => setError('')} /> : null}
      {notice ? <Banner tone="mint" text={notice} onClose={() => setNotice('')} /> : null}

      {activeView === 'dashboard' ? (
        <Dashboard
          leads={activeLeads}
          appointments={appointments}
          tasks={tasks}
          onCreateLead={openCreateLeadModal}
          onOpenLead={handleLeadSelect}
          onScheduleAppointment={openAppointmentModal}
          onCompleteTask={completeTask}
          onNavigate={setActiveView}
        />
      ) : null}
      {activeView === 'followups' ? (
        <FollowupsView
          leads={activeLeads}
          tasks={tasks}
          profiles={clinicProfiles}
          onOpenLead={handleLeadSelect}
          onEditLead={openEditLeadModal}
          onMarkContacted={markLeadContacted}
          onScheduleAppointment={openAppointmentModal}
          onCompleteTask={completeTask}
          onPostpone={postponeLeadFollowup}
        />
      ) : null}
      {activeView === 'leads' ? (
        <LeadsView
          leads={leads}
          canAdmin={canAdmin}
          onCreateLead={openCreateLeadModal}
          onEditLead={openEditLeadModal}
          onArchiveLead={openArchiveLeadModal}
          onOpenLead={handleLeadSelect}
          onUpdateLead={updateLead}
          onScheduleAppointment={openAppointmentModal}
          onCreateTask={openCreateTaskModal}
          onMarkContacted={markLeadContacted}
          profiles={clinicProfiles}
          setNotice={setNotice}
        />
      ) : null}
      {activeView === 'lead-detail' ? (
        <LeadDetail
          lead={selectedLead}
          events={leadEvents}
          canAdmin={canAdmin}
          onBack={() => setActiveView('leads')}
          onEditLead={openEditLeadModal}
          onArchiveLead={openArchiveLeadModal}
          onSave={updateLead}
          onMarkContacted={markLeadContacted}
          onScheduleAppointment={openAppointmentModal}
          setNotice={setNotice}
        />
      ) : null}
      {activeView === 'agenda' ? (
        <AgendaView
          appointments={appointments}
          actionId={appointmentActionId}
          onOutcome={updateAppointmentOutcome}
          onReschedule={openRescheduleModal}
          onOpenLead={handleLeadSelect}
          onNavigate={setActiveView}
        />
      ) : null}
      {activeView === 'tasks' ? (
        <TasksView tasks={tasks} leads={activeLeads} canAdmin={canAdmin} onCreateTask={openCreateTaskModal} onEditTask={openEditTaskModal} onComplete={completeTask} onOpenLead={handleLeadSelect} />
      ) : null}
      {activeView === 'metrics' && canAdmin ? (
        <MetricsView leads={activeLeads} appointments={appointments} tasks={tasks} treatmentPrices={treatmentPrices} />
      ) : null}
      {activeView === 'settings' && canAdmin ? (
        <SettingsView clinic={clinic} profile={profile} publicFormConfig={publicFormConfig} savingPublicForm={publicFormSaving} onSavePublicForm={savePublicFormConfig} setNotice={setNotice} />
      ) : null}
      {appointmentModal ? (
        <AppointmentModal
          clinic={clinic}
          lead={appointmentModal.lead}
          appointment={appointmentModal.appointment}
          appointments={appointments}
          profiles={clinicProfiles}
          clinicSettings={clinicSettings}
          mode={appointmentModal.mode}
          saving={appointmentSaving}
          onClose={() => setAppointmentModal(null)}
          onSubmit={saveAppointmentSchedule}
        />
      ) : null}
      {leadModal ? (
        <LeadFormModal
          mode={leadModal.mode}
          lead={leadModal.lead}
          canAdmin={canAdmin}
          profiles={clinicProfiles}
          currentUserId={profile?.id}
          treatmentOptions={getTreatmentOptions(clinicSettings, treatmentPrices)}
          saving={leadFormSaving}
          onClose={() => setLeadModal(null)}
          onSubmit={saveLeadForm}
        />
      ) : null}
      {archiveModal ? <ArchiveLeadModal lead={archiveModal} saving={archiveSaving} onClose={() => setArchiveModal(null)} onSubmit={archiveLead} /> : null}
      {taskModal ? (
        <TaskFormModal
          mode={taskModal.mode}
          task={taskModal.task}
          initialLeadId={taskModal.leadId}
          leads={activeLeads}
          saving={taskFormSaving}
          onClose={() => setTaskModal(null)}
          onSubmit={saveTaskForm}
        />
      ) : null}
    </AppLayout>
  );
}

function PublicEmbedLeadForm({ clinicSlug, landingToken }) {
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
      setError(submitError.message || 'No se pudo enviar el formulario.');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-6 text-cream">
      <form className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 shadow-glow" onSubmit={handleSubmit}>
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

        <button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-mint px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={sending}>
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

function FullScreenLoader({ label }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink text-cream">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-glow">
        <div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-mint" /><span className="text-sm font-semibold">{label}</span></div>
        <div className="mt-5 space-y-3" aria-hidden="true"><div className="skeleton h-3 w-2/3 rounded-full" /><div className="skeleton h-16 w-full rounded-xl" /><div className="grid grid-cols-2 gap-3"><div className="skeleton h-14 rounded-xl" /><div className="skeleton h-14 rounded-xl" /></div></div>
      </div>
    </main>
  );
}

function Banner({ text, tone, onClose }) {
  const styles = tone === 'danger' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  useEffect(() => {
    if (tone === 'danger') return undefined;
    const timeout = window.setTimeout(onClose, 4500);
    return () => window.clearTimeout(timeout);
  }, [text, tone, onClose]);

  return (
    <div className={`modal-enter fixed right-4 top-4 z-[70] flex max-w-md items-center justify-between gap-4 rounded-2xl border p-4 text-sm font-medium shadow-xl ${styles}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="flex items-center gap-2">{tone === 'danger' ? <Ban className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}{text}</span>
      <button className="rounded-lg p-1 opacity-70 hover:bg-white/50 hover:opacity-100" type="button" onClick={onClose} aria-label="Cerrar mensaje"><X className="h-4 w-4" /></button>
    </div>
  );
}

function Dashboard({ leads, appointments, tasks, onCreateLead, onOpenLead, onScheduleAppointment, onCompleteTask, onNavigate }) {
  const data = useMemo(() => {
    const now = Date.now();
    const today = todayIsoDate();
    const newToday = leads.filter((lead) => toLocalIsoDate(lead.created_at) === today).length;
    const hotPending = leads.filter((lead) => lead.classification === 'Lead Caliente' && ['Nuevo', 'No Contactado'].includes(lead.status) && !lead.last_contact_at);
    const overdueFollowups = leads.filter((lead) => lead.next_followup_at && new Date(lead.next_followup_at).getTime() < now && !terminalStatuses.includes(lead.status));
    const todayAppointments = appointments.filter((appointment) => appointment.appointment_date === today && APPOINTMENT_ACTIVE_STATUSES.includes(appointment.status));
    const overdueTasks = tasks.filter((task) => isOpenTask(task) && task.due_at && new Date(task.due_at).getTime() < now);
    const noShows = appointments.filter((appointment) => appointment.status === APPOINTMENT_STATUS.noShow);
    const unassigned = leads.filter((lead) => !lead.assigned_to && !terminalStatuses.includes(lead.status));
    const responseTimes = leads
      .filter((lead) => lead.created_at && lead.last_contact_at)
      .map((lead) => Math.max(0, new Date(lead.last_contact_at) - new Date(lead.created_at)) / 60000)
      .filter((minutes) => Number.isFinite(minutes));
    const averageMinutes = responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) : null;

    const priority = [
      ...hotPending.map((lead) => ({ id: `hot-${lead.id}`, rank: 1, title: lead.name, detail: `Lead caliente sin contactar · ${lead.treatment || 'Tratamiento sin definir'}`, label: 'Ver lead', icon: Flame, tone: 'red', onClick: () => onOpenLead(lead.id) })),
      ...overdueFollowups.map((lead) => ({ id: `followup-${lead.id}`, rank: 2, title: lead.name, detail: `${lead.next_action || 'Seguimiento pendiente'} · ${formatDateTime(lead.next_followup_at)}`, label: 'Contactar', icon: AlarmClock, tone: 'amber', onClick: () => onOpenLead(lead.id) })),
      ...todayAppointments.map((appointment) => ({ id: `appointment-${appointment.id}`, rank: 3, title: appointment.leads?.name || 'Cita de hoy', detail: `${formatTime(appointment.appointment_time)} · ${appointment.doctor_assigned}`, label: 'Ver cita', icon: CalendarCheck2, tone: 'blue', onClick: () => onNavigate('agenda') })),
      ...noShows.slice(0, 3).map((appointment) => ({ id: `noshow-${appointment.id}`, rank: 4, title: appointment.leads?.name || 'No-show', detail: 'No asistió. Recuperar y ofrecer reprogramación.', label: 'Reagendar', icon: RefreshCw, tone: 'red', onClick: () => onRescheduleSafe(appointment, onOpenLead) })),
      ...overdueTasks.map((task) => ({ id: `task-${task.id}`, rank: 5, title: task.title, detail: task.leads?.name || 'Tarea sin lead asociado', label: 'Completar tarea', icon: CheckCircle2, tone: 'slate', onClick: () => onCompleteTask(task.id) })),
    ].sort((a, b) => a.rank - b.rank).slice(0, 10);

    return { newToday, hotPending, overdueFollowups, todayAppointments, overdueTasks, noShows, unassigned, averageMinutes, priority };
  }, [leads, appointments, tasks, onCompleteTask, onNavigate, onOpenLead]);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Prioridad de hoy"
        title="¿Qué necesita atención ahora?"
        subtitle="Estas son las oportunidades y tareas que conviene resolver primero."
        action={<Button type="button" onClick={onCreateLead}><FilePlus className="h-4 w-4" />Nuevo lead</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Leads nuevos hoy" value={data.newToday} icon={UsersRound} detail="Ingresados desde cualquier fuente" />
        <StatCard label="Calientes pendientes" value={data.hotPending.length} tone="danger" icon={Flame} detail="Sin primer contacto registrado" />
        <StatCard label="Seguimientos vencidos" value={data.overdueFollowups.length} tone="gold" icon={AlarmClock} detail="Requieren acción inmediata" />
        <StatCard label="Citas de hoy" value={data.todayAppointments.length} tone="purple" icon={CalendarCheck2} detail="Agendadas, confirmadas o reprogramadas" />
        <StatCard label="Tareas vencidas" value={data.overdueTasks.length} tone="danger" icon={CheckCircle2} />
        <StatCard label="No-shows a recuperar" value={data.noShows.length} tone="gold" icon={RefreshCw} />
        <StatCard label="Respuesta promedio" value={data.averageMinutes === null ? 'Sin datos' : data.averageMinutes < 60 ? `${data.averageMinutes} min` : `${Math.round(data.averageMinutes / 60)} h`} icon={Clock3} detail="Desde creación hasta primer contacto" />
        <StatCard label="Sin responsable" value={data.unassigned.length} tone="cream" icon={UserRound} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_0.55fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="font-bold text-cream">Prioridad de hoy</h3>
              <p className="mt-1 text-sm text-slate-500">Resolvé la lista de arriba hacia abajo.</p>
            </div>
            <Button variant="ghost" size="sm" type="button" onClick={() => onNavigate('followups')}>Ver seguimientos</Button>
          </div>
          {data.priority.length ? (
            <div className="divide-y divide-slate-100">
              {data.priority.map((item) => {
                const Icon = item.icon;
                const tone = item.tone === 'red' ? 'bg-red-50 text-red-600' : item.tone === 'amber' ? 'bg-amber-50 text-amber-700' : item.tone === 'blue' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600';
                return (
                  <div key={item.id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-cream">{item.title}</p>
                      <p className="mt-1 truncate text-sm text-slate-500">{item.detail}</p>
                    </div>
                    <Button variant="secondary" size="sm" type="button" onClick={item.onClick}>{item.label}</Button>
                  </div>
                );
              })}
            </div>
          ) : <div className="p-5"><EmptyState title="Todo al día" text="No hay prioridades vencidas ni leads calientes esperando contacto." /></div>}
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-cream">Acciones rápidas</h3>
          <p className="mt-1 text-sm text-slate-500">Los atajos más usados por recepción.</p>
          <div className="mt-5 grid gap-2">
            <Button type="button" onClick={onCreateLead}><FilePlus className="h-4 w-4" />Registrar nuevo lead</Button>
            <Button variant="secondary" type="button" onClick={() => onNavigate('followups')}><AlarmClock className="h-4 w-4" />Trabajar seguimientos</Button>
            <Button variant="secondary" type="button" onClick={() => onNavigate('agenda')}><CalendarDays className="h-4 w-4" />Revisar agenda</Button>
          </div>
          <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-blue-800">
            <strong>Regla operativa:</strong> ningún lead caliente debería terminar el día sin contacto o próxima acción.
          </div>
        </Card>
      </div>
    </section>
  );
}

function onRescheduleSafe(appointment, onOpenLead) {
  if (appointment?.lead_id) onOpenLead(appointment.lead_id);
}

function FollowupsView({ leads, tasks, profiles, onOpenLead, onEditLead, onMarkContacted, onScheduleAppointment, onCompleteTask, onPostpone }) {
  const [filters, setFilters] = useState({ assigned: '', classification: '', source: '', treatment: '', status: '', window: 'all' });
  const profileNames = useMemo(() => Object.fromEntries((profiles || []).map((profile) => [profile.id, profile.full_name])), [profiles]);
  const treatmentOptions = useMemo(() => uniqueStrings(leads.map((lead) => lead.treatment)).sort(), [leads]);
  const sourceOptions = useMemo(() => uniqueStrings(leads.map((lead) => lead.source)).sort(), [leads]);
  const items = useMemo(() => {
    const now = Date.now();
    const today = todayIsoDate();
    const inSevenDays = startOfAsuncionDate(7).getTime();

    return leads.flatMap((lead) => {
      if (terminalStatuses.includes(lead.status)) return [];
      const leadTasks = tasks.filter((task) => task.lead_id === lead.id && isOpenTask(task));
      const nextTask = leadTasks.sort((a, b) => new Date(a.due_at || 8640000000000000) - new Date(b.due_at || 8640000000000000))[0] || null;
      const due = lead.next_followup_at || nextTask?.due_at || null;
      const dueMs = due ? new Date(due).getTime() : null;
      const isHotUncontacted = lead.classification === 'Lead Caliente' && ['Nuevo', 'No Contactado'].includes(lead.status) && !lead.last_contact_at;
      const isNewStale = ['Nuevo', 'No Contactado'].includes(lead.status) && new Date(lead.created_at).getTime() < now - 2 * 3600000;
      const isContactedUnscheduled = ['Contactado', 'Respondió', 'Presupuesto Enviado', 'No Respondió'].includes(lead.status);
      const isNoShow = lead.status === LEAD_STATUS.noShow;
      const isUnassigned = !lead.assigned_to;
      if (!due && !nextTask && !isHotUncontacted && !isNewStale && !isContactedUnscheduled && !isNoShow && !isUnassigned) return [];

      let bucket = 'Sin respuesta';
      if (isNoShow) bucket = 'No-shows';
      else if (dueMs && dueMs < now) bucket = 'Vencidos';
      else if (due && toLocalIsoDate(due) === today) bucket = 'Para hoy';
      else if (dueMs && dueMs <= inSevenDays) bucket = 'Próximos 7 días';

      let reason = lead.next_action || 'Definir próxima acción';
      if (isHotUncontacted) reason = `Lead caliente sin contactar desde hace ${Math.max(1, Math.round((now - new Date(lead.created_at).getTime()) / 3600000))} h.`;
      else if (isNoShow) reason = 'No asistió. Reagendar y recuperar hoy.';
      else if (dueMs && dueMs < now) reason = `${lead.next_action || nextTask?.title || 'Seguimiento'} · vencido hace ${daysBetween(due) ? `${daysBetween(due)} d` : 'menos de 1 día'}.`;
      else if (isContactedUnscheduled) reason = `${lead.status}: falta concretar el próximo paso.`;
      else if (isUnassigned) reason = 'Oportunidad sin responsable asignado.';

      return [{ lead, task: nextTask, due, bucket, reason, rank: bucket === 'Vencidos' ? 1 : bucket === 'Para hoy' ? 2 : bucket === 'Próximos 7 días' ? 3 : bucket === 'No-shows' ? 4 : 5 }];
    })
      .filter((item) => {
        const { lead, due } = item;
        if (filters.assigned && lead.assigned_to !== filters.assigned) return false;
        if (filters.classification && lead.classification !== filters.classification) return false;
        if (filters.source && lead.source !== filters.source) return false;
        if (filters.treatment && lead.treatment !== filters.treatment) return false;
        if (filters.status && lead.status !== filters.status) return false;
        if (filters.window === 'overdue' && item.bucket !== 'Vencidos') return false;
        if (filters.window === 'today' && item.bucket !== 'Para hoy') return false;
        if (filters.window === 'next7' && item.bucket !== 'Próximos 7 días') return false;
        if (filters.window === 'hot' && lead.classification !== 'Lead Caliente') return false;
        return Boolean(due || item.reason);
      })
      .sort((a, b) => a.rank - b.rank || new Date(a.due || 8640000000000000) - new Date(b.due || 8640000000000000));
  }, [leads, tasks, filters]);

  const groups = ['Vencidos', 'Para hoy', 'Próximos 7 días', 'No-shows', 'Sin respuesta'];

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Cola de acción" title="Seguimientos" subtitle="Contactá primero estos leads para evitar que se enfríen." />
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-600"><Filter className="h-4 w-4" />Filtrar seguimientos</div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Select label="Responsable" value={filters.assigned} onChange={(value) => setFilters({ ...filters, assigned: value })} options={(profiles || []).map((profile) => ({ value: profile.id, label: profile.full_name }))} placeholder="Todos" />
          <Select label="Prioridad" value={filters.classification} onChange={(value) => setFilters({ ...filters, classification: value })} options={CLASSIFICATIONS} placeholder="Todas" />
          <Select label="Fuente" value={filters.source} onChange={(value) => setFilters({ ...filters, source: value })} options={sourceOptions} placeholder="Todas" />
          <Select label="Tratamiento" value={filters.treatment} onChange={(value) => setFilters({ ...filters, treatment: value })} options={treatmentOptions} placeholder="Todos" />
          <Select label="Estado" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={LEAD_STATUSES.filter((status) => status !== ARCHIVED_STATUS)} placeholder="Todos" />
          <Select label="Cuándo" value={filters.window} onChange={(value) => setFilters({ ...filters, window: value })} options={[{ value: 'all', label: 'Todos' }, { value: 'overdue', label: 'Vencidos' }, { value: 'today', label: 'Para hoy' }, { value: 'next7', label: 'Próximos 7 días' }, { value: 'hot', label: 'Sólo calientes' }]} />
        </div>
      </Card>

      {items.length ? groups.map((group) => {
        const groupItems = items.filter((item) => item.bucket === group);
        if (!groupItems.length) return null;
        return (
          <section key={group} className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-cream">{group}</h3>
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">{groupItems.length}</span>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {groupItems.map(({ lead, task, reason, due }) => (
                <Card key={`${group}-${lead.id}`} as="article" className="card-enter p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <button className="text-left text-lg font-bold text-cream hover:text-mint" type="button" onClick={() => onOpenLead(lead.id)}>{lead.name}</button>
                      <p className="mt-1 text-sm font-medium text-slate-600">{reason}</p>
                      <p className="mt-2 text-xs text-slate-500">{lead.treatment || 'Tratamiento sin definir'} · {lead.source || 'Fuente sin definir'} · {profileNames[lead.assigned_to] || 'Sin responsable'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2"><StatusBadge value={lead.classification} /><StatusBadge value={lead.status} /></div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <Clock3 className="h-4 w-4 text-mint" /> Próximo seguimiento: {due ? formatDateTime(due) : 'Definir ahora'}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    <Button size="sm" type="button" onClick={() => onOpenLead(lead.id)}>Abrir lead</Button>
                    {['Nuevo', 'No Contactado', 'No Respondió'].includes(lead.status) ? <Button size="sm" variant="secondary" type="button" onClick={() => onMarkContacted(lead)}><Check className="h-4 w-4" />Marcar contactado</Button> : null}
                    <Button size="sm" variant="secondary" type="button" onClick={() => onScheduleAppointment(lead)}><CalendarPlus className="h-4 w-4" />Agendar</Button>
                    {task ? <Button size="sm" variant="secondary" type="button" onClick={() => onCompleteTask(task.id)}><CheckCircle2 className="h-4 w-4" />Completar tarea</Button> : null}
                    <select className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600" defaultValue="" aria-label={`Posponer seguimiento de ${lead.name}`} onChange={(event) => { if (event.target.value) onPostpone(lead, Number(event.target.value)); event.target.value = ''; }}>
                      <option value="" disabled>Posponer…</option>
                      <option value="1">Mañana</option><option value="3">En 3 días</option><option value="7">En 7 días</option>
                    </select>
                    <Button size="sm" variant="ghost" type="button" onClick={() => onEditLead(lead)}><Edit3 className="h-4 w-4" />Crear nota</Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        );
      }) : <EmptyState title="No hay seguimientos con estos filtros" text="Cuando un lead necesite una acción, aparecerá acá con su recomendación." />}
    </section>
  );
}

function LeadsView({ leads, canAdmin, onCreateLead, onEditLead, onArchiveLead, onOpenLead, onUpdateLead, onScheduleAppointment, onCreateTask, onMarkContacted, profiles, setNotice }) {
  const [filters, setFilters] = useState({ status: '', classification: '', treatment: '', source: '', assigned: '', date: '', q: '', uncontacted: false, hotOnly: false, showArchived: false, sort: 'recent' });
  const treatmentOptions = useMemo(() => uniqueStrings(leads.map((lead) => lead.treatment)).sort(), [leads]);
  const sourceOptions = useMemo(() => uniqueStrings(leads.map((lead) => lead.source)).sort(), [leads]);
  const profileNames = useMemo(() => Object.fromEntries((profiles || []).map((profile) => [profile.id, profile.full_name])), [profiles]);
  const filteredLeads = useMemo(() => {
    const q = normalizeText(filters.q);
    const today = todayIsoDate();
    const now = Date.now();
    const rows = leads.filter((lead) => {
      if ((!canAdmin || !filters.showArchived) && isArchivedLead(lead)) return false;
      if (filters.status && lead.status !== filters.status) return false;
      if (filters.classification && lead.classification !== filters.classification) return false;
      if (filters.treatment && lead.treatment !== filters.treatment) return false;
      if (filters.source && lead.source !== filters.source) return false;
      if (filters.assigned && lead.assigned_to !== filters.assigned) return false;
      if (filters.uncontacted && (lead.last_contact_at || !['Nuevo', 'No Contactado'].includes(lead.status))) return false;
      if (filters.hotOnly && lead.classification !== 'Lead Caliente') return false;
      if (filters.date === 'today' && toLocalIsoDate(lead.created_at) !== today) return false;
      if (filters.date === '7d' && new Date(lead.created_at).getTime() < now - 7 * 86400000) return false;
      if (filters.date === 'month' && toLocalIsoDate(lead.created_at).slice(0, 7) !== today.slice(0, 7)) return false;
      return !q || normalizeText(`${lead.name} ${lead.phone} ${lead.phone_plus} ${lead.consultation_reason}`).includes(q);
    });

    return rows.sort((a, b) => {
      if (filters.sort === 'hot') return CLASSIFICATIONS.indexOf(a.classification) - CLASSIFICATIONS.indexOf(b.classification) || new Date(b.created_at) - new Date(a.created_at);
      if (filters.sort === 'followup') return new Date(a.next_followup_at || 8640000000000000) - new Date(b.next_followup_at || 8640000000000000);
      if (filters.sort === 'overdue') return Number(Boolean(b.next_followup_at && new Date(b.next_followup_at).getTime() < now)) - Number(Boolean(a.next_followup_at && new Date(a.next_followup_at).getTime() < now));
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [leads, filters, canAdmin]);

  async function copyMessage(lead) {
    await navigator.clipboard.writeText(buildLeadMessage(lead));
    setNotice('Mensaje copiado.');
  }

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Oportunidades" title="Leads" subtitle="Buscá, filtrá y mové cada oportunidad hacia su próxima acción." action={<Button type="button" onClick={onCreateLead}><FilePlus className="h-4 w-4" />Nuevo lead</Button>} />
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block xl:col-span-2">
            <span className="mb-2 block text-xs font-semibold text-slate-500">Buscar por nombre o teléfono</span>
            <span className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition focus-within:border-mint focus-within:ring-4 focus-within:ring-blue-50">
              <Search className="h-4 w-4 text-slate-400" />
              <input className="w-full bg-transparent text-sm text-cream outline-none placeholder:text-slate-400" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Ej. Laura o 0981…" />
            </span>
          </label>
          <Select label="Estado comercial" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={LEAD_STATUSES} placeholder="Todos" />
          <Select label="Clasificación" value={filters.classification} onChange={(value) => setFilters({ ...filters, classification: value })} options={CLASSIFICATIONS} placeholder="Todas" />
          <Select label="Tratamiento" value={filters.treatment} onChange={(value) => setFilters({ ...filters, treatment: value })} options={treatmentOptions} placeholder="Todos" />
          <Select label="Fuente" value={filters.source} onChange={(value) => setFilters({ ...filters, source: value })} options={sourceOptions} placeholder="Todas" />
          <Select label="Responsable" value={filters.assigned} onChange={(value) => setFilters({ ...filters, assigned: value })} options={(profiles || []).map((profile) => ({ value: profile.id, label: profile.full_name }))} placeholder="Todos" />
          <Select label="Fecha de ingreso" value={filters.date} onChange={(value) => setFilters({ ...filters, date: value })} options={[{ value: 'today', label: 'Hoy' }, { value: '7d', label: 'Últimos 7 días' }, { value: 'month', label: 'Este mes' }]} placeholder="Cualquier fecha" />
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <QuickFilter active={filters.uncontacted} onClick={() => setFilters({ ...filters, uncontacted: !filters.uncontacted })}>Sólo sin contactar</QuickFilter>
            <QuickFilter active={filters.hotOnly} onClick={() => setFilters({ ...filters, hotOnly: !filters.hotOnly })}><Flame className="h-3.5 w-3.5" />Sólo calientes</QuickFilter>
            {canAdmin ? <QuickFilter active={filters.showArchived} onClick={() => setFilters({ ...filters, showArchived: !filters.showArchived })}><Archive className="h-3.5 w-3.5" />Archivados</QuickFilter> : null}
          </div>
          <div className="flex items-center gap-2">
            <ArrowDownUp className="h-4 w-4 text-slate-400" />
            <select className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
              <option value="recent">Más recientes</option><option value="hot">Más calientes</option><option value="followup">Seguimiento más próximo</option><option value="overdue">Más atrasados</option>
            </select>
            <span className="text-xs font-semibold text-slate-500">{filteredLeads.length} resultados</span>
          </div>
        </div>
      </Card>

      {filteredLeads.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredLeads.map((lead) => (
            <Card key={lead.id} as="article" className="card-enter overflow-hidden">
              <button className="w-full p-5 text-left transition hover:bg-slate-50" type="button" onClick={() => onOpenLead(lead.id)}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-cream">{lead.name}</h3>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-500"><Phone className="h-4 w-4 text-mint" />{lead.phone_plus || lead.phone || 'Sin teléfono'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2"><StatusBadge value={lead.classification} /><StatusBadge value={lead.status} /></div>
                </div>
                <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Info label="Tratamiento" value={lead.treatment || 'Sin definir'} />
                  <Info label="Fuente" value={lead.source || 'Sin definir'} />
                  <Info label="Responsable" value={profileNames[lead.assigned_to] || 'Sin responsable'} />
                  <Info label="Próxima acción" value={lead.next_action || 'Definir acción'} />
                  <Info label="Próximo seguimiento" value={lead.next_followup_at ? formatDateTime(lead.next_followup_at) : 'Sin fecha'} />
                  <Info label="Último contacto" value={lead.last_contact_at ? formatDateTime(lead.last_contact_at) : 'Todavía no contactado'} />
                </div>
              </button>
              <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 p-4">
                <Button size="sm" type="button" onClick={() => onOpenLead(lead.id)}>Ver detalle</Button>
                {['Nuevo', 'No Contactado', 'No Respondió'].includes(lead.status) ? <Button size="sm" variant="secondary" type="button" onClick={() => onMarkContacted(lead)}><Check className="h-4 w-4" />Contactado</Button> : null}
                <Button size="sm" variant="secondary" type="button" onClick={() => onScheduleAppointment(lead)}><CalendarPlus className="h-4 w-4" />Agendar</Button>
                <a className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50" href={buildWhatsappUrl(lead)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />WhatsApp</a>
                <Button size="sm" variant="ghost" type="button" onClick={() => copyMessage(lead)}><Clipboard className="h-4 w-4" />Copiar mensaje</Button>
                {canAdmin ? <Button size="sm" variant="ghost" type="button" onClick={() => onCreateTask(lead)}><Plus className="h-4 w-4" />Crear tarea</Button> : null}
                <Button size="sm" variant="ghost" type="button" onClick={() => onEditLead(lead)}><Edit3 className="h-4 w-4" />Editar</Button>
                <select className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600" value={lead.status} aria-label={`Estado comercial de ${lead.name}`} onChange={(event) => { const nextStatus = event.target.value; if (nextStatus === LEAD_STATUS.scheduled && nextStatus !== lead.status) onScheduleAppointment(lead); else onUpdateLead(lead.id, { status: nextStatus }); }}>
                  {LEAD_STATUSES.filter((status) => status !== ARCHIVED_STATUS).map((status) => <option key={status}>{status}</option>)}
                </select>
                {canAdmin && !isArchivedLead(lead) ? <Button size="sm" variant="danger" type="button" onClick={() => onArchiveLead(lead)}><Archive className="h-4 w-4" />Archivar</Button> : null}
              </div>
            </Card>
          ))}
        </div>
      ) : <EmptyState title="No hay leads para estos filtros" text="Quitá uno o más filtros o registrá una nueva oportunidad." action={<Button type="button" onClick={onCreateLead}>Nuevo lead</Button>} />}
    </section>
  );
}

function QuickFilter({ active, onClick, children }) {
  return <button className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${active ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`} type="button" onClick={onClick}>{children}</button>;
}

function LeadDetail({ lead, events, canAdmin, onBack, onEditLead, onArchiveLead, onSave, onMarkContacted, onScheduleAppointment, setNotice }) {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (lead) {
      setForm({
        status: lead.status || 'Nuevo',
        notes: lead.notes || '',
        next_action: lead.next_action || '',
        next_followup_at: toDatetimeLocalAsuncion(lead.next_followup_at),
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
      next_followup_at: fromDatetimeLocalAsuncion(form.next_followup_at),
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
      <Card className="p-5">
        <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <button className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-mint hover:text-blue-700" type="button" onClick={onBack}>
              <ChevronLeft className="h-4 w-4" />Volver a leads
            </button>
            <h2 className="text-2xl font-semibold">{lead.name}</h2>
            <p className="mt-1 text-slate-500">{lead.phone_plus || lead.phone || 'Sin teléfono'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={lead.classification} />
            <StatusBadge value={lead.status} />
            <Button size="sm" variant="secondary" type="button" onClick={() => onEditLead(lead)}>
              <Edit3 className="h-4 w-4" />
              Editar
            </Button>
            {canAdmin && !isArchivedLead(lead) ? (
              <Button size="sm" variant="danger" type="button" onClick={() => onArchiveLead(lead)}>
                <Archive className="h-4 w-4" />
                Archivar
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Info label="Tratamiento" value={lead.treatment || 'Sin dato'} />
          <Info label="Urgencia" value={lead.urgency || 'Sin dato'} />
          <Info label="Score" value={lead.score} />
          <Info label="Situacion" value={lead.situation || 'Sin dato'} />
          <Info label="Evaluacion previa" value={lead.evaluation_previous || 'Sin dato'} />
          <Info label="Motivo consulta" value={displayConsultationReason(lead)} />
          <Info label="Valor estimado" value={formatMoney(lead.estimated_value)} />
          <Info label="Fuente" value={lead.source || 'Sin dato'} />
          <Info label="Pagina" value={lead.page || 'Sin dato'} />
          <Info label="Ultimo contacto" value={lead.last_contact_at ? formatDateTime(lead.last_contact_at) : 'Sin registro'} />
          <Info label="Intentos" value={lead.contact_attempts} />
          <Info label="Creado" value={formatDateTime(lead.created_at)} />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Select label="Estado comercial" value={form.status} onChange={handleStatusChange} options={isArchivedLead(lead) ? LEAD_STATUSES : LEAD_STATUSES.filter((status) => status !== ARCHIVED_STATUS)} />
          <Select label="Próxima acción" value={form.next_action} onChange={(value) => setForm({ ...form, next_action: value })} options={NEXT_ACTION_OPTIONS} />
          <Field label="Próximo seguimiento" type="datetime-local" value={form.next_followup_at} onChange={(value) => setForm({ ...form, next_followup_at: value })} />
          <label className="block md:col-span-2">
            <span className="mb-2 block text-xs font-semibold text-slate-500">Notas</span>
            <textarea className="min-h-32 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-cream outline-none focus:border-mint focus:ring-4 focus:ring-blue-50" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" onClick={saveForm}>
            <Save className="h-4 w-4" />
            Guardar cambios
          </Button>
          <Button variant="secondary" type="button" onClick={() => onMarkContacted(lead)}>
            <Check className="h-4 w-4" />Registrar contacto
          </Button>
          <Button variant="secondary" type="button" onClick={() => onSave(lead.id, { contact_attempts: Number(lead.contact_attempts || 0) + 1 })}>
            <Plus className="h-4 w-4" />
            Aumentar intentos
          </Button>
          <Button variant="secondary" type="button" onClick={() => onScheduleAppointment(lead)}><CalendarPlus className="h-4 w-4" />Agendar</Button>
          <Button variant="ghost" type="button" onClick={copyMessage}>
            <Clipboard className="h-4 w-4" />
            Copiar mensaje
          </Button>
        </div>
      </Card>

      <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-glow">
        <h3 className="mb-4 text-lg font-semibold">Eventos</h3>
        {events.length ? (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold">{event.title}</p>
                <p className="mt-1 text-xs text-slate-400">{formatDateTime(event.created_at)}</p>
                {event.description ? <p className="mt-2 text-sm text-slate-500">{event.description}</p> : null}
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

function AgendaView({ appointments, actionId, onOutcome, onReschedule, onOpenLead, onNavigate }) {
  const [selectedDate, setSelectedDate] = useState(todayIsoDate());
  const [calendarOffset, setCalendarOffset] = useState(0);
  const [mode, setMode] = useState('week');
  const [status, setStatus] = useState('');
  const today = todayIsoDate();
  const calendarDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = startOfAsuncionDate(calendarOffset + index);
    return { iso: toLocalIsoDate(date), date };
  }), [calendarOffset]);
  const visibleAppointments = useMemo(() => appointments.filter((appointment) => {
    if (status && appointment.status !== status) return false;
    if (mode === 'day') return appointment.appointment_date === selectedDate;
    if (mode === 'upcoming') return appointment.appointment_date >= today;
    if (mode === 'week') {
      const first = calendarDays[0]?.iso;
      const last = calendarDays[calendarDays.length - 1]?.iso;
      return appointment.appointment_date >= first && appointment.appointment_date <= last;
    }
    return true;
  }), [appointments, status, mode, selectedDate, today, calendarDays]);
  const grouped = useMemo(() => Object.entries(visibleAppointments.reduce((acc, appointment) => {
    (acc[appointment.appointment_date] ||= []).push(appointment);
    return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b)), [visibleAppointments]);

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Calendario operativo" title="Agenda" subtitle="Revisá turnos, disponibilidad y asistencia sin escribir horarios manualmente." action={<Button type="button" onClick={() => onNavigate('leads')}><CalendarPlus className="h-4 w-4" />Agendar desde Leads</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Citas de hoy" value={appointments.filter((item) => item.appointment_date === today && APPOINTMENT_ACTIVE_STATUSES.includes(item.status)).length} icon={CalendarDays} />
        <StatCard label="Confirmadas" value={appointments.filter((item) => item.status === APPOINTMENT_STATUS.confirmed).length} tone="success" icon={CheckCircle2} />
        <StatCard label="No-shows" value={appointments.filter((item) => item.status === APPOINTMENT_STATUS.noShow).length} tone="danger" icon={Ban} />
        <StatCard label="Reprogramaciones" value={appointments.filter((item) => item.status === APPOINTMENT_STATUS.rescheduled).length} tone="purple" icon={RefreshCw} />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-cream">Semana actual</h3>
                <p className="mt-1 text-xs text-slate-500">Elegí un día para enfocarte en sus turnos.</p>
              </div>
              <div className="flex gap-1">
                <button className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" type="button" onClick={() => setCalendarOffset((value) => value - 7)} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
                <button className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50" type="button" onClick={() => { setCalendarOffset(0); setSelectedDate(today); }}>Hoy</button>
                <button className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" type="button" onClick={() => setCalendarOffset((value) => value + 7)} aria-label="Semana siguiente"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map(({ iso, date }) => {
                const count = appointments.filter((appointment) => appointment.appointment_date === iso && APPOINTMENT_ACTIVE_STATUSES.includes(appointment.status)).length;
                const selected = selectedDate === iso;
                return (
                  <button key={iso} className={`min-h-[76px] rounded-xl border px-1 py-2 text-center transition ${selected ? 'border-mint bg-mint text-white shadow-sm' : iso === today ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50'}`} type="button" onClick={() => { setSelectedDate(iso); setMode('day'); }}>
                    <span className="block text-[10px] font-bold uppercase">{new Intl.DateTimeFormat('es-PY', { weekday: 'short', timeZone: 'America/Asuncion' }).format(date).replace('.', '')}</span>
                    <span className="mt-1 block text-lg font-bold">{new Intl.DateTimeFormat('es-PY', { day: '2-digit', timeZone: 'America/Asuncion' }).format(date)}</span>
                    <span className={`mt-1 block text-[10px] ${selected ? 'text-white/80' : 'text-slate-400'}`}>{count} {count === 1 ? 'cita' : 'citas'}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:w-[360px]">
            <Select label="Vista" value={mode} onChange={setMode} options={[{ value: 'day', label: 'Día seleccionado' }, { value: 'week', label: 'Semana visible' }, { value: 'upcoming', label: 'Próximas citas' }, { value: 'all', label: 'Todas' }]} />
            <Select label="Estado" value={status} onChange={setStatus} options={['Agendado', 'Confirmado', 'Asistió', 'No Asistió', 'Reprogramado', 'Cancelado']} placeholder="Todos" />
          </div>
        </div>
      </Card>

      {grouped.length ? grouped.map(([date, dateAppointments]) => (
        <section key={date} className="space-y-3">
          <div className="flex items-center gap-3"><h3 className="font-bold text-cream">{formatDate(date)}</h3><span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">{dateAppointments.length}</span></div>
          <div className="grid gap-3">
            {dateAppointments.map((appointment) => {
              const lead = appointment.leads || {};
              const isBusy = actionId.startsWith(`${appointment.id}:`);
              return (
                <Card key={appointment.id} as="article" className="card-enter p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                    <div className="flex items-center gap-4 xl:w-28">
                      <div className="rounded-2xl bg-blue-50 px-4 py-3 text-center text-blue-700"><Clock3 className="mx-auto h-4 w-4" /><span className="mt-1 block text-lg font-bold">{formatTime(appointment.appointment_time)}</span></div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <button className="text-left text-lg font-bold text-cream hover:text-mint" type="button" onClick={() => appointment.lead_id && onOpenLead(appointment.lead_id)}>{lead.name || 'Lead asociado'}</button>
                      <p className="mt-1 text-sm text-slate-500">{appointment.treatment_scheduled || lead.treatment || 'Tratamiento sin definir'} · {appointment.doctor_assigned || 'Sin profesional asignado'}</p>
                      <div className="mt-2"><StatusBadge value={appointment.status} /></div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-mint px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700" href={buildWhatsappUrl(lead)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />WhatsApp</a>
                      <AgendaActionButton icon={Check} label="Confirmar" loading={actionId === `${appointment.id}:confirm`} disabled={isBusy || appointment.status === APPOINTMENT_STATUS.confirmed} onClick={() => onOutcome(appointment, 'confirm')} />
                      <AgendaActionButton icon={UserCheck} label="Asistió" loading={actionId === `${appointment.id}:attended`} disabled={isBusy || appointment.status === APPOINTMENT_STATUS.attended} onClick={() => onOutcome(appointment, 'attended')} />
                      <AgendaActionButton icon={Ban} label="No asistió" loading={actionId === `${appointment.id}:noShow`} disabled={isBusy || appointment.status === APPOINTMENT_STATUS.noShow} onClick={() => onOutcome(appointment, 'noShow')} />
                      <Button size="sm" variant="secondary" type="button" onClick={() => onReschedule(appointment)} disabled={isBusy}><RefreshCw className="h-4 w-4" />Reprogramar</Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )) : <EmptyState title="No hay citas en esta vista" text="Cambiá el día o los filtros. Para crear un turno, abrí un lead y elegí Agendar." />}
    </section>
  );
}

function AgendaActionButton({ icon: Icon, label, loading, disabled, onClick }) {
  return (
    <button
      className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
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
    doctor_assigned: appointment?.doctor_assigned || clinic?.doctor_name || 'Sin asignar',
    treatment_scheduled: appointment?.treatment_scheduled || lead?.treatment || '',
    notes: appointment?.notes || '',
  };
}

function buildTimeSlots() {
  const periods = [[8, 12], [14, 18]];
  return periods.flatMap(([start, end]) => {
    const slots = [];
    for (let minutes = start * 60; minutes < end * 60; minutes += 30) {
      slots.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
    }
    return slots;
  });
}

function AppointmentModal({ clinic, lead, appointment, appointments, profiles, clinicSettings, mode, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(() => getAppointmentFormDefaults({ clinic, lead, appointment }));
  const [formError, setFormError] = useState('');
  const isReschedule = mode === 'reschedule';
  const timeSlots = useMemo(buildTimeSlots, []);
  const dateOptions = useMemo(() => Array.from({ length: 14 }, (_, index) => {
    const date = startOfAsuncionDate(index);
    return { iso: toLocalIsoDate(date), date };
  }), []);
  const doctorOptions = useMemo(() => uniqueStrings([
    appointment?.doctor_assigned,
    clinic?.doctor_name,
    ...(appointments || []).map((item) => item.doctor_assigned),
    ...(profiles || []).filter((profile) => profile.role !== ROLE.receptionist).map((profile) => profile.full_name),
    'Sin asignar',
  ]), [appointment?.doctor_assigned, clinic?.doctor_name, appointments, profiles]);
  const treatmentOptions = useMemo(() => uniqueStrings([
    lead?.treatment,
    ...(Array.isArray(clinicSettings?.treatments) ? clinicSettings.treatments.map((item) => typeof item === 'string' ? item : item?.name || item?.treatment) : []),
    ...TREATMENT_OPTIONS,
  ]), [lead?.treatment, clinicSettings]);
  const occupiedTimes = useMemo(() => new Set((appointments || [])
    .filter((item) => item.id !== appointment?.id
      && item.appointment_date === form.appointment_date
      && normalizeText(item.doctor_assigned) === normalizeText(form.doctor_assigned)
      && APPOINTMENT_ACTIVE_STATUSES.includes(item.status))
    .map((item) => String(item.appointment_time).slice(0, 5))), [appointments, appointment?.id, form.appointment_date, form.doctor_assigned]);

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
      setFormError('Elegí un horario disponible.');
      return;
    }

    if (!form.doctor_assigned.trim()) {
      setFormError('Elegí el profesional o responsable del turno.');
      return;
    }

    if (occupiedTimes.has(form.appointment_time)) {
      setFormError('Ese horario ya está ocupado. Elegí otro slot disponible.');
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6">
      <form
        className="modal-enter w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-mint">{isReschedule ? 'Reprogramar' : 'Nuevo turno'}</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-cream">{isReschedule ? 'Reprogramar consulta' : 'Agendar consulta'}</h2>
            <p className="mt-1 text-sm text-slate-500">{lead?.name || 'Lead asociado'} · elegí día, profesional y horario.</p>
          </div>
          <StatusBadge value={LEAD_STATUS.scheduled} />
        </div>

        {formError ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div> : null}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div>
              <div className="flex items-end justify-between gap-3">
                <div><p className="text-sm font-bold text-cream">1. Elegí el día</p><p className="mt-1 text-xs text-slate-500">Próximos 14 días</p></div>
                <label className="text-xs font-semibold text-slate-500">Otra fecha <input className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700" type="date" min={todayIsoDate()} value={form.appointment_date} onChange={(event) => { updateField('appointment_date', event.target.value); updateField('appointment_time', ''); }} disabled={saving} /></label>
              </div>
              <div className="scrollbar-soft mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {dateOptions.map(({ iso, date }) => {
                  const selected = form.appointment_date === iso;
                  return (
                    <button key={iso} className={`min-h-[74px] rounded-xl border px-2 py-2 text-center transition ${selected ? 'border-mint bg-mint text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50'}`} type="button" onClick={() => { updateField('appointment_date', iso); updateField('appointment_time', ''); }} disabled={saving}>
                      <span className="block text-[10px] font-bold uppercase">{new Intl.DateTimeFormat('es-PY', { weekday: 'short', timeZone: 'America/Asuncion' }).format(date).replace('.', '')}</span>
                      <span className="mt-1 block text-lg font-bold">{new Intl.DateTimeFormat('es-PY', { day: '2-digit', timeZone: 'America/Asuncion' }).format(date)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="2. Profesional / responsable" value={form.doctor_assigned} onChange={(value) => { updateField('doctor_assigned', value); updateField('appointment_time', ''); }} options={doctorOptions} disabled={saving} />
              <Select label="Tratamiento agendado" value={form.treatment_scheduled} onChange={(value) => updateField('treatment_scheduled', value)} options={treatmentOptions} placeholder="Seleccionar tratamiento" disabled={saving} />
            </div>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-slate-500">Notas opcionales</span>
              <textarea className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-cream outline-none transition focus:border-mint focus:ring-4 focus:ring-blue-50" value={form.notes} onChange={(event) => updateField('notes', event.target.value)} disabled={saving} placeholder="Indicaciones comerciales o de coordinación (sin datos clínicos sensibles)." />
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-cream">3. Elegí un horario</p>
            <p className="mt-1 text-xs text-slate-500">Slots de 30 minutos. Los ocupados están bloqueados.</p>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
              {timeSlots.map((time) => {
                const occupied = occupiedTimes.has(time);
                const selected = form.appointment_time === time;
                return (
                  <button key={time} className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-bold transition ${occupied ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through' : selected ? 'border-mint bg-mint text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'}`} type="button" onClick={() => !occupied && updateField('appointment_time', time)} disabled={saving || occupied} aria-label={`${time}${occupied ? ', ocupado' : ', disponible'}`}>
                    {time}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500"><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-mint" />Seleccionado</span><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-white ring-1 ring-slate-300" />Disponible</span><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-slate-300" />Ocupado</span></div>
            {clinicSettings?.opening_hours ? <p className="mt-4 rounded-xl bg-white p-3 text-xs leading-5 text-slate-500">Horario configurado: {clinicSettings.opening_hours}. Los slots visuales usan 08:00–12:00 y 14:00–18:00; la restricción de base sigue siendo la autoridad final.</p> : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" loading={saving}>
            {!saving ? <CalendarCheck2 className="h-4 w-4" /> : null}
            {isReschedule ? 'Guardar reprogramación' : 'Agendar cita'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function getLeadFormDefaults(lead, currentUserId = '') {
  return {
    name: lead?.name || '',
    phone: lead?.phone || '',
    phone_plus: lead?.phone_plus || '',
    treatment: lead?.treatment || 'Consulta general',
    urgency: lead?.urgency || 'Esta semana',
    classification: lead?.classification || 'Lead Medio',
    score: lead?.score ?? 0,
    status: lead?.status || 'Nuevo',
    situation: lead?.situation || 'Quiere agendar una consulta',
    evaluation_previous: lead?.evaluation_previous || 'No sabe',
    consultation_reason: lead?.consultation_reason || '',
    estimated_value: lead?.estimated_value ?? '',
    next_action: lead?.next_action || 'Enviar WhatsApp',
    next_followup_at: toDatetimeLocalAsuncion(lead?.next_followup_at || addHoursIso(1)),
    notes: lead?.notes || '',
    source: lead?.source || 'WhatsApp directo',
    consent_contact: Boolean(lead?.consent_contact),
    assigned_to: lead?.assigned_to || currentUserId,
  };
}

function followupPresetValue(preset) {
  if (preset === 'today') return toDatetimeLocalAsuncion(new Date(Date.now() + 60 * 60 * 1000));
  if (preset === 'tomorrow') return toDatetimeLocalAsuncion(addDaysAsuncion(1, 9));
  if (preset === '3d') return toDatetimeLocalAsuncion(addDaysAsuncion(3, 9));
  if (preset === '7d') return toDatetimeLocalAsuncion(addDaysAsuncion(7, 9));
  return '';
}

function LeadFormModal({ mode, lead, canAdmin, profiles, currentUserId, treatmentOptions, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(() => getLeadFormDefaults(lead, currentUserId));
  const [formError, setFormError] = useState('');
  const [followupPreset, setFollowupPreset] = useState(lead ? 'custom' : 'today');
  const isCreate = mode === 'create';
  const fullEdit = isCreate || canAdmin;
  const statusOptions = useMemo(() => {
    const options = LEAD_STATUSES.filter((status) => status !== ARCHIVED_STATUS);
    return isArchivedLead(lead) ? [...options, ARCHIVED_STATUS] : options;
  }, [lead]);

  useEffect(() => {
    setForm(getLeadFormDefaults(lead, currentUserId));
    setFormError('');
    setFollowupPreset(lead ? 'custom' : 'today');
  }, [lead?.id, mode, currentUserId]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(scheduleAfterSave = false) {
    if ((isCreate || fullEdit) && !String(form.name || '').trim()) {
      setFormError('El nombre del lead es obligatorio.');
      return;
    }

    if (isCreate && !String(form.phone || '').trim() && !String(form.phone_plus || '').trim()) {
      setFormError('El teléfono del lead es obligatorio.');
      return;
    }

    if (isCreate && !form.source) {
      setFormError('Elegí cómo llegó el lead.');
      return;
    }

    if (isCreate && !form.treatment) {
      setFormError('Elegí el tratamiento de interés.');
      return;
    }

    setFormError('');

    try {
      await onSubmit(form, { scheduleAfterSave });
    } catch (submitError) {
      setFormError(submitError.message || 'No se pudo guardar el lead.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6">
      <form
        className="modal-enter w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit(false);
        }}
      >
        <ModalHeader title={isCreate ? 'Nuevo lead' : 'Editar lead'} subtitle={isCreate ? 'Carga rápida · menos de 45 segundos' : lead?.name || 'Lead'} onClose={onClose} disabled={saving} />

        {formError ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div> : null}

        {fullEdit ? (
          <div className="space-y-5">
            <FormSection number="1" title="Datos básicos" description="Sólo nombre y teléfono requieren escritura.">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Nombre *" value={form.name} onChange={(value) => updateField('name', value)} disabled={saving} placeholder="Nombre y apellido" />
                <Field label="Teléfono *" value={form.phone} onChange={(value) => updateField('phone', value)} disabled={saving} placeholder="0981 000 000" />
                {isCreate ? <Select label="Fuente *" value={form.source} onChange={(value) => updateField('source', value)} options={MANUAL_LEAD_SOURCES} disabled={saving} /> : <Field label="Teléfono internacional" value={form.phone_plus} onChange={(value) => updateField('phone_plus', value)} disabled={saving} />}
              </div>
            </FormSection>

            <FormSection number="2" title="Interés" description="Elegí opciones para mantener datos comparables.">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Select label="Tratamiento *" value={form.treatment} onChange={(value) => updateField('treatment', value)} options={treatmentOptions || TREATMENT_OPTIONS} disabled={saving} />
                <Select label="Urgencia" value={form.urgency} onChange={(value) => updateField('urgency', value)} options={URGENCY_OPTIONS} disabled={saving} />
                <Select label="Evaluación previa" value={form.evaluation_previous} onChange={(value) => updateField('evaluation_previous', value)} options={EVALUATION_OPTIONS} disabled={saving} />
                <Select label="Situación" value={form.situation} onChange={(value) => updateField('situation', value)} options={SITUATION_OPTIONS} disabled={saving} />
                <Select label="Clasificación" value={form.classification} onChange={(value) => updateField('classification', value)} options={CLASSIFICATIONS} disabled={saving} />
                {!isCreate ? <Select label="Estado comercial" value={form.status} onChange={(value) => updateField('status', value)} options={statusOptions} disabled={saving} /> : null}
                <TextArea label="Motivo o nota breve (opcional)" value={form.consultation_reason} onChange={(value) => updateField('consultation_reason', value)} disabled={saving} className="md:col-span-2 xl:col-span-3" placeholder="Contexto comercial mínimo, sin información clínica sensible." />
              </div>
            </FormSection>

            <FormSection number="3" title="Seguimiento" description="Al guardar se genera o actualiza una tarea sin duplicados.">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-500">Responsable</span>
                  <select className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-cream outline-none transition focus:border-mint focus:ring-4 focus:ring-blue-50 disabled:opacity-60" value={form.assigned_to} onChange={(event) => updateField('assigned_to', event.target.value)} disabled={saving || !isCreate}>
                    {(profiles || []).map((clinicProfile) => <option key={clinicProfile.id} value={clinicProfile.id}>{clinicProfile.full_name} · {clinicProfile.role}</option>)}
                  </select>
                </label>
                <Select label="Próxima acción" value={form.next_action} onChange={(value) => updateField('next_action', value)} options={NEXT_ACTION_OPTIONS} disabled={saving} />
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-500">Próximo seguimiento</span>
                  <select className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-cream outline-none transition focus:border-mint focus:ring-4 focus:ring-blue-50" value={followupPreset} onChange={(event) => { const preset = event.target.value; setFollowupPreset(preset); const value = followupPresetValue(preset); if (value) updateField('next_followup_at', value); }} disabled={saving}>
                    <option value="today">Hoy</option><option value="tomorrow">Mañana</option><option value="3d">En 3 días</option><option value="7d">En 7 días</option><option value="custom">Fecha personalizada</option>
                  </select>
                </label>
                {followupPreset === 'custom' ? <Field label="Fecha y hora personalizada" type="datetime-local" value={form.next_followup_at} onChange={(value) => updateField('next_followup_at', value)} disabled={saving} /> : <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800 md:col-span-2 xl:col-span-3">Seguimiento programado para {formatDateTime(fromDatetimeLocalAsuncion(form.next_followup_at))}.</div>}
                <TextArea label={isCreate ? 'Nota interna (opcional)' : 'Notas'} value={form.notes} onChange={(value) => updateField('notes', value)} disabled={saving} className="md:col-span-2 xl:col-span-3" />
                {canAdmin && !isCreate ? <><Field label="Score" type="number" value={form.score} onChange={(value) => updateField('score', value)} disabled={saving} /><Field label="Valor potencial estimado" type="number" value={form.estimated_value} onChange={(value) => updateField('estimated_value', value)} disabled={saving} /></> : null}
              </div>
              {isCreate ? <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"><input className="mt-0.5 h-4 w-4 accent-mint" type="checkbox" checked={form.consent_contact} onChange={(event) => updateField('consent_contact', event.target.checked)} disabled={saving} /><span>La persona autorizó a la clínica a contactarla por estos datos.</span></label> : null}
            </FormSection>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <Select label="Estado comercial" value={form.status} onChange={(value) => updateField('status', value)} options={statusOptions} disabled={saving} />
            <Select label="Próxima acción" value={form.next_action} onChange={(value) => updateField('next_action', value)} options={NEXT_ACTION_OPTIONS} disabled={saving} />
            <Field label="Próximo seguimiento" type="datetime-local" value={form.next_followup_at} onChange={(value) => updateField('next_followup_at', value)} disabled={saving} />
            <TextArea label="Notas" value={form.notes} onChange={(value) => updateField('notes', value)} disabled={saving} className="md:col-span-2" />
          </div>
        )}

        {isCreate ? (
          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <Button variant="ghost" type="button" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button variant="secondary" type="button" onClick={() => handleSubmit(true)} disabled={saving}><CalendarPlus className="h-4 w-4" />Guardar y agendar</Button>
            <Button type="submit" loading={saving}>{!saving ? <Save className="h-4 w-4" /> : null}Guardar lead</Button>
          </div>
        ) : <ModalActions saving={saving} onClose={onClose} submitLabel="Guardar cambios" />}
      </form>
    </div>
  );
}

function FormSection({ number, title, description, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{number}</span>
        <div><h3 className="font-bold text-cream">{title}</h3><p className="mt-1 text-xs text-slate-500">{description}</p></div>
      </div>
      {children}
    </section>
  );
}

function ArchiveLeadModal({ lead, saving, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');

  async function handleSubmit() {
    if (!String(reason || '').trim()) {
      setFormError('El motivo de archivado es obligatorio.');
      return;
    }

    setFormError('');

    try {
      await onSubmit(lead, reason);
    } catch (submitError) {
      setFormError(submitError.message || 'No se pudo archivar el lead.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-6 backdrop-blur-sm sm:items-center">
      <form
        className="modal-enter w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <ModalHeader title="Archivar lead" subtitle={lead?.name || 'Lead'} onClose={onClose} disabled={saving} />
        {formError ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div> : null}
        <TextArea label="Motivo obligatorio" value={reason} onChange={setReason} disabled={saving} />
        <ModalActions saving={saving} onClose={onClose} submitLabel="Archivar" danger />
      </form>
    </div>
  );
}

function getTaskFormDefaults(task, initialLeadId = '') {
  return {
    lead_id: task?.lead_id || initialLeadId,
    title: task?.title || '',
    description: task?.description || '',
    due_at: toDatetimeLocalAsuncion(task?.due_at),
    priority: task?.priority || 'media',
    status: task?.status || 'pendiente',
  };
}

function TaskFormModal({ mode, task, initialLeadId, leads, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(() => getTaskFormDefaults(task, initialLeadId));
  const [formError, setFormError] = useState('');
  const isCreate = mode === 'create';

  useEffect(() => {
    setForm(getTaskFormDefaults(task, initialLeadId));
    setFormError('');
  }, [task?.id, mode, initialLeadId]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit() {
    if (!String(form.title || '').trim()) {
      setFormError('El titulo de la tarea es obligatorio.');
      return;
    }

    setFormError('');

    try {
      await onSubmit(form);
    } catch (submitError) {
      setFormError(submitError.message || 'No se pudo guardar la tarea.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-6 backdrop-blur-sm sm:items-center">
      <form
        className="modal-enter w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <ModalHeader title={isCreate ? 'Crear tarea' : 'Editar tarea'} subtitle="Tareas CRM" onClose={onClose} disabled={saving} />
        {formError ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Titulo" value={form.title} onChange={(value) => updateField('title', value)} disabled={saving} />
          <label className="block">
            <span className="mb-2 block text-xs text-cream/55">Lead asociado</span>
            <select className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-cream outline-none" value={form.lead_id} onChange={(event) => updateField('lead_id', event.target.value)} disabled={saving}>
              <option value="">Sin lead</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="Vencimiento" type="datetime-local" value={form.due_at} onChange={(value) => updateField('due_at', value)} disabled={saving} />
          <Select label="Prioridad" value={form.priority} onChange={(value) => updateField('priority', value)} options={['baja', 'media', 'alta', 'urgente']} disabled={saving} />
          <Select label="Estado" value={form.status} onChange={(value) => updateField('status', value)} options={['pendiente', 'hecho', 'vencido', 'cancelado']} disabled={saving} />
          <TextArea label="Descripcion" value={form.description} onChange={(value) => updateField('description', value)} disabled={saving} className="md:col-span-2" />
        </div>

        <ModalActions saving={saving} onClose={onClose} submitLabel={isCreate ? 'Crear tarea' : 'Guardar tarea'} />
      </form>
    </div>
  );
}

function ModalHeader({ title, subtitle, onClose, disabled }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-mint">{subtitle}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-cream">{title}</h2>
      </div>
      <button className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={onClose} disabled={disabled} aria-label="Cerrar">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ModalActions({ saving, onClose, submitLabel, danger = false }) {
  return (
    <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
      <Button variant="ghost" type="button" onClick={onClose} disabled={saving}>Cancelar</Button>
      <Button variant={danger ? 'danger' : 'primary'} type="submit" loading={saving}>{!saving ? <Save className="h-4 w-4" /> : null}{submitLabel}</Button>
    </div>
  );
}

function TasksView({ tasks, leads, canAdmin, onCreateTask, onEditTask, onComplete, onOpenLead }) {
  const [filter, setFilter] = useState('pendientes');
  const now = Date.now();
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const isDone = task.status === 'hecho';
      const isOverdue = !isDone && task.due_at && new Date(task.due_at).getTime() < now;

      if (filter === 'completadas') return isDone;
      if (filter === 'vencidas') return isOverdue || task.status === 'vencido';
      return !isDone && task.status !== 'cancelado' && !isOverdue;
    });
  }, [tasks, filter, now]);

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Trabajo operativo" title="Tareas" subtitle="Completá lo pendiente y resolvé primero lo vencido." action={canAdmin ? <Button type="button" onClick={() => onCreateTask()}><FilePlus className="h-4 w-4" />Nueva tarea</Button> : null} />
      <Card className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            ['pendientes', 'Pendientes'],
            ['vencidas', 'Vencidas'],
            ['completadas', 'Completadas'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${filter === id ? 'bg-mint text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              type="button"
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="text-xs font-semibold text-slate-500">{filteredTasks.length} tareas</span>
      </Card>

      {filteredTasks.length ? (
        filteredTasks.map((task) => {
          const lead = task.leads || leads.find((item) => item.id === task.lead_id) || null;
          const isDone = task.status === 'hecho';
          const isOverdue = !isDone && task.due_at && new Date(task.due_at).getTime() < Date.now();
          const displayStatus = isOverdue ? 'vencido' : task.status;

          return (
            <Card key={task.id} as="article" className="card-enter flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{task.title}</h3>
                  <StatusBadge value={task.priority} />
                  <StatusBadge value={displayStatus} />
                </div>
                {task.description ? <p className="mt-2 text-sm text-slate-500">{task.description}</p> : null}
                <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                  <span>Vence: {task.due_at ? formatDateTime(task.due_at) : 'Sin vencimiento'}</span>
                  <span>Paciente: {lead?.name || 'Sin lead asociado'}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {lead ? <Button size="sm" variant="ghost" type="button" onClick={() => onOpenLead(lead.id)}>Abrir lead</Button> : null}
                {lead ? (
                  <a className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" href={buildWhatsappUrl(lead)} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    WhatsApp
                  </a>
                ) : null}
                {canAdmin ? (
                  <Button size="sm" variant="secondary" type="button" onClick={() => onEditTask(task)}>
                    <Edit3 className="h-4 w-4" />
                    Editar
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  type="button"
                  onClick={() => onComplete(task.id)}
                  disabled={isDone}
                >
                  <Check className="h-4 w-4" />
                  Marcar hecha
                </Button>
              </div>
            </Card>
          );
        })
      ) : (
        <EmptyState title="Sin tareas" text="Las tareas de la clinica apareceran aca." />
      )}
    </section>
  );
}

function MetricsView({ leads, appointments, tasks, treatmentPrices }) {
  const [period, setPeriod] = useState('30d');
  const data = useMemo(() => {
    const now = new Date();
    const today = todayIsoDate();
    const starts = {
      week: new Date(now.getTime() - 7 * 86400000),
      month: new Date(`${today.slice(0, 7)}-01T00:00:00`),
      '30d': new Date(now.getTime() - 30 * 86400000),
      '90d': new Date(now.getTime() - 90 * 86400000),
      year: new Date(`${today.slice(0, 4)}-01-01T00:00:00`),
    };
    const start = starts[period] || starts['30d'];
    const periodLeads = leads.filter((lead) => new Date(lead.created_at) >= start);
    const periodAppointments = appointments.filter((item) => new Date(`${item.appointment_date}T12:00:00`) >= start);
    const periodTasks = tasks.filter((task) => new Date(task.created_at || task.due_at || 0) >= start);
    const contacted = periodLeads.filter((lead) => lead.last_contact_at || CONTACTED_STATUSES.includes(lead.status));
    const uncontacted = periodLeads.filter((lead) => !lead.last_contact_at && ['Nuevo', 'No Contactado'].includes(lead.status));
    const responseTimes = periodLeads.filter((lead) => lead.created_at && lead.last_contact_at).map((lead) => Math.max(0, new Date(lead.last_contact_at) - new Date(lead.created_at)) / 60000);
    const avgResponse = responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) : null;
    const attended = periodAppointments.filter((item) => item.status === APPOINTMENT_STATUS.attended);
    const noShows = periodAppointments.filter((item) => item.status === APPOINTMENT_STATUS.noShow);
    const attendanceBase = attended.length + noShows.length;
    const scheduledLeadIds = new Set(periodAppointments.map((item) => item.lead_id));
    const attendedLeadIds = new Set(attended.map((item) => item.lead_id));
    const recoveredNoShows = new Set(noShows.filter((noShow) => appointments.some((item) => item.lead_id === noShow.lead_id && item.id !== noShow.id && item.appointment_date > noShow.appointment_date && APPOINTMENT_ACTIVE_STATUSES.includes(item.status))).map((item) => item.lead_id));
    const priceByTreatment = Object.fromEntries((treatmentPrices || []).map((item) => [normalizeText(item.treatment), Number(item.estimated_price || 0)]));
    const underFollowup = periodLeads.filter((lead) => !terminalStatuses.includes(lead.status));
    const potential = underFollowup.reduce((sum, lead) => sum + Number(lead.estimated_value || priceByTreatment[normalizeText(lead.treatment)] || 0), 0);
    const sourceCounts = countBy(periodLeads, (lead) => lead.source || 'Sin fuente');
    const treatmentCounts = countBy(periodLeads, (lead) => lead.treatment || 'Sin tratamiento');
    const classificationCounts = countBy(periodLeads, (lead) => lead.classification || 'Sin clasificación');
    const funnel = [
      ['Leads nuevos', periodLeads.length],
      ['Contactados', contacted.length],
      ['Agendados', periodLeads.filter((lead) => scheduledLeadIds.has(lead.id) || SCHEDULED_STATUSES.includes(lead.status)).length],
      ['Asistieron', periodLeads.filter((lead) => attendedLeadIds.has(lead.id) || lead.status === LEAD_STATUS.attended).length],
      ['Tratamiento iniciado', periodLeads.filter((lead) => lead.status === 'Tratamiento Iniciado').length],
    ];

    return {
      periodLeads,
      contacted,
      uncontacted,
      avgResponse,
      hotUncontacted: uncontacted.filter((lead) => lead.classification === 'Lead Caliente').length,
      overdueTasks: periodTasks.filter((task) => isOpenTask(task) && task.due_at && new Date(task.due_at) < now).length,
      periodAppointments,
      attended,
      noShows,
      confirmed: periodAppointments.filter((item) => item.status === APPOINTMENT_STATUS.confirmed).length,
      rescheduled: periodAppointments.filter((item) => item.status === APPOINTMENT_STATUS.rescheduled).length,
      attendanceRate: attendanceBase ? Math.round((attended.length / attendanceBase) * 100) : 0,
      lost: periodLeads.filter((lead) => lead.status === 'Perdido').length,
      completedFollowups: periodTasks.filter((task) => task.status === 'hecho' && ['followup', 'contact', 'no_show_recovery'].includes(task.type)).length,
      overdueFollowups: periodTasks.filter((task) => isOpenTask(task) && ['followup', 'contact', 'no_show_recovery'].includes(task.type) && task.due_at && new Date(task.due_at) < now).length,
      recoveredNoShows: recoveredNoShows.size,
      reactivated: periodLeads.filter((lead) => lead.status === 'Reactivar 30d').length,
      protected: underFollowup.filter((lead) => lead.next_followup_at || tasks.some((task) => task.lead_id === lead.id && isOpenTask(task))).length,
      potential,
      sourceCounts,
      treatmentCounts,
      classificationCounts,
      funnel,
    };
  }, [leads, appointments, tasks, treatmentPrices, period]);

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Control comercial" title="Métricas" subtitle="Medí captación, velocidad y seguimiento. Las estimaciones no representan ingresos confirmados." action={<div className="min-w-48"><Select label="Período" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Esta semana' }, { value: 'month', label: 'Este mes' }, { value: '30d', label: 'Últimos 30 días' }, { value: '90d', label: 'Últimos 90 días' }, { value: 'year', label: 'Este año' }]} /></div>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Leads captados" value={data.periodLeads.length} icon={UsersRound} detail="Oportunidades nuevas del período" />
        <StatCard label="Leads contactados" value={data.contacted.length} tone="success" icon={CheckCircle2} />
        <StatCard label="Sin contactar" value={data.uncontacted.length} tone="gold" icon={AlarmClock} />
        <StatCard label="Respuesta promedio" value={data.avgResponse === null ? 'Sin datos' : data.avgResponse < 60 ? `${data.avgResponse} min` : `${Math.round(data.avgResponse / 60)} h`} icon={Clock3} />
        <StatCard label="Citas agendadas" value={data.periodAppointments.length} tone="purple" icon={CalendarCheck2} />
        <StatCard label="Tasa de asistencia" value={`${data.attendanceRate}%`} tone="success" icon={TrendingUp} detail={`${data.attended.length} asistencias · ${data.noShows.length} no-shows`} />
        <StatCard label="Tareas vencidas" value={data.overdueTasks} tone="danger" icon={CheckCircle2} />
        <StatCard label="Calientes sin contacto" value={data.hotUncontacted} tone="danger" icon={Flame} />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5"><h3 className="font-bold text-cream">Embudo comercial</h3><p className="mt-1 text-sm text-slate-500">Conversión observada por etapa dentro del período.</p></div>
        <div className="grid gap-3 p-5 lg:grid-cols-5">
          {data.funnel.map(([label, value], index) => {
            const previous = index ? data.funnel[index - 1][1] : value;
            const rate = previous ? Math.round((value / previous) * 100) : 0;
            return <div key={label} className="relative rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-cream">{value}</p>{index ? <p className="mt-2 text-xs font-bold text-mint">{rate}% desde etapa anterior</p> : <p className="mt-2 text-xs text-slate-400">Base del período</p>}</div>;
          })}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <MetricBreakdown title="Leads por fuente" entries={data.sourceCounts} total={data.periodLeads.length} />
        <MetricBreakdown title="Leads por tratamiento" entries={data.treatmentCounts} total={data.periodLeads.length} />
        <MetricBreakdown title="Clasificación" entries={data.classificationCounts} total={data.periodLeads.length} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4"><div><h3 className="font-bold text-cream">Valor comercial protegido</h3><p className="mt-1 text-sm text-slate-500">Señales operativas del sistema, sin prometer resultados.</p></div><CircleDollarSign className="h-6 w-6 text-violet-600" /></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <ValueSignal label="Oportunidades bajo seguimiento" value={data.protected} />
            <ValueSignal label="Leads calientes priorizados" value={data.periodLeads.filter((lead) => lead.classification === 'Lead Caliente').length} />
            <ValueSignal label="No-shows con recuperación" value={data.noShows.length} />
            <ValueSignal label="No-shows recuperados" value={data.recoveredNoShows} />
            <ValueSignal label="Seguimientos completados" value={data.completedFollowups} />
            <ValueSignal label="Seguimientos vencidos" value={data.overdueFollowups} />
          </div>
        </Card>
        <Card className="bg-gradient-to-br from-violet-600 to-blue-700 p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">Estimación interna</p>
          <h3 className="mt-2 text-lg font-semibold text-white/90">Valor potencial estimado en seguimiento</h3>
          <p className="mt-4 text-4xl font-bold tracking-tight">{formatMoney(data.potential)}</p>
          <p className="mt-4 text-sm leading-6 text-white/75">Calculado con el valor del lead o el precio conservador configurado por tratamiento. No es ingreso confirmado.</p>
          <div className="mt-5 border-t border-white/20 pt-4 text-sm text-white/80">{data.lost} oportunidades marcadas como perdidas · {data.reactivated} en reactivación</div>
        </Card>
      </div>
    </section>
  );
}

function countBy(items, selector) {
  return Object.entries(items.reduce((acc, item) => {
    const key = selector(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 7);
}

function MetricBreakdown({ title, entries, total }) {
  return (
    <Card className="p-5">
      <h3 className="font-bold text-cream">{title}</h3>
      <div className="mt-5 space-y-4">
        {entries.length ? entries.map(([label, value]) => <div key={label}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="truncate font-semibold text-slate-600">{label}</span><span className="font-bold text-cream">{value}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-mint transition-all" style={{ width: `${total ? Math.max(4, Math.round((value / total) * 100)) : 0}%` }} /></div></div>) : <p className="text-sm text-slate-500">Sin datos en este período.</p>}
      </div>
    </Card>
  );
}

function ValueSignal({ label, value }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-cream">{value}</p></div>;
}

function SettingsView({ clinic, profile, publicFormConfig, savingPublicForm, onSavePublicForm, setNotice }) {
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
          <button className="w-fit rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-cream/80 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={() => updateField('public_token', generatePublicToken())} disabled={saving}>
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
        <button className="inline-flex items-center gap-2 rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60" type="button" onClick={handleSave} disabled={saving}>
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
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-medium leading-5 text-slate-700">{value === null || value === undefined || value === '' ? 'Sin dato' : value}</p>
    </div>
  );
}

function Select({ label, value, onChange, options, placeholder, disabled = false }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-slate-500">{label}</span>
      <select className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-cream outline-none transition focus:border-mint focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:opacity-60" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {(options || []).map((option) => {
          const optionValue = typeof option === 'object' ? option.value : option;
          const optionLabel = typeof option === 'object' ? option.label : option;
          return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
        })}
      </select>
    </label>
  );
}

function Field({ label, value, onChange, type = 'text', disabled = false, placeholder = '' }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-slate-500">{label}</span>
      <input className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-cream outline-none transition placeholder:text-slate-400 focus:border-mint focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:opacity-60" type={type} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} />
    </label>
  );
}

function TextArea({ label, value, onChange, disabled = false, className = '', placeholder = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-xs font-semibold text-slate-500">{label}</span>
      <textarea className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-cream outline-none transition placeholder:text-slate-400 focus:border-mint focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:opacity-60" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} />
    </label>
  );
}
