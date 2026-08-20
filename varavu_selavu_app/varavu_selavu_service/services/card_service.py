from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import CardCatalog, CardDataCorrection, CardEarningRule, UserCard
from varavu_selavu_service.services.analysis_service import AnalysisService
from varavu_selavu_service.services.card_rewards_engine import CategoryRewardGap, compute_coach_summary


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
                "multiplier": float(r.multiplier),
                "cap_amount": float(r.cap_amount) if r.cap_amount is not None else None,
                "cap_period": r.cap_period,
                "exclusions_note": r.exclusions_note,
            }
            for r in rules
        ],
    }


class CardService:
    """TS-CARD-103: card catalog search/detail + a user's held-card CRUD. Calculation logic
    (multiplier/cap/gap math) deliberately lives in CardRewardsEngine instead, per spec §13.3."""

    def __init__(self, db: Session):
        self.db = db
        self.analysis_service = AnalysisService(db)

    # ------------------------------------------------------------------
    # Catalog
    # ------------------------------------------------------------------

    def search_catalog(self, query: Optional[str] = None) -> List[CardCatalog]:
        q = self.db.query(CardCatalog).filter(CardCatalog.is_active.is_(True))
        if query:
            like = f"%{query.strip()}%"
            q = q.filter(or_(CardCatalog.issuer.ilike(like), CardCatalog.card_name.ilike(like)))
        return q.order_by(CardCatalog.issuer, CardCatalog.card_name).all()

    def get_catalog_detail(self, card_id: str) -> CardCatalog:
        cid = _to_uuid(card_id, "Card not found")
        card = self.db.query(CardCatalog).filter(CardCatalog.id == cid).first()
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")
        return card

    def get_earning_rules(self, card_id: str) -> List[CardEarningRule]:
        cid = uuid.UUID(str(card_id))
        return self.db.query(CardEarningRule).filter(CardEarningRule.card_id == cid).all()

    def _get_active_catalog_card(self, card_id: str) -> CardCatalog:
        card = self.get_catalog_detail(card_id)
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
        self._get_active_catalog_card(card_id)  # 404/400 if missing/inactive
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
        self.db.delete(user_card)
        self.db.flush()

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
        """All active catalog cards + their earning rules, in card_rewards_engine's shape."""
        cards = self.db.query(CardCatalog).filter(CardCatalog.is_active.is_(True)).all()
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
    ) -> Tuple[List[CategoryRewardGap], bool]:
        """Returns (per-category gaps, group_share_included). TS-CARD-105: when Groups is
        enabled, scope="i_paid" merges personal totals with the *full amount the user paid* on
        group expenses (spec §8.2) — never just their split "my share"."""
        scope = "i_paid" if groups_enabled else "personal"
        analysis = self.analysis_service.analyze(
            user_id=user_id, year=year, month=month, start_date=start_date, end_date=end_date,
            use_cache=True, scope=scope,
        )
        held_cards, default_card_id = self.get_engine_ready_held_cards(user_id)
        catalog_cards = self.get_engine_ready_catalog()
        gaps = compute_coach_summary(analysis["category_totals"], held_cards, catalog_cards, default_card_id)
        return gaps, groups_enabled
