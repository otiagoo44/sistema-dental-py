import { supabase } from '../lib/supabase';

export function getUserProfile(userId) {
  return supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
}

export function getClinic(clinicId) {
  return supabase
    .from('clinics')
    .select('*')
    .eq('id', clinicId)
    .single();
}

export function getPublicFormConfig(clinicId) {
  return supabase
    .from('clinic_public_forms')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

export function getLeadEvents(clinicId, leadId) {
  return supabase
    .from('lead_events')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
}

export async function getClinicWorkspace(clinicId) {
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

  const error = leadsResult.error
    || appointmentsResult.error
    || tasksResult.error
    || profilesResult.error
    || settingsResult.error
    || pricesResult.error;

  if (error) return { data: null, error };

  return {
    data: {
      leads: leadsResult.data || [],
      appointments: appointmentsResult.data || [],
      tasks: tasksResult.data || [],
      profiles: profilesResult.data || [],
      settings: settingsResult.data || null,
      prices: pricesResult.data || [],
    },
    error: null,
  };
}
