import { createScreenTracker } from './screenTracker';

const screens = { Dashboard: 'home', Expenses: 'expenses', GroupDetail: 'group_detail' };
const setup = () => {
  const seen: string[] = [];
  return { seen, tracker: createScreenTracker(screens, (id) => seen.push(id)) };
};

test('reports the first screen once and each change once', () => {
  const { seen, tracker } = setup();
  tracker.onReady('Dashboard');
  tracker.onStateChange('Dashboard'); // rerender / params-only change
  tracker.onStateChange('Expenses');
  tracker.onStateChange('Expenses');
  tracker.onStateChange('Dashboard'); // revisit after another screen counts
  expect(seen).toEqual(['home', 'expenses', 'home']);
});
test('a container or unregistered route is never reported and never leaks its name', () => {
  const { seen, tracker } = setup();
  tracker.onReady('MainTabs');
  tracker.onStateChange('Mystery Group 7f3a1c');
  tracker.onStateChange(undefined);
  tracker.onStateChange('Expenses');
  expect(seen).toEqual(['expenses']);
});
test('replay reports the focused screen again so a late grant still gets its first screen', () => {
  const { seen, tracker } = setup();
  tracker.onReady('Dashboard');
  tracker.replay('Dashboard');
  tracker.replay('MainTabs');
  expect(seen).toEqual(['home', 'home']); // the client, not the tracker, drops the duplicate
});
test('inherited object keys are not screens', () => {
  const { seen, tracker } = setup();
  tracker.onStateChange('constructor');
  tracker.onStateChange('__proto__');
  expect(seen).toEqual([]);
});
test('a throwing reporter never reaches navigation', () => {
  const tracker = createScreenTracker(screens, () => { throw new Error('sdk'); });
  expect(() => tracker.onReady('Dashboard')).not.toThrow();
  expect(() => tracker.onStateChange('Expenses')).not.toThrow();
});
