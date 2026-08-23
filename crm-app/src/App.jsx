import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import AppLayout from './components/AppLayout';
import Login from './components/Login';
import { Banner, FullScreenLoader, PageSkeleton } from './components/feedback/AppFeedback';
import { CONTACT_ATTEMPT_STATUSES } from './lib/constants';
import {
  addDaysAsuncion,
  fromDatetimeLocalAsuncion,
  todayIsoDate,
  tomorrowFollowupAsuncion,
} from './lib/formatters';
import { supabase } from './lib/supabase';
import useSupabaseSession from './hooks/useSupabaseSession';
import useClinicWorkspace from './hooks/useClinicWorkspace';

import {
  ROLE,
  ARCHIVED_STATUS,
  terminalStatuses,
  statusContactDates,
  LEAD_STATUS,
  APPOINTMENT_STATUS,
  APPOINTMENT_ACTIVE_STATUSES,
  APPOINTMENT_OUTCOME_LEAD_STATUSES,
  TASK_OPEN_STATUSES,
  MANUAL_LEAD_SOURCES,
  LEAD_ADMIN_EDIT_FIELDS,
  LEAD_RECEPTIONIST_EDIT_FIELDS,
  cleanOptionalText,
  normalizeRole,
  isArchivedLead,
  getTreatmentOptions,
  numberOrNull,
  integerOrZero,
  slugify,
  parseAllowedOrigins,
  taskConfigForLeadStatus,
  isContactTask,
  isOpenTask,
  buildLeadFormPatch,
  getPublicFormRoute,
} from './lib/crmDomain';

const PublicEmbedLeadForm = lazy(() => import('./features/public-form/PublicEmbedLeadForm'));
const AppointmentModal = lazy(() => import('./components/modals/AppointmentModal'));
const ArchiveLeadModal = lazy(() => import('./components/modals/ArchiveLeadModal'));
const ContactOutcomeModal = lazy(() => import('./components/modals/ContactOutcomeModal'));
const LeadFormModal = lazy(() => import('./components/modals/LeadFormModal'));
const TaskFormModal = lazy(() => import('./components/modals/TaskFormModal'));
const AgendaView = lazy(() => import('./pages/AgendaPage'));
const Dashboard = lazy(() => import('./pages/DashboardPage'));
const FollowupsView = lazy(() => import('./pages/FollowupsPage'));
const LeadsView = lazy(() => import('./pages/LeadsPage'));
const LeadDetail = lazy(() => import('./pages/LeadsPage').then((module) => ({ default: module.LeadDetail })));
const MetricsView = lazy(() => import('./pages/MetricsPage'));
const SettingsView = lazy(() => import('./pages/SettingsPage'));
const TasksView = lazy(() => import('./pages/TasksPage'));


export default function App() {
  const { session, loading: authLoading, error: authError } = useSupabaseSession();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const {
    bootLoading,
    profile,
    clinic,
    leads,
    appointments,
    tasks,
    clinicSettings,
    treatmentPrices,
    leadEvents,
    publicFormConfig,
    clinicProfiles,
    messageTemplates,
    refreshClinicData,
    loadLeadEvents,
    setPublicFormConfig,
  } = useClinicWorkspace({ session, onError: setError });
  const [activeView, setActiveView] = useState('dashboard');
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
  const [publicFormSaving, setPublicFormSaving] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [contactOutcomeModal, setContactOutcomeModal] = useState(null);
  const [contactOutcomeSaving, setContactOutcomeSaving] = useState(false);

  useEffect(() => {
    if (authError) setError(authError);
  }, [authError]);

  useEffect(() => {
    if (session) return;
    setAppointmentModal(null);
    setAppointmentSaving(false);
    setAppointmentActionId('');
    setLeadModal(null);
    setLeadFormSaving(false);
    setArchiveModal(null);
    setArchiveSaving(false);
    setTaskModal(null);
    setTaskFormSaving(false);
    setPublicFormSaving(false);
    setTemplateSaving(false);
    setContactOutcomeModal(null);
    setContactOutcomeSaving(false);
  }, [session]);

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
  const clinicContext = useMemo(() => ({
    name: clinic?.name,
    whatsapp: clinic?.whatsapp,
    calendar_link: clinic?.calendar_link,
  }), [clinic]);

  useEffect(() => {
    if (['settings', 'metrics'].includes(activeView) && !canAdmin) {
      setActiveView('dashboard');
    }
  }, [activeView, canAdmin]);

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

  async function markLeadContacted(lead, options = {}) {
    if (!profile?.clinic_id || !lead?.id) return false;
    setError('');
    setNotice('');

    const { error: contactError } = await supabase.rpc('mark_lead_contacted', {
      p_lead_id: lead.id,
      p_contact_channel: options.channel || 'manual',
      p_note: cleanOptionalText(options.note),
      p_next_action: options.nextAction || 'Hacer seguimiento',
      p_next_followup_at: options.dueAt || tomorrowFollowupAsuncion(),
    });

    if (contactError) {
      console.error('Error marking lead contacted', contactError);
      setError(contactError.message || 'No se pudo registrar el contacto.');
      return false;
    }

    await refreshClinicData();
    if (selectedLeadId === lead.id) await loadLeadEvents(lead.id);
    setNotice('Lead contactado; la tarea de contacto se cerró y quedó creado el próximo seguimiento.');
    return true;
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

    const task = typeof taskId === 'object' ? taskId : tasks.find((item) => item.id === taskId);
    if (task && isContactTask(task)) {
      const lead = leads.find((item) => item.id === task.lead_id) || task.leads;
      if (!lead) {
        setError('La tarea de contacto no tiene un lead disponible.');
        return;
      }
      setContactOutcomeModal({ lead, task, source: 'task' });
      return;
    }

    const { error: taskError } = await supabase.rpc('complete_task', {
      p_task_id: task?.id || taskId,
    });

    if (taskError) {
      console.error('Error completing task', taskError);
      setError(taskError.message);
      return;
    }

    await refreshClinicData();
    setNotice('Tarea marcada como hecha.');
  }

  async function handleWhatsAppOpened({ lead, task = null, templateKey }) {
    const linkedTask = task || tasks.find((item) => item.lead_id === lead.id
      && isContactTask(item)
      && isOpenTask(item));
    setContactOutcomeModal({ lead, task: linkedTask || null, templateKey, source: 'whatsapp' });

    const { error: eventError } = await supabase.rpc('record_whatsapp_opened', {
      p_lead_id: lead.id,
      p_template_key: templateKey,
    });
    if (eventError) {
      console.warn('WhatsApp opened but event could not be recorded', eventError);
      setError('WhatsApp se abrió, pero no se pudo registrar el evento en la CRM.');
    } else if (selectedLeadId === lead.id) {
      await loadLeadEvents(lead.id);
    }
  }

  async function submitContactOutcome(outcome, note) {
    const context = contactOutcomeModal;
    if (!context?.lead?.id) return;
    setContactOutcomeSaving(true);
    setError('');
    setNotice('');

    try {
      if (context.task?.id) {
        const { error: outcomeError } = await supabase.rpc('complete_contact_task', {
          p_task_id: context.task.id,
          p_outcome: outcome,
          p_note: cleanOptionalText(note),
        });
        if (outcomeError) throw outcomeError;
      } else if (outcome === 'respondio') {
        const { error: contactedError } = await supabase.rpc('mark_lead_contacted', {
          p_lead_id: context.lead.id,
          p_contact_channel: context.source === 'whatsapp' ? 'whatsapp' : 'manual',
          p_note: cleanOptionalText(note),
          p_next_action: 'Hacer seguimiento',
          p_next_followup_at: tomorrowFollowupAsuncion(),
        });
        if (contactedError) throw contactedError;
      } else if (outcome === 'posponer') {
        const { error: postponeError } = await supabase.rpc('save_lead_followup', {
          p_lead_id: context.lead.id,
          p_status: null,
          p_next_action: context.lead.next_action || 'Reintentar contacto',
          p_next_followup_at: addDaysAsuncion(1, 9),
        });
        if (postponeError) throw postponeError;
      } else {
        const { error: attemptError } = await supabase.rpc('record_contact_attempt', {
          p_lead_id: context.lead.id,
          p_outcome: outcome,
          p_note: cleanOptionalText(note),
          p_contact_channel: context.source === 'whatsapp' ? 'whatsapp' : 'manual',
        });
        if (attemptError) throw attemptError;
      }

      await refreshClinicData();
      if (selectedLeadId === context.lead.id) await loadLeadEvents(context.lead.id);
      setContactOutcomeModal(null);
      setNotice(outcome === 'respondio'
        ? 'Contacto confirmado y tareas sincronizadas.'
        : outcome === 'posponer'
          ? 'Contacto pospuesto para mañana.'
          : 'Intento registrado y próximo contacto programado.');
    } catch (outcomeError) {
      console.error('Error saving contact outcome', outcomeError);
      setError(outcomeError.message || 'No se pudo guardar el resultado del contacto.');
    } finally {
      setContactOutcomeSaving(false);
    }
  }

  async function saveMessageTemplates(nextTemplates) {
    if (!profile?.clinic_id || !canAdmin) throw new Error('Solo owner/admin puede editar plantillas.');
    if (nextTemplates.some((template) => !String(template.message || '').trim())) {
      throw new Error('Ninguna plantilla puede quedar vacía.');
    }

    setTemplateSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = nextTemplates.map((template) => ({
        clinic_id: profile.clinic_id,
        template_key: template.template_key,
        name: template.name,
        situation: template.situation,
        treatment: null,
        message: String(template.message).trim(),
      }));
      const { error: templateError } = await supabase
        .from('message_templates')
        .upsert(payload, { onConflict: 'clinic_id,template_key' });
      if (templateError) throw templateError;
      await refreshClinicData();
      setNotice('Plantillas de WhatsApp guardadas para esta clínica.');
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  if (publicFormRoute) {
    return (
      <Suspense fallback={<FullScreenLoader label="Cargando formulario…" />}>
        <PublicEmbedLeadForm clinicSlug={publicFormRoute.clinicSlug} landingToken={publicFormRoute.landingToken} />
      </Suspense>
    );
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
      <AnimatePresence>
        {error ? <Banner key="error" tone="danger" text={error} onClose={() => setError('')} /> : null}
        {notice ? <Banner key="notice" tone="mint" text={notice} onClose={() => setNotice('')} /> : null}
      </AnimatePresence>

      <Suspense fallback={<PageSkeleton />}>
      {activeView === 'dashboard' ? (
        <Dashboard
          leads={activeLeads}
          appointments={appointments}
          tasks={tasks}
          canAdmin={canAdmin}
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
          onWhatsAppOpened={handleWhatsAppOpened}
          messageTemplates={messageTemplates}
          clinicContext={clinicContext}
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
          onWhatsAppOpened={handleWhatsAppOpened}
          messageTemplates={messageTemplates}
          clinicContext={clinicContext}
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
          onWhatsAppOpened={handleWhatsAppOpened}
          messageTemplates={messageTemplates}
          clinicContext={clinicContext}
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
        <TasksView tasks={tasks} leads={activeLeads} canAdmin={canAdmin} onCreateTask={openCreateTaskModal} onEditTask={openEditTaskModal} onComplete={completeTask} onOpenLead={handleLeadSelect} onWhatsAppOpened={handleWhatsAppOpened} messageTemplates={messageTemplates} clinicContext={clinicContext} />
      ) : null}
      {activeView === 'metrics' && canAdmin ? (
        <MetricsView leads={activeLeads} appointments={appointments} tasks={tasks} treatmentPrices={treatmentPrices} />
      ) : null}
      {activeView === 'settings' && canAdmin ? (
        <SettingsView clinic={clinic} profile={profile} publicFormConfig={publicFormConfig} savingPublicForm={publicFormSaving} onSavePublicForm={savePublicFormConfig} messageTemplates={messageTemplates} savingTemplates={templateSaving} onSaveMessageTemplates={saveMessageTemplates} setNotice={setNotice} />
      ) : null}
      </Suspense>
      <Suspense fallback={null}>
      <AnimatePresence>
      {appointmentModal ? (
        <AppointmentModal
          key="appointment-modal"
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
          key="lead-modal"
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
      {archiveModal ? <ArchiveLeadModal key="archive-modal" lead={archiveModal} saving={archiveSaving} onClose={() => setArchiveModal(null)} onSubmit={archiveLead} /> : null}
      {taskModal ? (
        <TaskFormModal
          key="task-modal"
          mode={taskModal.mode}
          task={taskModal.task}
          initialLeadId={taskModal.leadId}
          leads={activeLeads}
          saving={taskFormSaving}
          onClose={() => setTaskModal(null)}
          onSubmit={saveTaskForm}
        />
      ) : null}
      {contactOutcomeModal ? (
        <ContactOutcomeModal
          key="contact-outcome-modal"
          context={contactOutcomeModal}
          saving={contactOutcomeSaving}
          onClose={() => setContactOutcomeModal(null)}
          onSubmit={submitContactOutcome}
        />
      ) : null}
      </AnimatePresence>
      </Suspense>
    </AppLayout>
  );
}
