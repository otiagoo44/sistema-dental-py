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
  const [leadsResult, appointmentsResult, tasksResult, quotesResult, eventsResult, profilesResult, settingsResult, pricesResult, templatesResult] = await Promise.all([
    supabase
      .from('leads')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false }),
    supabase
      .from('appointments')
      .select('*, leads(id, name, phone, phone_plus, treatment, urgency, situation, evaluation_previous, status, whatsapp_link)')
      .eq('clinic_id', clinicId)
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true }),
    supabase
      .from('tasks')
      .select('*, leads(id, name, phone, phone_plus, treatment, urgency, situation, evaluation_previous, status, whatsapp_link)')
      .eq('clinic_id', clinicId)
      .order('due_at', { ascending: true, nullsFirst: false }),
    supabase
      .from('quotes')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('issued_at', { ascending: false }),
    supabase
      .from('lead_events')
      .select('id, clinic_id, lead_id, event_type, title, description, metadata, created_by, created_at')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false }),
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
      .select('id, treatment, estimated_price')
      .eq('clinic_id', clinicId)
      .order('treatment', { ascending: true }),
    supabase
      .from('message_templates')
      .select('id, clinic_id, template_key, name, treatment, situation, message, updated_at')
      .eq('clinic_id', clinicId)
      .order('name', { ascending: true }),
  ]);

  const error = leadsResult.error
    || appointmentsResult.error
    || tasksResult.error
    || quotesResult.error
    || eventsResult.error
    || profilesResult.error
    || settingsResult.error
    || pricesResult.error
    || templatesResult.error;

  if (error) return { data: null, error };

  return {
    data: {
      leads: leadsResult.data || [],
      appointments: appointmentsResult.data || [],
      tasks: tasksResult.data || [],
      quotes: quotesResult.data || [],
      events: eventsResult.data || [],
      profiles: profilesResult.data || [],
      settings: settingsResult.data || null,
      prices: pricesResult.data || [],
      messageTemplates: templatesResult.data || [],
    },
    error: null,
  };
}
