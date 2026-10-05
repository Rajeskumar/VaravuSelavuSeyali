#!/usr/bin/env node
/**
 * Fails on npm audit advisories at or above a severity, except ones listed in an allowlist.
 *
 *   npm audit --omit=dev --json | node scripts/check-audit.js --level high --allowlist audit-allowlist.json
 *
 * Why: `npm audit --audit-level=X` has no way to accept a specific advisory, so a project with
 * one unfixable advisory has to lower the threshold for everything (mobile was gated at
 * `critical`, which also let any NEW high-severity issue through). This gates at the real
 * threshold and tolerates only advisories explicitly listed, each with a reason and a
 * reviewBy date. Exit codes: 0 pass, 1 new advisory or expired allowlist entry, 2 usage error.
 */
const fs = require('fs');

const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const level = arg('level', 'high');
const allowlistPath = arg('allowlist');
if (!(level in RANK)) {
  console.error(`check-audit: unknown --level ${level}`);
  process.exit(2);
}

const allowlist = allowlistPath ? JSON.parse(fs.readFileSync(allowlistPath, 'utf8')).advisories || [] : [];
const today = new Date().toISOString().slice(0, 10);

let report;
try {
  report = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch (e) {
  console.error('check-audit: expected `npm audit --json` on stdin');
  process.exit(2);
}

// Collect the root advisories (the `via` entries that are objects), not every package in each chain.
const found = new Map();
for (const [pkg, v] of Object.entries(report.vulnerabilities || {})) {
  for (const via of v.via || []) {
    if (typeof via !== 'object') continue;
    const id = (via.url || '').split('/').pop() || String(via.source);
    if (!found.has(id)) found.set(id, { id, pkg, severity: via.severity, title: via.title, url: via.url });
  }
}

const allowed = new Map(allowlist.map((a) => [a.id, a]));
const failures = [];
const tolerated = [];
for (const adv of found.values()) {
  if (RANK[adv.severity] < RANK[level]) continue;
  const entry = allowed.get(adv.id);
  if (!entry) failures.push(`NEW ${adv.severity.toUpperCase()} ${adv.id} in ${adv.pkg}: ${adv.title} ${adv.url}`);
  else if (entry.reviewBy && entry.reviewBy < today) failures.push(`EXPIRED allowlist entry ${adv.id} (${adv.pkg}), reviewBy ${entry.reviewBy}: re-check for a patch, then renew or remove it`);
  else tolerated.push(`${adv.id} (${adv.pkg}, ${adv.severity}) until ${entry.reviewBy}`);
}

for (const entry of allowlist) {
  if (!found.has(entry.id)) console.log(`note: allowlisted ${entry.id} (${entry.package}) no longer reported, so remove it from the allowlist`);
}
for (const t of tolerated) console.log(`allowlisted: ${t}`);

if (failures.length) {
  console.error(`\ncheck-audit: ${failures.length} problem(s) at --level ${level}:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`check-audit: OK, no unlisted advisories at or above ${level}`);
