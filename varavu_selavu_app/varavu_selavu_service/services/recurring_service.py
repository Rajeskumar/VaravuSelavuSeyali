from __future__ import annotations

from typing import List, Dict, Optional
from datetime import date as date_type, datetime, timedelta
import uuid

from sqlalchemy.orm import Session
from varavu_selavu_service.db.models import RecurringTemplate

def _last_day_of_month(y: int, m0: int) -> int:
    next_month_year = y + 1 if m0 == 11 else y
    next_month = 1 if m0 == 11 else m0 + 2  # convert to 1-12 next month
    first_of_next = datetime(next_month_year, next_month, 1)
    return (first_of_next - timedelta(days=1)).day


class RecurringService:
    def __init__(self, db: Session):
        self.db = db

    def list_templates(self, user_id: str) -> List[Dict]:
        rows = self.db.query(RecurringTemplate).filter(RecurringTemplate.user_email == user_id).order_by(RecurringTemplate.created_at.asc()).all()
        out: List[Dict] = []
        for r in rows:
            st_iso = r.start_date.strftime("%Y-%m-%d") if r.start_date else None
            lp_iso = r.last_processed_date.strftime("%Y-%m-%d") if r.last_processed_date else None
            out.append({
                "id": str(r.id),
                "description": r.description,
                "category": r.category,
                "day_of_month": int(r.day_of_month),
                "default_cost": float(r.default_cost),
                "start_date_iso": st_iso or datetime.utcnow().strftime("%Y-%m-%d"),
                "last_processed_iso": lp_iso,
                "status": r.status if r.status else "Active",
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
        start_date_parsed = datetime.strptime(start_val, "%Y-%m-%d").date()
        
        tpl = self.db.query(RecurringTemplate).filter(
            RecurringTemplate.user_email == user_id, 
            RecurringTemplate.description == description, 
            RecurringTemplate.category == category
        ).first()

        if tpl:
            tpl.day_of_month = day_of_month
            tpl.default_cost = default_cost
            tpl.start_date = start_date_parsed
            tpl.status = status
            tpl_id = str(tpl.id)
        else:
            tpl_id_uuid = uuid.uuid4()
            tpl = RecurringTemplate(
                id=tpl_id_uuid,
                user_email=user_id,
                description=description,
                category=category,
                day_of_month=day_of_month,
                default_cost=default_cost,
                start_date=start_date_parsed,
                status=status
            )
            self.db.add(tpl)
            tpl_id = str(tpl_id_uuid)
            
        self.db.commit()

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
        
        for tid, update_dt in latest.items():
            parsed_dt = datetime.strptime(update_dt, "%Y-%m-%d").date()
            tpl = self.db.query(RecurringTemplate).filter(RecurringTemplate.id == tid, RecurringTemplate.user_email == user_id).first()
            if tpl:
                tpl.last_processed_date = parsed_dt
        self.db.commit()

    def delete_template(self, user_id: str, template_id: str) -> bool:
        tpl = self.db.query(RecurringTemplate).filter(RecurringTemplate.id == template_id, RecurringTemplate.user_email == user_id).first()
        if tpl:
            self.db.delete(tpl)
            self.db.commit()
            return True
        return False
