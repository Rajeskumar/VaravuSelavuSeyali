"""Deterministic (non-LLM) categorization: merchant dictionary + keyword rules.

See categorizer.RuleCategorizer for the lookup order.
"""
from varavu_selavu_service.services.category_rules.categorizer import (  # noqa: F401
    RuleCategorizer,
    RuleMatch,
    get_rule_categorizer,
)
