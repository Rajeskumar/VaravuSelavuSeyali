import uuid

from varavu_selavu_service.db.models import CanonicalItem, CanonicalMerchant, ItemInsight, MerchantInsight
from varavu_selavu_service.services.entity_resolution_service import EntityResolutionService
from scripts.backfill_entity_resolution import backfill_items, backfill_merchants


def test_backfill_merchants_links_exact_match(db_session):
    merchant = CanonicalMerchant(
        id=uuid.uuid4(), user_email=None, canonical_name="costco wholesale",
        display_name="Costco Wholesale", is_global=True,
    )
    db_session.add(merchant)
    row = MerchantInsight(
        id=uuid.uuid4(), user_email="test@user.com", merchant_name="Costco Wholesale",
        canonical_merchant_id=None, total_spent=100,
    )
    db_session.add(row)
    db_session.commit()

    resolver = EntityResolutionService(db_session)
    stats = backfill_merchants(db_session, resolver, batch_size=500)

    assert stats["total"] == 1
    assert stats["linked"] == 1
    db_session.refresh(row)
    assert row.canonical_merchant_id == merchant.id


def test_backfill_merchants_mints_new_canonical_when_no_match(db_session):
    row = MerchantInsight(
        id=uuid.uuid4(), user_email="test@user.com", merchant_name="Totally New Place",
        canonical_merchant_id=None, total_spent=25,
    )
    db_session.add(row)
    db_session.commit()

    resolver = EntityResolutionService(db_session)
    stats = backfill_merchants(db_session, resolver, batch_size=500)

    assert stats["total"] == 1
    assert stats["linked"] == 1
    db_session.refresh(row)
    assert row.canonical_merchant_id is not None


def test_backfill_items_skips_already_linked_rows(db_session):
    item = CanonicalItem(
        id=uuid.uuid4(), user_email=None, canonical_name="milk", display_name="Milk", is_global=True,
    )
    db_session.add(item)
    row = ItemInsight(
        id=uuid.uuid4(), user_email="test@user.com", normalized_name="milk",
        canonical_item_id=item.id, total_spent=5,
    )
    db_session.add(row)
    db_session.commit()

    resolver = EntityResolutionService(db_session)
    stats = backfill_items(db_session, resolver, batch_size=500)

    # Already-linked rows are excluded from the query entirely.
    assert stats["total"] == 0
    db_session.refresh(row)
    assert row.canonical_item_id == item.id


def test_backfill_items_batches_commits(db_session):
    rows = [
        ItemInsight(
            id=uuid.uuid4(), user_email="test@user.com", normalized_name=f"item {i}",
            canonical_item_id=None, total_spent=1,
        )
        for i in range(3)
    ]
    db_session.add_all(rows)
    db_session.commit()

    resolver = EntityResolutionService(db_session)
    stats = backfill_items(db_session, resolver, batch_size=1)

    assert stats["total"] == 3
    assert stats["linked"] == 3
    for row in rows:
        db_session.refresh(row)
        assert row.canonical_item_id is not None
