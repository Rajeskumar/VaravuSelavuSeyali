import { ChangeInsight } from '../api/analytics';
import { formatMoney } from './money';

export type ChangeInsightKind = 'new' | 'up' | 'down' | 'outlier';

export interface ChangeInsightText {
  kind: ChangeInsightKind;
  headline: string;
  detail: string;
}

const GROUP_SUFFIX = '(includes your share of group expenses)';

/**
 * One sentence pair per insight type, shared by the Analysis "What changed" rail and the
 * Dashboard. Every type used to be phrased as "<name> is up N% vs last period", which turned an
 * unusually large one-off purchase into "Best Buy is up 4076%" and put the backend's internal
 * metric label ("Spend Decreased at Blue Bottle (includes …) is down 87%") on the dashboard.
 */
export function describeChangeInsight(insight: ChangeInsight): ChangeInsightText {
  const name = (insight.entity_name || insight.metric_name).trim();
  const pct = Math.round(Math.abs(insight.change_percent));
  const fromTo = `${formatMoney(insight.previous_value)} → ${formatMoney(insight.current_value)}`;
  const groupNote = insight.metric_name.includes(GROUP_SUFFIX) ? ' Includes your share of group expenses.' : '';

  if (insight.time_scope === 'transaction') {
    return {
      kind: 'outlier',
      headline: `Unusually large: ${name}, ${formatMoney(insight.current_value)}`,
      detail: `Your typical expense is about ${formatMoney(insight.previous_value)}.`,
    };
  }
  if (insight.previous_value === 0) {
    return {
      kind: 'new',
      headline: `New: ${name}, ${formatMoney(insight.current_value)}`,
      detail: `Nothing here in the comparison period.${groupNote}`,
    };
  }

  const up = insight.change_amount > 0;
  const direction = up ? 'up' : 'down';
  const subject =
    insight.time_scope === 'item' ? `${name} price` :
    insight.time_scope === 'recurring' ? `${name} bill` :
    `${name} spending`;
  return {
    kind: up ? 'up' : 'down',
    headline: `${subject} is ${direction} ${pct}%`,
    detail: `${fromTo}${insight.time_scope === 'item' ? ' average price' : ''}.${groupNote}`,
  };
}
