#!/usr/bin/env python3
"""Dry-run-by-default validator and planner for TrackSpense GCP observability configs (TS-OBS-001).

Validates metrics.json, dashboard.json, alerts.json, and sink-exclusions.json against the
TS-OBS-001 privacy and cardinality envelopes. Never mutates GCP resources unless explicitly
invoked with `--apply --confirm-authorized-cloud-apply` and an explicit `--project`.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

OPS_DIR = Path(__file__).resolve().parent
FORBIDDEN_LABELS = frozenset(
    {"user_id", "user_email", "email", "group_id", "request_id", "trace_id", "raw_path", "error_message", "client_version"}
)


def load_json(name: str) -> Dict[str, Any]:
    return json.loads((OPS_DIR / name).read_text(encoding="utf-8"))


def validate_configs() -> List[str]:
    errors: List[str] = []
    metrics_doc = load_json("metrics.json")
    alerts_doc = load_json("alerts.json")
    sinks_doc = load_json("sink-exclusions.json")
    dashboard_doc = load_json("dashboard.json")

    envelope = metrics_doc.get("cardinality_envelope", {})
    if envelope.get("max_active_custom_series", 999999) > 5000:
        errors.append("max_active_custom_series exceeds 5,000 envelope")
    if envelope.get("monthly_log_budget_gib", 999) > 5:
        errors.append("monthly_log_budget_gib exceeds 5 GiB envelope")

    metric_names = set()
    for m in metrics_doc.get("metrics", []):
        name = m.get("name", "")
        if not name:
            errors.append("metric missing name")
            continue
        metric_names.add(name)
        labels = set(m.get("labels", []))
        bad_labels = labels & FORBIDDEN_LABELS
        if bad_labels:
            errors.append(f"metric {name} uses forbidden high-cardinality/PII labels: {sorted(bad_labels)}")
        filt = m.get("filter", "")
        if 'jsonPayload.service="trackspense-backend"' not in filt:
            errors.append(f"metric {name} filter must scope to safe trackspense-backend JSON events")

    # Verify CLS (score) and ms durations are never combined into one distribution metric.
    if "trackspense_client_duration_ms" not in metric_names or "trackspense_client_cls_score" not in metric_names:
        errors.append("client ms duration and dimensionless CLS score must have separate metric descriptors")

    # Verify sink exclusions are strictly service-scoped to TrackSpense services.
    for ex in sinks_doc.get("exclusions", []):
        filt = ex.get("filter", "")
        if "varavu-selavu-backend" not in filt or "varavu-selavu-frontend" not in filt:
            errors.append(f"sink exclusion {ex.get('name')} must explicitly scope to TrackSpense services")

    if not alerts_doc.get("alerts"):
        errors.append("alerts.json contains no alert definitions")
    if not dashboard_doc.get("mosaicLayout", {}).get("tiles"):
        errors.append("dashboard.json contains no tiles")

    return errors


def build_plan_commands(project: str) -> List[str]:
    sinks_doc = load_json("sink-exclusions.json")
    metrics_doc = load_json("metrics.json")
    cmds: List[str] = []
    for ex in sinks_doc.get("exclusions", []):
        cmds.append(
            f"gcloud logging sinks update _Default --project={project} "
            f"--add-exclusion='name={ex['name']},description={ex['description']},filter={ex['filter']}'"
        )
    for m in metrics_doc.get("metrics", []):
        cmds.append(
            f"gcloud logging metrics create {m['name']} --project={project} "
            f"--description='{m['description']}' --log-filter='{m['filter']}'"
        )
    cmds.append(
        f"gcloud monitoring dashboards create --project={project} "
        f"--config-from-file={OPS_DIR / 'dashboard.json'}"
    )
    return cmds


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate and plan TS-OBS-001 GCP observability configs.")
    parser.add_argument("--project", default="<PROJECT_ID>", help="Target GCP project ID")
    parser.add_argument("--apply", action="store_true", help="Apply changes (requires explicit authorization flag)")
    parser.add_argument(
        "--confirm-authorized-cloud-apply",
        action="store_true",
        help="Required explicit confirmation before any non-dry-run cloud mutation",
    )
    args = parser.parse_args(argv)

    errors = validate_configs()
    if errors:
        for err in errors:
            print(f"CONFIG ERROR: {err}", file=sys.stderr)
        return 1

    cmds = build_plan_commands(args.project)
    if args.apply:
        if not args.confirm_authorized_cloud_apply or args.project == "<PROJECT_ID>":
            print(
                "REFUSED: --apply requires both --confirm-authorized-cloud-apply and an explicit --project.",
                file=sys.stderr,
            )
            return 2
        print("Authorized apply mode is intentionally gated: run the validated gcloud commands below via change control:")
        for c in cmds:
            print(f"  {c}")
        return 0

    print("DRY-RUN OK: all TS-OBS-001 observability configs passed privacy and cardinality validation.")
    print(f"Planned commands ({len(cmds)}):")
    for c in cmds:
        print(f"  {c}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
