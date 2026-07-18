import uuid

from varavu_selavu_service.db.models import CanonicalMerchant, ItemInsight, MerchantInsight
from scripts.reconcile_entity_resolution import reconcile


def test_reconcile_reports_full_coverage_when_all_rows_linked(db_session):
    merchant = CanonicalMerchant(
        id=uuid.uuid4(), user_email=None, canonical_name="costco", display_name="Costco", is_global=True,
    )
    db_session.add(merchant)
    db_session.flush()
    db_session.add(
        MerchantInsight(
            id=uuid.uuid4(), user_email="test@user.com", merchant_name="Costco",
            canonical_merchant_id=merchant.id, total_spent=100,
        )
    )
    db_session.commit()

    results = reconcile(db_session)
    assert results["merchant_insights"]["row_count"] == 1
    assert results["merchant_insights"]["linked_row_count"] == 1
    assert results["merchant_insights"]["gap"] == 0
    assert results["merchant_insights"]["coverage_pct"] == 100.0


def test_reconcile_reports_gap_when_some_rows_unlinked(db_session):
    merchant = CanonicalMerchant(
        id=uuid.uuid4(), user_email=None, canonical_name="costco", display_name="Costco", is_global=True,
    )
    db_session.add(merchant)
    db_session.flush()
    db_session.add_all([
        MerchantInsight(
            id=uuid.uuid4(), user_email="test@user.com", merchant_name="Costco",
            canonical_merchant_id=merchant.id, total_spent=100,
        ),
        MerchantInsight(
            id=uuid.uuid4(), user_email="test@user.com", merchant_name="Some Other Store",
            canonical_merchant_id=None, total_spent=50,
        ),
    ])
    db_session.commit()

    results = reconcile(db_session)
    r = results["merchant_insights"]
    assert r["row_count"] == 2
    assert r["linked_row_count"] == 1
    assert r["total_spent"] == 150.0
    assert r["linked_spent"] == 100.0
    assert r["gap"] == 50.0
    assert round(r["gap_pct"], 2) == round(50 / 150 * 100, 2)


def test_reconcile_item_insights_tracked_independently(db_session):
    db_session.add(
        ItemInsight(
            id=uuid.uuid4(), user_email="test@user.com", normalized_name="milk",
            canonical_item_id=None, total_spent=10,
        )
    )
    db_session.commit()

    results = reconcile(db_session)
    assert results["item_insights"]["row_count"] == 1
    assert results["item_insights"]["linked_row_count"] == 0
    assert results["item_insights"]["gap"] == 10.0
