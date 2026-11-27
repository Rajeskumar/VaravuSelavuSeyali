/**
 * TrackSpense 1,000-DAU Isolated Load-Test Scenarios (k6, TS-OBS-001 AC-10..12).
 *
 * Usage (ONLY after target_guard.py passes on an isolated local or authorized staging target):
 *   LOAD_TEST_SCENARIO=smoke|warm_20rps|headroom_50rps|spike_100rps|stress_ladder|soak_2h \
 *   LOAD_TEST_BASE_URL=http://127.0.0.1:18080 \
 *   LOAD_TEST_RUN_MARKER=ts-load-local-1 \
 *   k6 run qa/load/scenarios.js
 *
 * Credentials remain in memory via env; summary output is strictly credential-free.
 */

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const BASE_URL = (__ENV.LOAD_TEST_BASE_URL || '').replace(/\/+$/, '');
const RUN_MARKER = __ENV.LOAD_TEST_RUN_MARKER || '';
const SCENARIO = __ENV.LOAD_TEST_SCENARIO || 'smoke';
const BEARER_TOKEN = __ENV.LOAD_TEST_BEARER_TOKEN || '';

const FORBIDDEN_PATTERNS = [
  'cerebroos.com',
  'trackspense.app',
  'varavu-selavu-backend-952416556244',
  'supabase.co',
];

if (!BASE_URL || !RUN_MARKER.startsWith('ts-load-')) {
  throw new Error('Refused: LOAD_TEST_BASE_URL and LOAD_TEST_RUN_MARKER (ts-load-*) are required.');
}
for (const bad of FORBIDDEN_PATTERNS) {
  if (BASE_URL.toLowerCase().includes(bad)) {
    throw new Error('Refused: LOAD_TEST_BASE_URL matches forbidden production host.');
  }
}

const unexpectedErrors = new Rate('unexpected_errors');
const coreWritesPersisted = new Counter('core_writes_persisted');

const SCENARIOS = {
  smoke: {
    executor: 'shared-iterations',
    vus: 1,
    iterations: 5,
    maxDuration: '2m',
  },
  warm_20rps: {
    executor: 'constant-arrival-rate',
    rate: 20,
    timeUnit: '1s',
    duration: '30m',
    preAllocatedVUs: 40,
    maxVUs: 120,
  },
  headroom_50rps: {
    executor: 'constant-arrival-rate',
    rate: 50,
    timeUnit: '1s',
    duration: '30m',
    preAllocatedVUs: 100,
    maxVUs: 250,
  },
  spike_100rps: {
    executor: 'ramping-arrival-rate',
    startRate: 20,
    timeUnit: '1s',
    preAllocatedVUs: 120,
    maxVUs: 300,
    stages: [
      { target: 20, duration: '2m' },
      { target: 100, duration: '2m' },
      { target: 20, duration: '10m' },
    ],
  },
  stress_ladder: {
    executor: 'ramping-arrival-rate',
    startRate: 20,
    timeUnit: '1s',
    preAllocatedVUs: 120,
    maxVUs: 300,
    stages: [
      { target: 20, duration: '5m' },
      { target: 50, duration: '5m' },
      { target: 75, duration: '5m' },
      { target: 100, duration: '5m' },
    ],
  },
  soak_2h: {
    executor: 'constant-arrival-rate',
    rate: 20,
    timeUnit: '1s',
    duration: '2h',
    preAllocatedVUs: 40,
    maxVUs: 120,
  },
};

export const options = {
  scenarios: {
    active: SCENARIOS[SCENARIO] || SCENARIOS.smoke,
  },
  thresholds: {
    'http_req_duration{cohort:core}': ['p(95)<=1000', 'p(99)<=3000'],
    unexpected_errors: ['rate<0.005'],
    dropped_iterations: ['count==0'],
  },
};

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (BEARER_TOKEN) {
    headers.Authorization = `Bearer ${BEARER_TOKEN}`;
  }
  return headers;
}

export default function () {
  const roll = Math.random();
  const headers = authHeaders();

  if (!BEARER_TOKEN) {
    // Unauthenticated health/config smoke when no synthetic token is supplied
    const res = http.get(`${BASE_URL}/api/v1/readyz`, { tags: { cohort: 'probe' } });
    const ok = check(res, {
      'readyz 200': (r) => r.status === 200,
      'has server X-Request-ID': (r) => Boolean(r.headers['X-Request-Id'] || r.headers['X-Request-ID']),
    });
    unexpectedErrors.add(!ok);
    return;
  }

  if (roll < 0.7) {
    // 70% core reads
    const res = http.get(`${BASE_URL}/api/v1/expenses?limit=50`, {
      headers,
      tags: { cohort: 'core', op: 'expense_list' },
    });
    const ok = check(res, { 'core read 200': (r) => r.status === 200 });
    unexpectedErrors.add(res.status >= 500 || res.status === 0 || !ok);
  } else if (roll < 0.9) {
    // 20% personal writes (unique synthetic descriptions prevent duplicate collapse)
    const uniqueDesc = `${RUN_MARKER}-vu${__VU}-it${__ITER}`;
    const today = new Date().toISOString().slice(0, 10);
    const payload = JSON.stringify({
      date: today,
      description: uniqueDesc,
      category: 'Groceries',
      cost: 12.34,
      merchant_name: 'MarketOne',
    });
    const res = http.post(`${BASE_URL}/api/v1/expenses`, payload, {
      headers,
      tags: { cohort: 'core', op: 'personal_expense_create' },
    });
    const ok = check(res, { 'core write 2xx': (r) => r.status >= 200 && r.status < 300 });
    if (ok) coreWritesPersisted.add(1);
    // Never automatically replay ambiguous writes (timeout / 5xx).
    unexpectedErrors.add(res.status >= 500 || res.status === 0);
  } else {
    // 10% group list / balance reads
    const res = http.get(`${BASE_URL}/api/v1/groups`, {
      headers,
      tags: { cohort: 'core', op: 'group_list' },
    });
    const ok = check(res, { 'group read 200 or 404': (r) => r.status === 200 || r.status === 404 });
    unexpectedErrors.add(res.status >= 500 || res.status === 0 || !ok);
  }
}

export function handleSummary(data) {
  // Strictly credential-free summary report
  const summary = {
    run_marker: RUN_MARKER,
    scenario: SCENARIO,
    metrics: {
      http_reqs: data.metrics.http_reqs ? data.metrics.http_reqs.values : null,
      http_req_duration: data.metrics.http_req_duration ? data.metrics.http_req_duration.values : null,
      unexpected_errors: data.metrics.unexpected_errors ? data.metrics.unexpected_errors.values : null,
      dropped_iterations: data.metrics.dropped_iterations ? data.metrics.dropped_iterations.values : null,
      core_writes_persisted: data.metrics.core_writes_persisted ? data.metrics.core_writes_persisted.values : null,
    },
  };
  return {
    stdout: JSON.stringify(summary, null, 2) + '\n',
  };
}
