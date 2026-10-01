"""Per-user category memory — the Splitwise-style "remember what I picked".

Every saved expense records (description -> category) and, when known,
(merchant -> category) for its owner. The next time that user types the same
description or merchant, categorization answers from here before any rule or
LLM, so a user's own correction always wins.
"""
from __future__ import annotations

import logging
from typing import List, Optional, Tuple

from sqlalchemy import case, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import CategoryMemory
from varavu_selavu_service.services.category_rules import get_rule_categorizer
from varavu_selavu_service.services.category_rules.normalizer import normalize_text

logger = logging.getLogger("varavu_selavu.category_memory")

_MAX_KEY_TOKENS = 6
_MAX_KEY_LEN = 120
# The clients' own fallback when nothing was suggested. Remembering it would pin
# every future suggestion for that text to "General", so it's never recorded.
_NOT_REMEMBERED = {"General"}


def memory_key(text: Optional[str]) -> str:
    key = normalize_text(text)
    return " ".join(key.split(" ")[:_MAX_KEY_TOKENS])[:_MAX_KEY_LEN]


def _category_groups():
    # Imported lazily: categorization_service imports this module.
    from varavu_selavu_service.services.categorization_service import CATEGORY_GROUPS

    return CATEGORY_GROUPS


def resolve_main(sub: str, main: Optional[str], hint_text: Optional[str]) -> Optional[str]:
    """Expenses store only the subcategory; several subs ("Other", "Electronics",
    "Services") exist under more than one main, so pick the right one."""
    groups = _category_groups()
    if main and sub in groups.get(main, []):
        return main
    rule = get_rule_categorizer().classify(hint_text)
    if rule and rule.subcategory == sub:
        return rule.main_category
    for candidate, subs in groups.items():
        if sub in subs:
            return candidate
    return None


class CategoryMemoryService:
    def __init__(self, db: Session):
        self.db = db

    def lookup(self, user_email: str, description: Optional[str], merchant_name: Optional[str] = None) -> Optional[Tuple[str, str]]:
        keys: List[str] = [k for k in (memory_key(description), memory_key(merchant_name)) if k]
        if not keys:
            return None
        rows = (
            self.db.query(CategoryMemory)
            .filter(CategoryMemory.user_email == user_email, CategoryMemory.key.in_(keys))
            .all()
        )
        by_key = {r.key: r for r in rows}
        for k in keys:  # the exact description beats the merchant
            if k in by_key:
                return by_key[k].main_category, by_key[k].category_id
        return None

    def record(
        self,
        user_email: str,
        description: Optional[str],
        category: Optional[str],
        merchant_name: Optional[str] = None,
        main_category: Optional[str] = None,
    ) -> None:
        """Best-effort: called after an expense is saved, and never fails that save."""
        if not user_email or not category or category in _NOT_REMEMBERED:
            return
        try:
            main = resolve_main(category, main_category, merchant_name or description)
            if not main:
                return
            keys = {k for k in (memory_key(description), memory_key(merchant_name)) if k}
            if not keys:
                return
            insert = pg_insert if self.db.bind.dialect.name == "postgresql" else sqlite_insert
            for key in keys:
                stmt = insert(CategoryMemory).values(
                    user_email=user_email, key=key, main_category=main, category_id=category, hits=1
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=[CategoryMemory.user_email, CategoryMemory.key],
                    set_={
                        # A repeat strengthens the memory; a different pick replaces it.
                        "hits": case((CategoryMemory.category_id == category, CategoryMemory.hits + 1), else_=1),
                        "main_category": main,
                        "category_id": category,
                        "updated_at": func.now(),
                    },
                )
                self.db.execute(stmt)
            self.db.commit()
        except Exception:
            logger.exception("category memory record failed")
            self.db.rollback()
