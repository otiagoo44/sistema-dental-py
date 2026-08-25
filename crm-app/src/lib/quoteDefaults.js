export function normalizeTreatmentKey(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

export function findTreatmentPrice(treatment, treatmentPrices = []) {
  const key = normalizeTreatmentKey(treatment);
  if (!key) return null;
  const match = treatmentPrices.find((item) => normalizeTreatmentKey(item.treatment) === key);
  if (!match || match.estimated_price === null || match.estimated_price === undefined) return null;
  const amount = Number(match.estimated_price);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function quoteTreatmentOptions({ leadTreatment = '', quoteTreatment = '', treatmentPrices = [], fallbackOptions = [] } = {}) {
  const values = [quoteTreatment, leadTreatment, ...treatmentPrices.map((item) => item?.treatment), ...fallbackOptions];
  const seen = new Set();
  return values.map((value) => String(value || '').trim()).filter((value) => {
    const key = normalizeTreatmentKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
