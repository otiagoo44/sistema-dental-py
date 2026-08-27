import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import AppLayout from '../src/components/AppLayout.jsx';
import Dashboard from '../src/pages/DashboardPage.jsx';
import LeadsView from '../src/pages/LeadsPage.jsx';
import AgendaView from '../src/pages/AgendaPage.jsx';
import PendingPage from '../src/pages/PendingPage.jsx';
import MetricsView from '../src/pages/MetricsPage.jsx';
import ContactOutcomeModal from '../src/components/modals/ContactOutcomeModal.jsx';
import QuoteModal from '../src/components/modals/QuoteModal.jsx';
import AppointmentModal from '../src/components/modals/AppointmentModal.jsx';
import LeadFormModal from '../src/components/modals/LeadFormModal.jsx';
import { todayIsoDate } from '../src/lib/formatters.js';

const now = new Date();
const today = todayIsoDate();
const hour = now.getHours();
const pastTime = `${String(Math.max(0, hour - 1)).padStart(2, '0')}:00`;
const futureTime = `${String(Math.min(23, hour + 2)).padStart(2, '0')}:30`;
const profiles = [
  { id: 'user-reception', full_name: 'Ana Recepción', email: 'ana@example.test', role: 'receptionist', active: true },
  { id: 'user-owner', full_name: 'Dueño Dental', email: 'owner@example.test', role: 'owner', active: true },
];
const leads = [
  { id: 'lead-1', clinic_id: 'clinic-1', name: 'María González', phone_plus: '+595981111111', treatment: 'Implante dental', status: 'Nuevo', score: 88, classification: 'Lead Caliente', assigned_to: 'user-reception', created_at: new Date(now.getTime() - 18 * 60_000).toISOString(), next_action: 'Responder nueva consulta', next_followup_at: new Date(now.getTime() - 13 * 60_000).toISOString(), source_normalized: 'Instagram' },
  { id: 'lead-2', clinic_id: 'clinic-1', name: 'Carlos Benítez', phone_plus: '+595982222222', treatment: 'Ortodoncia', status: 'Contactado', score: 64, classification: 'Lead Medio', assigned_to: 'user-reception', created_at: now.toISOString(), first_contacted_at: now.toISOString(), next_action: 'Volver a contactar', next_followup_at: new Date(now.getTime() + 2 * 60 * 60_000).toISOString(), source_normalized: 'Google' },
  { id: 'lead-3', clinic_id: 'clinic-1', name: 'Laura Gómez', phone_plus: '', treatment: 'Carillas', status: 'Confirmado', score: 45, classification: 'Lead Frío', assigned_to: 'user-reception', created_at: now.toISOString(), first_contacted_at: now.toISOString(), next_action: 'Registrar asistencia', next_followup_at: now.toISOString(), source_normalized: 'Referido' },
];
const tasks = [
  { id: 'task-1', clinic_id: 'clinic-1', lead_id: 'lead-1', type: 'contact', title: 'Responder nueva consulta', status: 'pendiente', priority: 'alta', due_at: leads[0].next_followup_at, assigned_to: 'user-reception' },
  { id: 'task-2', clinic_id: 'clinic-1', lead_id: 'lead-2', type: 'followup', title: 'Volver a contactar', status: 'pendiente', priority: 'media', due_at: leads[1].next_followup_at, assigned_to: 'user-reception' },
  { id: 'task-3', clinic_id: 'clinic-1', lead_id: 'lead-3', type: 'attendance', title: 'Registrar asistencia', status: 'pendiente', priority: 'alta', due_at: now.toISOString(), assigned_to: 'user-reception' },
];
const appointments = [
  { id: 'appointment-1', clinic_id: 'clinic-1', lead_id: 'lead-3', appointment_date: today, appointment_time: pastTime, doctor_assigned: 'Dra. López', treatment_scheduled: 'Carillas', status: 'Confirmado', leads: leads[2] },
  { id: 'appointment-2', clinic_id: 'clinic-1', lead_id: 'lead-2', appointment_date: today, appointment_time: futureTime, doctor_assigned: 'Dr. Vera', treatment_scheduled: 'Ortodoncia', status: 'Agendado', leads: leads[1] },
  { id: 'appointment-3', clinic_id: 'clinic-1', lead_id: 'lead-1', appointment_date: today, appointment_time: '08:30', doctor_assigned: 'Dra. López', treatment_scheduled: 'Implante dental', status: 'No Asistió', leads: leads[0] },
];
const quotes = [
  { id: 'quote-1', clinic_id: 'clinic-1', lead_id: 'lead-2', amount: 8500000, currency: 'PYG', status: 'pending', treatment: 'Ortodoncia', issued_at: now.toISOString(), next_action_at: new Date(now.getTime() - 60_000).toISOString() },
];
const workspaceEvents = [
  { id: 'event-1', lead_id: 'lead-1', event_type: 'contact_attempted', created_at: now.toISOString() },
  { id: 'event-2', lead_id: 'lead-2', event_type: 'appointment_scheduled', created_at: now.toISOString() },
  { id: 'event-3', lead_id: 'lead-3', event_type: 'appointment_attended', created_at: now.toISOString() },
  { id: 'event-4', lead_id: 'lead-3', event_type: 'treatment_started', created_at: now.toISOString() },
  { id: 'event-5', lead_id: 'lead-1', event_type: 'appointment_no_show', created_at: now.toISOString() },
];
const noop = () => {};
const params = new URLSearchParams(window.location.search);
const page = params.get('page') || 'home';
const isOwner = ['owner', 'analysis'].includes(page);
const activeView = page === 'patients' ? 'leads' : page === 'pending' ? 'pending' : page === 'agenda' ? 'agenda' : page === 'analysis' ? 'metrics' : 'dashboard';

const common = { leads, tasks, appointments, quotes, profiles, workspaceEvents, messageTemplates: [], clinicContext: {}, onNavigate: noop };
let content;
if (page === 'modal') {
  content = <ModalScenario kind={params.get('modal') || 'contact'} saving={params.get('saving') === '1'} />;
} else if (page === 'patients') {
  content = <LeadsView {...common} canAdmin={false} onCreateLead={noop} onOpenLead={noop} onRegisterOutcome={noop} onWhatsAppOpened={noop} />;
} else if (page === 'agenda') {
  content = <AgendaView {...common} actionId="" onOutcome={noop} onReschedule={noop} onOpenLead={noop} onRegisterQuote={noop} onRegisterOutcome={noop} onWhatsAppOpened={noop} />;
} else if (page === 'pending') {
  content = <PendingPage {...common} onOpenLead={noop} onRegisterOutcome={noop} onConfirmAppointment={noop} onCompleteTask={noop} onWhatsAppOpened={noop} />;
} else if (page === 'analysis') {
  content = <MetricsView {...common} onNavigate={noop} />;
} else {
  content = <Dashboard {...common} canAdmin={isOwner} onCreateLead={noop} onOpenLead={noop} onRegisterOutcome={noop} onConfirmAppointment={noop} onWhatsAppOpened={noop} onRefresh={noop} />;
}

createRoot(document.getElementById('root')).render(
  <AppLayout
    activeView={activeView}
    setActiveView={noop}
    clinic={{ id: 'clinic-1', name: 'Clínica Dental QA' }}
    profile={isOwner ? profiles[1] : profiles[0]}
    isAdmin={isOwner}
    onLogout={noop}
  >
    {content}
  </AppLayout>,
);

function ModalScenario({ kind, saving }) {
  const [open, setOpen] = useState(false);
  const context = { lead: leads[1], quote: quotes[0], action: { actionType: 'quote_followup', quoteId: quotes[0].id } };
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-cream">Prueba de modal</h1>
      <button id="qa-modal-opener" className="button-primary min-h-11 rounded-xl px-4" type="button" onClick={() => setOpen(true)}>Abrir modal</button>
      {open && kind === 'contact' ? <ContactOutcomeModal context={context} saving={saving} quotes={quotes} onClose={() => setOpen(false)} onSubmit={async () => {}} /> : null}
      {open && kind === 'quote' ? <QuoteModal context={{ lead: leads[1], appointment: appointments[1] }} saving={saving} onClose={() => setOpen(false)} onSubmit={async () => { throw new Error('No se pudo guardar el presupuesto de prueba.'); }} /> : null}
      {open && kind === 'appointment' ? <AppointmentModal clinic={{ doctor_name: 'Dra. López' }} lead={leads[1]} appointments={appointments} profiles={profiles} clinicSettings={{ opening_hours: 'Lunes a viernes 08:00-12:00; 14:00-18:00' }} mode="schedule" saving={saving} onClose={() => setOpen(false)} onSubmit={async () => { throw new Error('No se pudo guardar la cita de prueba.'); }} /> : null}
      {open && kind === 'lead' ? <LeadFormModal mode="create" lead={null} canAdmin={false} profiles={profiles} currentUserId="user-reception" saving={saving} onClose={() => setOpen(false)} onSubmit={async () => { throw new Error('No se pudo guardar la consulta de prueba.'); }} /> : null}
    </section>
  );
}
