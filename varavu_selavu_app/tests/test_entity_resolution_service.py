import uuid

import pytest

from varavu_selavu_service.db.models import CanonicalMerchant, CanonicalItem, EntityAlias
from varavu_selavu_service.services.entity_resolution_service import (
    Candidate,
    EntityResolutionService,
)


# ---------------------------------------------------------------------------
# normalize() — pure function, no DB
# ---------------------------------------------------------------------------

def test_normalize_lowercases_trims_collapses_whitespace(db_session):
    svc = EntityResolutionService(db_session)
    assert svc.normalize("  Costco   Wholesale  ") == "costco wholesale"


def test_normalize_strips_punctuation():
    svc = EntityResolutionService(None)
    assert svc.normalize("Wal-Mart, Inc.") == "wal mart inc"


def test_normalize_expands_abbreviations():
    svc = EntityResolutionService(None)
    assert svc.normalize("GV MLK") == "great value mlk"
    assert svc.normalize("Sam's WHLSL") == "sam s wholesale"


def test_normalize_expands_percent():
    svc = EntityResolutionService(None)
    assert svc.normalize("2% Milk") == "2 percent milk"


def test_normalize_singularizes_trailing_plural_only():
    svc = EntityResolutionService(None)
    assert svc.normalize("Organic Apples") == "organic apple"
    assert svc.normalize("Paper Towels") == "paper towel"
    # Only the LAST token singularizes, not every word.
    assert svc.normalize("Boxes of Apples") == "boxes of apple"
    # No entity_type specified defaults to item-style (singularize) — matches
    # every caller above, which never passes one.
    assert svc.normalize("Eggs") == "egg"


def test_normalize_skips_singularization_for_merchants():
    # Found empirically while seeding the merchant dictionary (TS-ENT-104):
    # 76 of 182 real chain names end in a bare "s" that is NOT a plural —
    # Starbucks, Staples, Walgreens, McDonald's, "...Airlines" — singularizing
    # these mangles the name into something that no longer matches itself.
    svc = EntityResolutionService(None)
    assert svc.normalize("Starbucks", entity_type="merchant") == "starbucks"
    assert svc.normalize("Popeyes", entity_type="merchant") == "popeyes"
    assert svc.normalize("Trader Joes", entity_type="merchant") == "trader joes"
    assert svc.normalize("Delta Air Lines", entity_type="merchant") == "delta air lines"
    # Same raw string normalized as an item DOES still singularize — the
    # distinction is entity_type, not a blanket rule change.
    assert svc.normalize("Bananas", entity_type="item") == "banana"
    assert svc.normalize("Bananas", entity_type="merchant") == "bananas"


def test_normalize_does_not_mangle_short_or_double_s_words():
    svc = EntityResolutionService(None)
    assert svc.normalize("Bus") == "bus"  # len <= 3 guard leaves 3-letter words alone... actually "bus" is 3 chars
    assert svc.normalize("Swiss") == "swiss"  # ends in "ss", not stripped


def test_normalize_empty_and_none():
    svc = EntityResolutionService(None)
    assert svc.normalize("") == ""
    assert svc.normalize(None) == ""
    assert svc.normalize("   ") == ""
    assert svc.normalize("!!!") == ""


# ---------------------------------------------------------------------------
# Cascade — tiers 1 (exact) / 2 (alias), fully SQLite-testable (no trigram)
# ---------------------------------------------------------------------------

def _make_merchant(db_session, canonical_name, display_name, user_email=None, is_global=False):
    m = CanonicalMerchant(
        id=uuid.uuid4(), user_email=user_email, canonical_name=canonical_name,
        display_name=display_name, is_global=is_global,
    )
    db_session.add(m)
    db_session.commit()
    return m


def test_tier1_exact_match_links_silently_no_write(db_session, monkeypatch):
    svc = EntityResolutionService(db_session)
    costco = _make_merchant(db_session, "costco", "Costco Wholesale", is_global=True)

    def _boom(*a, **kw):
        raise AssertionError("tier 1 hit must short-circuit before any trigram fetch")
    monkeypatch.setattr(svc, "_fetch_trigram_candidates", _boom)

    result = svc.resolve("Costco", "merchant", "test@user.com")
    assert result.status == "linked"
    assert result.canonical.id == str(costco.id)
    assert result.candidates == []
    # No alias written for a tier-1 hit — canonical_name equality is already
    # deterministic and repeatable, nothing new to remember.
    assert db_session.query(EntityAlias).count() == 0


def test_tier1_prefers_user_scoped_over_global_on_exact_name_collision(db_session):
    svc = EntityResolutionService(db_session)
    _make_merchant(db_session, "costco", "Costco (global)", is_global=True)
    mine = _make_merchant(db_session, "costco", "Costco (mine)", user_email="test@user.com")

    result = svc.resolve("costco", "merchant", "test@user.com")
    assert result.canonical.id == str(mine.id)


def test_tier2_known_alias_links_silently(db_session, monkeypatch):
    svc = EntityResolutionService(db_session)
    costco = _make_merchant(db_session, "costco", "Costco Wholesale", is_global=True)
    db_session.add(EntityAlias(
        id=uuid.uuid4(), user_email=None, entity_type="merchant", entity_id=costco.id,
        raw_key="cosco", source="seed", confirmed=True,
    ))
    db_session.commit()

    def _boom(*a, **kw):
        raise AssertionError("tier 2 hit must short-circuit before any trigram fetch")
    monkeypatch.setattr(svc, "_fetch_trigram_candidates", _boom)

    # Appendix A.1's worked example: "cosco" resolves to Costco via the seed alias.
    result = svc.resolve("cosco", "merchant", "test@user.com")
    assert result.status == "linked"
    assert result.canonical.id == str(costco.id)


def test_tier2_prefers_user_alias_over_global_alias(db_session):
    svc = EntityResolutionService(db_session)
    global_costco = _make_merchant(db_session, "costco global target", "Global target", is_global=True)
    my_costco = _make_merchant(db_session, "costco mine target", "My target", user_email="test@user.com")
    db_session.add_all([
        EntityAlias(id=uuid.uuid4(), user_email=None, entity_type="merchant",
                    entity_id=global_costco.id, raw_key="cosco", source="seed", confirmed=True),
        EntityAlias(id=uuid.uuid4(), user_email="test@user.com", entity_type="merchant",
                    entity_id=my_costco.id, raw_key="cosco", source="user_confirm", confirmed=True),
    ])
    db_session.commit()

    result = svc.resolve("cosco", "merchant", "test@user.com")
    assert result.canonical.id == str(my_costco.id)


def test_tier2_dangling_alias_falls_through_to_trigram(db_session, monkeypatch):
    svc = EntityResolutionService(db_session)
    db_session.add(EntityAlias(
        id=uuid.uuid4(), user_email=None, entity_type="merchant", entity_id=uuid.uuid4(),
        raw_key="ghost", source="seed", confirmed=True,
    ))
    db_session.commit()

    called = {}
    def _fake_fetch(raw_key, entity_type, user_email, limit=20):
        called["hit"] = True
        return []
    monkeypatch.setattr(svc, "_fetch_trigram_candidates", _fake_fetch)

    result = svc.resolve("ghost", "merchant", "test@user.com")
    assert called.get("hit") is True
    assert result.status == "new"  # no candidates at all -> tier 5


# ---------------------------------------------------------------------------
# Cascade — tiers 3 (auto-link high sim) / 4 (suggested) / 5 (new), with
# _fetch_trigram_candidates mocked (real trigram scoring is Postgres-only,
# exercised separately by the E2E suite).
# ---------------------------------------------------------------------------

def test_tier3_high_similarity_auto_links_and_writes_alias(db_session, monkeypatch):
    svc = EntityResolutionService(db_session)
    costco = _make_merchant(db_session, "costco", "Costco Wholesale", is_global=True)
    monkeypatch.setattr(
        svc, "_fetch_trigram_candidates",
        lambda *a, **kw: [Candidate(id=str(costco.id), display_name="Costco Wholesale", score=0.9)],
    )

    result = svc.resolve("costcoo", "merchant", "test@user.com")
    assert result.status == "linked"
    assert result.canonical.id == str(costco.id)

    alias = db_session.query(EntityAlias).filter_by(raw_key="costcoo").first()
    assert alias is not None
    assert alias.source == "auto_high"
    assert alias.confirmed is False
    assert float(alias.confidence) == pytest.approx(0.9)


def test_tier4_mid_band_returns_suggestion_writes_nothing(db_session, monkeypatch):
    svc = EntityResolutionService(db_session)
    gas = _make_merchant(db_session, "costco gas", "Costco Gas", is_global=True)
    monkeypatch.setattr(
        svc, "_fetch_trigram_candidates",
        lambda *a, **kw: [Candidate(id=str(gas.id), display_name="Costco Gas", score=0.71)],
    )

    result = svc.resolve("costco gass", "merchant", "test@user.com")
    assert result.status == "suggested"
    assert result.canonical is None
    assert len(result.candidates) == 1
    assert result.candidates[0].display_name == "Costco Gas"

    # Ambiguous match must not silently create/link/alias anything.
    assert db_session.query(EntityAlias).count() == 0
    assert db_session.query(CanonicalMerchant).filter_by(is_global=False).count() == 0


def test_tier5_no_match_creates_new_entity_and_writes_alias(db_session, monkeypatch):
    svc = EntityResolutionService(db_session)
    monkeypatch.setattr(svc, "_fetch_trigram_candidates", lambda *a, **kw: [])

    result = svc.resolve("Dragonfruit Org", "item", "test@user.com")
    assert result.status == "new"
    assert result.canonical.display_name == "Dragonfruit Org"

    created = db_session.query(CanonicalItem).filter_by(canonical_name="dragonfruit org").first()
    assert created is not None
    assert created.user_email == "test@user.com"
    assert created.is_global is False

    alias = db_session.query(EntityAlias).filter_by(raw_key="dragonfruit org", entity_type="item").first()
    assert alias is not None
    assert alias.source == "user"
    assert alias.entity_id == created.id


def test_tier5_source_hint_llm_tags_alias(db_session, monkeypatch):
    svc = EntityResolutionService(db_session)
    monkeypatch.setattr(svc, "_fetch_trigram_candidates", lambda *a, **kw: [])

    svc.resolve("Some New Item", "item", "test@user.com", source_hint="llm")
    alias = db_session.query(EntityAlias).filter_by(raw_key="some new item").first()
    assert alias.source == "llm"


def test_tier5_brand_passed_through_to_new_item(db_session, monkeypatch):
    svc = EntityResolutionService(db_session)
    monkeypatch.setattr(svc, "_fetch_trigram_candidates", lambda *a, **kw: [])

    svc.resolve("Whole Milk", "item", "test@user.com", brand="Great Value")
    created = db_session.query(CanonicalItem).filter_by(canonical_name="whole milk").first()
    assert created.brand == "Great Value"


def test_resolve_blank_input_does_not_crash(db_session):
    svc = EntityResolutionService(db_session)
    result = svc.resolve("   ", "merchant", "test@user.com")
    assert result.status == "new"
    assert result.canonical is None


def test_resolve_second_call_reuses_alias_no_duplicate(db_session, monkeypatch):
    # Tier 5 twice in a row for the same raw string should hit tier 1 (exact
    # canonical_name match) the second time, not create a second entity.
    svc = EntityResolutionService(db_session)
    monkeypatch.setattr(svc, "_fetch_trigram_candidates", lambda *a, **kw: [])

    first = svc.resolve("Kombucha", "item", "test@user.com")
    second = svc.resolve("Kombucha", "item", "test@user.com")

    assert first.canonical.id == second.canonical.id
    assert db_session.query(CanonicalItem).filter_by(canonical_name="kombucha").count() == 1
