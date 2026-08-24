import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeRole, ROLE } from '../lib/crmDomain';
import { supabase } from '../lib/supabase';
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

  useEffect(() => {
    if (!session?.user?.id) {
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

    bootstrapUser(session.user.id);
  }, [session?.user?.id]);

  async function bootstrapUser(userId) {
    setBootLoading(true);
    onError('');

    const { data: profileData, error: profileError } = await getUserProfile(userId);
    if (profileError) {
      console.error('Error loading user profile', profileError);
      onError('No se pudo cargar el profile del usuario. Verifica public.profiles y las politicas RLS.');
      setBootLoading(false);
      return;
    }

    if (!profileData) {
      onError('Tu usuario no tiene perfil asignado. Pedí al administrador que cree tu profile.');
      setBootLoading(false);
      return;
    }

    const { data: clinicData, error: clinicError } = await getClinic(profileData.clinic_id);
    if (clinicError) {
      console.error('Error loading clinic', clinicError);
      onError('No se pudo cargar la clinica asociada al usuario.');
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

    const { data, error } = await getClinicWorkspace(clinicId);
    if (error) {
      console.error('Error loading clinic data', error);
      onError(error.message);
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
  }, [onError, profile?.clinic_id]);

  const refreshTimerRef = useRef(null);

  useEffect(() => {
    const clinicId = profile?.clinic_id;
    if (!clinicId) return undefined;

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
      .subscribe();

    const pollId = window.setInterval(() => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    }, 25_000);
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };

    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
      window.clearInterval(pollId);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      supabase.removeChannel(channel);
    };
  }, [profile?.clinic_id, refreshClinicData]);

  async function loadLeadEvents(leadId) {
    if (!profile?.clinic_id || !leadId) return false;

    const { data, error } = await getLeadEvents(profile.clinic_id, leadId);
    if (error) {
      console.error('Error loading lead events', error);
      onError(error.message);
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
