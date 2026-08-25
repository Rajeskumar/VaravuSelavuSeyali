"""tests/test_tag_utils.py — TS-TAG-101 normalize_tag_name, per PRD §9.1's worked examples."""
from varavu_selavu_service.services.tag_utils import normalize_tag_name


def test_case_and_whitespace_variants_collapse_to_the_same_normalized_name():
    assert normalize_tag_name("Trip 1") == "trip 1"
    assert normalize_tag_name("trip 1") == "trip 1"
    assert normalize_tag_name("  TRIP  1 ") == "trip 1"


def test_punctuation_variants_stay_distinct():
    """The PRD's explicit reversal from v0.1.0 — do not strip punctuation, or "Trip 1" and
    "Trip-1"/"Trip1" would silently merge into one tag with no undo."""
    assert normalize_tag_name("Trip1") == "trip1"
    assert normalize_tag_name("Trip-1") == "trip-1"
    assert normalize_tag_name("Trip 1") != normalize_tag_name("Trip1")
    assert normalize_tag_name("Trip 1") != normalize_tag_name("Trip-1")


def test_internal_whitespace_runs_collapse_to_single_space():
    assert normalize_tag_name("Kitchen   reno") == "kitchen reno"
    assert normalize_tag_name("Kitchen\treno") == "kitchen reno"


def test_leading_and_trailing_whitespace_trimmed():
    assert normalize_tag_name("   Gift   ") == "gift"


def test_empty_and_whitespace_only_normalize_to_empty_string():
    assert normalize_tag_name("") == ""
    assert normalize_tag_name("   ") == ""


def test_already_normalized_name_is_unchanged():
    assert normalize_tag_name("tax deductible 2026") == "tax deductible 2026"
