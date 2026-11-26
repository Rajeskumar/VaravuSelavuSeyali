import { readFileSync } from 'fs';
import { resolve } from 'path';
import { trackSpenseConfig } from './appConfig';

const catalog = JSON.parse(readFileSync(resolve(__dirname, '../../../docs/analytics/catalog.v1.json'), 'utf8'));
const allowed: string[] = catalog.events.screen_view.properties.screen_name.values;
const registry = trackSpenseConfig.analytics.screens;
const src = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

test('every registered screen id is in the catalog, so none is silently dropped', () => {
  for (const [route, id] of Object.entries(registry)) expect({ route, known: allowed.includes(id) }).toEqual({ route, known: true });
});
test('every catalog screen id has a registered route, so none is dead', () => {
  expect(new Set(Object.values(registry))).toEqual(new Set(allowed));
});
test('every navigable route is registered or deliberately a container', () => {
  const containers = new Set(['MainTabs']);
  const names = new Set<string>();
  for (const m of src('tabs.tsx').matchAll(/name:\s*'([^']+)'/g)) names.add(m[1]);
  for (const m of src('routes.ts').matchAll(/name:\s*'([^']+)'/g)) names.add(m[1]);
  for (const m of src('../core/navigation/RootNavigator.tsx').matchAll(/<Stack\.Screen name="([^"]+)"/g)) names.add(m[1]);
  expect(names.size).toBeGreaterThan(20);
  const missing = [...names].filter((n) => !containers.has(n) && !(n in registry));
  expect(missing).toEqual([]);
});
test('no route name or id looks like data', () => {
  for (const [route, id] of Object.entries(registry)) {
    expect(route).toMatch(/^[A-Za-z][A-Za-z ]*$/);
    expect(id).toMatch(/^[a-z][a-z_]*$/);
  }
});
