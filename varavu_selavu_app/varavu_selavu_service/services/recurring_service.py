from __future__ import annotations

from typing import List, Dict, Optional
from datetime import date as date_type, datetime, timedelta

from varavu_selavu_service.db.google_sheets import GoogleSheetsClient  # type: ignore
from varavu_selavu_service.core.config import Settings
import psycopg2
import uuid

settings = Settings()

if settings.USE_POSTGRES:
    from varavu_selavu_service.db.postgres import get_db_cursor


def _last_day_of_month(y: int, m0: int) -> int:
    """Return the last day-of-month for year y and zero-based month m0 (0=Jan)."""
    next_month_year = y + 1 if m0 == 11 else y
    next_month = 1 if m0 == 11 else m0 + 2  # convert to 1-12 next month
    first_of_next = datetime(next_month_year, next_month, 1)
    return (first_of_next - timedelta(days=1)).day


class RecurringService:
    def __init__(self, gs_client: Optional[GoogleSheetsClient] = None):
        if settings.USE_POSTGRES:
            self.gs = None
            self.ws = None
        else:
            self.gs = gs_client or GoogleSheetsClient()
            self.ws = self.gs.recurring_sheet()

    def _load_records(self) -> List[Dict]:
        return self.ws.get_all_records()

    def list_templates(self, user_id: str) -> List[Dict]:
        if settings.USE_POSTGRES:
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

        rows = self._load_records()
        out: List[Dict] = []
        for row_idx, row in enumerate(rows, start=2):
            if row.get("user_id") != user_id:
                continue
            raw_status = str(row.get("status") or "").strip().title()
            out.append({
                "id": row.get("template_id") or f"r_{row_idx}",
                "description": row.get("description", ""),
                "category": row.get("category", ""),
                "day_of_month": int(row.get("day_of_month", 1) or 1),
                "default_cost": float(row.get("default_cost", 0) or 0),
                "start_date_iso": str(row.get("start_date_iso") or datetime.utcnow().strftime("%Y-%m-%d")),
                "last_processed_iso": row.get("last_processed_iso") or None,
                "status": raw_status if raw_status else "Active",
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
        
        if settings.USE_POSTGRES:
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
            
        rows = self._load_records()
        # Find existing by (user_id, description, category)
        target_row_idx: Optional[int] = None
        for idx, row in enumerate(rows, start=2):
            if row.get("user_id") == user_id and row.get("description") == description and row.get("category") == category:
                target_row_idx = idx
                break
        start_val = start_date_iso or datetime.utcnow().strftime("%Y-%m-%d")
        if target_row_idx:
            values = [[user_id, description, category, day_of_month, default_cost, start_val, rows[target_row_idx-2].get("last_processed_iso"), rows[target_row_idx-2].get("template_id"), status]]
            self.ws.update(f"A{target_row_idx}:I{target_row_idx}", values)
            tpl_id = rows[target_row_idx-2].get("template_id") or f"r_{target_row_idx}"
        else:
            tpl_id = f"recur_{int(datetime.utcnow().timestamp())}"
            self.ws.append_row([user_id, description, category, day_of_month, default_cost, start_val, "", tpl_id, status])
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
        if settings.USE_POSTGRES:
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
            return

        rows = self._load_records()
        # Build map of template_id -> latest date
        latest: Dict[str, str] = {}
        for it in items:
            tid = it["template_id"]
            dt = it["date_iso"]
            if (tid not in latest) or latest[tid] < dt:
                latest[tid] = dt
        # Update rows
        for idx, row in enumerate(rows, start=2):
            if row.get("user_id") != user_id:
                continue
            tid = row.get("template_id")
            if not tid or tid not in latest:
                continue
            values = [[row.get("user_id"), row.get("description"), row.get("category"), row.get("day_of_month"), row.get("default_cost"), row.get("start_date_iso"), latest[tid], tid, row.get("status", "Active")]]
            self.ws.update(f"A{idx}:I{idx}", values)

    def delete_template(self, user_id: str, template_id: str) -> bool:
        if settings.USE_POSTGRES:
            with get_db_cursor(commit=True) as cur:
                cur.execute(
                    """
                    DELETE FROM trackspense.recurring_templates
                    WHERE id = %s AND user_email = %s
                    """,
                    (template_id, user_id)
                )
                return cur.rowcount > 0

        rows = self._load_records()
        for idx, row in enumerate(rows, start=2):
            if row.get("user_id") == user_id and row.get("template_id") == template_id:
                # Delete the row from the sheet
                self.ws.delete_rows(idx)
                return True
        return False
