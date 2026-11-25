import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const sourceRoot = path.resolve(__dirname, '../../varavu_selavu_ui/src/analytics');
/** Bundle the actual pure client/provider modules, not copies of their implementation.
 * The SDK below is deliberately a transport fixture, NOT real-Google privacy evidence. */
function bundle(entry: string, bootstrap = ''): string {
  const modules: Record<string, string> = {};
  const visit = (file: string) => {
    if (modules[file]) return;
    let js = ts.transpileModule(fs.readFileSync(path.join(sourceRoot, file + '.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    modules[file] = 'pending';
    js = js.replace(/require\("([^"]+)"\)/g, (_all, dependency: string) => {
      if (!dependency.startsWith('.')) throw Error('Only local analytics sources are allowed');
      const id = path.posix.normalize(path.posix.join(path.posix.dirname(file), dependency));
      visit(id); return `require(${JSON.stringify(id)})`;
    });
    modules[file] = js;
  };
  visit(entry);
  return `(() => { const process = {env: {NODE_ENV: 'production', REACT_APP_ANALYTICS_ENV: 'production', REACT_APP_ANALYTICS_ENABLED: 'true', REACT_APP_ANALYTICS_CONFIG_VERIFIED: 'true', REACT_APP_GA4_MEASUREMENT_ID: 'G-TESTONLY01'}}; const cache = {}; const modules = {${Object.entries(modules).map(([id, code]) => `${JSON.stringify(id)}: (module, exports, require) => {${code}\n}`).join(',')}};
    const load = id => { if (!cache[id]) { const m = cache[id] = {exports:{}}; modules[id](m, m.exports, load); } return cache[id].exports; };
    ${bootstrap}
    return load(${JSON.stringify(entry)}); })()`;
}
const fakeTag = `(() => {
  let context = {};
  const send = args => {
    if (args[0] === 'set') context = {...context, ...args[1]};
    if (args[0] !== 'event' || window['ga-disable-G-TESTONLY01']) return;
    const data = new URLSearchParams({en: args[1], ...context, ...args[2]}).toString();
    fetch('https://www.google-analytics.com/g/collect?' + data, {mode:'no-cors'});
    navigator.sendBeacon('https://www.google-analytics.com/g/collect', data);
  };
  const layer = window.tsAnalyticsLayer; layer.forEach(send);
  layer.push = args => { send(args); return 0; };
})();`;

test('browser requests contain only normalized page context; consent withdrawal stops GET and beacon collection', async ({ page }) => {
  const payloads: string[] = [];
  let scripts = 0;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'analytics.fixture.test') return route.fulfill({ contentType: 'text/html', body: '<html><head><meta name="referrer" content="no-referrer"></head><body>Fixture</body></html>' });
    if (url.hostname === 'www.googletagmanager.com') {
      expect(url.searchParams.get('id')).toBe('G-TESTONLY01'); scripts++;
      return route.fulfill({ contentType: 'text/javascript', body: fakeTag });
    }
    if (url.hostname === 'www.google-analytics.com') payloads.push(url.search.slice(1) || route.request().postData() || '');
    return route.abort(); // No request leaves the fixture, including collection beacons.
  });
  await page.goto('https://analytics.fixture.test/groups/PRIVATE?token=SECRET');
  await page.addScriptTag({ content: `window.fixtureClient = ${bundle('client')}; window.fixtureProvider = ${bundle('providers/ga4')};` });
  await page.evaluate(() => {
    const w = window as any;
    w.client = w.fixtureClient.createAnalyticsClient({ enabled: true, measurementId: 'G-TESTONLY01', origin: location.origin }, w.fixtureProvider.createGa4Provider(window, document));
    w.client.initialize(); w.client.trackPageView(location.pathname, true);
  });
  expect(scripts).toBe(0);
  await page.evaluate(() => (window as any).client.setConsent('granted'));
  await expect.poll(() => payloads.length).toBe(2);
  const decoded = payloads.map(value => Object.fromEntries(new URLSearchParams(value)));
  for (const p of decoded) {
    expect(p.page_location).toBe('https://analytics.fixture.test/groups/:groupId');
    expect(p.page_title).toBe('Groups — TrackSpense');
    expect(p.en).toBe('page_view');
    expect(p.send_to).toBe('G-TESTONLY01');
  }
  expect(JSON.stringify(decoded)).not.toMatch(/PRIVATE|SECRET|token=/);
  await page.evaluate(() => {
    const client = (window as any).client;
    const operation = client.beginOperation();
    client.track('group_expense_created', { entry_method: 'receipt', expense_scope: 'group' }, operation);
    client.track('group_expense_created', { entry_method: 'receipt', expense_scope: 'group' }, operation);
    client.track('group_expense_created', { entry_method: 'receipt', expense_scope: 'group', group_id: 'PRIVATE' });
  });
  await expect.poll(() => payloads.length).toBe(4);
  const productEvents = payloads.slice(2).map(value => Object.fromEntries(new URLSearchParams(value)));
  for (const event of productEvents) {
    expect(event).toMatchObject({
      en: 'group_expense_created', entry_method: 'receipt', expense_scope: 'group', feature: 'groups',
      page_location: 'https://analytics.fixture.test/groups/:groupId',
    });
  }
  expect(JSON.stringify(productEvents)).not.toMatch(/PRIVATE|SECRET|group_id|token=/);
  await page.evaluate(() => {
    const client = (window as any).client;
    client.setConsent('denied'); client.trackPageView('/dashboard', true); client.track('logout', {});
  });
  // Await browser network-idle to include asynchronous beacons, without sending real events.
  await page.waitForLoadState('networkidle');
  expect(payloads).toHaveLength(4);
  expect(scripts).toBe(1);
});

test('browser lifecycle contains sensitive history transitions before the old tag can observe them', async ({ page }) => {
  const collections: string[] = [];
  const documents: string[] = [];
  await page.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.hostname === 'analytics.fixture.test') {
      documents.push(url.pathname);
      return route.fulfill({ contentType: 'text/html', body: '<html><head><meta name="referrer" content="no-referrer"></head><body>Fixture</body></html>' });
    }
    if (url.hostname === 'www.googletagmanager.com') {
      expect(url.searchParams.get('id')).toBe('G-TESTONLY01');
      return route.fulfill({ contentType: 'text/javascript', body: fakeTag });
    }
    if (url.hostname === 'www.google-analytics.com') collections.push(decodeURIComponent(url.search + (request.postData() || '')));
    return route.abort();
  });
  await page.goto('https://analytics.fixture.test/dashboard');
  await page.evaluate(() => { localStorage.setItem('vs_user', 'synthetic@example.test'); localStorage.setItem('vs_analytics_consent', 'granted'); });
  await page.addScriptTag({ content: `window.browserAnalytics = ${bundle('browser', "load('config').APPROVED_DESTINATIONS.production = {origin: 'https://analytics.fixture.test', measurementId: 'G-TESTONLY01'};")}; window.browserAnalytics.initializeAnalytics(); window.browserAnalytics.analytics.trackPageView(location.pathname, true);` });
  await expect.poll(() => collections.length).toBe(2);
  await page.evaluate(() => history.pushState(null, '', '/groups/join/PRIVATE?token=SECRET'));
  await page.waitForURL('**/groups/join/PRIVATE?token=SECRET');
  await page.waitForLoadState('networkidle');
  expect(documents).toEqual(['/dashboard', '/groups/join/PRIVATE']); // full document, not uncontained SPA mutation
  expect(collections).toHaveLength(2);
  expect(collections.join('')).not.toMatch(/PRIVATE|SECRET|synthetic/);
});

test('configured production bundle without an approved destination remains inert after consent', async ({ page }) => {
  const unexpected: string[] = [];
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).hostname === 'analytics.fixture.test') return route.fulfill({ contentType: 'text/html', body: '<html><body>Fixture</body></html>' });
    unexpected.push(route.request().url()); return route.abort();
  });
  await page.goto('https://analytics.fixture.test/');
  await page.addScriptTag({ content: `window.browserAnalytics = ${bundle('browser')}; window.browserAnalytics.initializeAnalytics(); window.browserAnalytics.analytics.trackPageView('/', false); window.browserAnalytics.setConsent('granted');` });
  await page.waitForLoadState('networkidle');
  expect(unexpected).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('vs_analytics_consent'))).toBe('granted');
});
