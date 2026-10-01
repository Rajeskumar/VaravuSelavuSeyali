"""Turn OCR text fragments into receipt rows.

OCR engines (RapidOCR on the server, ML Kit on the phone) return fragments —
"BANANAS" and "0.69 F" come back as separate boxes because of the gap between
the description and the price column. A receipt parser needs them on one row,
so fragments are clustered by vertical centre and then read left to right.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field, replace
from statistics import median
from typing import List, Optional, Sequence


@dataclass
class OcrFragment:
    text: str
    x: float
    y: float
    w: float
    h: float
    conf: float = 1.0
    # Baseline angle in radians (from the box's top edge), 0 when unknown.
    angle: float = 0.0

    @property
    def cy(self) -> float:
        return self.y + self.h / 2


@dataclass
class OcrRow:
    text: str
    y: float
    conf: float
    fragments: List[OcrFragment] = field(default_factory=list)


def group_rows(fragments: Sequence[OcrFragment], image_width: Optional[float] = None) -> List[OcrRow]:
    frags = [f for f in fragments if f.text and f.text.strip()]
    if not frags:
        return []
    frags = _deskew(frags)
    typical_h = median(f.h for f in frags) or 1.0
    width = image_width or max(f.x + f.w for f in frags)

    rows: List[List[OcrFragment]] = []
    row_cy: List[float] = []
    for frag in sorted(frags, key=lambda f: f.cy):
        # Tolerance scales with text height so small print and headline text
        # both cluster correctly; slightly generous to absorb photo skew.
        tol = 0.55 * max(min(frag.h, 2 * typical_h), 0.5 * typical_h)
        best_i = None
        best_d = None
        for i in range(max(0, len(rows) - 4), len(rows)):
            d = abs(row_cy[i] - frag.cy)
            if d <= tol and (best_d is None or d < best_d):
                # Never merge two fragments that overlap horizontally — they're
                # stacked lines, not columns of the same row.
                if any(_x_overlap(frag, other) > 0.3 * min(frag.w, other.w) for other in rows[i]):
                    continue
                best_i, best_d = i, d
        if best_i is None:
            rows.append([frag])
            row_cy.append(frag.cy)
        else:
            rows[best_i].append(frag)
            row_cy[best_i] = sum(f.cy for f in rows[best_i]) / len(rows[best_i])

    out: List[OcrRow] = []
    for members in rows:
        members.sort(key=lambda f: f.x)
        parts = [members[0].text.strip()]
        for prev, cur in zip(members, members[1:]):
            gap = cur.x - (prev.x + prev.w)
            # A wide gap is a column break (description | price); keep it
            # visible as a double space so the parser can tell columns apart.
            parts.append(("  " if gap > 0.04 * width else " ") + cur.text.strip())
        out.append(
            OcrRow(
                text="".join(parts),
                y=min(f.y for f in members),
                conf=min(f.conf for f in members),
                fragments=members,
            )
        )
    out.sort(key=lambda r: r.y)
    return out


def _x_overlap(a: OcrFragment, b: OcrFragment) -> float:
    return max(0.0, min(a.x + a.w, b.x + b.w) - max(a.x, b.x))


def _deskew(frags: List[OcrFragment]) -> List[OcrFragment]:
    """Undo photo rotation before clustering rows. Even 2 degrees across a
    receipt's width shifts the price column by about a row height, which would
    otherwise split "SUBTOTAL" and its amount onto separate rows."""
    # Only wide boxes give a reliable baseline angle.
    angles = [f.angle for f in frags if f.w > 2 * f.h and abs(f.angle) < math.radians(20)]
    if len(angles) < 3:
        return frags
    theta = median(angles)
    if abs(theta) < math.radians(0.3):
        return frags
    tan = math.tan(theta)
    # Shift each box vertically by how far its centre sits along the tilted baseline.
    return [replace(f, y=f.y - (f.x + f.w / 2) * tan) for f in frags]
