from __future__ import annotations

from typing import List, Dict, Optional
from datetime import date as date_type, datetime, timedelta
import uuid

import psycopg2
from varavu_selavu_service.db.postgres import get_db_cursor


def _last_day_of_month(y: int, m0: int) -> int:
    """Return the last day-of-month for year y and zero-based month m0 (0=Jan)."""
    next_month_year = y + 1 if m0 == 11 else y
    next_month = 1 if m0 == 11 else m0 + 2  # convert to 1-12 next month
    first_of_next = datetime(next_month_year, next_month, 1)
    return (first_of_next - timedelta(days=1)).day


class RecurringService:
    def __init__(self):
        pass

    def list_templates(self, user_id: str) -> List[Dict]:
        with get_db_cursor() as cur:
            cur.execute(
                """
                SELECT id as template_id, description, category, day_of_month,
                       default_cost, start_date, last_processed_date, status
                FROM trackspense.recurring_templates
                WHERE user_email = %s
                ORDER BY created_at ASC
                """,
                (user_id,)
            )
            rows = cur.fetchall()
        out: List[Dict] = []
        for r in rows:
            raw_stat = r["status"]
            st_iso = r["start_date"].strftime("%Y-%m-%d") if r["start_date"] else None
            lp_iso = r["last_processed_date"].strftime("%Y-%m-%d") if r["last_processed_date"] else None
            out.append({
                "id": str(r["template_id"]),
                "description": r["description"],
                "category": r["category"],
                "day_of_month": int(r["day_of_month"]),
                "default_cost": float(r["default_cost"]),
                "start_date_iso": st_iso or datetime.utcnow().strftime("%Y-%m-%d"),
                "last_processed_iso": lp_iso,
                "status": raw_stat if raw_stat else "Active",
            })
        return out

    def upsert_template(
        self,
        user_id: str,
        description: str,
        category: str,
        day_of_month: int,
        default_cost: float,
        start_date_iso: Optional[str] = None,
        status: str = "Active",
    ) -> Dict:
        start_val = start_date_iso or datetime.utcnow().strftime("%Y-%m-%d")
        
        with get_db_cursor(commit=True) as cur:
            # Find existing by description and category manually since conflict isn't strict
            cur.execute(
                """
                SELECT id FROM trackspense.recurring_templates
                WHERE user_email = %s AND description = %s AND category = %s
                LIMIT 1
                """,
                (user_id, description, category)
            )
            row = cur.fetchone()
            
            if row:
                tpl_id = str(row["id"])
                cur.execute(
                    """
                    UPDATE trackspense.recurring_templates
                    SET day_of_month = %s, default_cost = %s, start_date = %s, status = %s
                    WHERE id = %s
                    """,
                    (day_of_month, default_cost, start_val, status, tpl_id)
                )
            else:
                tpl_id = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO trackspense.recurring_templates
                    (id, user_email, description, category, day_of_month, default_cost, start_date, status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (tpl_id, user_id, description, category, day_of_month, default_cost, start_val, status)
                )
        return {
            "id": tpl_id,
            "description": description,
            "category": category,
            "day_of_month": day_of_month,
            "default_cost": default_cost,
            "start_date_iso": start_val,
            "status": status,
        }

    def compute_due(self, user_id: str, as_of_iso: Optional[str] = None) -> List[Dict]:
        as_of = datetime.strptime(as_of_iso, "%Y-%m-%d") if as_of_iso else datetime.utcnow()
        aY, aM, aD = as_of.year, as_of.month - 1, as_of.day
        a_ms = datetime(aY, aM + 1, aD).timestamp()
        due: List[Dict] = []
        for tpl in self.list_templates(user_id):
            if tpl.get("status") == "Paused":
                continue
            start = datetime.strptime(tpl["last_processed_iso"], "%Y-%m-%d") if tpl.get("last_processed_iso") else datetime.strptime(tpl["start_date_iso"], "%Y-%m-%d")
            y, m0 = start.year, start.month - 1
            if tpl.get("last_processed_iso"):
                m0 += 1
                if m0 > 11:
                    m0 = 0
                    y += 1
            while (y < aY) or (y == aY and m0 <= aM):
                dom = min(int(tpl["day_of_month"]), _last_day_of_month(y, m0))
                d = datetime(y, m0 + 1, dom)
                if d.timestamp() <= a_ms:
                    due.append({
                        "template_id": tpl["id"],
                        "date_iso": d.strftime("%Y-%m-%d"),
                        "description": tpl["description"],
                        "category": tpl["category"],
                        "suggested_cost": tpl["default_cost"],
                    })
                m0 += 1
                if m0 > 11:
                    m0 = 0
                    y += 1
        return sorted(due, key=lambda x: x["date_iso"])

    def mark_processed(self, user_id: str, items: List[Dict[str, str]]) -> None:
        latest: Dict[str, str] = {}
        for it in items:
            tid = it["template_id"]
            dt = it["date_iso"]
            if (tid not in latest) or latest[tid] < dt:
                latest[tid] = dt
        
        with get_db_cursor(commit=True) as cur:
            for tid, update_dt in latest.items():
                cur.execute(
                    """
                    UPDATE trackspense.recurring_templates
                    SET last_processed_date = %s
                    WHERE id = %s AND user_email = %s
                    """,
                    (update_dt, tid, user_id)
                )

    def delete_template(self, user_id: str, template_id: str) -> bool:
        with get_db_cursor(commit=True) as cur:
            cur.execute(
                """
                DELETE FROM trackspense.recurring_templates
                WHERE id = %s AND user_email = %s
                """,
                (template_id, user_id)
            )
            return cur.rowcount > 0
