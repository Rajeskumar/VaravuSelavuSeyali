#!/usr/bin/env bash
# Dedicated iOS simulators for the E2E suite (never the developer's own devices).
#   ios-sim.sh create <name>   -> prints the new UDID (newest iOS runtime; E2E_IOS_RUNTIME / E2E_IOS_DEVICE override)
#   ios-sim.sh delete <udid>   -> shuts down and deletes it, only if it is named trackspense-e2e-*
set -euo pipefail
cmd="${1:-}"; arg="${2:-}"
case "${cmd}" in
  create)
    [ -n "${arg}" ] || { echo "name required" >&2; exit 2; }
    python3 - "$arg" <<'PY'
import json, os, subprocess, sys
name = sys.argv[1]
sim = lambda *a: subprocess.run(["xcrun", "simctl", *a], capture_output=True, text=True, check=True).stdout
runtimes = [r for r in json.loads(sim("list", "runtimes", "-j"))["runtimes"] if r.get("isAvailable") and r["name"].startswith("iOS")]
want_rt = os.environ.get("E2E_IOS_RUNTIME")
if want_rt:
    runtimes = [r for r in runtimes if want_rt in (r["identifier"], r["name"], r["version"])]
if not runtimes:
    sys.exit("no matching available iOS runtime")
rt = sorted(runtimes, key=lambda r: [int(x) for x in r["version"].split(".")])[-1]
types = {t["name"]: t["identifier"] for t in json.loads(sim("list", "devicetypes", "-j"))["devicetypes"]}
dev = os.environ.get("E2E_IOS_DEVICE", "iPhone 17 Pro")
if dev not in types:
    sys.exit(f"device type {dev!r} not available; have: {sorted(t for t in types if 'iPhone' in t)}")
print(sim("create", name, types[dev], rt["identifier"]).strip())
PY
    ;;
  delete)
    name="$(xcrun simctl list devices -j | python3 -c "
import json,sys
for rt in json.load(sys.stdin)['devices'].values():
    for d in rt:
        if d['udid']=='${arg}': print(d['name'])")"
    case "${name}" in trackspense-e2e-*) ;; *) echo "refusing to delete simulator '${name}'" >&2; exit 1 ;; esac
    xcrun simctl shutdown "${arg}" 2>/dev/null || true
    xcrun simctl delete "${arg}" ;;
  *) echo "usage: ios-sim.sh create <name> | delete <udid>" >&2; exit 2 ;;
esac
