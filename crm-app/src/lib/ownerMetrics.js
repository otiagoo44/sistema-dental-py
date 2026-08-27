import { buildAnalytics } from './analytics.js';

export function buildOwnerSummary({
  leads = [], appointments = [], tasks = [], quotes = [], workspaceEvents = [], profiles = [], now = new Date(),
}) {
  const analytics = buildAnalytics({
    leads,
    appointments,
    tasks,
    quotes,
    events: workspaceEvents,
    profiles,
    period: '30d',
    now,
  });

  return {
    ...analytics,
    monthLabel: 'los últimos 30 días',
    money: {
      ...analytics.money,
      risk: analytics.money.attention,
      riskCount: analytics.money.attentionCount,
    },
  };
}
