"""Unit coverage for the free-text sanitizer (P0-1)."""

import pytest
from pydantic import ValidationError

from varavu_selavu_service.core.text_sanitize import (
    MAX_DESCRIPTION,
    MAX_NAME,
    sanitize_text,
)
from varavu_selavu_service.models.api_models import (
    AddMemberRequest,
    CreateGroupRequest,
    ExpenseRequest,
    GroupExpenseRequest,
)

AUDIT_PAYLOAD = "ZZTEST <b>bold</b> <img src=x onerror=alert(1)>"


class TestSanitizeText:
    def test_strips_tags_from_the_audit_payload(self):
        assert sanitize_text(AUDIT_PAYLOAD) == "ZZTEST bold"

    def test_strips_an_unterminated_tag_fragment(self):
        assert sanitize_text("Dinner <img src=x") == "Dinner"

    def test_strips_script_tags_leaving_inner_text(self):
        assert sanitize_text("<script>alert(1)</script>Coffee") == "alert(1)Coffee"

    @pytest.mark.parametrize(
        "value",
        ["5 < 10 is true", "budget < 50 > target", "Coffee & Bagel"],
    )
    def test_leaves_legitimate_text_with_brackets_alone(self, value):
        assert sanitize_text(value) == value

    def test_removes_control_and_zero_width_characters(self):
        assert sanitize_text("a​b\tc\x00d") == "abcd"

    def test_removes_bidi_override_used_to_spoof_display_text(self):
        assert sanitize_text("Coffee‮gnihsihP") == "CoffeegnihsihP"

    def test_collapses_whitespace_and_trims(self):
        assert sanitize_text("  Dinner   at    Joe's  ") == "Dinner at Joe's"

    def test_passes_non_strings_through_untouched(self):
        assert sanitize_text(None) is None
        assert sanitize_text(42) == 42

    def test_strips_lone_surrogate(self):
        """A bare \\uXXXX escape (truncated emoji, corrupted paste, a client-side
        substring that split a surrogate pair) decodes into a valid Python str,
        but one that can never be encoded as UTF-8 -- left in, it reaches the DB
        write and blows up as an unhandled UnicodeEncodeError (bare 500) instead
        of a clean 422, since it's syntactically valid at every validation step
        before that. Reproduced live via POST /recurring/upsert."""
        assert sanitize_text("Bad\ud83dName") == "BadName"


class TestRequestModelSanitization:
    def test_expense_request_sanitizes_description_and_merchant(self):
        req = ExpenseRequest(
            user_id="u", cost=10.0, category="Food",
            description=AUDIT_PAYLOAD, date="01/15/2026",
            merchant_name="<b>Costco</b>",
        )
        assert req.description == "ZZTEST bold"
        assert req.merchant_name == "Costco"

    def test_group_expense_request_sanitizes_description(self):
        req = GroupExpenseRequest(
            date="01/15/2026", description=AUDIT_PAYLOAD, category="Food",
            amount=10.0, payers=[], split={"type": "equal", "entries": []},
        )
        assert "<" not in req.description

    def test_group_name_is_sanitized(self):
        assert CreateGroupRequest(name="<script>x</script>Trip").name == "xTrip"

    def test_member_display_name_is_sanitized(self):
        assert AddMemberRequest(display_name="<i>Sai</i>").display_name == "Sai"

    def test_over_long_description_is_rejected(self):
        with pytest.raises(ValidationError):
            ExpenseRequest(
                user_id="u", cost=10.0, category="Food",
                description="x" * (MAX_DESCRIPTION + 1), date="01/15/2026",
            )

    def test_description_at_the_limit_is_accepted(self):
        req = ExpenseRequest(
            user_id="u", cost=10.0, category="Food",
            description="x" * MAX_DESCRIPTION, date="01/15/2026",
        )
        assert len(req.description) == MAX_DESCRIPTION

    def test_length_is_enforced_on_the_sanitized_value_not_the_raw_input(self):
        """Markup that pushes raw input over the ceiling is still accepted when
        what we actually store fits."""
        padding = "<span>" * 40  # 240 raw chars that sanitize away to nothing
        req = ExpenseRequest(
            user_id="u", cost=10.0, category="Food",
            description=padding + "Dinner", date="01/15/2026",
        )
        assert req.description == "Dinner"

    def test_over_long_group_name_is_rejected(self):
        with pytest.raises(ValidationError):
            CreateGroupRequest(name="x" * (MAX_NAME + 1))
