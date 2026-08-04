"""P2-5: "Export all my expenses" for the personal ledger.

The per-group export (GroupExportService) already existed; this is its personal
counterpart. Both route every cell through the same formula-injection guard.
"""

import csv
import io
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from varavu_selavu_service.core.csv_safety import sanitize_csv_row
from varavu_selavu_service.services.expense_service import ExpenseService


class PersonalExportService:
    def __init__(self, db: Session):
        self.db = db
        self.expense_service = ExpenseService(db)

    def export_csv(
        self,
        user_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> str:
        """CSV of the caller's personal (non-group) expenses, newest first.

        `start_date`/`end_date` are inclusive MM/DD/YYYY bounds; omitting both
        exports everything.
        """
        rows = self.expense_service.get_expenses_for_user(user_id)

        def parse(value: str) -> Optional[datetime]:
            try:
                return datetime.strptime(value, "%m/%d/%Y")
            except (TypeError, ValueError):
                return None

        start = parse(start_date) if start_date else None
        end = parse(end_date) if end_date else None
        if start or end:
            filtered = []
            for row in rows:
                dt = parse(row.get("date", ""))
                if dt is None:
                    continue
                if start and dt < start:
                    continue
                if end and dt > end:
                    continue
                filtered.append(row)
            rows = filtered

        rows.sort(key=lambda r: parse(r.get("date", "")) or datetime.min, reverse=True)

        buf = io.StringIO()
        writer = csv.writer(buf)

        def write_row(row):
            writer.writerow(sanitize_csv_row(row))

        write_row(["date", "description", "category", "merchant", "amount", "item_count"])
        for r in rows:
            write_row([
                r.get("date", ""),
                r.get("description", ""),
                r.get("category", ""),
                r.get("merchant_name") or "",
                float(r.get("cost") or 0),
                r.get("item_count", 0),
            ])

        # UTF-8 BOM so Excel-on-Windows opens it without mangling non-ASCII text,
        # matching the group export.
        return "﻿" + buf.getvalue()
