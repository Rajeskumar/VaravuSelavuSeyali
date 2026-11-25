// Arms ONE "backend commits, response is lost" fault on POST /api/v1/expenses through the E2E fault proxy.
// Runs in Maestro's JavaScript runtime on the host (so 127.0.0.1 is the host, on iOS and Android alike).
// PROXY_CONTROL_URL is passed in by run_flows.py. Exact path match: /api/v1/expenses/categorize is not affected.
var response = http.post(PROXY_CONTROL_URL + '/arm', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ method: 'POST', path: '/api/v1/expenses', times: 1, mode: 'drop_response' }),
});
if (!response.ok) {
  throw new Error('could not arm the save fault: HTTP ' + response.status);
}
