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
import { humanizeCrmError } from './lib/errors';
import { buildNextActionQueue, PRIORITY_GROUP } from './lib/nextActions';
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
const QuoteModal = lazy(() => import('./components/modals/QuoteModal'));
const TaskFormModal = lazy(() => import('./components/modals/TaskFormModal'));
const AgendaView = lazy(() => import('./pages/AgendaPage'));
const Dashboard = lazy(() => import('./pages/DashboardPage'));
const FollowupsView = lazy(() => import('./pages/FollowupsPage'));
const PendingView = lazy(() => import('./pages/PendingPage'));
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
    quotes,
    workspaceEvents,
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
  const [priceSaving, setPriceSaving] = useState(false);
  const [contactOutcomeModal, setContactOutcomeModal] = useState(null);
  const [contactOutcomeSaving, setContactOutcomeSaving] = useState(false);
  const [quoteModal, setQuoteModal] = useState(null);
  const [quoteSaving, setQuoteSaving] = useState(false);

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
    setPriceSaving(false);
    setContactOutcomeModal(null);
    setContactOutcomeSaving(false);
    setQuoteModal(null);
    setQuoteSaving(false);
  }, [session]);

  const selectedLead = useMemo(() => leads.find((lead) => lead.id === selectedLeadId) || null, [leads, selectedLeadId]);
  const normalizedRole = normalizeRole(profile?.role);
  const canAdmin = normalizedRole === ROLE.admin;
  const activeLeads = useMemo(() => leads.filter((lead) => !isArchivedLead(lead)), [leads]);
  const navCounts = useMemo(() => {
    const today = todayIsoDate();
    const queue = buildNextActionQueue({ leads: activeLeads, tasks, appointments, quotes });
    const openTasks = tasks.filter((task) => !['hecho', 'cancelado'].includes(task.status));
    return {
      leads: activeLeads.filter((lead) => ['Nuevo', 'No Contactado'].includes(lead.status)).length,
      pending: queue.filter(({ action }) => action.priorityGroup !== PRIORITY_GROUP.later).length,
      agenda: appointments.filter((appointment) => appointment.appointment_date === today && APPOINTMENT_ACTIVE_STATUSES.includes(appointment.status)).length,
      tasks: openTasks.length,
    };
  }, [activeLeads, appointments, tasks, quotes]);
  const publicFormRoute = getPublicFormRoute();
  const clinicContext = useMemo(() => ({
    name: clinic?.name,
    whatsapp: clinic?.whatsapp,
    calendar_link: clinic?.calendar_link,
    responsible: profile?.full_name,
  }), [clinic, profile?.full_name]);

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

    if (statusChanged && patch.status === 'Perdido') {
      if (before) setArchiveModal({ lead: before, archive: false });
      return;
    }

    if (statusChanged && APPOINTMENT_OUTCOME_LEAD_STATUSES.includes(patch.status)) {
      setError('Confirmado, Asistió y No Asistió se registran desde Agenda para mantener el turno sincronizado.');
      return;
    }

    if (statusChanged && patch.status === LEAD_STATUS.scheduled) {
      if (!before) {
        setError('No se pudo encontrar al paciente para agendar la consulta.');
        return;
      }

      openAppointmentModal(before);
      return;
    }

    if (statusChanged && patch.status === 'Tratamiento Iniciado') {
      const { error: treatmentError } = await supabase.rpc('register_lead_outcome', {
        p_lead_id: leadId,
        p_outcome: 'treatment_started',
        p_note: cleanOptionalText(patch.notes),
        p_followup_at: null,
      });
      if (treatmentError) {
        setError(humanizeCrmError(treatmentError, 'No se pudo registrar el inicio del tratamiento. Intentá de nuevo.'));
        return;
      }
      await refreshClinicData();
      if (selectedLeadId === leadId) await loadLeadEvents(leadId);
      setNotice('Tratamiento iniciado; se cerraron las acciones comerciales abiertas.');
      return;
    }

    if (statusChanged) {
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
        if (notesError) setError(humanizeCrmError(notesError, 'El flujo se guardó, pero no se pudo actualizar la nota.'));
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
      setError(humanizeCrmError(updateError));
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
        eventErrorMessage = 'El paciente se actualizó, pero no pudimos registrar el cambio en su historial. Intentá de nuevo.';
      }
    }

    if (statusChanged) {
      const { error: taskError } = await syncTasksForLeadStatus(
        { ...before, ...leadPatch, id: leadId, clinic_id: profile.clinic_id },
        leadPatch.status,
      );

      if (taskError) {
        eventErrorMessage = eventErrorMessage || 'El paciente se actualizó, pero no pudimos sincronizar la próxima acción. Intentá de nuevo.';
      }
    }

    await refreshClinicData();
    await loadLeadEvents(leadId);
    if (eventErrorMessage) {
      setError(eventErrorMessage);
      return;
    }
    setNotice('Paciente actualizado.');
  }

  function openAppointmentModal(lead, appointment = null, mode = 'schedule') {
    if (!lead?.id) {
      setError('No se pudo identificar al paciente para agendar la consulta.');
      return;
    }

    setError('');
    setAppointmentModal({ lead, appointment, mode });
  }

  function openRescheduleModal(appointment) {
    const leadFromState = leads.find((lead) => lead.id === appointment.lead_id);
    const leadFromAppointment = appointment.leads
      ? { ...appointment.leads, id: appointment.leads.id || appointment.lead_id }
      : { id: appointment.lead_id, name: 'Paciente asociado' };

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
      setError(humanizeCrmError(followupError, 'No se pudo guardar el seguimiento. Intentá de nuevo.'));
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
      setError(humanizeCrmError(contactError, 'No se pudo registrar el contacto. Intentá de nuevo.'));
      return false;
    }

    await refreshClinicData();
    if (selectedLeadId === lead.id) await loadLeadEvents(lead.id);
    setNotice('Contacto registrado; la acción anterior se cerró y quedó creado el próximo paso.');
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
      setError('Sólo owner/admin puede archivar pacientes.');
      return;
    }

    if (!lead?.id) return;
    setError('');
    setArchiveModal({ lead, archive: true });
  }

  function openLostLeadModal(lead) {
    if (!lead?.id) return;
    setError('');
    setArchiveModal({ lead, archive: false });
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
      throw new Error('El nombre del paciente es obligatorio.');
    }

    if (!MANUAL_LEAD_SOURCES.includes(form.source)) {
      throw new Error('Seleccioná una fuente válida.');
    }

    setLeadFormSaving(true);
    setError('');
    setNotice('');

    try {
      const { data, error: insertError } = await supabase.rpc('create_manual_lead_v2', {
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
        p_situation: cleanOptionalText(form.situation),
        p_evaluation_previous: cleanOptionalText(form.evaluation_previous),
        p_estimated_value: numberOrNull(form.estimated_value),
      });

      if (insertError) {
        throw new Error(humanizeCrmError(insertError));
      }

      const createdLead = Array.isArray(data) ? data[0] : data;
      if (!createdLead?.id) {
        throw new Error('No se pudo recuperar la consulta creada.');
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

      setNotice(scheduleAfterSave ? 'Consulta creada. Elegí un horario para agendarla.' : 'Consulta creada y próxima acción generada.');
    } finally {
      setLeadFormSaving(false);
    }
  }

  async function saveLeadEdit(lead, form) {
    if (!profile?.clinic_id || !lead?.id) return;

    const editableFields = canAdmin ? LEAD_ADMIN_EDIT_FIELDS : LEAD_RECEPTIONIST_EDIT_FIELDS;
    const patch = buildLeadFormPatch(form, editableFields);
    const requestedAssignee = patch.assigned_to;
    const assignmentChanged = canAdmin && requestedAssignee && requestedAssignee !== lead.assigned_to;
    delete patch.assigned_to;

    if (canAdmin && !patch.name) {
      throw new Error('El nombre del paciente es obligatorio.');
    }

    if (patch.status === ARCHIVED_STATUS && !isArchivedLead(lead)) {
      throw new Error('Para archivar un paciente usá el botón Archivar y registrá el motivo.');
    }

    if (patch.status === 'Perdido' && patch.status !== lead.status) {
      setLeadModal(null);
      openLostLeadModal(lead);
      return;
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
            throw new Error(humanizeCrmError(updateError));
          }

          await createLeadEvent(lead.id, {
            event_type: 'lead_updated',
            title: 'Paciente editado',
            description: 'Datos del paciente actualizados',
          });
          if (assignmentChanged) {
            const { error: reassignmentError } = await supabase.rpc('reassign_lead_owner', {
              p_lead_id: lead.id,
              p_assigned_to: requestedAssignee,
            });
            if (reassignmentError) throw new Error(humanizeCrmError(reassignmentError));
          }
          await refreshClinicData();
        } finally {
          setLeadFormSaving(false);
        }
      }

      setLeadModal(null);
      openAppointmentModal({ ...lead, ...patchWithoutStatus });
      return;
    }

    if (statusChanged && patch.status === 'Tratamiento Iniciado') {
      setLeadFormSaving(true);
      try {
        const { error: treatmentError } = await supabase.rpc('register_lead_outcome', {
          p_lead_id: lead.id,
          p_outcome: 'treatment_started',
          p_note: cleanOptionalText(patch.notes),
          p_followup_at: null,
        });
        if (treatmentError) throw new Error(humanizeCrmError(treatmentError));
        if (assignmentChanged) {
          const { error: reassignmentError } = await supabase.rpc('reassign_lead_owner', {
            p_lead_id: lead.id,
            p_assigned_to: requestedAssignee,
          });
          if (reassignmentError) throw new Error(humanizeCrmError(reassignmentError));
        }
        await refreshClinicData();
        if (selectedLeadId === lead.id) await loadLeadEvents(lead.id);
        setLeadModal(null);
        setNotice('Tratamiento iniciado; se cerraron las acciones comerciales abiertas.');
      } finally {
        setLeadFormSaving(false);
      }
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
          if (notesError) throw new Error(humanizeCrmError(notesError));
          await refreshClinicData();
        }
        setLeadModal(null);
        setNotice('Paciente actualizado y próxima acción sincronizada.');
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
        throw new Error(humanizeCrmError(updateError));
      }

      if (assignmentChanged) {
        const { error: reassignmentError } = await supabase.rpc('reassign_lead_owner', {
          p_lead_id: lead.id,
          p_assigned_to: requestedAssignee,
        });
        if (reassignmentError) throw new Error(humanizeCrmError(reassignmentError));
      }

      const { error: eventError } = await createLeadEvent(lead.id, {
        event_type: 'lead_updated',
        title: 'Paciente editado',
        description: 'Datos del paciente actualizados',
      });

      const mergedLead = { ...lead, ...patch, clinic_id: profile.clinic_id };
      const { error: taskError } = statusChanged ? await syncTasksForLeadStatus(mergedLead, patch.status) : { error: null };

      await refreshClinicData();
      if (selectedLeadId === lead.id) {
        await loadLeadEvents(lead.id);
      }

      setLeadModal(null);

      if (eventError) {
        setError(humanizeCrmError(eventError, 'El paciente fue actualizado, pero no se pudo registrar el evento.'));
        return;
      }

      if (taskError) {
        setError(humanizeCrmError(taskError, 'El paciente fue actualizado, pero no se pudo sincronizar la próxima acción.'));
        return;
      }

      setNotice('Paciente editado.');
    } finally {
      setLeadFormSaving(false);
    }
  }

  async function saveLeadLoss(lead, { reason, note, archive }) {
    if (!profile?.clinic_id || !lead?.id) throw new Error('No se pudo identificar la oportunidad.');
    if (archive && !canAdmin) throw new Error('Sólo owner/admin puede archivar pacientes.');

    setArchiveSaving(true);
    setError('');
    setNotice('');

    try {
      const { error: archiveError } = await supabase.rpc('mark_lead_lost', {
        p_lead_id: lead.id,
        p_reason: reason,
        p_reason_note: cleanOptionalText(note),
        p_archive: Boolean(archive),
      });

      if (archiveError) {
        throw new Error(humanizeCrmError(archiveError));
      }

      await refreshClinicData();
      if (selectedLeadId === lead.id) {
        await loadLeadEvents(lead.id);
      }

      setArchiveModal(null);

      setNotice(archive ? 'Oportunidad archivada con motivo registrado.' : 'Oportunidad marcada como perdida con motivo registrado.');
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
        throw new Error(humanizeCrmError(result.error));
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
        throw new Error(humanizeCrmError(result.error));
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
      throw new Error('No se pudo identificar la clínica o el paciente para guardar la consulta.');
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
          : humanizeCrmError(scheduleError, 'No se pudo guardar la consulta. Intentá de nuevo.');
        throw new Error(message || 'No se pudo guardar la consulta.');
      }

      await refreshClinicData();
      if (selectedLeadId === lead.id) {
        await loadLeadEvents(lead.id);
      }

      setAppointmentModal(null);
      setNotice(isReschedule ? 'Consulta reprogramada.' : 'Consulta agendada.');
    } catch (scheduleError) {
      setError(humanizeCrmError(scheduleError, 'No se pudo guardar la consulta. Intentá de nuevo.'));
      throw scheduleError;
    } finally {
      setAppointmentSaving(false);
    }
  }

  async function updateAppointmentOutcome(appointment, action) {
    if (!profile?.clinic_id || !appointment?.id || !appointment?.lead_id) {
      setError('No se pudo identificar la cita o el paciente asociado.');
      return false;
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
      cancel: {
        outcome: APPOINTMENT_STATUS.cancelled,
        notice: 'Cita cancelada y recuperación programada.',
      },
    };

    const config = configs[action];
    if (!config) return false;

    setAppointmentActionId(`${appointment.id}:${action}`);
    setError('');
    setNotice('');
    try {
      const { error: outcomeError } = await supabase.rpc('update_appointment_outcome', {
        p_appointment_id: appointment.id,
        p_outcome: config.outcome,
      });

      if (outcomeError) throw outcomeError;

      await refreshClinicData();
      if (selectedLeadId === appointment.lead_id) {
        await loadLeadEvents(appointment.lead_id);
      }

      setNotice(config.notice);
      return true;
    } catch (outcomeError) {
      console.error('Error updating appointment outcome', outcomeError);
      setError(humanizeCrmError(outcomeError, 'No se pudo actualizar el resultado del turno. Intentá de nuevo.'));
      return false;
    } finally {
      setAppointmentActionId('');
    }
  }

  async function confirmAppointmentById(appointmentId) {
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment) {
      setError('No se encontró la cita para confirmar.');
      return;
    }
    await updateAppointmentOutcome(appointment, 'confirm');
  }

  function openRegisterOutcome(context) {
    if (!context?.lead?.id) return;
    setError('');
    setContactOutcomeModal({ ...context, source: context.source || 'manual' });
  }

  function openQuoteModal(lead, appointment = null, quote = null) {
    if (!lead?.id) {
      setError('No se pudo identificar el paciente del presupuesto.');
      return;
    }
    setError('');
    setQuoteModal({ lead, appointment, quote });
  }

  async function saveQuote(form) {
    const context = quoteModal;
    if (!context?.lead?.id) throw new Error('No se pudo identificar el paciente.');
    setQuoteSaving(true);
    setError('');
    setNotice('');
    try {
      const request = context.quote
        ? supabase.rpc('update_treatment_quote', {
            p_quote_id: context.quote.id,
            p_treatment: form.treatment,
            p_amount: form.amount,
            p_currency: 'PYG',
            p_professional_name: cleanOptionalText(form.professional_name),
            p_next_action_at: form.next_action_at,
            p_notes: cleanOptionalText(form.notes),
          })
        : supabase.rpc('create_treatment_quote', {
            p_lead_id: context.lead.id,
            p_appointment_id: context.appointment?.id || null,
            p_treatment: form.treatment,
            p_amount: form.amount,
            p_currency: 'PYG',
            p_professional_name: cleanOptionalText(form.professional_name),
            p_next_action_at: form.next_action_at,
            p_notes: cleanOptionalText(form.notes),
          });
      const { error: quoteError } = await request;
      if (quoteError) throw new Error(humanizeCrmError(quoteError, 'No se pudo guardar el presupuesto. Intentá de nuevo.'));
      await refreshClinicData();
      if (selectedLeadId === context.lead.id) await loadLeadEvents(context.lead.id);
      setQuoteModal(null);
      setNotice(context.quote ? 'Presupuesto actualizado.' : 'Presupuesto registrado y seguimiento creado.');
    } finally {
      setQuoteSaving(false);
    }
  }

  async function completeTask(taskId) {
    if (!profile?.clinic_id) return;

    const task = typeof taskId === 'object' ? taskId : tasks.find((item) => item.id === taskId);
    if (task && isContactTask(task)) {
      const lead = leads.find((item) => item.id === task.lead_id) || task.leads;
      if (!lead) {
        setError('La acción de contacto no tiene un paciente disponible.');
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
      setError(humanizeCrmError(taskError, 'No se pudo completar la acción. Intentá de nuevo.'));
      return;
    }

    await refreshClinicData();
    setNotice('Tarea marcada como hecha.');
  }

  async function handleWhatsAppOpened({ lead, task = null, action = null, templateKey }) {
    const linkedTask = task || tasks.find((item) => item.lead_id === lead.id
      && isContactTask(item)
      && isOpenTask(item));
    setContactOutcomeModal({ lead, task: linkedTask || null, action, templateKey, source: 'whatsapp' });

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

  async function handleMessageCopied({ lead, templateKey }) {
    const { error: eventError } = await supabase.rpc('record_message_copied', {
      p_lead_id: lead.id,
      p_template_key: templateKey,
    });
    if (eventError) {
      console.warn('Message copied but event could not be recorded', eventError);
      setError('El mensaje se copió, pero no se pudo registrar la acción en el historial.');
      return;
    }
    if (selectedLeadId === lead.id) await loadLeadEvents(lead.id);
    setNotice('Mensaje copiado y acción registrada.');
  }

  async function submitContactOutcome({ outcome, note, followupAt, quote }) {
    const context = contactOutcomeModal;
    if (!context?.lead?.id) return;

    if (outcome === 'schedule') {
      const linkedAppointment = appointments.find((item) => item.id === context.action?.appointmentId) || null;
      setContactOutcomeModal(null);
      openAppointmentModal(context.lead, linkedAppointment, linkedAppointment ? 'reschedule' : 'schedule');
      return;
    }
    if (outcome === 'attended' || outcome === 'no_show') {
      const linkedAppointment = appointments.find((item) => item.id === context.action?.appointmentId);
      if (!linkedAppointment) {
        setError('No se encontró la cita para registrar la asistencia.');
        return;
      }
      const saved = await updateAppointmentOutcome(linkedAppointment, outcome === 'attended' ? 'attended' : 'noShow');
      if (saved) setContactOutcomeModal(null);
      return;
    }
    if (outcome === 'quote_pending') {
      const appointment = appointments.find((item) => item.id === context.action?.appointmentId)
        || appointments.filter((item) => item.lead_id === context.lead.id && item.status === APPOINTMENT_STATUS.attended).at(-1)
        || null;
      setContactOutcomeModal(null);
      openQuoteModal(context.lead, appointment);
      return;
    }
    if (outcome === 'no_continue') {
      setContactOutcomeModal(null);
      openLostLeadModal(context.lead);
      return;
    }

    setContactOutcomeSaving(true);
    setError('');
    setNotice('');

    try {
      if (outcome === 'quote_accepted' || outcome === 'quote_rejected') {
        if (!quote?.id) throw new Error('No se encontró un presupuesto pendiente.');
        if (outcome === 'quote_rejected' && !cleanOptionalText(note)) throw new Error('Escribí el motivo del rechazo.');
        const { error: quoteStatusError } = await supabase.rpc('set_treatment_quote_status', {
          p_quote_id: quote.id,
          p_status: outcome === 'quote_accepted' ? 'accepted' : 'rejected',
          p_rejection_reason: outcome === 'quote_rejected' ? cleanOptionalText(note) : null,
          p_notes: cleanOptionalText(note),
        });
        if (quoteStatusError) throw quoteStatusError;
      } else {
        const rpcOutcome = {
          responded: 'responded',
          no_response: 'no_response',
          follow_up: 'follow_up',
          treatment_started: 'treatment_started',
        }[outcome];
        if (!rpcOutcome) throw new Error('Resultado no reconocido.');
        const { error: outcomeError } = await supabase.rpc('register_lead_outcome', {
          p_lead_id: context.lead.id,
          p_note: cleanOptionalText(note),
          p_outcome: rpcOutcome,
          p_followup_at: outcome === 'treatment_started' ? null : followupAt,
        });
        if (outcomeError) throw outcomeError;
      }

      await refreshClinicData();
      if (selectedLeadId === context.lead.id) await loadLeadEvents(context.lead.id);
      setContactOutcomeModal(null);
      const notices = {
        responded: 'Respuesta registrada y próximo paso programado.',
        no_response: 'Intento registrado y reintento programado.',
        follow_up: 'Próximo contacto programado.',
        quote_accepted: 'Presupuesto aceptado. No se registró ningún cobro.',
        quote_rejected: 'Presupuesto rechazado y próximo paso creado.',
        treatment_started: 'Tratamiento iniciado; se cerraron las acciones comerciales abiertas.',
      };
      setNotice(notices[outcome] || 'Resultado registrado.');
    } catch (outcomeError) {
      console.error('Error saving contact outcome', outcomeError);
      setError(humanizeCrmError(outcomeError, 'No se pudo guardar el resultado. Intentá de nuevo.'));
      throw outcomeError;
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

  async function saveTreatmentPrice(price) {
    if (!profile?.clinic_id || !canAdmin) throw new Error('Solo owner/admin puede editar precios.');
    const treatment = String(price?.treatment || '').trim();
    const estimatedPrice = Number(price?.estimated_price);
    if (!treatment) throw new Error('El nombre del tratamiento es obligatorio.');
    if (!Number.isFinite(estimatedPrice) || estimatedPrice <= 0) throw new Error('El precio debe ser mayor que cero.');

    setPriceSaving(true);
    setError('');
    setNotice('');
    try {
      const { error: priceError } = await supabase
        .from('treatment_prices')
        .upsert({ clinic_id: profile.clinic_id, treatment, estimated_price: estimatedPrice }, { onConflict: 'clinic_id,treatment' });
      if (priceError) throw priceError;
      await refreshClinicData();
      setNotice(`Precio de referencia de “${treatment}” guardado.`);
    } finally {
      setPriceSaving(false);
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
          quotes={quotes}
          workspaceEvents={workspaceEvents}
          profiles={clinicProfiles}
          canAdmin={canAdmin}
          onCreateLead={openCreateLeadModal}
          onOpenLead={handleLeadSelect}
          onScheduleAppointment={openAppointmentModal}
          onCompleteTask={completeTask}
          onMarkContacted={markLeadContacted}
          onPostpone={postponeLeadFollowup}
          onWhatsAppOpened={handleWhatsAppOpened}
          onRegisterOutcome={openRegisterOutcome}
          onConfirmAppointment={confirmAppointmentById}
          onRefresh={() => refreshClinicData()}
          messageTemplates={messageTemplates}
          clinicContext={clinicContext}
          onNavigate={setActiveView}
        />
      ) : null}
      {activeView === 'followups' ? (
        <FollowupsView
          leads={activeLeads}
          tasks={tasks}
          appointments={appointments}
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
      {activeView === 'pending' ? (
        <PendingView
          leads={activeLeads}
          tasks={tasks}
          appointments={appointments}
          quotes={quotes}
          profiles={clinicProfiles}
          onOpenLead={handleLeadSelect}
          onRegisterOutcome={openRegisterOutcome}
          onConfirmAppointment={confirmAppointmentById}
          onCompleteTask={completeTask}
          onWhatsAppOpened={handleWhatsAppOpened}
          messageTemplates={messageTemplates}
          clinicContext={clinicContext}
        />
      ) : null}
      {activeView === 'leads' ? (
        <LeadsView
          leads={leads}
          appointments={appointments}
          tasks={tasks}
          quotes={quotes}
          canAdmin={canAdmin}
          onCreateLead={openCreateLeadModal}
          onEditLead={openEditLeadModal}
          onArchiveLead={openArchiveLeadModal}
          onMarkLost={openLostLeadModal}
          onOpenLead={handleLeadSelect}
          onUpdateLead={updateLead}
          onScheduleAppointment={openAppointmentModal}
          onCreateTask={openCreateTaskModal}
          onMarkContacted={markLeadContacted}
          onRegisterOutcome={openRegisterOutcome}
          profiles={clinicProfiles}
          onWhatsAppOpened={handleWhatsAppOpened}
          onMessageCopied={handleMessageCopied}
          messageTemplates={messageTemplates}
          clinicContext={clinicContext}
          setNotice={setNotice}
        />
      ) : null}
      {activeView === 'lead-detail' ? (
        <LeadDetail
          lead={selectedLead}
          events={leadEvents}
          tasks={tasks}
          appointments={appointments}
          quotes={quotes}
          profiles={clinicProfiles}
          canAdmin={canAdmin}
          onBack={() => setActiveView('leads')}
          onEditLead={openEditLeadModal}
          onArchiveLead={openArchiveLeadModal}
          onScheduleAppointment={openAppointmentModal}
          onCreateTask={openCreateTaskModal}
          onRegisterOutcome={openRegisterOutcome}
          onRegisterQuote={openQuoteModal}
          onWhatsAppOpened={handleWhatsAppOpened}
          messageTemplates={messageTemplates}
          clinicContext={clinicContext}
        />
      ) : null}
      {activeView === 'agenda' ? (
        <AgendaView
          appointments={appointments}
          quotes={quotes}
          actionId={appointmentActionId}
          onOutcome={updateAppointmentOutcome}
          onReschedule={openRescheduleModal}
          onOpenLead={handleLeadSelect}
          onNavigate={setActiveView}
          onRegisterQuote={openQuoteModal}
          onRegisterOutcome={openRegisterOutcome}
          onWhatsAppOpened={handleWhatsAppOpened}
          messageTemplates={messageTemplates}
          clinicContext={clinicContext}
        />
      ) : null}
      {activeView === 'tasks' ? (
        <TasksView tasks={tasks} leads={activeLeads} appointments={appointments} canAdmin={canAdmin} onCreateTask={openCreateTaskModal} onEditTask={openEditTaskModal} onComplete={completeTask} onOpenLead={handleLeadSelect} onWhatsAppOpened={handleWhatsAppOpened} messageTemplates={messageTemplates} clinicContext={clinicContext} />
      ) : null}
      {activeView === 'metrics' && canAdmin ? (
        <MetricsView
          leads={leads}
          appointments={appointments}
          tasks={tasks}
          quotes={quotes}
          workspaceEvents={workspaceEvents}
          profiles={clinicProfiles}
          onNavigate={setActiveView}
        />
      ) : null}
      {activeView === 'settings' && canAdmin ? (
        <SettingsView clinic={clinic} profile={profile} publicFormConfig={publicFormConfig} savingPublicForm={publicFormSaving} onSavePublicForm={savePublicFormConfig} messageTemplates={messageTemplates} savingTemplates={templateSaving} onSaveMessageTemplates={saveMessageTemplates} treatmentPrices={treatmentPrices} savingPrices={priceSaving} onSaveTreatmentPrice={saveTreatmentPrice} clinicSettings={clinicSettings} profiles={clinicProfiles} setNotice={setNotice} />
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
      {archiveModal ? <ArchiveLeadModal key="archive-modal" lead={archiveModal.lead} archive={archiveModal.archive} saving={archiveSaving} onClose={() => setArchiveModal(null)} onSubmit={saveLeadLoss} /> : null}
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
          quotes={quotes}
          onClose={() => setContactOutcomeModal(null)}
          onSubmit={submitContactOutcome}
        />
      ) : null}
      {quoteModal ? (
        <QuoteModal
          key="quote-modal"
          context={quoteModal}
          treatmentPrices={treatmentPrices}
          saving={quoteSaving}
          onClose={() => setQuoteModal(null)}
          onSubmit={saveQuote}
        />
      ) : null}
      </AnimatePresence>
      </Suspense>
    </AppLayout>
  );
}
