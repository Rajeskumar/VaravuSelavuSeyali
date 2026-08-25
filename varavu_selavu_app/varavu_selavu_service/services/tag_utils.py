"""TS-TAG-101 — tag name normalization, isolated as a pure function so `TagService` (TS-TAG-102)
and its tests don't duplicate the rule.

PRD §9.1 (revised in v0.2.0): `normalized_name` = lowercase -> trim -> collapse internal
whitespace runs to a single space. Nothing else — deliberately NOT stripped of punctuation, so
"Trip 1" and "Trip-1" stay distinct tags. The v0.1.0 spec's aggressive stripping was reversed
because it applied an irreversible data constraint to solve a UI problem: it silently merged
tags a user may have meant to keep separate, with no undo once merged. The near-duplicate problem
(catching "Trip1" vs "Trip 1") belongs at suggestion time (client-side fuzzy match against the
user's tag list, PRD §7.1), not at storage time — a wrong hint is recoverable, a wrong merge
is not.
"""
import re

_WHITESPACE_RUN_RE = re.compile(r"\s+")


def normalize_tag_name(name: str) -> str:
    """Lowercase, trim, collapse internal whitespace runs to a single space. Empty/whitespace-only
    input normalizes to an empty string — callers are responsible for rejecting that as invalid
    (PRD §9.3: tag name length 1-50 chars after trim), this function only normalizes."""
    return _WHITESPACE_RUN_RE.sub(" ", name.strip().lower())
