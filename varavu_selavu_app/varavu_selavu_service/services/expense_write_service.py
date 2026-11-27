"""Financial persistence without hidden commits; caller owns commit/rollback."""

from decimal import ROUND_HALF_UP, Decimal
from varavu_selavu_service.services.expense_service import ExpenseService
from varavu_selavu_service.repo.postgres_repo import PostgresRepo
from varavu_selavu_service.services.category_memory_service import CategoryMemoryService
from varavu_selavu_service.services.category_catalog import resolve
from varavu_selavu_service.services import receipt_lines


def reconcile_receipt_totals(items, total, tax=0, tip=0, subtotal=None):
    """TS-FIX-102: paid line prices + tax + tip must match the total within 0.02 (no discount term)."""
    return receipt_lines.reconcile_totals(items, total, tax, tip, subtotal)


class ExpenseWriteService:
    def __init__(self, db):
        self.db = db

    def create_simple(
        self,
        user,
        *,
        date,
        description,
        category,
        amount,
        merchant=None,
        notes=None,
        source_connection_id=None,
        payment_method=None,
    ):
        result = ExpenseService(self.db).add_expense(
            user,
            date,
            description,
            category,
            amount,
            merchant_name=merchant,
            notes=notes,
            commit=False,
            source_connection_id=source_connection_id,
            payment_method=payment_method,
        )
        CategoryMemoryService(self.db).record(
            user, description, category, merchant, commit=False
        )
        return result["row_id"]

    def create_itemized(self, user, header, items):
        repo = PostgresRepo(self.db)
        expense_id = repo.append_expense(
            {**header, "user_email": user, "split_type": "itemized"}, commit=False
        )
        item_ids = repo.append_items(user, expense_id, items, commit=False)
        return expense_id, item_ids

    def from_verified(self, user, payload, connection_id):
        main, category = resolve(payload["category_id"])
        if payload["kind"] == "simple":
            return self.create_simple(
                user,
                date=payload["date"],
                description=payload["description"],
                category=category,
                amount=Decimal(payload["amount"]),
                merchant=payload.get("merchant"),
                notes=payload.get("notes"),
                source_connection_id=connection_id,
                payment_method=payload.get("payment_method"),
            )
        items = receipt_lines.prepare_lines([
            {
                **i,
                "item_name": i["name"],
                "line_no": n,
                "category_id": resolve(i.get("category_id") or payload["category_id"])[
                    1
                ],
            }
            for n, i in enumerate(payload["items"], 1)
        ])
        for item in items:
            # Price history reads unit_price: keep it the paid price per unit (TS-FIX-102).
            qty = Decimal(str(item.get("quantity") or 0))
            if item["discount"] and qty > 0:
                item["unit_price"] = (item["line_total"] / qty).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        header = {
            **payload,
            "discount": receipt_lines.savings_of(items),
            "amount": Decimal(payload["total"]),
            "purchased_at": payload["date"],
            "merchant_name": payload["merchant"],
            "category_name": category,
            "created_by_connection_id": connection_id,
        }
        expense_id, _ = self.create_itemized(user, header, items)
        CategoryMemoryService(self.db).record(
            user,
            payload["description"],
            category,
            payload["merchant"],
            main,
            commit=False,
        )
        return expense_id
