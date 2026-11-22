"""Catalog identifiers are distinct from legacy stored subcategory names."""

import re
from collections import Counter
from varavu_selavu_service.services.categorization_service import CATEGORY_GROUPS


def slug(value):
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


CATALOG = {
    f"{slug(main)}.{slug(sub)}": (main, sub)
    for main, subs in CATEGORY_GROUPS.items()
    for sub in dict.fromkeys(subs)
}
COUNTS = Counter(sub for _, sub in CATALOG.values())


def resolve(category_id):
    if category_id not in CATALOG:
        raise ValueError("invalid_category")
    return CATALOG[category_id]


def stored_category(name):
    matches = [key for key, (_, sub) in CATALOG.items() if sub == name]
    return {
        "category_id": matches[0] if len(matches) == 1 else None,
        "category_name": name,
        "category_ambiguous": len(matches) > 1,
    }


def filter_names(category_id):
    if category_id in CATALOG:
        names = [CATALOG[category_id][1]]
    else:
        names = [
            sub for key, (_, sub) in CATALOG.items() if key.split(".")[0] == category_id
        ]
    if not names:
        raise ValueError("invalid_category")
    if any(COUNTS[name] != 1 for name in names):
        raise ValueError("ambiguous_category_filter")
    return names


def list_catalog():
    return {
        "version": "2026-11-21",
        "default_currency": "USD",
        "categories": [
            {
                "id": slug(main),
                "name": main,
                "filter_supported": all(COUNTS[sub] == 1 for sub in set(subs)),
                "subcategories": [
                    {
                        "id": f"{slug(main)}.{slug(sub)}",
                        "name": sub,
                        "filter_supported": COUNTS[sub] == 1,
                    }
                    for sub in dict.fromkeys(subs)
                ],
            }
            for main, subs in CATEGORY_GROUPS.items()
        ],
    }
