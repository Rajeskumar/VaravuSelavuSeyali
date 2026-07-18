"""
EntityResolutionService
========================
TS-ENT-102/103: normalizes raw merchant/item strings and resolves them to a
canonical entity via the confidence-gated cascade in
docs/features/smart_entity/TrackSpense_Smart_Entity_Resolution_Spec.md §6.

Tiers 1/2/3/5 mutate the DB as part of resolving (link + write an alias, or
create a brand-new canonical entity) — this mirrors the spec's own per-tier
"Action" column, which says e.g. tier 3 "Link silently + write alias". Tier 4
("suggested") deliberately writes nothing; a bad fuzzy guess must never
silently corrupt data, so ambiguous matches wait for an explicit confirm
(P1 — no confirm endpoint exists yet in this phase, so a "suggested" result
today just stays unresolved until that ships).
"""
from __future__ import annotations

import re
import uuid
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional, Type, Union

from sqlalchemy import func, or_
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import CanonicalMerchant, CanonicalItem, EntityAlias

logger = logging.getLogger("varavu_selavu.entity_resolution")

EntityType = Literal["merchant", "item"]
ResolveStatus = Literal["linked", "suggested", "new"]

# Tunable per spec §6.2 — plain module constants for P0 rather than a config
# table; there are only two thresholds and a top-N, not worth a schema for.
RESOLVE_HIGH = 0.85
RESOLVE_LOW = 0.55
RESOLVE_TOPN = 20

# Looser than RESOLVE_LOW — typeahead wants to surface plausible options
# while the user is still typing (a 2-3 char query has low trigram overlap
# against a long canonical_name almost by construction), and picking a
# suggestion is itself the confirmation (spec §8.2). Combined with a prefix
# match so exact-start-of-string typing always surfaces its target too.
SUGGEST_MIN_SIMILARITY = 0.3
SUGGEST_TOPN = 20

_MODEL_BY_TYPE: Dict[str, Type[Union[CanonicalMerchant, CanonicalItem]]] = {
    "merchant": CanonicalMerchant,
    "item": CanonicalItem,
}

# Spec §6.1's own examples, kept intentionally small — grows primarily via the
# seed dictionary (TS-ENT-104) and user data, not by expanding this map.
_ABBREVIATIONS: Dict[str, str] = {
    "gv": "great value",
    "whlsl": "wholesale",
    "whse": "wholesale",
}

_PERCENT_RE = re.compile(r"(\d+)\s*%")
_PUNCT_RE = re.compile(r"[^\w\s]")
_WS_RE = re.compile(r"\s+")
_PLURAL_ES_RE = re.compile(r"(s|x|z|ch|sh)es$")


@dataclass
class Candidate:
    id: str
    display_name: str
    score: float
    category_id: Optional[str] = None


@dataclass
class CanonicalRef:
    id: str
    display_name: str
    category_id: Optional[str] = None


@dataclass
class ResolutionResult:
    status: ResolveStatus
    canonical: Optional[CanonicalRef]
    candidates: List[Candidate] = field(default_factory=list)


class EntityResolutionService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # Normalization (pure, no DB) — spec §6.1
    # ------------------------------------------------------------------
    def normalize(self, raw: Optional[str], entity_type: Optional[EntityType] = None) -> str:
        if not raw:
            return ""
        s = raw.strip().lower()
        s = _PERCENT_RE.sub(r"\1 percent", s)
        s = _PUNCT_RE.sub(" ", s)
        s = _WS_RE.sub(" ", s).strip()
        if not s:
            return ""
        tokens = [_ABBREVIATIONS.get(tok, tok) for tok in s.split(" ")]
        s = _WS_RE.sub(" ", " ".join(tokens)).strip()
        # Singularizing helps collapse genuine plural *product* descriptions
        # ("organic apples"/"organic apple" should be the same item) but is
        # actively harmful for *merchant* names, which routinely end in "s" as
        # part of their actual identity, not a plural (Starbucks, Staples,
        # Walgreens, McDonald's, "...Airlines"...). Verified empirically: 76
        # of the 182 seed merchants would otherwise fail to exact-match their
        # own canonical_name. Skip it whenever the caller tells us this is a
        # merchant; apply it by default otherwise (matches every existing
        # item-focused caller, including tests written before entity_type
        # was threaded through).
        if entity_type == "merchant":
            return s
        return self._singularize_trailing(s)

    def _singularize_trailing(self, s: str) -> str:
        # Only the last token (the head noun) is singularized — "organic
        # apples" -> "organic apple", not every word in the phrase. Suffix
        # rules only, deliberately not a real stemmer/inflect dependency for
        # a foundation ticket.
        words = s.split(" ")
        last = words[-1]
        if len(last) > 3:
            if last.endswith("ies"):
                last = last[:-3] + "y"
            elif _PLURAL_ES_RE.search(last):
                last = last[:-2]
            elif last.endswith("s") and not last.endswith("ss"):
                last = last[:-1]
        words[-1] = last
        return " ".join(words)

    # ------------------------------------------------------------------
    # Typeahead — spec §8. Deliberately separate from resolve(): read-only,
    # no side effects (writes nothing, creates nothing), safe to call on
    # every keystroke. The full recency/frequency/is_global-boost ranking
    # formula in spec §8.2 is deferred to a later pass — this is pure
    # name-similarity ranking for P0.
    # ------------------------------------------------------------------
    def suggest(
        self,
        query: str,
        entity_type: EntityType,
        user_email: str,
        merchant_id: Optional[str] = None,
        limit: int = SUGGEST_TOPN,
    ) -> List[Candidate]:
        # merchant_id (item typeahead scoped to a merchant, spec §8) is
        # accepted but not yet applied — doing so meaningfully needs
        # item_price_history joined through canonical_item_id, which nothing
        # populates until the dual-write aggregation change ships. Silently
        # ignoring it here is correct today, not a shortcut: there is no
        # linked data yet to scope by.
        del merchant_id

        q = self.normalize(query, entity_type=entity_type)
        if not q:
            return []
        model = _MODEL_BY_TYPE[entity_type]

        name_sim = func.similarity(model.canonical_name, q)
        name_rows = (
            self.db.query(model.id, model.display_name, model.default_category_id, name_sim.label("score"))
            .filter(or_(model.user_email == user_email, model.user_email.is_(None)))
            .filter(or_(model.canonical_name.like(f"{q}%"), name_sim >= SUGGEST_MIN_SIMILARITY))
            .all()
        )

        # Known aliases (e.g. seed variants like "cosco") — joined back to the
        # canonical entity so a hit here still surfaces the right display_name,
        # not the raw alias text.
        alias_sim = func.similarity(EntityAlias.raw_key, q)
        alias_rows = (
            self.db.query(model.id, model.display_name, model.default_category_id, alias_sim.label("score"))
            .join(EntityAlias, EntityAlias.entity_id == model.id)
            .filter(EntityAlias.entity_type == entity_type)
            .filter(or_(model.user_email == user_email, model.user_email.is_(None)))
            .filter(or_(EntityAlias.raw_key.like(f"{q}%"), alias_sim >= SUGGEST_MIN_SIMILARITY))
            .all()
        )

        best: Dict[str, Candidate] = {}
        for entity_id, display_name, category_id, score in [*name_rows, *alias_rows]:
            key = str(entity_id)
            score = float(score)
            if key not in best or score > best[key].score:
                best[key] = Candidate(id=key, display_name=display_name, score=score, category_id=category_id)
        return sorted(best.values(), key=lambda c: c.score, reverse=True)[:limit]

    # ------------------------------------------------------------------
    # Cascade — spec §6.2
    # ------------------------------------------------------------------
    def resolve(
        self,
        raw: str,
        entity_type: EntityType,
        user_email: str,
        brand: Optional[str] = None,
        source_hint: Literal["user", "llm", "backfill"] = "user",
    ) -> ResolutionResult:
        raw_key = self.normalize(raw, entity_type=entity_type)
        if not raw_key:
            return ResolutionResult(status="new", canonical=None, candidates=[])

        model = _MODEL_BY_TYPE[entity_type]

        # Tier 1 — exact canonical_name match. Prefer the user's own entity
        # over a same-named global one if somehow both exist (a user-scoped
        # row represents a deliberate override of their own history).
        exact = (
            self.db.query(model)
            .filter(model.canonical_name == raw_key)
            .filter(or_(model.user_email == user_email, model.user_email.is_(None)))
            .order_by((model.user_email == user_email).desc())
            .first()
        )
        if exact is not None:
            return ResolutionResult(status="linked", canonical=self._to_ref(exact))

        # Tier 2 — known alias (this is the Resolution Pipeline's memory).
        alias = (
            self.db.query(EntityAlias)
            .filter(EntityAlias.entity_type == entity_type, EntityAlias.raw_key == raw_key)
            .filter(or_(EntityAlias.user_email == user_email, EntityAlias.user_email.is_(None)))
            .order_by((EntityAlias.user_email == user_email).desc())
            .first()
        )
        if alias is not None:
            canonical = self.db.query(model).filter(model.id == alias.entity_id).first()
            if canonical is not None:
                return ResolutionResult(status="linked", canonical=self._to_ref(canonical))
            logger.warning(
                "Dangling alias %s -> missing %s %s (canonical entity was deleted); "
                "falling through to trigram search", alias.id, entity_type, alias.entity_id,
            )

        # Tiers 3-5 share one trigram fetch, isolated in its own method
        # specifically so it's mockable — SQLite (every unit test in this
        # repo) has no pg_trgm/similarity(); real tier-3 behavior is only
        # exercised by the Postgres E2E suite.
        candidates = self._fetch_trigram_candidates(raw_key, entity_type, user_email, limit=RESOLVE_TOPN)

        if candidates and candidates[0].score >= RESOLVE_HIGH:
            top = candidates[0]
            canonical = self.db.query(model).filter(model.id == uuid.UUID(top.id)).first()
            self._write_alias(entity_type, uuid.UUID(top.id), raw_key, user_email, source="auto_high", confidence=top.score)
            return ResolutionResult(status="linked", canonical=self._to_ref(canonical), candidates=candidates)

        if candidates and candidates[0].score >= RESOLVE_LOW:
            # Nothing written — ambiguous matches require an explicit confirm
            # (P1) before they become an alias.
            return ResolutionResult(status="suggested", canonical=None, candidates=candidates)

        # Tier 5 — no match anywhere close; mint a new canonical entity.
        new_entity = self._create_canonical(entity_type, raw_key, raw, user_email, brand)
        self._write_alias(entity_type, new_entity.id, raw_key, user_email, source=source_hint, confidence=None)
        return ResolutionResult(status="new", canonical=self._to_ref(new_entity), candidates=candidates)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _fetch_trigram_candidates(
        self, raw_key: str, entity_type: EntityType, user_email: str, limit: int = RESOLVE_TOPN,
    ) -> List[Candidate]:
        model = _MODEL_BY_TYPE[entity_type]
        sim = func.similarity(model.canonical_name, raw_key)
        try:
            # SAVEPOINT so a missing pg_trgm extension only aborts this one
            # query, not the caller's whole transaction (resolve() is called
            # from insights_aggregation_service mid-write, with an
            # already-flushed-but-uncommitted row on the session).
            with self.db.begin_nested():
                rows = (
                    self.db.query(model, sim.label("score"))
                    .filter(or_(model.user_email == user_email, model.user_email.is_(None)))
                    .filter(sim >= RESOLVE_LOW)
                    .order_by(sim.desc())
                    .limit(limit)
                    .all()
                )
        except DBAPIError:
            # similarity() undefined (e.g. SQLite in tests/local dev without
            # pg_trgm) — degrade to "no fuzzy candidates" so resolve() still
            # falls through to tier 5 instead of hard-crashing every caller.
            logger.warning(
                "Trigram similarity() unavailable while resolving %s '%s'; treating as no candidates",
                entity_type, raw_key,
            )
            return []
        return [
            Candidate(
                id=str(entity.id),
                display_name=entity.display_name,
                score=float(score),
                category_id=entity.default_category_id,
            )
            for entity, score in rows
        ]

    def _write_alias(
        self,
        entity_type: EntityType,
        entity_id: uuid.UUID,
        raw_key: str,
        user_email: str,
        source: str,
        confidence: Optional[float],
    ) -> EntityAlias:
        existing = (
            self.db.query(EntityAlias)
            .filter(
                EntityAlias.user_email == user_email,
                EntityAlias.entity_type == entity_type,
                EntityAlias.raw_key == raw_key,
            )
            .first()
        )
        if existing is not None:
            return existing
        alias = EntityAlias(
            id=uuid.uuid4(),
            user_email=user_email,
            entity_type=entity_type,
            entity_id=entity_id,
            raw_key=raw_key,
            source=source,
            confidence=confidence,
            confirmed=source in ("seed", "user_confirm"),
        )
        self.db.add(alias)
        self.db.commit()
        return alias

    def _create_canonical(
        self,
        entity_type: EntityType,
        raw_key: str,
        raw_original: str,
        user_email: str,
        brand: Optional[str],
    ) -> Union[CanonicalMerchant, CanonicalItem]:
        model = _MODEL_BY_TYPE[entity_type]
        kwargs = dict(
            id=uuid.uuid4(),
            user_email=user_email,
            canonical_name=raw_key,
            display_name=raw_original.strip(),
            is_global=False,
        )
        if entity_type == "item" and brand:
            kwargs["brand"] = brand
        entity = model(**kwargs)
        self.db.add(entity)
        self.db.commit()
        self.db.refresh(entity)
        return entity

    def _to_ref(self, entity: Union[CanonicalMerchant, CanonicalItem]) -> CanonicalRef:
        return CanonicalRef(
            id=str(entity.id),
            display_name=entity.display_name,
            category_id=entity.default_category_id,
        )
