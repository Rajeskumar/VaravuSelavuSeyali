# MCP: local testing and GCP enablement

Updated 2026-11-22 (Codex). These are operator instructions; no deployment, secret creation or production enablement was performed. MCP runs **inside the existing FastAPI backend**, at `/mcp`; there is no separate MCP service, port or stdio process.

The five review findings are fixed locally. See [implementation and rollout evidence](mcp-local-implementation.md) for the remaining real-client, staging and CI gates. Start with Claude and a dedicated test account, then test ChatGPT. Account eligibility and exact client registration details must be established in those apps.

## 1. Local prerequisites and HTTPS layout

Use the existing local PostgreSQL database, Python 3.11+, Poetry and the web app's Node/npm setup. Install Caddy and `cloudflared` if you choose the tunnel recipe below. Use local test data and a separate local signing key.

OAuth requires a canonical **HTTPS origin**, and remote clients cannot reach your machine's `localhost`. One public HTTPS tunnel can serve both the web app and API, keeping approval/login cookies on the same origin:

```text
https://YOUR-TUNNEL.trycloudflare.com
  /mcp, /oauth/*, /.well-known/*, /api/* → local backend :8080
  everything else                       → local web app :3000
```

Create `/tmp/trackspense-mcp.Caddyfile`:

```caddyfile
:8090 {
    bind 127.0.0.1
    header Referrer-Policy "no-referrer"
    @backend path /mcp /mcp/* /oauth/* /.well-known/* /api/*
    handle @backend {
        reverse_proxy 127.0.0.1:8080 {
            header_up Host {host}
        }
    }
    handle {
        reverse_proxy 127.0.0.1:3000 {
            header_up Host localhost:3000
        }
    }
}
```

Run each process in its own terminal:

```bash
caddy run --config /tmp/trackspense-mcp.Caddyfile --adapter caddyfile
```

```bash
cloudflared tunnel --url http://localhost:8090
```

Copy the HTTPS URL printed by `cloudflared`; keep that tunnel running. A new Quick Tunnel generally means a new origin: update the configuration below, restart both apps and reconnect the assistant. A named tunnel with a stable development hostname avoids that churn. Do not add Cloudflare's browser email-login gate in front of `/mcp` or OAuth endpoints: remote connector requests use TrackSpense OAuth. Quick Tunnels are development-only and do not support SSE; this v1 uses JSON responses over Streamable HTTP. If a particular client needs a persistent SSE connection, test through a suitable named tunnel instead. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) and [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## 2. Local backend configuration

From `varavu_selavu_app/`, install dependencies:

```bash
poetry install
```

Create a local P-256 key **outside the repository**, once:

```bash
umask 077
mkdir -p "$HOME/.config/trackspense"
if [ ! -f "$HOME/.config/trackspense/mcp-local.pem" ]; then
  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 \
    -out "$HOME/.config/trackspense/mcp-local.pem"
fi
```

In the backend terminal, export the following, replacing the tunnel hostname. Keep your existing local `DATABASE_URL`, `JWT_SECRET`, email and other app settings; verify that `DATABASE_URL` points to **local PostgreSQL**, not Supabase. Do not print keys into logs or commit them.

```bash
export MCP_DEV_ORIGIN='https://YOUR-TUNNEL.trycloudflare.com'
export ENVIRONMENT=local
export DEBUG=false
export MCP_ENABLED=true
export MCP_WRITES_ENABLED=true
export MCP_ISSUER="$MCP_DEV_ORIGIN"
export MCP_RESOURCE_URL="$MCP_DEV_ORIGIN/mcp"
export PUBLIC_APP_URL="$MCP_DEV_ORIGIN"
export MCP_TOKEN_SIGNING_KEY="$(cat "$HOME/.config/trackspense/mcp-local.pem")"
export MCP_PREVIOUS_VERIFY_KEYS='[]'
export MCP_CIMD_ALLOWED_HOSTS='[]'
export MCP_ALLOWED_ORIGINS="[\"$MCP_DEV_ORIGIN\"]"
export CORS_ALLOW_ORIGINS="[\"$MCP_DEV_ORIGIN\"]"
export AUTH_COOKIE_SECURE=true
export AUTH_COOKIE_SAMESITE=strict
export AUTH_COOKIE_DOMAIN=''
```

The issuer must be a root HTTPS origin with no trailing slash; the resource must be exactly that origin plus `/mcp`. Do not include `/api/v1`. `MCP_TOKEN_SIGNING_KEY` is a complete PEM value, not a file path. Browser cookies remain secure because the user accesses the HTTPS tunnel. Use this public origin for login/approval rather than mixing it with `localhost`.

### Database preparation

For an **existing Alembic-managed local database**:

```bash
poetry run alembic current
poetry run alembic upgrade head
poetry run python scripts/mcp_admin.py init
```

New revisions are `b49a6c2df803` (MCP tables/columns) and `98f3d6b1a740` (three-decimal quantities). The entire historical migration chain cannot bootstrap an empty database. If your existing dev database was created from ORM metadata and is not Alembic-managed, reconcile its baseline first; do not blindly stamp it to head.

For a **brand-new, empty local database only**, this guarded bootstrap creates the current schema, then records that baseline:

```bash
if poetry run python - <<'PY'
from sqlalchemy import inspect, text
from varavu_selavu_service.db.session import Base, engine
from varavu_selavu_service.db import models
with engine.begin() as conn:
    if inspect(conn).get_table_names(schema='trackspense'):
        raise SystemExit('Refusing bootstrap: trackspense already contains tables')
    conn.execute(text('CREATE SCHEMA IF NOT EXISTS trackspense'))
    Base.metadata.create_all(conn)
PY
then
  poetry run alembic stamp head &&
    poetry run python scripts/mcp_admin.py init
fi
```

Enable the local database write switch, then start the backend:

```bash
poetry run python scripts/mcp_admin.py global writes
poetry run uvicorn varavu_selavu_service.main:app --host 127.0.0.1 --port 8080
```

**Both** `MCP_WRITES_ENABLED=true` and the database `global writes` control are required. Changing a global control invalidates previous approval authority; verify and approve a new draft after changing it.

## 3. Local frontend and client registration

In a separate terminal, from `varavu_selavu_ui/`:

```bash
export MCP_DEV_ORIGIN='https://YOUR-TUNNEL.trycloudflare.com'
npm ci
REACT_APP_API_BASE_URL="$MCP_DEV_ORIGIN" HOST=127.0.0.1 PORT=3000 BROWSER=none npm start
```

No new frontend build flag is needed: the app discovers MCP availability from `/api/v1/config`. Sign in through the tunnel with an email-verified test account. Existing sessions without the new original-authentication/session-family claims must sign in again; approval requires authentication within the last 12 hours.

Configure the remote connector URL as:

```text
https://YOUR-TUNNEL.trycloudflare.com/mcp
```

Choose Streamable HTTP/remote MCP and OAuth if the client exposes those choices. Do not paste a first-party login token, invent a client secret, or configure a stdio command. This server supports public OAuth clients (`token_endpoint_auth_method=none`) with S256 PKCE.

Register the **actual client ID and exact HTTPS callback URI** supplied by the chosen client, in another backend terminal with the same local database configuration:

```bash
poetry run python scripts/mcp_admin.py register \
  'ACTUAL_CLIENT_ID' 'Claude local test' 'https://ACTUAL-CLIENT-CALLBACK'
```

Alternatively, if the client identifies itself using an HTTPS metadata-document URL, add only its verified hostname to `MCP_CIMD_ALLOWED_HOSTS` as a JSON array and restart the backend. Metadata fetching rejects private addresses, redirects and compressed responses. An empty list disables it.

Do not assume Claude/ChatGPT callback URLs or metadata hosts from examples. DCR is not implemented. A client that requires `/oauth/register`, confidential-client authentication, or an HTTP localhost callback will not connect with this v1 configuration; resolve that compatibility gap before deployment rather than weakening validation. The common Inspector loopback OAuth callback therefore needs an approved HTTPS callback setup to exercise this server's OAuth flow.

## 4. Manual acceptance checks

First check discovery without credentials:

```bash
curl -fsS "$MCP_DEV_ORIGIN/.well-known/oauth-authorization-server"
curl -fsS "$MCP_DEV_ORIGIN/.well-known/oauth-protected-resource/mcp"
curl -i "$MCP_DEV_ORIGIN/mcp"
```

The first two return JSON matching your tunnel origin. The last returns **401 with `WWW-Authenticate`** referencing the protected-resource metadata. A 403 `invalid_host` means the proxy is changing Host or the configured origin is wrong; HTML usually means `/mcp` went to the frontend.

Then test through the connected client:

1. Connect with read scopes; list categories/expenses and check that only your personal data is visible.
2. Connect with `expenses:create` as well. Verify one old-dated expense. Open the returned approval URL and check its immutable details.
3. Call save before approval: it must not create an expense. Approve in the browser: it must say **approved, not saved** and still create nothing.
4. Call save with the same operation ID: exactly one expense appears. Retry that save: the same outcome returns without another expense.
5. Verify a duplicate receipt: check the warning and required acknowledgment. Test a duplicate added after verification: save must request renewed approval.
6. Reject a draft, disconnect the assistant, and test sign out everywhere. A rejected draft cannot save; disconnected/revoked credentials cannot read or write.
7. Check web/mobile expense attribution and the browser management link. After a timeout, query status or retry the **same operation ID**; never create a fresh draft just to retry an unknown save.

Access tokens last at most ten minutes. Refresh families last at most **30 days total / 14 days inactive**; rotation never extends the absolute deadline. Refresh-token reuse disconnects the grant, so explicitly test the client's concurrent-refresh behavior.

If you created connections with the earlier local implementation, revoke and reconnect them before testing: changing token-lifetime code does not rewrite previously stored token deadlines.

Stop the tunnel after testing. Use `mcp_admin.py global read-only` to stop creates or `global stop` to stop all MCP authorization. These operator commands act on the database configured in that terminal.

## 5. GCP preparation and deployment

Read-only verification on 2026-11-22 confirmed:

- Project `gold-circlet-424313-r7`, region `us-central1`, backend `varavu-selavu-backend`.
- Runtime service account `varavu-selavu-seyali@gold-circlet-424313-r7.iam.gserviceaccount.com`.
- `varavu-backend-release` and `varavu-frontend-release` are enabled release-tag triggers; legacy `varavuselavuseyali` is disabled.

Use [the release pipeline](../.cloudbuild/README.md), `cloudbuild.backend.yaml` and `cloudbuild.frontend.yaml`, not the deprecated `cloudbuild.yaml`. The backend pipeline runs `migrate-db` using the new image **before** deploying the service. Frontend and backend builds run independently: wait for both. The current backend pipeline updates only `PUBLIC_APP_URL` and preserves other existing service environment settings.

### Separate production signing key

Create another P-256 PEM outside the repository; never reuse the development key or `JWT_SECRET`:

```bash
umask 077
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 \
  -out "$HOME/.config/trackspense/mcp-production.pem"
gcloud secrets create trackspense-mcp-signing-key \
  --project=gold-circlet-424313-r7 --replication-policy=automatic \
  --data-file="$HOME/.config/trackspense/mcp-production.pem"
gcloud secrets add-iam-policy-binding trackspense-mcp-signing-key \
  --project=gold-circlet-424313-r7 \
  --member=serviceAccount:varavu-selavu-seyali@gold-circlet-424313-r7.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

These are one-time creation commands. If the secret already exists, deliberately add a new version with `gcloud secrets versions add --data-file=...`; do not regenerate/replace keys during every deploy. Pin the resulting version number below (example `1`) so all instances use the same key. [Cloud Run secret configuration](https://docs.cloud.google.com/run/docs/configuring/services/secrets) documents service-account access and secret-version bindings.

### Configure the service, initially disabled

After local acceptance, provision these settings on the backend. This command changes service configuration and creates a revision; it does not deploy the uncommitted local code:

```bash
gcloud run services update varavu-selavu-backend \
  --project=gold-circlet-424313-r7 --region=us-central1 \
  --update-secrets=MCP_TOKEN_SIGNING_KEY=trackspense-mcp-signing-key:1 \
  --update-env-vars='MCP_ENABLED=false,MCP_WRITES_ENABLED=false,MCP_ISSUER=https://trackspense-api.cerebroos.com,MCP_RESOURCE_URL=https://trackspense-api.cerebroos.com/mcp,PUBLIC_APP_URL=https://expense.cerebroos.com,MCP_APPROVAL_HOURS=24,MCP_CIMD_ALLOWED_HOSTS=[],MCP_ALLOWED_ORIGINS=[],MCP_PREVIOUS_VERIFY_KEYS=[]'
```

Keep the existing DB/JWT/mail/AI secrets and cookie/CORS settings. Confirm `https://expense.cerebroos.com` is an exact allowed CORS origin, cookies are secure, and first-party login works. Extra browser-tool origins go into both the actual CORS allowlist and `MCP_ALLOWED_ORIGINS`; do not use wildcard origins. Preregistered server-to-server clients normally require no extra browser origin or metadata host. JSON array values with multiple entries need gcloud's alternate delimiter syntax, e.g. `--update-env-vars='^@^MCP_CIMD_ALLOWED_HOSTS=["host-one.example","host-two.example"]'`.

Use `--update-env-vars`/`--update-secrets` to preserve unrelated configuration; `--set-env-vars` replaces the environment configuration. See [Cloud Run environment variables](https://docs.cloud.google.com/run/docs/configuring/services/environment-variables).

Commit/release only when you choose to do so after testing. The normal release pipeline must apply both migrations and deploy both apps. Do not run the old `migrate-db` job expecting new migrations before its image has been updated. MCP being disabled does not remove the migration requirement: shared auth/expense/export code references the new schema.

### Run operator commands inside GCP

Create a separate operator Cloud Run Job using the **same immutable backend image tag as the new release**. Replace `RELEASE_SHA` below; do not point it at the currently deployed pre-MCP image. Keep the existing migration job dedicated to Alembic.

```bash
gcloud run jobs deploy trackspense-mcp-admin \
  --project=gold-circlet-424313-r7 --region=us-central1 \
  --image=gcr.io/gold-circlet-424313-r7/varavu-selavu-backend:RELEASE_SHA \
  --service-account=varavu-selavu-seyali@gold-circlet-424313-r7.iam.gserviceaccount.com \
  --command=python --args=scripts/mcp_admin.py,init \
  --set-secrets=DATABASE_URL=SUPABASE_PG_DB_URL:latest \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=60s

gcloud run jobs execute trackspense-mcp-admin \
  --project=gold-circlet-424313-r7 --region=us-central1 --wait
```

The CLI needs database access, not the MCP private signing key. The job uses the same database reachability as the existing migration job; mirror any networking overrides if your deployment changes them. [Cloud Run job execution](https://docs.cloud.google.com/run/docs/execute/jobs) supports per-execution argument overrides and `--wait`.

Register the production client and start in read-only mode:

```bash
gcloud run jobs execute trackspense-mcp-admin \
  --project=gold-circlet-424313-r7 --region=us-central1 --wait \
  --args='scripts/mcp_admin.py,register,ACTUAL_CLIENT_ID,Claude,https://ACTUAL-CLIENT-CALLBACK'
gcloud run jobs execute trackspense-mcp-admin \
  --project=gold-circlet-424313-r7 --region=us-central1 --wait \
  --args=scripts/mcp_admin.py,global,read-only
gcloud run services update varavu-selavu-backend \
  --project=gold-circlet-424313-r7 --region=us-central1 \
  --update-env-vars=MCP_ENABLED=true,MCP_WRITES_ENABLED=false
```

Use the actual production client metadata path instead if required, explicitly allowlisting its hostname. Check discovery/401 behavior on `https://trackspense-api.cerebroos.com`, then connect the client to **`https://trackspense-api.cerebroos.com/mcp`**. The `.run.app` hostname is intentionally rejected for MCP/OAuth; no new domain or Cloud Run service is required.

### Enable writes after acceptance

```bash
gcloud run services update varavu-selavu-backend \
  --project=gold-circlet-424313-r7 --region=us-central1 \
  --update-env-vars=MCP_WRITES_ENABLED=true
gcloud run jobs execute trackspense-mcp-admin \
  --project=gold-circlet-424313-r7 --region=us-central1 --wait \
  --args=scripts/mcp_admin.py,global,writes
```

Reconnect/consent with `expenses:create`: an existing read-only grant does not gain write scope automatically. Verify and approve a fresh draft after the global-control change. Browser approval remains mandatory; no configuration bypasses it.

### Operations and rollback

- Keep Cloud Run reachable by remote clients without a Google IAM browser login; application-level OAuth protects MCP. Preserve the canonical Host at ingress. Never trust arbitrary forwarded headers to determine resource/audience.
- Check application **and platform/proxy** logs before onboarding users. Application Uvicorn query redaction does not redact Cloud Run request logs. Exclude or otherwise prevent retention of OAuth authorization/callback query strings at the relevant log sinks; never log token bodies/cookies. Keep redacted application audit events for investigations.
- Run the operator job with `--args=scripts/mcp_admin.py,cleanup,--batch-size,100` for bounded maintenance; repeat until caught up and monitor lag. A sampled request-triggered sweep also runs. There is no newly configured Cloud Scheduler job.
- For an immediate shared write stop, execute the operator job with `--args=scripts/mcp_admin.py,global,read-only`. Use `global,stop` for all MCP access; use `revoke,USER_EMAIL` for one user's grants. These database controls apply across existing instances, unlike a rolling environment change.
- To unmount the feature afterward, update both environment flags to false. Keep schema/tombstones when rolling back compatible code; do not downgrade away retained financial idempotency records.
- Key rotation needs the new private secret version plus the old public PEM in `MCP_PREVIOUS_VERIFY_KEYS` for the access-token overlap window; do not print the private key into a gcloud argument.
- Before broad enablement, obtain staging quantity-migration timing, production-sized contention/load evidence and passing CI with the PostgreSQL job required. Local tests and a successful manual connection do not establish those operational properties.
