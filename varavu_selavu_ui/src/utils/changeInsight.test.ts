import { describeChangeInsight } from './changeInsight';

const base = { change_amount: 0, change_percent: 0, previous_value: 0, current_value: 0, metric_name: '', time_scope: 'merchant' };

test('an outlier purchase is described as unusually large, not as a percent change', () => {
  const t = describeChangeInsight({
    ...base, metric_name: 'Unusually large transaction at Best Buy', time_scope: 'transaction',
    entity_name: 'Best Buy', previous_value: 30, current_value: 1249, change_amount: 1219, change_percent: 4063.3,
  });
  expect(t.kind).toBe('outlier');
  expect(t.headline).toBe('Unusually large: Best Buy, $1,249.00');
  expect(t.headline).not.toMatch(/%/);
});

test('merchant changes use the entity name and keep the group note out of the headline', () => {
  const t = describeChangeInsight({
    ...base, metric_name: 'Spend Decreased at Blue Bottle (includes your share of group expenses)',
    entity_name: 'Blue Bottle', previous_value: 52.17, current_value: 6.75, change_amount: -45.42, change_percent: -87.1,
  });
  expect(t.headline).toBe('Blue Bottle spending is down 87%');
  expect(t.detail).toBe('$52.17 → $6.75. Includes your share of group expenses.');
});

test('a merchant with nothing last period is new', () => {
  const t = describeChangeInsight({ ...base, entity_name: 'Airbnb', current_value: 215, change_amount: 215, change_percent: 100 });
  expect(t.kind).toBe('new');
  expect(t.headline).toBe('New: Airbnb, $215.00');
});
