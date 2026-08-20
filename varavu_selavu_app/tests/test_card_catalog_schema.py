"""TS-CARD-101 — schema-level smoke tests for the Card Coach tables.

No API exists yet (that's TS-CARD-103/106) — this just proves the ORM models,
FKs, and cascade-delete behavior are wired correctly.
"""
import uuid
from datetime import datetime, timezone

from varavu_selavu_service.db.models import (
    User,
    CardCatalog,
    CardEarningRule,
    UserCard,
    CardDataCorrection,
)


def _make_user(db_session, email="card-schema-test@user.com"):
    user = User(id=uuid.uuid4(), email=email, password_hash="x")
    db_session.add(user)
    db_session.commit()
    return user


def test_card_catalog_and_earning_rules_round_trip(db_session):
    card = CardCatalog(
        id=uuid.uuid4(),
        issuer="Chase",
        card_name="Chase Sapphire Preferred",
        reward_type="points",
        points_currency_name="Ultimate Rewards",
        point_value_estimate_usd=0.0125,
        annual_fee=95.00,
        source_url="https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred",
        last_verified_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
        is_active=True,
    )
    db_session.add(card)
    db_session.commit()

    flat_rule = CardEarningRule(id=uuid.uuid4(), card_id=card.id, category_id="All Purchases", multiplier=1.0)
    dining_rule = CardEarningRule(
        id=uuid.uuid4(),
        card_id=card.id,
        category_id="Food & Drink - Dining out",
        multiplier=3.0,
        cap_amount=None,
        cap_period=None,
        exclusions_note=None,
    )
    db_session.add_all([flat_rule, dining_rule])
    db_session.commit()

    rules = db_session.query(CardEarningRule).filter(CardEarningRule.card_id == card.id).all()
    assert {r.category_id for r in rules} == {"All Purchases", "Food & Drink - Dining out"}
    assert float(next(r for r in rules if r.category_id == "Food & Drink - Dining out").multiplier) == 3.0


def test_earning_rules_cascade_delete_with_card(db_session):
    card = CardCatalog(
        id=uuid.uuid4(),
        issuer="Amex",
        card_name="Blue Cash Preferred",
        reward_type="cashback",
        annual_fee=95.00,
        source_url="https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/",
        last_verified_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
        is_active=True,
    )
    db_session.add(card)
    db_session.commit()
    rule = CardEarningRule(id=uuid.uuid4(), card_id=card.id, category_id="Food & Drink - Groceries", multiplier=6.0, cap_amount=6000, cap_period="annual")
    db_session.add(rule)
    db_session.commit()

    db_session.delete(card)
    db_session.commit()

    assert db_session.query(CardEarningRule).filter(CardEarningRule.card_id == card.id).count() == 0


def test_user_card_and_correction_round_trip(db_session):
    user = _make_user(db_session)
    card = CardCatalog(
        id=uuid.uuid4(),
        issuer="Citi",
        card_name="Citi Double Cash",
        reward_type="cashback",
        annual_fee=0,
        source_url="https://www.citi.com/credit-cards/citi-double-cash-credit-card",
        last_verified_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
        is_active=True,
    )
    db_session.add(card)
    db_session.commit()

    user_card = UserCard(id=uuid.uuid4(), user_email=user.email, card_id=card.id)
    correction = CardDataCorrection(
        id=uuid.uuid4(),
        user_email=user.email,
        card_id=card.id,
        note="Multiplier for dining looks outdated — issuer site now shows 4x, not 3x.",
    )
    db_session.add_all([user_card, correction])
    db_session.commit()

    stored_card = db_session.query(UserCard).filter(UserCard.user_email == user.email).one()
    assert stored_card.card_id == card.id

    stored_correction = db_session.query(CardDataCorrection).filter(CardDataCorrection.user_email == user.email).one()
    assert stored_correction.status == "open"


def test_user_cards_cascade_delete_with_user(db_session):
    user = _make_user(db_session, email="card-schema-cascade@user.com")
    card = CardCatalog(
        id=uuid.uuid4(),
        issuer="Discover",
        card_name="Discover it Cash Back",
        reward_type="cashback",
        annual_fee=0,
        source_url="https://www.discover.com/credit-cards/cash-back/it-card.html",
        last_verified_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
        is_active=True,
    )
    db_session.add(card)
    db_session.commit()
    user_card = UserCard(id=uuid.uuid4(), user_email=user.email, card_id=card.id)
    db_session.add(user_card)
    db_session.commit()

    db_session.delete(user)
    db_session.commit()

    assert db_session.query(UserCard).filter(UserCard.card_id == card.id).count() == 0
