import assert from 'node:assert/strict';
import {
  buildWhatsAppMessage,
  buildWhatsappUrl,
  normalizeWhatsAppPhone,
  selectWhatsAppTemplateKey,
} from '../crm-app/src/lib/messages.js';

const lead = {
  name: 'Laura',
  phone_plus: '+595 (981) 123-456',
  treatment: 'Implante dental',
  urgency: 'Hoy',
  situation: 'Quiere agendar una consulta',
  evaluation_previous: 'No',
  status: 'Nuevo',
  whatsapp_link: 'https://wa.me/595981123456',
};

const template = 'Hola {{nombre}}, soy de {{clinica}}. Consulta: {{tratamiento}}. {{agenda_link}} {{variable_desconocida}}';
const message = buildWhatsAppMessage(lead, template, {
  name: 'DentalPro QA',
  calendar_link: 'https://agenda.example.test',
});

assert.equal(normalizeWhatsAppPhone(lead), '595981123456');
assert.equal(selectWhatsAppTemplateKey(lead), 'urgency');
assert.match(message, /Hola Laura, soy de DentalPro QA/);
assert.match(message, /Implante dental/);
assert.match(message, /https:\/\/agenda\.example\.test/);
assert.doesNotMatch(message, /\{\{/);

const url = buildWhatsappUrl(lead, [{ template_key: 'urgency', message: template }], {
  name: 'DentalPro QA',
  calendar_link: 'https://agenda.example.test',
});
assert.match(url, /^https:\/\/wa\.me\/595981123456\?text=/);
assert.match(decodeURIComponent(url), /Hola Laura/);

const fallback = buildWhatsAppMessage({}, 'Hola {{nombre}}, consultaste por {{tratamiento}} en {{clinica}}.');
assert.equal(fallback, 'Hola, consultaste por tu consulta en la clínica.');

console.log('PASS whatsapp_message_builder');
