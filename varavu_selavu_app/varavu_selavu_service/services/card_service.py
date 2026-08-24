from __future__ import annotations

import uuid
from typing import Any, Dict, List, NamedTuple, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import CardCatalog, CardDataCorrection, CardEarningRule, UserCard
from varavu_selavu_service.services.analysis_service import AnalysisService
from varavu_selavu_service.services.card_rewards_engine import (
    CardRewardEstimate,
    CategoryRewardGap,
    MerchantRewardGap,
    best_card_for_category,
    compute_coach_summary,
    estimate_reward,
)
from varavu_selavu_service.services.categorization_service import VALID_CATEGORY_IDS


def _to_uuid(value: str, not_found_detail: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail=not_found_detail)


def _card_to_engine_dict(card: CardCatalog, rules: List[CardEarningRule]) -> Dict[str, Any]:
    """CardCatalog + its rules -> the plain-dict shape card_rewards_engine expects — the engine
    stays DB-agnostic (spec §13.3), so this conversion lives here, not there."""
    return {
        "card_id": str(card.id),
        "card_name": card.card_name,
        "reward_type": card.reward_type,
        "point_value_estimate_usd": float(card.point_value_estimate_usd) if card.point_value_estimate_usd is not None else None,
        "earning_rules": [
            {
                "category_id": r.category_id,
                "merchant_name": r.merchant_name,
                "multiplier": float(r.multiplier),
                "cap_amount": float(r.cap_amount) if r.cap_amount is not None else None,
                "cap_period": r.cap_period,
                "exclusions_note": r.exclusions_note,
            }
            for r in rules
        ],
    }


class CardSuggestion(NamedTuple):
    """Result of `CardService.suggest_best_card_for_purchase`.

    `estimate` is the recommended held card's dollar-comparable estimate, if any. `unpriced`
    is set only when NO held card has a dollar-comparable estimate but at least one has an
    applicable rule anyway (a points/miles card with no `point_value_estimate_usd`) — kept
    separate from `estimate` so the caller can report "earns 3x, but I can't price its points"
    instead of the misleading "none of your cards has a bonus rate" when a rule did match.
    `default_estimate` is the user's default card's own estimate for the same purchase, for a
    "vs. what you'd normally reach for" comparison — None if there's no default card or it has
    no applicable rule.
    """
    estimate: Optional[CardRewardEstimate]
    unpriced: Optional[CardRewardEstimate]
    held_card_count: int
    amount: Optional[float]
    default_estimate: Optional[CardRewardEstimate]


class CardService:
    """TS-CARD-103: card catalog search/detail + a user's held-card CRUD. Calculation logic
    (multiplier/cap/gap math) deliberately lives in CardRewardsEngine instead, per spec §13.3."""

    def __init__(self, db: Session):
        self.db = db
        self.analysis_service = AnalysisService(db)

    # ------------------------------------------------------------------
    # Catalog
    # ------------------------------------------------------------------

    def search_catalog(self, user_email: str, query: Optional[str] = None) -> List[CardCatalog]:
        # TS-CARD-112: curated cards (created_by_user_email IS NULL) plus this user's own custom
        # cards — never another user's private, self-reported card.
        q = self.db.query(CardCatalog).filter(
            CardCatalog.is_active.is_(True),
            or_(CardCatalog.created_by_user_email.is_(None), CardCatalog.created_by_user_email == user_email),
        )
        if query:
            like = f"%{query.strip()}%"
            q = q.filter(or_(CardCatalog.issuer.ilike(like), CardCatalog.card_name.ilike(like)))
        return q.order_by(CardCatalog.issuer, CardCatalog.card_name).all()

    def get_catalog_detail(self, card_id: str, require_visible_to: Optional[str] = None) -> CardCatalog:
        """`require_visible_to`: pass the requesting user's email on public/discovery paths (the
        GET /cards/catalog/{id} route) to 404 rather than leak another user's custom card by a
        guessed UUID. Omit it on paths that already proved legitimate access via an existing
        UserCard row (add/remove/set-default, coach computation) — those callers may need any
        card the user already holds, curated or their own custom one."""
        cid = _to_uuid(card_id, "Card not found")
        card = self.db.query(CardCatalog).filter(CardCatalog.id == cid).first()
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")
        if require_visible_to is not None and card.created_by_user_email not in (None, require_visible_to):
            raise HTTPException(status_code=404, detail="Card not found")
        return card

    def get_earning_rules(self, card_id: str) -> List[CardEarningRule]:
        cid = uuid.UUID(str(card_id))
        return self.db.query(CardEarningRule).filter(CardEarningRule.card_id == cid).all()

    def _get_active_catalog_card(self, card_id: str, user_email: str) -> CardCatalog:
        # require_visible_to guards against adding another user's private custom card by a
        # guessed UUID (TS-CARD-112) — curated cards remain visible to everyone as before.
        card = self.get_catalog_detail(card_id, require_visible_to=user_email)
        if not card.is_active:
            raise HTTPException(status_code=400, detail="Card is no longer offered")
        return card

    def file_correction(self, user_email: str, card_id: str, note: str) -> CardDataCorrection:
        """TS-CARD-110: crowdsourced freshness signal (spec §5 item 6) — purely a manual-review
        queue, nothing here is auto-applied back onto the catalog."""
        self.get_catalog_detail(card_id)  # 404 if the card doesn't exist
        cid = uuid.UUID(str(card_id))
        correction = CardDataCorrection(id=uuid.uuid4(), user_email=user_email, card_id=cid, note=note)
        self.db.add(correction)
        self.db.commit()
        self.db.refresh(correction)
        return correction

    # ------------------------------------------------------------------
    # Held cards
    # ------------------------------------------------------------------

    def list_user_cards(self, user_email: str) -> List[tuple]:
        """Returns (UserCard, CardCatalog) tuples — the join the route handler needs to build
        UserCardDTO without a second round trip."""
        return (
            self.db.query(UserCard, CardCatalog)
            .join(CardCatalog, CardCatalog.id == UserCard.card_id)
            .filter(UserCard.user_email == user_email)
            .order_by(UserCard.added_at)
            .all()
        )

    def add_user_card(self, user_email: str, card_id: str) -> UserCard:
        self._get_active_catalog_card(card_id, user_email)  # 404/400 if missing/inactive/not-visible
        cid = uuid.UUID(str(card_id))

        existing = (
            self.db.query(UserCard)
            .filter(UserCard.user_email == user_email, UserCard.card_id == cid)
            .first()
        )
        if existing:
            return existing

        is_first = self.db.query(UserCard).filter(UserCard.user_email == user_email).count() == 0
        user_card = UserCard(id=uuid.uuid4(), user_email=user_email, card_id=cid, is_default=is_first)
        self.db.add(user_card)
        self.db.commit()
        self.db.refresh(user_card)
        return user_card

    def create_custom_card(
        self, user_email: str, card_name: str, issuer: Optional[str], annual_fee: float,
        rules: List[Dict[str, Any]],
    ) -> Tuple[CardCatalog, UserCard]:
        """TS-CARD-112: a user-added card outside the curated catalog. Cashback-only, category-
        only for v1 (the spec follow-up's explicit scope) — each rule's category_id must be one
        of the app's real categories (VALID_CATEGORY_IDS), same set a curated card's rules use, so
        a self-reported rule can never reference a category that doesn't exist. Creates the
        catalog row and adds it to the user's held cards in one call, since a custom card only
        ever belongs to its creator (spec follow-up decision — no separate "create then add").
        No "All Purchases" fallback is required (spec follow-up decision) — some real cards
        (store-only cards) genuinely earn nothing outside their specific categories, and
        CardRewardsEngine already handles "no applicable rule" correctly."""
        for rule in rules:
            if rule["category_id"] not in VALID_CATEGORY_IDS:
                raise HTTPException(status_code=422, detail=f"Unknown category: {rule['category_id']!r}")

        card_id = uuid.uuid4()
        card = CardCatalog(
            id=card_id,
            issuer=(issuer or "").strip() or "Custom",
            card_name=card_name,
            reward_type="cashback",
            annual_fee=annual_fee,
            source_url=None,
            last_verified_at=None,
            is_active=True,
            created_by_user_email=user_email,
        )
        self.db.add(card)
        for rule in rules:
            self.db.add(CardEarningRule(
                id=uuid.uuid4(), card_id=card_id, category_id=rule["category_id"],
                multiplier=rule["multiplier"],
            ))

        is_first = self.db.query(UserCard).filter(UserCard.user_email == user_email).count() == 0
        user_card = UserCard(id=uuid.uuid4(), user_email=user_email, card_id=card_id, is_default=is_first)
        self.db.add(user_card)

        self.db.commit()
        self.db.refresh(card)
        self.db.refresh(user_card)
        return card, user_card

    def remove_user_card(self, user_email: str, user_card_id: str) -> None:
        uid = _to_uuid(user_card_id, "Held card not found")
        user_card = (
            self.db.query(UserCard)
            .filter(UserCard.id == uid, UserCard.user_email == user_email)
            .first()
        )
        if not user_card:
            raise HTTPException(status_code=404, detail="Held card not found")

        was_default = user_card.is_default
        card_id = user_card.card_id
        self.db.delete(user_card)
        self.db.flush()

        # TS-CARD-112: a custom card only ever has the one UserCard its creator made (add_user_card
        # is idempotent per (user, card_id)) — once that link is gone, garbage-collect the private
        # catalog row and its rules rather than leaving them orphaned with zero references.
        custom_card = (
            self.db.query(CardCatalog)
            .filter(CardCatalog.id == card_id, CardCatalog.created_by_user_email == user_email)
            .first()
        )
        if custom_card is not None:
            self.db.query(CardEarningRule).filter(CardEarningRule.card_id == card_id).delete()
            self.db.delete(custom_card)

        if was_default:
            # Promote the next-oldest remaining card so there's always exactly one default
            # whenever the user holds at least one card (CardRewardsEngine's "actual earned"
            # basis, spec §8.3, requires this invariant).
            next_card = (
                self.db.query(UserCard)
                .filter(UserCard.user_email == user_email)
                .order_by(UserCard.added_at)
                .first()
            )
            if next_card:
                next_card.is_default = True
        self.db.commit()

    def set_default_card(self, user_email: str, user_card_id: str) -> UserCard:
        uid = _to_uuid(user_card_id, "Held card not found")
        target = (
            self.db.query(UserCard)
            .filter(UserCard.id == uid, UserCard.user_email == user_email)
            .first()
        )
        if not target:
            raise HTTPException(status_code=404, detail="Held card not found")

        self.db.query(UserCard).filter(
            UserCard.user_email == user_email, UserCard.id != uid
        ).update({"is_default": False})
        target.is_default = True
        self.db.commit()
        self.db.refresh(target)
        return target

    # ------------------------------------------------------------------
    # TS-CARD-106: engine-ready bundles for CardRewardsEngine (batch-fetched —
    # one query per table, not N+1 per card).
    # ------------------------------------------------------------------

    def get_engine_ready_catalog(self) -> List[Dict[str, Any]]:
        """All active *curated* catalog cards + their earning rules, in card_rewards_engine's
        shape. TS-CARD-112: excludes custom cards — "optimal in catalog" is a cross-user
        aspirational comparison, and showing one user's private self-reported card to another
        would be both wrong (unverified) and a privacy leak."""
        cards = (
            self.db.query(CardCatalog)
            .filter(CardCatalog.is_active.is_(True), CardCatalog.created_by_user_email.is_(None))
            .all()
        )
        if not cards:
            return []
        rules_by_card = self._rules_by_card_id([c.id for c in cards])
        return [_card_to_engine_dict(c, rules_by_card.get(c.id, [])) for c in cards]

    def get_engine_ready_held_cards(self, user_email: str) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """Held cards in engine shape, plus the default card's id (None if the user holds no
        cards — CardRewardsEngine then has no "actual earned" baseline for this user)."""
        rows = self.list_user_cards(user_email)
        if not rows:
            return [], None
        rules_by_card = self._rules_by_card_id([catalog.id for _, catalog in rows])
        held = [_card_to_engine_dict(catalog, rules_by_card.get(catalog.id, [])) for _, catalog in rows]
        default_card_id = next((str(user_card.card_id) for user_card, _ in rows if user_card.is_default), None)
        return held, default_card_id

    def _rules_by_card_id(self, card_ids: List[uuid.UUID]) -> Dict[uuid.UUID, List[CardEarningRule]]:
        rules = self.db.query(CardEarningRule).filter(CardEarningRule.card_id.in_(card_ids)).all()
        by_card: Dict[uuid.UUID, List[CardEarningRule]] = {}
        for r in rules:
            by_card.setdefault(r.card_id, []).append(r)
        return by_card

    # ------------------------------------------------------------------
    # TS-CARD-106/109: the actual Card Coach computation — shared by the /cards/coach route
    # and the get_card_coach_summary chat tool (chat_service.py) so there's exactly one place
    # that decides scope/group-share handling, not two implementations that can drift apart.
    # ------------------------------------------------------------------

    def compute_coach_gaps(
        self,
        user_id: str,
        year: Optional[int] = None,
        month: Optional[int] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        groups_enabled: bool = False,
    ) -> Tuple[List[CategoryRewardGap], List[MerchantRewardGap], bool]:
        """Returns (category_gaps, merchant_gaps, group_share_included). TS-CARD-105: when Groups
        is enabled, the (category, merchant) buckets include the *full amount the user paid* on
        group expenses (spec §8.2) — never just their split "my share". TS-CARD-113: buckets
        (not a flat category_totals list) are what let CardRewardsEngine resolve merchant-vs-
        category rule precedence correctly per dollar."""
        buckets = self.analysis_service.compute_category_merchant_buckets(
            user_id, year=year, month=month, start_date=start_date, end_date=end_date,
            include_group_i_paid=groups_enabled,
        )
        held_cards, default_card_id = self.get_engine_ready_held_cards(user_id)
        catalog_cards = self.get_engine_ready_catalog()
        category_gaps, merchant_gaps = compute_coach_summary(buckets, held_cards, catalog_cards, default_card_id)
        return category_gaps, merchant_gaps, groups_enabled

    # ------------------------------------------------------------------
    # Phase 2: prospective "which card should I use for this purchase" — deliberately searches
    # only the user's HELD cards, never the catalog. Recommending a card the user doesn't own
    # would be an acquisition suggestion, which the spec explicitly excludes from Phase 1/2
    # pending a separate affiliate-model decision (spec §11 Open Decision #2).
    # ------------------------------------------------------------------

    def suggest_best_card_for_purchase(
        self,
        user_id: str,
        category: Optional[str],
        merchant: Optional[str] = None,
        amount: Optional[float] = None,
    ) -> CardSuggestion:
        """See `CardSuggestion` for the result shape. `amount` only sizes the displayed dollar
        estimate — ranking itself is rate-based and spend-invariant, so a nominal $100 is used
        internally when the caller doesn't supply a real (positive) amount; a non-positive amount
        is treated the same as "not supplied" rather than propagated into a nonsensical negative
        dollar estimate."""
        held_cards, default_card_id = self.get_engine_ready_held_cards(user_id)
        safe_amount = amount if amount and amount > 0 else None
        if not held_cards:
            return CardSuggestion(None, None, 0, safe_amount, None)

        spend = safe_amount or 100.0
        default_card = next((c for c in held_cards if c["card_id"] == default_card_id), None) if default_card_id else None
        default_estimate = estimate_reward(default_card, category, spend, merchant=merchant) if default_card else None

        best = best_card_for_category(held_cards, category, spend, merchant=merchant)
        if best is not None:
            return CardSuggestion(best, None, len(held_cards), safe_amount, default_estimate)

        # No held card has a dollar-comparable estimate — but a points/miles card without a
        # stored point value may still have matched a real rule. Surface that honestly instead of
        # claiming no card has a bonus rate at all.
        unpriced = next(
            (e for c in held_cards if (e := estimate_reward(c, category, spend, merchant=merchant)) is not None),
            None,
        )
        return CardSuggestion(None, unpriced, len(held_cards), safe_amount, default_estimate)
