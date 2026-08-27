const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

export function captureUrlAttribution(locationValue, referrerValue = '') {
  if (!locationValue) return {};

  const params = new URLSearchParams(locationValue.search || '');
  const attribution = Object.fromEntries(UTM_FIELDS.map((field) => [field, params.get(field) || null]));
  const origin = locationValue.origin || '';
  const pathname = locationValue.pathname || '';

  return {
    ...attribution,
    landing_page: `${origin}${pathname}` || null,
    referrer: String(referrerValue || '').trim() || null,
  };
}
