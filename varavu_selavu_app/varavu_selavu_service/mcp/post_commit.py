"""Derived insights run after commit using a fresh session; never change save outcome."""

import logging
from varavu_selavu_service.db.session import SessionLocal
from varavu_selavu_service.mcp.reads import owned
from varavu_selavu_service.repo.postgres_repo import PostgresRepo
from varavu_selavu_service.services.analysis_service import AnalysisService
from varavu_selavu_service.services.insights_aggregation_service import (
    InsightsAggregationService,
)


def update_insights(email, expense_id):
    try:
        with SessionLocal() as db:
            AnalysisService(db).invalidate_cache()
            row = owned(db, email, expense_id)
            aggregation = InsightsAggregationService(db)
            if row.split_type == "itemized":
                aggregation.on_expense_with_items_created(
                    user_email=email,
                    expense_id=expense_id,
                    merchant_name=row.merchant_name,
                    purchased_at=row.purchased_at,
                    items=PostgresRepo(db).get_items_for_expense(expense_id),
                    total_amount=row.amount,
                )
            else:
                aggregation.on_simple_expense_created(
                    user_email=email,
                    merchant_name=row.merchant_name,
                    purchased_at=row.purchased_at,
                    amount=row.amount,
                )
    except Exception:
        logging.getLogger(__name__).warning(
            "MCP post-commit insight update failed; expense_id=%s", expense_id
        )
