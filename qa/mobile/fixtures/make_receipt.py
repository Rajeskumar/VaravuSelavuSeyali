#!/usr/bin/env python3
"""Renders the synthetic receipt used by the receipt-import flow (no real data). Run with any Python that has Pillow:
    python3 qa/mobile/fixtures/make_receipt.py
Output: qa/mobile/fixtures/receipt.jpg (also committed, so CI does not need fonts or Pillow)."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

LINES = [
    ("BLUE BOTTLE COFFEE", None),
    ("123 MARKET STREET", None),
    ("ORDER 4821", None),   # no date on purpose: a fixed date would age into the app's "older than a year" rule
    ("", None),
    ("LATTE", "4.50"),
    ("CROISSANT", "3.75"),
    ("COLD BREW", "5.00"),
    ("", None),
    ("SUBTOTAL", "13.25"),
    ("TAX 8.5%", "1.13"),
    ("TOTAL", "14.38"),
    ("", None),
    ("VISA ****1234", None),
    ("THANK YOU", None),
]
FONTS = ["/System/Library/Fonts/Supplemental/Courier New Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"]

font_path = next((f for f in FONTS if Path(f).exists()), None)
font = ImageFont.truetype(font_path, 44) if font_path else ImageFont.load_default()
width, line_h, pad = 900, 78, 70
img = Image.new("RGB", (width, pad * 2 + line_h * len(LINES)), "white")
draw = ImageDraw.Draw(img)
for i, (left, right) in enumerate(LINES):
    y = pad + i * line_h
    draw.text((pad, y), left, fill="black", font=font)
    if right:
        w = draw.textlength(right, font=font)
        draw.text((width - pad - w, y), right, fill="black", font=font)
out = Path(__file__).with_name("receipt.jpg")
img.save(out, quality=92)
print(out, img.size)
