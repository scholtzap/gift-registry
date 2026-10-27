import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

// Literal loopback only; no DNS, external target, or external redirects.
const base = __ENV.BASE_URL || 'http://127.0.0.1:3000';
if (base !== 'http://127.0.0.1:3000') {
  throw new Error('Smoke target must be literal loopback port 3000');
}

export const options = {
  scenarios: { smoke: { executor: 'shared-iterations', vus: 1, iterations: 10, maxDuration: '30s' } },
  maxRedirects: 0,
  discardResponseBodies: true,
  thresholds: { checks: ['rate==1'], http_req_failed: ['rate==0'] },
};

export default function () {
  // Bound the script even if a caller overrides k6's scenario options.
  if (__VU > 1 || exec.scenario.iterationInTest >= 10) {
    exec.test.abort('Smoke is capped at one VU and ten total iterations');
    return;
  }
  const response = http.get(`${base}/health`, { timeout: '2s', redirects: 0 });
  check(response, { 'health and RLS gate return 200': (r) => r.status === 200 });
  sleep(0.2);
}
