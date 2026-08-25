import assert from 'node:assert/strict';
import { findTreatmentPrice, quoteTreatmentOptions } from '../crm-app/src/lib/quoteDefaults.js';

const prices = [{ treatment: 'Implantes', estimated_price: 8500000 }];

assert.equal(findTreatmentPrice('Implantes', prices), 8500000);
assert.equal(findTreatmentPrice('implantes', prices), 8500000);
assert.equal(findTreatmentPrice('Blanqueamiento', prices), null);

const options = quoteTreatmentOptions({ leadTreatment: 'Implantes', treatmentPrices: prices, fallbackOptions: ['Ortodoncia'] });
assert.deepEqual(options, ['Implantes', 'Ortodoncia']);

console.log('quote-pricing-test: ok');
