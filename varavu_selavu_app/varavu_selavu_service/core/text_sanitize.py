"""Normalization for user-supplied free text (descriptions, names, categories).

Defense in depth behind React's auto-escaping: values are cleaned on write so
that non-React sinks (CSV, PDF/email digests, LLM prompts, mobile webviews)
never see markup or control characters in the first place.

Tags are *stripped* rather than HTML-escaped: escaping on write would render as
literal `&lt;b&gt;` once React escapes it again on read.
"""

import re
import unicodedata
from typing import Annotated, Optional, TypeVar

from pydantic import BeforeValidator, Field

# Both patterns require a real tag-name start (letter, `/`, `!` or `?`) so that
# arithmetic in free text — "5 < 10", "budget < 50" — survives untouched.
_TAG_RE = re.compile(r"<\s*[/!?]?\s*[a-zA-Z][^>]*>")
# An unterminated trailing fragment, e.g. "foo <img src=x".
_DANGLING_TAG_RE = re.compile(r"<\s*[/!?]?\s*[a-zA-Z][^>]*$")
_WHITESPACE_RE = re.compile(r"\s+")

MAX_DESCRIPTION = 200
MAX_NAME = 100
MAX_CATEGORY = 100
MAX_NOTES = 500


def _strip_control_chars(value: str) -> str:
    # Drop C0/C1 control and format characters (Cc/Cf), which includes the
    # zero-width and bidi-override characters used to spoof display text.
    # Also drop lone/unpaired UTF-16 surrogates (Cs): JSON can carry a bare
    # \uXXXX escape (a truncated emoji, corrupted paste, a client-side
    # substring that split a surrogate pair) into a Python str just fine, but
    # that str can never be encoded as UTF-8 — psycopg raises UnicodeEncodeError
    # deep inside the DB write, well past any normal 422 validation path,
    # surfacing as a bare 500 (confirmed: POST /recurring/upsert 500 with a
    # merchant_name containing "\ud83d" with no matching low surrogate).
    return "".join(ch for ch in value if unicodedata.category(ch) not in ("Cc", "Cf", "Cs"))


def sanitize_text(value):
    """Normalizes one free-text value. Non-str input passes through untouched so
    Pydantic can report the real type error."""
    if not isinstance(value, str):
        return value

    cleaned = unicodedata.normalize("NFKC", value)
    cleaned = _strip_control_chars(cleaned)
    cleaned = _TAG_RE.sub("", cleaned)
    cleaned = _DANGLING_TAG_RE.sub("", cleaned)
    cleaned = _WHITESPACE_RE.sub(" ", cleaned)
    return cleaned.strip()


def _sanitized(max_length: int):
    """Sanitize first, then enforce the length ceiling, so an over-long value is
    rejected with 422 on what we would actually store."""
    return BeforeValidator(sanitize_text), Field(max_length=max_length)


DescriptionStr = Annotated[str, *_sanitized(MAX_DESCRIPTION)]
CategoryStr = Annotated[str, *_sanitized(MAX_CATEGORY)]
NameStr = Annotated[str, *_sanitized(MAX_NAME)]
DisplayNameStr = Annotated[str, *_sanitized(MAX_NAME)]

# The validator/constraint must sit on the inner `str`, with `Optional[...]` wrapping the
# whole annotated type -- NOT `Annotated[Optional[str], BeforeValidator(...), Field(max_length=...)]`.
# Pydantic v2 applies a Field constraint that shares an Annotated slot with a BeforeValidator
# to the validator's raw output rather than scoping it to just the `str` arm of the union, so
# an explicit `null` (any cleared optional field, or any value round-tripped from a prior GET
# response) crashes with a raw TypeError instead of the ordinary "None is a valid Optional[str]"
# pass-through you get without a BeforeValidator in the chain. Confirmed live: this shape 500'd
# POST /recurring/upsert on a template whose merchant_name was null.
OptionalNameStr = Optional[Annotated[str, *_sanitized(MAX_NAME)]]
OptionalDisplayNameStr = Optional[Annotated[str, *_sanitized(MAX_NAME)]]
OptionalMerchantStr = Optional[Annotated[str, *_sanitized(MAX_NAME)]]
OptionalNotesStr = Optional[Annotated[str, *_sanitized(MAX_NOTES)]]
