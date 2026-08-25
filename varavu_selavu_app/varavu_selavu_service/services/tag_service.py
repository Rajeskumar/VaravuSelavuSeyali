"""TS-TAG-102 — TagService: CRUD + derived-ranking autocomplete for user-defined tags.

Privacy note (PRD §9.2, load-bearing): every query here filters by `Tag.user_email`/
`ExpenseTag.user_email` — a tag belongs to exactly one user and there is no shared tag. This
service is the repository-layer enforcement point the PRD requires; callers must never bypass it
by querying `Tag`/`ExpenseTag` directly.
"""
from __future__ import annotations

import re
import uuid
from typing import Dict, List, Optional, Sequence, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.models import ExpenseTag, Tag
from varavu_selavu_service.services.tag_utils import normalize_tag_name


def get_tags_for_expenses(db: Session, expense_ids: Sequence, user_email: str) -> Dict[str, List[dict]]:
    """Batch-fetch `{id, name, color}` tags per expense, keyed by `str(expense_id)`. TS-TAG-103:
    THE repository-layer privacy enforcement point (PRD §9.2) — every expense read path (personal
    list, group list/detail) must route through this, never query `Tag`/`ExpenseTag` directly,
    since filtering on `user_email` here is what guarantees a tag applied to a shared group
    expense is only ever visible to the member who applied it, never other group members."""
    if not expense_ids:
        return {}
    rows = (
        db.query(ExpenseTag.expense_id, Tag.id, Tag.name, Tag.color)
        .join(Tag, Tag.id == ExpenseTag.tag_id)
        .filter(ExpenseTag.expense_id.in_(list(expense_ids)), ExpenseTag.user_email == user_email)
        .all()
    )
    result: Dict[str, List[dict]] = {}
    for expense_id, tag_id, name, color in rows:
        result.setdefault(str(expense_id), []).append({"id": str(tag_id), "name": name, "color": color})
    return result

_HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

# Auto-assigned when a tag is created without an explicit color (PRD §14 Open Question #3 —
# "auto-assign, override in management view: fewer decisions at creation time"). Cycled by the
# creator's current active-tag count, not randomized, so colors stay stable/reproducible.
_PALETTE = [
    "#5E48C8", "#2E9E6B", "#D97706", "#DC2626",
    "#0EA5E9", "#DB2777", "#65A30D", "#7C3AED",
]


class TagWithStats:
    """A `Tag` plus its derived usage stats (PRD §8.1 — never stored, always computed)."""

    def __init__(self, tag: Tag, usage_count: int, last_used_at):
        self.tag = tag
        self.usage_count = usage_count
        self.last_used_at = last_used_at


class TagService:
    def __init__(self, db: Session):
        self.db = db
        self.settings = Settings()

    def _get_owned_tag(self, user_email: str, tag_id: str) -> Tag:
        try:
            tid = uuid.UUID(str(tag_id))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
        tag = self.db.query(Tag).filter(Tag.id == tid, Tag.user_email == user_email).first()
        if not tag:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
        return tag

    @staticmethod
    def _validate_name(name: str) -> str:
        trimmed = (name or "").strip()
        if not (1 <= len(trimmed) <= 50):
            raise HTTPException(status_code=422, detail="Tag name must be 1-50 characters after trimming")
        return trimmed

    @staticmethod
    def _validate_color(color: str) -> str:
        if not _HEX_COLOR_RE.match(color):
            raise HTTPException(status_code=422, detail="color must be a hex string like #RRGGBB")
        return color

    # ------------------------------------------------------------------
    # List / autocomplete (PRD §10.1) — ranked most-recently-used, then most-used, both derived
    # from expense_tags in one grouped query (PRD §8.1), never from stored counters.
    # ------------------------------------------------------------------

    def get_stats(self, tag: Tag) -> TagWithStats:
        """Real usage stats for a single tag — used by create/update so a collision-returned or
        just-edited tag never misreports a fabricated zero when it actually has usage history."""
        usage_count, last_used_at = (
            self.db.query(func.count(ExpenseTag.id), func.max(ExpenseTag.created_at))
            .filter(ExpenseTag.tag_id == tag.id, ExpenseTag.user_email == tag.user_email)
            .one()
        )
        return TagWithStats(tag, int(usage_count or 0), last_used_at)

    def list_tags(
        self, user_email: str, q: Optional[str] = None, status_filter: str = "active", limit: int = 20,
    ) -> List[TagWithStats]:
        stats_subq = (
            self.db.query(
                ExpenseTag.tag_id.label("tag_id"),
                func.count(ExpenseTag.id).label("usage_count"),
                func.max(ExpenseTag.created_at).label("last_used_at"),
            )
            .filter(ExpenseTag.user_email == user_email)
            .group_by(ExpenseTag.tag_id)
            .subquery()
        )

        query = (
            self.db.query(Tag, func.coalesce(stats_subq.c.usage_count, 0), stats_subq.c.last_used_at)
            .outerjoin(stats_subq, stats_subq.c.tag_id == Tag.id)
            .filter(Tag.user_email == user_email)
        )

        normalized_status = (status_filter or "active").strip().lower()
        if normalized_status == "active":
            query = query.filter(Tag.status == "Active")
        elif normalized_status == "archived":
            query = query.filter(Tag.status == "Archived")
        # "all" (or anything else unrecognized) -> no status filter.

        if q:
            query = query.filter(Tag.name.ilike(f"%{q}%"))

        query = query.order_by(
            stats_subq.c.last_used_at.desc().nullslast(),
            func.coalesce(stats_subq.c.usage_count, 0).desc(),
            Tag.name.asc(),
        )
        if limit:
            query = query.limit(limit)

        return [TagWithStats(tag, int(usage_count), last_used_at) for tag, usage_count, last_used_at in query.all()]

    # ------------------------------------------------------------------
    # CRUD (PRD §10.1)
    # ------------------------------------------------------------------

    def create_tag(self, user_email: str, name: str, color: Optional[str] = None) -> Tuple[Tag, bool]:
        """Returns (tag, created) — `created` is False when an exact-normalized-name collision
        returns the existing tag instead of erroring (PRD §9.1: "Inline creation must never fail
        on an exact-normalized duplicate")."""
        trimmed = self._validate_name(name)
        normalized = normalize_tag_name(trimmed)

        existing = (
            self.db.query(Tag)
            .filter(Tag.user_email == user_email, Tag.normalized_name == normalized)
            .first()
        )
        if existing:
            return existing, False

        active_count = (
            self.db.query(Tag)
            .filter(Tag.user_email == user_email, Tag.status == "Active")
            .count()
        )
        if active_count >= self.settings.TAG_MAX_PER_USER:
            raise HTTPException(
                status_code=422,
                detail=f"Tag limit reached ({self.settings.TAG_MAX_PER_USER} active tags max)",
            )

        assigned_color = self._validate_color(color) if color else _PALETTE[active_count % len(_PALETTE)]
        tag = Tag(
            id=uuid.uuid4(), user_email=user_email, name=trimmed, normalized_name=normalized,
            color=assigned_color, status="Active",
        )
        self.db.add(tag)
        self.db.commit()
        self.db.refresh(tag)
        return tag, True

    def update_tag(
        self, user_email: str, tag_id: str,
        name: Optional[str] = None, color: Optional[str] = None, status_value: Optional[str] = None,
    ) -> Tag:
        tag = self._get_owned_tag(user_email, tag_id)

        if name is not None:
            trimmed = self._validate_name(name)
            normalized = normalize_tag_name(trimmed)
            collision = (
                self.db.query(Tag)
                .filter(Tag.user_email == user_email, Tag.normalized_name == normalized, Tag.id != tag.id)
                .first()
            )
            if collision:
                raise HTTPException(status_code=409, detail=f"A tag named '{collision.name}' already exists")
            tag.name = trimmed
            tag.normalized_name = normalized

        if color is not None:
            tag.color = self._validate_color(color)

        if status_value is not None:
            if status_value not in ("Active", "Archived"):
                raise HTTPException(status_code=422, detail="status must be 'Active' or 'Archived'")
            tag.status = status_value

        self.db.commit()
        self.db.refresh(tag)
        return tag

    def delete_tag(self, user_email: str, tag_id: str) -> None:
        tag = self._get_owned_tag(user_email, tag_id)
        self.db.delete(tag)  # cascades expense_tags via FK ondelete="CASCADE"
        self.db.commit()

    # ------------------------------------------------------------------
    # Association (TS-TAG-103). Callers are responsible for verifying the caller has rights to
    # the expense itself (owns it personally, or is a member of its group) — that's an Expense/
    # Group concern, not a Tag one. This service only ever touches tags the caller owns.
    # ------------------------------------------------------------------

    def apply_tags_to_expense(
        self, user_email: str, expense_id: str,
        tag_ids: Optional[List[str]] = None, tag_names: Optional[List[str]] = None,
    ) -> List[dict]:
        """Idempotent — a tag already applied is skipped, not duplicated (PRD §10.2). `tag_names`
        are created-or-resolved via `create_tag` (so a typo'd/new name just works inline).
        Returns the expense's current tags (post-apply), filtered to `user_email` like every
        other tag read path."""
        try:
            eid = uuid.UUID(str(expense_id))
        except ValueError:
            raise HTTPException(status_code=404, detail="Expense not found")

        resolved_ids = set()
        for tid in tag_ids or []:
            tag = self._get_owned_tag(user_email, tid)
            resolved_ids.add(tag.id)
        for name in tag_names or []:
            tag, _created = self.create_tag(user_email, name)
            resolved_ids.add(tag.id)

        if not resolved_ids:
            raise HTTPException(status_code=422, detail="Provide at least one of tag_ids or tag_names")

        existing_ids = {
            row.tag_id for row in
            self.db.query(ExpenseTag.tag_id).filter(ExpenseTag.expense_id == eid, ExpenseTag.user_email == user_email)
        }
        already_applied_count = len(existing_ids)
        new_ids = resolved_ids - existing_ids
        if already_applied_count + len(new_ids) > self.settings.TAG_MAX_PER_EXPENSE:
            raise HTTPException(
                status_code=422,
                detail=f"An expense can carry at most {self.settings.TAG_MAX_PER_EXPENSE} tags",
            )

        for tag_id in new_ids:
            self.db.add(ExpenseTag(id=uuid.uuid4(), tag_id=tag_id, expense_id=eid, user_email=user_email))
        if new_ids:
            self.db.commit()

        return get_tags_for_expenses(self.db, [eid], user_email).get(str(eid), [])

    def remove_tag_from_expense(self, user_email: str, expense_id: str, tag_id: str) -> None:
        """Idempotent — removing a tag that isn't applied (or never existed) is a no-op, not an
        error, matching standard DELETE semantics."""
        try:
            eid = uuid.UUID(str(expense_id))
            tid = uuid.UUID(str(tag_id))
        except ValueError:
            return
        (
            self.db.query(ExpenseTag)
            .filter(ExpenseTag.expense_id == eid, ExpenseTag.tag_id == tid, ExpenseTag.user_email == user_email)
            .delete(synchronize_session=False)
        )
        self.db.commit()

    def set_tags_for_expense(self, user_email: str, expense_id: str, tag_names: List[str]) -> List[dict]:
        """TS-TAG-104 — full-replace semantics for the `tag_names` write-through field on
        `POST /expenses` / `PUT /expenses/{row_id}` / `POST /expenses/with_items` (PRD §10.2),
        distinct from the additive/idempotent association endpoint. An empty list clears every
        tag this user has on the expense; the caller (route layer) is responsible for the
        omitted-vs-explicit-empty distinction (Pydantic's `model_fields_set`) — this method
        always replaces, it never conditionally skips."""
        try:
            eid = uuid.UUID(str(expense_id))
        except ValueError:
            raise HTTPException(status_code=404, detail="Expense not found")

        resolved_ids = set()
        for name in tag_names:
            tag, _created = self.create_tag(user_email, name)
            resolved_ids.add(tag.id)

        if len(resolved_ids) > self.settings.TAG_MAX_PER_EXPENSE:
            raise HTTPException(
                status_code=422,
                detail=f"An expense can carry at most {self.settings.TAG_MAX_PER_EXPENSE} tags",
            )

        existing = (
            self.db.query(ExpenseTag)
            .filter(ExpenseTag.expense_id == eid, ExpenseTag.user_email == user_email)
            .all()
        )
        existing_ids = {row.tag_id for row in existing}

        for row in existing:
            if row.tag_id not in resolved_ids:
                self.db.delete(row)
        for tag_id in resolved_ids - existing_ids:
            self.db.add(ExpenseTag(id=uuid.uuid4(), tag_id=tag_id, expense_id=eid, user_email=user_email))

        self.db.commit()
        return get_tags_for_expenses(self.db, [eid], user_email).get(str(eid), [])
