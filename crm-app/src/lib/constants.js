export const LEAD_STATUSES = [
  'Nuevo',
  'No Contactado',
  'Contactado',
  'Respondió',
  'Consulta Agendada',
  'Confirmado',
  'Asistió',
  'Presupuesto Enviado',
  'Tratamiento Iniciado',
  'No Respondió',
  'Perdido',
  'Reactivar 30d',
  'No Asistió',
  'Archivado',
];

export const CLASSIFICATIONS = ['Lead Caliente', 'Lead Medio', 'Lead Frío'];

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Inicio', adminLabel: 'Resumen', description: 'Lo que necesita atención ahora.' },
  { id: 'leads', label: 'Pacientes', description: 'Buscá y gestioná oportunidades.' },
  { id: 'pending', label: 'Pendientes', description: 'Lo que necesita atención, ordenado automáticamente.' },
  { id: 'followups', label: 'Seguimientos', description: 'Acciones pendientes para no perder oportunidades.', hiddenFromMain: true },
  { id: 'agenda', label: 'Agenda', description: 'Turnos, disponibilidad y asistencia.' },
  { id: 'tasks', label: 'Tareas', description: 'Trabajo operativo asignado a la clínica.', hiddenFromMain: true },
  { id: 'metrics', label: 'Análisis', description: 'Dónde se está frenando el proceso comercial.', adminOnly: true },
  { id: 'settings', label: 'Configuración', description: 'Clínica, formulario público y accesos.', adminOnly: true },
];

export const TREATMENT_OPTIONS = [
  'Implante dental',
  'Ortodoncia',
  'Estética dental',
  'Blanqueamiento',
  'Limpieza',
  'Urgencia/dolor',
  'Carillas',
  'Prótesis',
  'Consulta general',
  'Otro',
];

export const LEAD_SOURCE_OPTIONS = [
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

export const URGENCY_OPTIONS = ['Hoy', 'Esta semana', 'Este mes', 'Sólo consultando'];
export const EVALUATION_OPTIONS = ['Sí', 'No', 'No sabe'];
export const SITUATION_OPTIONS = [
  'Quiere agendar una consulta',
  'Quiere precio',
  'Tiene dolor/urgencia',
  'Quiere segunda opinión',
  'Está comparando opciones',
  'Ya fue paciente',
  'Otro',
];
export const NEXT_ACTION_OPTIONS = ['Llamar', 'Enviar WhatsApp', 'Agendar evaluación', 'Pedir más información', 'Recontactar luego'];

export const CONTACTED_STATUSES = [
  'Contactado',
  'Respondió',
  'Consulta Agendada',
  'Confirmado',
  'Asistió',
  'Presupuesto Enviado',
  'Tratamiento Iniciado',
];

export const CONTACT_ATTEMPT_STATUSES = ['Contactado', 'Respondió', 'No Respondió'];

export const SCHEDULED_STATUSES = ['Consulta Agendada', 'Confirmado', 'Asistió', 'No Asistió'];
