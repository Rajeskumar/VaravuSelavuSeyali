// axe-core scan of a running web app (no new dependency: uses qa/'s Playwright and loads axe-core
// from a CDN; set AXE_SRC to a local axe.min.js to run offline).
//   node scripts/quality/axe-scan.mjs [base-url]
// Public routes always; app routes too when a Playwright storage state exists
// (qa/e2e/auth/primary.json, written by the qa `setup` project) or AXE_STORAGE_STATE is set.
// Exit 1 on any serious/critical violation. Checks light and dark.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const require = createRequire(path.join(root, 'qa', 'package.json'));
const { chromium } = require('@playwright/test');

const base = process.argv[2] || 'http://localhost:3000';
const axeSrc = process.env.AXE_SRC || 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';
const state = process.env.AXE_STORAGE_STATE || path.join(root, 'qa/e2e/auth/primary.json');
const publicRoutes = ['/', '/login', '/register', '/forgot-password', '/contact'];
const appRoutes = ['/dashboard', '/expenses', '/groups', '/analysis', '/ask', '/account'];

const browser = await chromium.launch();
let failed = false;
async function scan(routes, storageState, label) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme, ...(storageState ? { storageState } : {}) });
    const page = await ctx.newPage();
    for (const r of routes) {
      await page.goto(base + r, { waitUntil: 'networkidle' });
      await page.keyboard.press('Escape');
      await page.addScriptTag(axeSrc.startsWith('http') ? { url: axeSrc } : { path: axeSrc });
      const res = await page.evaluate(async () => {
        const x = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] });
        return x.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0].target.join(' ').slice(0, 80) }));
      });
      const bad = res.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      console.log(`${label} ${scheme} ${r}: ${res.length} violations (${bad.length} serious/critical)`);
      for (const v of res) console.log(`   ${v.impact?.padEnd(8)} ${v.id} ×${v.n}  ${v.sample}`);
      if (bad.length) failed = true;
    }
    await ctx.close();
  }
}
await scan(publicRoutes, undefined, 'public');
if (existsSync(state)) await scan(appRoutes, state, 'app'); else console.log(`(no storage state at ${state} — app routes skipped)`);
await browser.close();
process.exit(failed ? 1 : 0);
