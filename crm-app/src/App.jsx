import { useEffect, useMemo, useState } from 'react';
import { Archive, Ban, CalendarPlus, Check, Clipboard, Edit3, ExternalLink, FilePlus, Loader2, Phone, Plus, RefreshCw, Save, Search, UserCheck, X } from 'lucide-react';
import AppLayout from './components/AppLayout';
import Login from './components/Login';
import EmptyState from './components/ui/EmptyState';
import StatCard from './components/ui/StatCard';
import StatusBadge from './components/ui/StatusBadge';
import { CLASSIFICATIONS, CONTACT_ATTEMPT_STATUSES, CONTACTED_STATUSES, LEAD_STATUSES, SCHEDULED_STATUSES } from './lib/constants';
import { formatDate, formatDateTime, formatMoney, formatTime, normalizeText, todayIsoDate, toLocalIsoDate } from './lib/formatters';
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
const TASK_OPEN_STATUSES = ['pendiente', 'vencido', 'Pendiente', 'Vencida'];
const TASK_PRIORITY_BY_CLASSIFICATION = {
  'Lead Caliente': 'alta',
  'Lead Medio': 'media',
  'Lead Frío': 'baja',
};
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
const DEFAULT_PUBLIC_FORM_WEBHOOK_URL = 'https://kfpdworxksqofipmjijz.supabase.co/functions/v1/lead-intake';
const PUBLIC_LEAD_WEBHOOK_URL = import.meta.env.VITE_PUBLIC_LEAD_WEBHOOK_URL || DEFAULT_PUBLIC_FORM_WEBHOOK_URL;
const DEFAULT_EMBED_BASE_URL = 'https://TU-DOMINIO.vercel.app';

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

function tomorrowFollowupIso() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
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
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function appointmentDateTime(appointment) {
  if (!appointment?.appointment_date || !appointment?.appointment_time) return null;
  const date = new Date(`${appointment.appointment_date}T${String(appointment.appointment_time).slice(0, 5)}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function appointmentDueIso(appointment, offsetHours = 0) {
  const date = appointmentDateTime(appointment);
  if (!date) return null;
  date.setHours(date.getHours() + offsetHours);
  return date.toISOString();
}

function toDatetimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
      due_at: lead?.next_followup_at || tomorrowFollowupIso(),
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
      due_at: tomorrowFollowupIso(),
      priority: 'media',
    };
  }

  if (status === LEAD_STATUS.noShow) {
    return {
      title: 'Reprogramar consulta',
      type: 'followup',
      due_at: tomorrowFollowupIso(),
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
  if (allowed.has('next_followup_at')) patch.next_followup_at = toIsoOrNull(form.next_followup_at);
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
        setLeadModal(null);
        setLeadFormSaving(false);
        setArchiveModal(null);
        setArchiveSaving(false);
        setTaskModal(null);
        setTaskFormSaving(false);
        setPublicFormConfig(null);
        setPublicFormSaving(false);
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
  const publicFormRoute = getPublicFormRoute();

  useEffect(() => {
    if (activeView === 'settings' && !canAdmin) {
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
        .select('*, leads(id, name, phone, phone_plus, whatsapp_link)')
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

  function openCreateLeadModal() {
    if (!canAdmin) {
      setError('Solo un admin puede crear leads manuales.');
      return;
    }

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

  async function saveLeadForm(form) {
    if (!leadModal) return;

    if (leadModal.mode === 'create') {
      await createManualLead(form);
      return;
    }

    await saveLeadEdit(leadModal.lead, form);
  }

  async function createManualLead(form) {
    if (!profile?.clinic_id || !canAdmin) {
      throw new Error('Solo un admin puede crear leads manuales.');
    }

    const payload = buildLeadFormPatch({ ...form, status: 'Nuevo' }, LEAD_ADMIN_EDIT_FIELDS);
    if (!payload.name) {
      throw new Error('El nombre del lead es obligatorio.');
    }

    payload.clinic_id = profile.clinic_id;
    payload.status = 'Nuevo';
    payload.source = 'CRM manual';
    payload.page = 'crm';
    payload.whatsapp_link = payload.phone_plus || payload.phone ? buildWhatsappUrl(payload) : null;

    setLeadFormSaving(true);
    setError('');
    setNotice('');

    try {
      const { data: createdLead, error: insertError } = await supabase
        .from('leads')
        .insert(payload)
        .select('*')
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      const { error: eventError } = await createLeadEvent(createdLead.id, {
        event_type: 'lead_created_manual',
        title: 'Lead creado manualmente',
      });

      const { error: taskError } = await syncTasksForLeadStatus(createdLead, createdLead.status);

      await refreshClinicData();
      setSelectedLeadId(createdLead.id);
      await loadLeadEvents(createdLead.id);
      setLeadModal(null);
      setActiveView('lead-detail');

      if (eventError) {
        setError(`El lead fue creado, pero no se pudo registrar el evento: ${eventError.message}`);
        return;
      }

      if (taskError) {
        setError(`El lead fue creado, pero no se pudo crear la tarea automatica: ${taskError.message}`);
        return;
      }

      setNotice('Lead creado manualmente.');
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

  function openCreateTaskModal() {
    if (!canAdmin) {
      setError('Solo un admin puede crear tareas manuales.');
      return;
    }

    setTaskModal({ mode: 'create', task: null });
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
      due_at: toIsoOrNull(form.due_at),
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
      setNotice('Configuracion de landing guardada.');
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
            .select('*')
            .single()
        : await supabase.from('appointments').insert(appointmentPayload).select('*').single();

      if (appointmentResult.error) {
        const prefix = leadUpdated ? 'El lead se actualizo, pero ' : '';
        throw new Error(`${prefix}no se pudo guardar el turno: ${appointmentResult.error.message}`);
      }

      const savedAppointment = appointmentResult.data || appointmentPayload;

      const eventType = isReschedule ? 'appointment_rescheduled' : 'appointment_scheduled';
      const eventTitle = isReschedule ? 'Consulta reprogramada' : 'Consulta agendada';
      const { error: eventError } = await createLeadEvent(lead.id, {
        event_type: eventType,
        title: eventTitle,
        description: `${eventTitle} para ${form.appointment_date} ${form.appointment_time}`,
      });

      const { error: taskError } = await syncTasksForLeadStatus(
        { ...lead, ...leadPatch, clinic_id: profile.clinic_id },
        LEAD_STATUS.scheduled,
        savedAppointment,
      );

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

      if (taskError) {
        setError(`La consulta se guardo, pero no se pudo sincronizar la tarea: ${taskError.message}`);
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
        description: 'Se debe reprogramar la consulta',
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
      description: config.description || `${config.title} para ${appointment.appointment_date} ${formatTime(appointment.appointment_time)}`,
    });

    const leadBefore = leads.find((lead) => lead.id === appointment.lead_id);
    const { error: taskError } = await syncTasksForLeadStatus(
      { ...leadBefore, ...leadPatch, id: appointment.lead_id, clinic_id: profile.clinic_id },
      config.leadStatus,
      { ...appointment, status: config.appointmentStatus },
    );

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

    if (taskError) {
      setError(`El turno se actualizo, pero no se pudo sincronizar la tarea: ${taskError.message}`);
      return;
    }

    setNotice(config.notice);
  }

  async function completeTask(taskId) {
    if (!profile?.clinic_id) return;

    const task = tasks.find((item) => item.id === taskId);

    const { error: taskError } = await supabase
      .from('tasks')
      .update({ status: 'hecho', completed_at: new Date().toISOString() })
      .eq('id', taskId)
      .eq('clinic_id', profile.clinic_id);

    if (taskError) {
      console.error('Error completing task', taskError);
      setError(taskError.message);
      return;
    }

    if (task?.lead_id) {
      const { error: eventError } = await createLeadEvent(task.lead_id, {
        event_type: 'task_completed',
        title: 'Tarea completada',
        description: task.title || 'Tarea marcada como hecha',
      });

      if (eventError) {
        setError(`La tarea se marco como hecha, pero no se pudo registrar el evento: ${eventError.message}`);
      }
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
    <AppLayout activeView={activeView} setActiveView={setActiveView} clinic={clinic} profile={profile} isAdmin={canAdmin} onLogout={handleLogout}>
      {error ? <Banner tone="danger" text={error} onClose={() => setError('')} /> : null}
      {notice ? <Banner tone="mint" text={notice} onClose={() => setNotice('')} /> : null}

      {activeView === 'dashboard' ? <Dashboard leads={activeLeads} appointments={appointments} /> : null}
      {activeView === 'today' ? <TodayPriority leads={activeLeads} onOpenLead={handleLeadSelect} /> : null}
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
          onScheduleAppointment={openAppointmentModal}
          setNotice={setNotice}
        />
      ) : null}
      {activeView === 'agenda' ? (
        <AgendaView appointments={appointments} actionId={appointmentActionId} onOutcome={updateAppointmentOutcome} onReschedule={openRescheduleModal} />
      ) : null}
      {activeView === 'tasks' ? (
        <TasksView tasks={tasks} leads={activeLeads} canAdmin={canAdmin} onCreateTask={openCreateTaskModal} onEditTask={openEditTaskModal} onComplete={completeTask} />
      ) : null}
      {activeView === 'settings' && canAdmin ? (
        <SettingsView clinic={clinic} profile={profile} publicFormConfig={publicFormConfig} savingPublicForm={publicFormSaving} onSavePublicForm={savePublicFormConfig} setNotice={setNotice} />
      ) : null}
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
      {leadModal ? (
        <LeadFormModal
          mode={leadModal.mode}
          lead={leadModal.lead}
          canAdmin={canAdmin}
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
      });
    } catch (submitError) {
      setError(submitError.message || 'No se pudo enviar el formulario.');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-6 text-cream">
      <form className="mx-auto max-w-2xl rounded-lg border border-white/10 bg-panel p-5 shadow-glow" onSubmit={handleSubmit}>
        <div className="mb-5 border-b border-white/10 pb-4">
          <p className="text-xs uppercase tracking-[0.2em] text-mint">{clinicSlug}</p>
          <h1 className="mt-1 text-2xl font-semibold">Solicitar consulta</h1>
        </div>

        {error ? <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-red-100">{error}</div> : null}
        {success ? <div className="mb-4 rounded-lg border border-mint/40 bg-mint/10 p-3 text-sm text-mint">{success}</div> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre" value={form.nombre} onChange={(value) => updateField('nombre', value)} disabled={sending} />
          <Field label="WhatsApp" value={form.telefono} onChange={(value) => updateField('telefono', value)} disabled={sending} />
          <Field label="Tratamiento" value={form.tratamiento} onChange={(value) => updateField('tratamiento', value)} disabled={sending} />
          <Field label="Urgencia" value={form.urgencia} onChange={(value) => updateField('urgencia', value)} disabled={sending} />
          <Field label="Evaluacion previa" value={form.evaluacion_previa} onChange={(value) => updateField('evaluacion_previa', value)} disabled={sending} />
          <Field label="Situacion" value={form.situacion} onChange={(value) => updateField('situacion', value)} disabled={sending} />
          <TextArea label="Motivo de consulta" value={form.consultation_reason} onChange={(value) => updateField('consultation_reason', value)} disabled={sending} className="md:col-span-2" />
        </div>

        <button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-mint px-4 py-3 font-semibold text-ink hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={sending}>
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

function LeadsView({ leads, canAdmin, onCreateLead, onEditLead, onArchiveLead, onOpenLead, onUpdateLead, onScheduleAppointment, setNotice }) {
  const [filters, setFilters] = useState({ status: '', classification: '', treatment: '', q: '', showArchived: false });
  const treatmentOptions = useMemo(() => [...new Set(leads.map((lead) => lead.treatment).filter(Boolean))].sort(), [leads]);
  const filteredLeads = useMemo(() => {
    const q = normalizeText(filters.q);

    return leads.filter((lead) => {
      if (!canAdmin || !filters.showArchived) {
        if (isArchivedLead(lead)) return false;
      }

      const matchesStatus = !filters.status || lead.status === filters.status;
      const matchesClassification = !filters.classification || lead.classification === filters.classification;
      const matchesTreatment = !filters.treatment || lead.treatment === filters.treatment;
      const matchesQuery = !q || normalizeText(`${lead.name} ${lead.phone} ${lead.phone_plus} ${lead.consultation_reason}`).includes(q);

      return matchesStatus && matchesClassification && matchesTreatment && matchesQuery;
    });
  }, [leads, filters, canAdmin]);

  async function copyMessage(lead) {
    await navigator.clipboard.writeText(buildLeadMessage(lead));
    setNotice('Mensaje copiado.');
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-white/10 bg-panel/80 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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

        <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 md:flex-row md:items-center md:justify-between">
          {canAdmin ? (
            <label className="inline-flex items-center gap-2 text-sm text-cream/70">
              <input
                className="h-4 w-4 accent-mint"
                type="checkbox"
                checked={filters.showArchived}
                onChange={(event) => setFilters({ ...filters, showArchived: event.target.checked })}
              />
              Ver archivados
            </label>
          ) : (
            <span className="text-sm text-cream/45">Los leads archivados no se muestran en vistas operativas.</span>
          )}

          {canAdmin ? (
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-ink hover:bg-mint/90" type="button" onClick={onCreateLead}>
              <FilePlus className="h-4 w-4" />
              Crear lead
            </button>
          ) : null}
        </div>
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

              <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                <Info label="Motivo consulta" value={displayConsultationReason(lead)} />
                <Info label="Situacion" value={lead.situation || 'Sin dato'} />
                <Info label="Fuente" value={lead.source || 'Sin dato'} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                <a className="inline-flex items-center gap-2 rounded-lg bg-mint px-3 py-2 text-sm font-semibold text-ink hover:bg-mint/90" href={buildWhatsappUrl(lead)} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Abrir WhatsApp
                </a>
                <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-cream/80 hover:bg-white/5" type="button" onClick={() => copyMessage(lead)}>
                  <Clipboard className="h-4 w-4" />
                  Copiar mensaje
                </button>
                <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-cream/80 hover:bg-white/5" type="button" onClick={() => onEditLead(lead)}>
                  <Edit3 className="h-4 w-4" />
                  Editar
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
                  {LEAD_STATUSES.filter((status) => status !== ARCHIVED_STATUS).map((status) => <option key={status}>{status}</option>)}
                </select>
                {canAdmin && !isArchivedLead(lead) ? (
                  <button className="inline-flex items-center gap-2 rounded-lg border border-danger/40 px-3 py-2 text-sm text-red-100 hover:bg-danger/10" type="button" onClick={() => onArchiveLead(lead)}>
                    <Archive className="h-4 w-4" />
                    Archivar
                  </button>
                ) : null}
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

function LeadDetail({ lead, events, canAdmin, onBack, onEditLead, onArchiveLead, onSave, onScheduleAppointment, setNotice }) {
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
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={lead.classification} />
            <StatusBadge value={lead.status} />
            <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-cream/80 hover:bg-white/5" type="button" onClick={() => onEditLead(lead)}>
              <Edit3 className="h-4 w-4" />
              Editar
            </button>
            {canAdmin && !isArchivedLead(lead) ? (
              <button className="inline-flex items-center gap-2 rounded-lg border border-danger/40 px-3 py-2 text-sm text-red-100 hover:bg-danger/10" type="button" onClick={() => onArchiveLead(lead)}>
                <Archive className="h-4 w-4" />
                Archivar
              </button>
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
          <Select label="Estado" value={form.status} onChange={handleStatusChange} options={isArchivedLead(lead) ? LEAD_STATUSES : LEAD_STATUSES.filter((status) => status !== ARCHIVED_STATUS)} />
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

function getLeadFormDefaults(lead) {
  return {
    name: lead?.name || '',
    phone: lead?.phone || '',
    phone_plus: lead?.phone_plus || '',
    treatment: lead?.treatment || '',
    urgency: lead?.urgency || '',
    classification: lead?.classification || 'Lead Medio',
    score: lead?.score ?? 0,
    status: lead?.status || 'Nuevo',
    situation: lead?.situation || '',
    evaluation_previous: lead?.evaluation_previous || '',
    consultation_reason: lead?.consultation_reason || '',
    estimated_value: lead?.estimated_value ?? '',
    next_action: lead?.next_action || '',
    next_followup_at: toDatetimeLocal(lead?.next_followup_at),
    notes: lead?.notes || '',
  };
}

function LeadFormModal({ mode, lead, canAdmin, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(() => getLeadFormDefaults(lead));
  const [formError, setFormError] = useState('');
  const isCreate = mode === 'create';
  const fullEdit = canAdmin;
  const statusOptions = useMemo(() => {
    const options = LEAD_STATUSES.filter((status) => status !== ARCHIVED_STATUS);
    return isArchivedLead(lead) ? [...options, ARCHIVED_STATUS] : options;
  }, [lead]);

  useEffect(() => {
    setForm(getLeadFormDefaults(lead));
    setFormError('');
  }, [lead?.id, mode]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit() {
    if ((isCreate || fullEdit) && !String(form.name || '').trim()) {
      setFormError('El nombre del lead es obligatorio.');
      return;
    }

    setFormError('');

    try {
      await onSubmit(form);
    } catch (submitError) {
      setFormError(submitError.message || 'No se pudo guardar el lead.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/80 px-4 py-6 backdrop-blur">
      <form
        className="w-full max-w-4xl rounded-lg border border-white/10 bg-panel p-5 shadow-glow"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <ModalHeader title={isCreate ? 'Crear lead' : 'Editar lead'} subtitle={isCreate ? 'CRM manual' : lead?.name || 'Lead'} onClose={onClose} disabled={saving} />

        {formError ? <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-red-100">{formError}</div> : null}

        {fullEdit ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Nombre" value={form.name} onChange={(value) => updateField('name', value)} disabled={saving} />
            <Field label="Telefono" value={form.phone} onChange={(value) => updateField('phone', value)} disabled={saving} />
            <Field label="Telefono internacional" value={form.phone_plus} onChange={(value) => updateField('phone_plus', value)} disabled={saving} />
            <Field label="Tratamiento" value={form.treatment} onChange={(value) => updateField('treatment', value)} disabled={saving} />
            <Field label="Urgencia" value={form.urgency} onChange={(value) => updateField('urgency', value)} disabled={saving} />
            <Select label="Clasificacion" value={form.classification} onChange={(value) => updateField('classification', value)} options={CLASSIFICATIONS} disabled={saving} />
            <Field label="Score" type="number" value={form.score} onChange={(value) => updateField('score', value)} disabled={saving} />
            <Field label="Valor estimado" type="number" value={form.estimated_value} onChange={(value) => updateField('estimated_value', value)} disabled={saving} />
            {!isCreate ? <Select label="Estado" value={form.status} onChange={(value) => updateField('status', value)} options={statusOptions} disabled={saving} /> : null}
            <TextArea label="Situacion" value={form.situation} onChange={(value) => updateField('situation', value)} disabled={saving} />
            <TextArea label="Evaluacion previa" value={form.evaluation_previous} onChange={(value) => updateField('evaluation_previous', value)} disabled={saving} />
            <TextArea label="Motivo de consulta" value={form.consultation_reason} onChange={(value) => updateField('consultation_reason', value)} disabled={saving} />
            {!isCreate ? <Field label="Proxima accion" value={form.next_action} onChange={(value) => updateField('next_action', value)} disabled={saving} /> : null}
            {!isCreate ? <Field label="Proximo seguimiento" type="datetime-local" value={form.next_followup_at} onChange={(value) => updateField('next_followup_at', value)} disabled={saving} /> : null}
            <TextArea label="Notas" value={form.notes} onChange={(value) => updateField('notes', value)} disabled={saving} className="xl:col-span-3" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <Select label="Estado" value={form.status} onChange={(value) => updateField('status', value)} options={statusOptions} disabled={saving} />
            <Field label="Proxima accion" value={form.next_action} onChange={(value) => updateField('next_action', value)} disabled={saving} />
            <Field label="Proximo seguimiento" type="datetime-local" value={form.next_followup_at} onChange={(value) => updateField('next_followup_at', value)} disabled={saving} />
            <TextArea label="Notas" value={form.notes} onChange={(value) => updateField('notes', value)} disabled={saving} className="md:col-span-2" />
          </div>
        )}

        <ModalActions saving={saving} onClose={onClose} submitLabel={isCreate ? 'Crear lead' : 'Guardar cambios'} />
      </form>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/80 px-4 py-6 backdrop-blur sm:items-center">
      <form
        className="w-full max-w-xl rounded-lg border border-white/10 bg-panel p-5 shadow-glow"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <ModalHeader title="Archivar lead" subtitle={lead?.name || 'Lead'} onClose={onClose} disabled={saving} />
        {formError ? <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-red-100">{formError}</div> : null}
        <TextArea label="Motivo obligatorio" value={reason} onChange={setReason} disabled={saving} />
        <ModalActions saving={saving} onClose={onClose} submitLabel="Archivar" danger />
      </form>
    </div>
  );
}

function getTaskFormDefaults(task) {
  return {
    lead_id: task?.lead_id || '',
    title: task?.title || '',
    description: task?.description || '',
    due_at: toDatetimeLocal(task?.due_at),
    priority: task?.priority || 'media',
    status: task?.status || 'pendiente',
  };
}

function TaskFormModal({ mode, task, leads, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(() => getTaskFormDefaults(task));
  const [formError, setFormError] = useState('');
  const isCreate = mode === 'create';

  useEffect(() => {
    setForm(getTaskFormDefaults(task));
    setFormError('');
  }, [task?.id, mode]);

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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/80 px-4 py-6 backdrop-blur sm:items-center">
      <form
        className="w-full max-w-2xl rounded-lg border border-white/10 bg-panel p-5 shadow-glow"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <ModalHeader title={isCreate ? 'Crear tarea' : 'Editar tarea'} subtitle="Tareas CRM" onClose={onClose} disabled={saving} />
        {formError ? <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-red-100">{formError}</div> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Titulo" value={form.title} onChange={(value) => updateField('title', value)} disabled={saving} />
          <label className="block">
            <span className="mb-2 block text-xs text-cream/55">Lead asociado</span>
            <select className="w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-cream outline-none" value={form.lead_id} onChange={(event) => updateField('lead_id', event.target.value)} disabled={saving}>
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
    <div className="mb-5 flex items-start justify-between gap-4 border-b border-white/10 pb-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-mint">{subtitle}</p>
        <h2 className="mt-1 text-xl font-semibold text-cream">{title}</h2>
      </div>
      <button className="rounded-lg border border-white/10 p-2 text-cream/70 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={onClose} disabled={disabled} aria-label="Cerrar">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ModalActions({ saving, onClose, submitLabel, danger = false }) {
  return (
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-cream/80 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={onClose} disabled={saving}>
        Cancelar
      </button>
      <button
        className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
          danger ? 'bg-danger text-white hover:bg-danger/90' : 'bg-mint text-ink hover:bg-mint/90'
        }`}
        type="submit"
        disabled={saving}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {submitLabel}
      </button>
    </div>
  );
}

function TasksView({ tasks, leads, canAdmin, onCreateTask, onEditTask, onComplete }) {
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
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-panel/80 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            ['pendientes', 'Pendientes'],
            ['vencidas', 'Vencidas'],
            ['completadas', 'Completadas'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${filter === id ? 'bg-mint text-ink' : 'border border-white/10 text-cream/70 hover:bg-white/5'}`}
              type="button"
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {canAdmin ? (
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-ink hover:bg-mint/90" type="button" onClick={onCreateTask}>
            <FilePlus className="h-4 w-4" />
            Crear tarea
          </button>
        ) : null}
      </div>

      {filteredTasks.length ? (
        filteredTasks.map((task) => {
          const lead = task.leads || leads.find((item) => item.id === task.lead_id) || null;
          const isDone = task.status === 'hecho';
          const isOverdue = !isDone && task.due_at && new Date(task.due_at).getTime() < Date.now();
          const displayStatus = isOverdue ? 'vencido' : task.status;

          return (
            <article key={task.id} className="flex flex-col gap-4 rounded-lg border border-white/10 bg-panel/90 p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{task.title}</h3>
                  <StatusBadge value={task.priority} />
                  <StatusBadge value={displayStatus} />
                </div>
                {task.description ? <p className="mt-2 text-sm text-cream/60">{task.description}</p> : null}
                <div className="mt-3 grid gap-2 text-xs text-cream/50 md:grid-cols-2">
                  <span>Vence: {task.due_at ? formatDateTime(task.due_at) : 'Sin vencimiento'}</span>
                  <span>Paciente: {lead?.name || 'Sin lead asociado'}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {lead ? (
                  <a className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-cream/80 hover:bg-white/5" href={buildWhatsappUrl(lead)} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    WhatsApp
                  </a>
                ) : null}
                {canAdmin ? (
                  <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-cream/80 hover:bg-white/5" type="button" onClick={() => onEditTask(task)}>
                    <Edit3 className="h-4 w-4" />
                    Editar
                  </button>
                ) : null}
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-mint px-4 py-2 font-semibold text-ink hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={() => onComplete(task.id)}
                  disabled={isDone}
                >
                  <Check className="h-4 w-4" />
                  Marcar hecha
                </button>
              </div>
            </article>
          );
        })
      ) : (
        <EmptyState title="Sin tareas" text="Las tareas de la clinica apareceran aca." />
      )}
    </section>
  );
}

function SettingsView({ clinic, profile, publicFormConfig, savingPublicForm, onSavePublicForm, setNotice }) {
  return (
    <section className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
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
          </div>
        </div>
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
    <section className="rounded-lg border border-white/10 bg-panel/90 p-5 shadow-glow">
      <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Landing / Formulario</h2>
          <p className="mt-1 text-sm text-cream/55">Snippets publicos con clinic_slug y landing_token. Nunca incluyen clinic_id ni service role.</p>
        </div>
        <StatusBadge value={form.is_active ? 'Activo' : 'Inactivo'} />
      </div>

      {formError ? <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-red-100">{formError}</div> : null}

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
        <button className="inline-flex items-center gap-2 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-ink hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-60" type="button" onClick={handleSave} disabled={saving}>
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
      <p className="text-xs uppercase tracking-[0.16em] text-cream/40">{label}</p>
      <p className="mt-1 break-words text-sm text-cream/85">{value}</p>
    </div>
  );
}

function Select({ label, value, onChange, options, placeholder, disabled = false }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs text-cream/55">{label}</span>
      <select className="w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-cream outline-none disabled:cursor-not-allowed disabled:opacity-60" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
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

function TextArea({ label, value, onChange, disabled = false, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-xs text-cream/55">{label}</span>
      <textarea className="min-h-28 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-cream outline-none disabled:cursor-not-allowed disabled:opacity-60" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
    </label>
  );
}
