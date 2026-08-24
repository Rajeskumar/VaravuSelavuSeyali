"""seed card catalog

Revision ID: 609704f8daf2
Revises: 3eb188c707f9
Create Date: 2026-08-17 17:00:00.000000

TS-CARD-102: curated card catalog, per docs/features/card_coach/TrackSpense_Card_Rewards_Product_Spec.md
§5. Data-only migration — self-contained (the card list lives in this file, not a runtime JSON
asset), same pattern as fcc03f738abe_seed_merchant_dictionary.py. Sourced one card at a time from
each issuer's own public rates-and-terms page (never scraped/automated), human-reviewed before
being added here. `source_url`/`last_verified_at` on every card are what the UI surfaces per
spec §9.4 — nothing here is asserted with more confidence than the source page actually gives.

This file grows across review sessions as more cards are approved (not a single one-shot list
like the merchant dictionary was) — each addition, while unshipped, is verified locally via
`alembic downgrade -1 && alembic upgrade head` to re-seed with the larger set.

`category_id` values are the app's existing bare sub-category strings (CategorizationService.
CATEGORY_GROUPS), not "Main - Sub" — matches what Expense.category_id/AnalysisService.category_totals
actually store. "All Purchases" is the flat-rate sentinel (spec §6/§8.3).

Card-specific judgment calls (each reviewed and approved, not silently assumed) are documented
inline per card below.
"""
import uuid
from datetime import date, datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import table, column


# revision identifiers, used by Alembic.
revision: str = '609704f8daf2'
down_revision: Union[str, None] = '3eb188c707f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LAST_VERIFIED = datetime(2026, 8, 17, tzinfo=timezone.utc)

# (issuer, card_name, reward_type, points_currency_name, point_value_estimate_usd, annual_fee,
#  source_url, [ (category_id, multiplier, cap_amount, cap_period, exclusions_note), ... ])
CARDS = [
    (
        "Chase", "Chase Sapphire Preferred", "points", "Ultimate Rewards", 0.0125, 95.00,
        "https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred",
        [
            ("All Purchases", 1.0, None, None, None),
            ("Dining out", 3.0, None, None, None),
            ("Gas/fuel", 3.0, None, None, "at select top brands only, per issuer terms; EV charging also included"),
            ("Groceries", 3.0, None, None, "online grocery only (not in-store); excludes Target, Walmart, wholesale clubs. Also covers select streaming services."),
            # 5x if booked through the Chase Travel portal specifically — not modeled since booking
            # channel isn't tracked; 2x is the safe non-portal baseline that never overstates earnings.
            ("Plane", 2.0, None, None, "5x instead if booked through the Chase Travel portal — not reflected here since booking channel isn't tracked"),
            ("Hotel", 2.0, None, None, "5x instead if booked through the Chase Travel portal — not reflected here since booking channel isn't tracked"),
            ("Car", 2.0, None, None, "5x instead if booked through the Chase Travel portal — not reflected here since booking channel isn't tracked"),
            ("Bus/Train", 2.0, None, None, "5x instead if booked through the Chase Travel portal — not reflected here since booking channel isn't tracked"),
            ("Taxi", 2.0, None, None, "5x instead if booked through the Chase Travel portal — not reflected here since booking channel isn't tracked"),
            # Deliberately excluded: time-limited merchant promos (5x Lyft through 9/30/2027, 5x
            # Peloton up to $5k through 12/31/2027) — not part of the card's standing structure;
            # including them risks the catalog silently going stale past those end dates.
        ],
    ),
    (
        "U.S. Bank", "U.S. Bank Altitude Go", "points", None, 0.01, 0.00,
        "https://www.usbank.com/credit-cards/altitude-go-visa-signature-credit-card.html",
        [
            ("All Purchases", 1.0, None, None, None),
            ("Dining out", 4.0, 2000, "quarterly", "after the $2,000/quarter cap, reverts to 1x on additional dining purchases"),
            ("Groceries", 2.0, None, None, "excludes discount stores/supercenters and wholesale clubs"),
            ("Gas/fuel", 2.0, None, None, "excludes discount stores/supercenters and wholesale clubs; EV charging included"),
            # Deliberately excluded: 2x on streaming services — no matching category exists in the
            # app's taxonomy at all (not even an approximate one), so no rule is created for it
            # rather than attaching it to an unrelated category.
        ],
    ),
    (
        "Wells Fargo", "Wells Fargo Autograph Visa", "points", None, 0.01, 0.00,
        "https://www.wellsfargo.com/credit-cards/autograph-visa/terms/",
        [
            ("All Purchases", 1.0, None, None, None),
            ("Dining out", 3.0, None, None, "excludes bakeries, grocery stores, and third-party delivery services"),
            ("Gas/fuel", 3.0, None, None, "excludes auto repair, superstores, car washes, warehouse clubs, and groceries"),
            # Entertainment bonus (books, music, streaming, digital goods, movies) — split across
            # the taxonomy's closest matching sub-categories rather than one blanket rule.
            ("Movies", 3.0, None, None, "part of this card's broader entertainment bonus (also covers books, streaming, digital goods — not separately tracked since \"Other\" is ambiguous across multiple main categories in this app's taxonomy)"),
            ("Music", 3.0, None, None, "part of this card's broader entertainment bonus (also covers books, streaming, digital goods, movies)"),
            # Telecom bonus is phone-bills-only per issuer terms — narrower than the app's
            # TV/Phone/Internet category, which also covers cable/home internet (not bonused here).
            ("TV/Phone/Internet", 3.0, None, None, "landline/cell phone bills only — does not cover cable TV or home internet; excludes insurance, accessories, bundled/third-party-billed services"),
            # Local-transport bonus (ferries, parking, limousines, taxis, passenger rail, toll
            # bridges) — only the categories with a taxonomy match are included.
            ("Taxi", 3.0, None, None, "part of this card's local-transport bonus (also covers ferries, limousines, toll bridges — not separately tracked)"),
            ("Bus/Train", 3.0, None, None, "passenger railway, part of this card's local-transport bonus"),
            ("Parking", 3.0, None, None, "parking lots and garages, part of this card's local-transport bonus"),
            # Travel bonus (airlines, hotels/motels, campgrounds, timeshares, cruise lines, travel
            # agencies, vehicle/auto rentals) — only the categories with a taxonomy match are included.
            ("Plane", 3.0, None, None, "airlines, part of this card's travel bonus (also covers cruise lines, travel agencies, campgrounds, timeshares — not separately tracked)"),
            ("Hotel", 3.0, None, None, "hotels/motels, part of this card's travel bonus"),
            ("Car", 3.0, None, None, "vehicle/auto rentals, part of this card's travel bonus"),
        ],
    ),
    (
        "Wells Fargo", "Wells Fargo Autograph Journey Visa", "points", None, 0.01, 95.00,
        "https://www.wellsfargo.com/credit-cards/autograph-journey-visa/terms/",
        [
            ("All Purchases", 1.0, None, None, None),
            ("Hotel", 5.0, None, None, "dedicated hotel bonus, separate from this card's general travel bonus"),
            ("Plane", 4.0, None, None, "dedicated airline/air-carrier bonus, separate from this card's general travel bonus"),
            ("Dining out", 3.0, None, None, "excludes bakeries, grocery stores, and third-party delivery services"),
            # General travel bonus (campgrounds, timeshares, cruise lines, travel agencies, car
            # rentals) — only car rentals has a taxonomy match; the rest aren't separately tracked.
            ("Car", 3.0, None, None, "vehicle rentals, part of this card's general travel bonus (also covers campgrounds, timeshares, cruise lines, travel agencies — not separately tracked)"),
        ],
    ),
    (
        "BCU", "BCU Cash Rewards Visa Signature", "cashback", None, None, 0.00,
        "https://www.bcu.org/credit-cards/cash-rewards",
        [
            ("All Purchases", 2.0, None, None, "flat rate, no categories, per issuer's own \"no categories or guesswork\" language; requires a $5,000+ credit line — the lower-line Cash Rewards Visa Platinum tier (1.5%) is a different product, not tracked here"),
        ],
    ),
    (
        "Chase", "Chase Freedom Unlimited", "cashback", None, None, 0.00,
        "https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited",
        [
            ("All Purchases", 1.5, None, None, None),
            ("Dining out", 3.0, None, None, "includes takeout and eligible delivery services"),
            # Deliberately excluded: 3% on drugstore purchases — no matching category exists in
            # the app's taxonomy at all; "Medical expenses" would overstate non-medical drugstore
            # items (snacks, toiletries). 5% Chase Travel portal bonus also excluded — same
            # booking-channel problem as Sapphire Preferred, but here non-portal travel just earns
            # the flat 1.5% baseline already covered by "All Purchases," so no extra rule needed.
        ],
    ),
    (
        "Capital One", "Capital One Quicksilver", "cashback", None, None, 0.00,
        "https://www.capitalone.com/credit-cards/quicksilver/",
        [
            ("All Purchases", 1.5, None, None, None),
            # Deliberately excluded: 5% via Capital One Travel (hotels/rental cars/vacation
            # rentals/activities) and 5% via Capital One Entertainment — both require booking
            # through Capital One's own platforms specifically, not a detectable merchant
            # category. Non-portal spend in those areas already earns the flat 1.5% baseline.
        ],
    ),
    (
        "Apple", "Apple Card", "cashback", None, None, 0.00,
        "https://www.apple.com/apple-card/",
        [
            # Real card structure is payment-method-based (2% Apple Pay / 1% physical card) and
            # merchant-specific (3% at Apple, 3% at select named partners), neither of which this
            # category-based schema can represent until merchant-specific rules exist (tracked
            # separately). Approximated per explicit review: 2% used as the flat baseline (Apple
            # Pay is the card's primary/encouraged usage — overstates for physical-card users, who
            # actually earn only 1%), and "Electronics" as the closest category proxy for
            # purchases at Apple (also catches non-Apple electronics merchants, which don't
            # actually get 3%; doesn't cover Apple services like App Store/iCloud, which do).
            ("All Purchases", 2.0, None, None, "Apple Pay rate used as baseline; physical (titanium) card swipes actually earn only 1% — no payment-method dimension in this schema yet"),
            ("Electronics", 3.0, None, None, "proxy for \"purchases at Apple\" — also applies to non-Apple electronics merchants (overstates), and excludes Apple services like App Store/iCloud (understates)"),
        ],
    ),
]


def upgrade() -> None:
    card_catalog = table(
        'card_catalog',
        column('id', postgresql.UUID(as_uuid=True)),
        column('issuer', sa.String),
        column('card_name', sa.String),
        column('reward_type', sa.String),
        column('points_currency_name', sa.String),
        column('point_value_estimate_usd', sa.Numeric),
        column('annual_fee', sa.Numeric),
        column('source_url', sa.String),
        column('last_verified_at', sa.DateTime(timezone=True)),
        column('is_active', sa.Boolean),
        schema='trackspense',
    )
    card_earning_rules = table(
        'card_earning_rules',
        column('id', postgresql.UUID(as_uuid=True)),
        column('card_id', postgresql.UUID(as_uuid=True)),
        column('category_id', sa.String),
        column('multiplier', sa.Numeric),
        column('cap_amount', sa.Numeric),
        column('cap_period', sa.String),
        column('exclusions_note', sa.Text),
        schema='trackspense',
    )

    card_rows = []
    rule_rows = []
    for issuer, card_name, reward_type, points_currency_name, point_value_estimate_usd, annual_fee, source_url, rules in CARDS:
        # Deterministic (not random) so re-running upgrade after a downgrade during this file's
        # own iterative review process reproduces the same card_id, not a new one each time.
        card_id = uuid.uuid5(uuid.NAMESPACE_URL, source_url)
        card_rows.append({
            'id': card_id, 'issuer': issuer, 'card_name': card_name, 'reward_type': reward_type,
            'points_currency_name': points_currency_name, 'point_value_estimate_usd': point_value_estimate_usd,
            'annual_fee': annual_fee, 'source_url': source_url, 'last_verified_at': LAST_VERIFIED,
            'is_active': True,
        })
        for category_id, multiplier, cap_amount, cap_period, exclusions_note in rules:
            rule_rows.append({
                'id': uuid.uuid5(card_id, category_id), 'card_id': card_id, 'category_id': category_id,
                'multiplier': multiplier, 'cap_amount': cap_amount, 'cap_period': cap_period,
                'exclusions_note': exclusions_note,
            })

    op.bulk_insert(card_catalog, card_rows, multiinsert=False)
    op.bulk_insert(card_earning_rules, rule_rows, multiinsert=False)


def downgrade() -> None:
    source_urls = [c[6] for c in CARDS]
    placeholders = ", ".join(f"'{u}'" for u in source_urls)
    op.execute(
        f"DELETE FROM trackspense.card_earning_rules WHERE card_id IN "
        f"(SELECT id FROM trackspense.card_catalog WHERE source_url IN ({placeholders}))"
    )
    op.execute(f"DELETE FROM trackspense.card_catalog WHERE source_url IN ({placeholders})")
