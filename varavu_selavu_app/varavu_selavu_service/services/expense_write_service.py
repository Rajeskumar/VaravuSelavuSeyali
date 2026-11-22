"""Financial persistence without hidden commits; caller owns commit/rollback."""

from decimal import Decimal
from varavu_selavu_service.services.expense_service import ExpenseService
from varavu_selavu_service.repo.postgres_repo import PostgresRepo
from varavu_selavu_service.services.category_memory_service import CategoryMemoryService
from varavu_selavu_service.services.category_catalog import resolve


def reconcile_receipt_totals(items, total, tax=0, tip=0, discount=0, subtotal=None):
    lines = sum((Decimal(str(i["line_total"])) for i in items), Decimal("0"))
    expected = lines + Decimal(str(tax)) + Decimal(str(tip)) - Decimal(str(discount))
    return {
        "items_sum": f"{lines:.2f}",
        "expected_total": f"{expected:.2f}",
        "difference": f"{expected - Decimal(str(total)):.2f}",
        "reconciled": abs(expected - Decimal(str(total))) <= Decimal(".02")
        and (subtotal is None or abs(lines - Decimal(str(subtotal))) <= Decimal(".02")),
    }


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
        items = [
            {
                **i,
                "item_name": i["name"],
                "line_no": n,
                "category_id": resolve(i.get("category_id") or payload["category_id"])[
                    1
                ],
            }
            for n, i in enumerate(payload["items"], 1)
        ]
        header = {
            **payload,
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
