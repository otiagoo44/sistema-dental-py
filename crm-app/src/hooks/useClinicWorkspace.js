import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeRole, ROLE } from '../lib/crmDomain';
import { supabase } from '../lib/supabase';
import { humanizeCrmError } from '../lib/errors';
import {
  getClinic,
  getClinicWorkspace,
  getLeadEvents,
  getPublicFormConfig,
  getUserProfile,
} from '../services/crmApi';

export default function useClinicWorkspace({ session, onError }) {
  const [bootLoading, setBootLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [clinic, setClinic] = useState(null);
  const [leads, setLeads] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [workspaceEvents, setWorkspaceEvents] = useState([]);
  const [clinicSettings, setClinicSettings] = useState(null);
  const [treatmentPrices, setTreatmentPrices] = useState([]);
  const [leadEvents, setLeadEvents] = useState([]);
  const [publicFormConfig, setPublicFormConfig] = useState(null);
  const [clinicProfiles, setClinicProfiles] = useState([]);
  const [messageTemplates, setMessageTemplates] = useState([]);
  const activeClinicRef = useRef(null);
  const sessionGenerationRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const refreshTimerRef = useRef(null);

  useEffect(() => {
    const generation = sessionGenerationRef.current + 1;
    sessionGenerationRef.current = generation;

    if (!session?.user?.id) {
      activeClinicRef.current = null;
      refreshQueuedRef.current = false;
      setProfile(null);
      setClinic(null);
      setLeads([]);
      setAppointments([]);
      setTasks([]);
      setQuotes([]);
      setWorkspaceEvents([]);
      setClinicSettings(null);
      setTreatmentPrices([]);
      setLeadEvents([]);
      setPublicFormConfig(null);
      setClinicProfiles([]);
      setMessageTemplates([]);
      setBootLoading(false);
      return;
    }

    // Never keep a previous user's clinic visible while a new session boots.
    activeClinicRef.current = null;
    refreshQueuedRef.current = false;
    setProfile(null);
    setClinic(null);
    setLeads([]);
    setAppointments([]);
    setTasks([]);
    setQuotes([]);
    setWorkspaceEvents([]);
    setClinicSettings(null);
    setTreatmentPrices([]);
    setLeadEvents([]);
    setPublicFormConfig(null);
    setClinicProfiles([]);
    setMessageTemplates([]);
    bootstrapUser(session.user.id, generation);
    return () => {
      if (sessionGenerationRef.current === generation) sessionGenerationRef.current += 1;
      activeClinicRef.current = null;
      refreshQueuedRef.current = false;
    };
  }, [session?.user?.id]);

  async function bootstrapUser(userId, generation) {
    setBootLoading(true);
    onError('');

    const { data: profileData, error: profileError } = await getUserProfile(userId);
    if (sessionGenerationRef.current !== generation) return;
    if (profileError) {
      console.error('Error loading user profile', profileError);
      onError('No pudimos cargar tu usuario. Intentá cerrar sesión y volver a entrar.');
      setBootLoading(false);
      return;
    }

    if (!profileData) {
      onError('Tu usuario no tiene un perfil asignado. Pedí ayuda al administrador de la clínica.');
      setBootLoading(false);
      return;
    }

    const { data: clinicData, error: clinicError } = await getClinic(profileData.clinic_id);
    if (sessionGenerationRef.current !== generation) return;
    if (clinicError) {
      console.error('Error loading clinic', clinicError);
      onError('No pudimos cargar la clínica. Intentá de nuevo.');
      setBootLoading(false);
      return;
    }

    const profileRole = normalizeRole(profileData.role);
    activeClinicRef.current = profileData.clinic_id;
    setProfile({ ...profileData, raw_role: profileData.role, role: profileRole });
    setClinic(clinicData);
    await refreshClinicData(profileData.clinic_id);
    if (sessionGenerationRef.current !== generation) return;

    if (profileRole === ROLE.admin) {
      await loadPublicFormConfig(profileData.clinic_id);
    } else {
      setPublicFormConfig(null);
    }

    setBootLoading(false);
  }

  async function loadPublicFormConfig(clinicId = profile?.clinic_id) {
    if (!clinicId) return;

    const { data, error } = await getPublicFormConfig(clinicId);
    if (error) {
      console.warn('Public form config is not available yet', error);
      setPublicFormConfig(null);
      return;
    }

    setPublicFormConfig(data || null);
  }

  const refreshClinicData = useCallback(async (clinicId = profile?.clinic_id) => {
    if (!clinicId) return false;
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return false;
    }

    refreshInFlightRef.current = true;
    let shouldRefreshAgain = false;

    try {
      const { data, error } = await getClinicWorkspace(clinicId);
      if (activeClinicRef.current !== clinicId) return false;
      if (error) {
        console.error('Error loading clinic data', error);
        onError('No pudimos actualizar la información. Intentá de nuevo.');
        return false;
      }

      setLeads(data.leads);
      setAppointments(data.appointments);
      setTasks(data.tasks);
      setQuotes(data.quotes);
      setWorkspaceEvents(data.events);
      setClinicProfiles(data.profiles);
      setClinicSettings(data.settings);
      setTreatmentPrices(data.prices);
      setMessageTemplates(data.messageTemplates);
      return true;
    } finally {
      refreshInFlightRef.current = false;
      shouldRefreshAgain = refreshQueuedRef.current;
      refreshQueuedRef.current = false;
      const queuedClinicId = activeClinicRef.current;
      if (shouldRefreshAgain && queuedClinicId) {
        window.setTimeout(() => refreshClinicData(queuedClinicId), 0);
      }
    }
  }, [onError, profile?.clinic_id]);

  useEffect(() => {
    const clinicId = profile?.clinic_id;
    if (!clinicId) return undefined;
    let realtimeHealthy = false;

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        if (document.visibilityState === 'visible') refreshClinicData(clinicId);
      }, 800);
    };

    const channel = supabase
      .channel(`clinic-workspace:${clinicId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `clinic_id=eq.${clinicId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `clinic_id=eq.${clinicId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `clinic_id=eq.${clinicId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes', filter: `clinic_id=eq.${clinicId}` }, scheduleRefresh)
      .subscribe((status) => {
        realtimeHealthy = status === 'SUBSCRIBED';
        if (realtimeHealthy) scheduleRefresh();
      });

    const pollId = window.setInterval(() => {
      if (!realtimeHealthy && document.visibilityState === 'visible') scheduleRefresh();
    }, 25_000);
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };

    window.addEventListener('focus', refreshVisible);
    window.addEventListener('online', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
      window.clearInterval(pollId);
      window.removeEventListener('focus', refreshVisible);
      window.removeEventListener('online', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      supabase.removeChannel(channel);
    };
  }, [profile?.clinic_id, refreshClinicData]);

  async function loadLeadEvents(leadId) {
    if (!profile?.clinic_id || !leadId) return false;

    const { data, error } = await getLeadEvents(profile.clinic_id, leadId);
    if (error) {
      console.error('Error loading lead events', error);
      onError(humanizeCrmError(error, 'No pudimos cargar el historial. Intentá de nuevo.'));
      return false;
    }

    setLeadEvents(data || []);
    return true;
  }

  return {
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
  };
}
