"""CSV formula-injection ("CSV injection") guard for export endpoints.

A spreadsheet treats a cell whose text begins with one of `= + - @` (or a
leading tab/CR) as a formula, so an expense description such as
`=cmd|'/c calc'!A1` would execute on open. Prefixing with a single quote makes
the cell render as literal text instead.

Only `str` cells are guarded — numeric cells (amounts) are passed through so a
legitimately negative number is not mangled into text.
"""

from typing import Iterable, List

_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def sanitize_csv_cell(value):
    """Neutralizes a single cell. Non-str values are returned unchanged."""
    if not isinstance(value, str):
        return value
    if value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def sanitize_csv_row(row: Iterable) -> List:
    return [sanitize_csv_cell(cell) for cell in row]
