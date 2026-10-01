"""ReceiptTextParser on OCR-row fixtures shaped like real receipts."""
from datetime import date

import pytest

from varavu_selavu_service.services.receipt_text_parser import UNREADABLE_ITEMS_NAME, ReceiptTextParser
from varavu_selavu_service.services.ocr.layout import OcrFragment, group_rows

TODAY = date(2026, 9, 26)


def parse(text: str):
    rows = [ln for ln in text.strip("\n").split("\n")]
    return ReceiptTextParser(today=TODAY).parse(rows)


def names(result):
    return [i["item_name"] for i in result.items]


def items_sum(result):
    return round(sum(i["line_total"] for i in result.items), 2)


def assert_reconciles(result):
    h = result.header
    assert round(items_sum(result) + h["tax"] + h["tip"] - h["discount"], 2) == pytest.approx(h["amount"], abs=0.02)


WALMART = """
Walmart
Save money. Live better.
( 555 ) 123 - 4567
1234 MAIN ST
SPRINGFIELD IL 62701
ST# 05213 OP# 009018 TE# 18 TR# 07734
BANANAS 000000004011K  1.24 N
GV WHL MILK 007874235187  3.48 N
BNLS CHKN BRST 022655800000  8.97 N
PAPER TOWELS 003700074784  12.97 X
SUN CHIPS 002840058930  4.28 X
SUBTOTAL  30.94
TAX 1 7.250 %  1.25
TOTAL  32.19
VISA TEND  32.19
US DEBIT  **** **** **** 1234 I 0
APPROVAL # 06785C
CHANGE DUE  0.00
# ITEMS SOLD 5
TC# 0943 2983 7722 0911 3521
07/14/26  12:31:07
"""


def test_walmart_grocery():
    r = parse(WALMART)
    h = r.header
    assert h["normalized_merchant_name"] == "Walmart"
    assert (h["main_category_name"], h["category_name"]) == ("Food & Drink", "Groceries")
    assert h["amount"] == 32.19
    assert h["tax"] == 1.25
    assert h["purchased_at"] == "2026-07-14T12:31:07"
    assert names(r) == ["BANANAS", "GV WHL MILK", "BNLS CHKN BRST", "PAPER TOWELS", "SUN CHIPS"]
    assert r.reconciled
    assert_reconciles(r)
    cats = {i["item_name"]: i["category_name"] for i in r.items}
    assert cats["PAPER TOWELS"] == "Household supplies"
    assert cats["BNLS CHKN BRST"] == "Groceries"
    assert r.items[2]["normalized_name"] == "Boneless Chicken Breast"
    assert r.confidence >= 0.9


COSTCO = """
COSTCO
WHOLESALE
Mountain View #144
1000 N Rengstorff Ave
Mountain View, CA 94043
E  512515 KS WATER 40PK  4.49 E
E  1105910 ORG BANANAS  1.99
E  97823 KS PAPER TOWEL  22.99 A
0000358127 / 97823  4.00-
E  1250044 HDMI CABLE 2PK  14.99 A
SUBTOTAL  40.46
TAX  3.30
**** TOTAL  43.76
XXXXXXXXXXXX1234 CHIP Read
AID: A0000000031010
VISA  43.76
CHANGE  0.00
TOTAL NUMBER OF ITEMS SOLD = 4
09/20/2026 17:42 144 11 88 423
"""


def test_costco_instant_savings_line_is_item_discount():
    r = parse(COSTCO)
    assert r.header["normalized_merchant_name"] == "Costco Wholesale"
    assert r.header["amount"] == 43.76
    assert r.header["tax"] == 3.30
    assert r.header["purchased_at"].startswith("2026-09-20T17:42")
    totals = [i["line_total"] for i in r.items]
    assert -4.00 in totals
    assert r.reconciled
    assert_reconciles(r)
    cats = {i["item_name"]: i["category_name"] for i in r.items}
    assert cats["HDMI CABLE 2PK"] == "Electronics"
    assert cats["KS PAPER TOWEL"] == "Household supplies"


RESTAURANT = """
TAJ INDIAN KITCHEN
742 Evergreen Terrace
Springfield
Server: Priya   Table 12
Guests: 2
Sep 18, 2026 8:05 PM
2 Garlic Naan  7.98
Chicken Tikka Masala  18.95
Mango Lassi  4.50
Subtotal  31.43
Sales Tax  2.83
Tip  6.00
Total  40.26
Suggested Tip: 18% = 5.66  20% = 6.29
"""


def test_restaurant_with_tip_and_leading_qty():
    r = parse(RESTAURANT)
    h = r.header
    assert h["normalized_merchant_name"] == "Taj Indian Kitchen"
    assert (h["main_category_name"], h["category_name"]) == ("Food & Drink", "Dining out")
    assert h["tip"] == 6.00
    assert h["tax"] == 2.83
    assert h["amount"] == 40.26
    assert h["purchased_at"] == "2026-09-18T20:05:00"
    naan = r.items[0]
    assert naan["item_name"] == "Garlic Naan"
    assert naan["quantity"] == 2
    assert naan["unit_price"] == 3.99
    assert all(i["category_name"] == "Dining out" for i in r.items)
    assert r.reconciled
    assert_reconciles(r)


GAS = """
Shell
2200 El Camino Real
PUMP # 04
UNLEADED
10.512 G @ 4.599/G
FUEL TOTAL  48.35
TOTAL  48.35
MASTERCARD  48.35
09/25/2026 07:15
"""


def test_gas_station_single_line():
    r = parse(GAS)
    assert r.header["normalized_merchant_name"] == "Shell"
    assert r.header["category_name"] == "Gas/fuel"
    assert r.header["amount"] == 48.35
    assert items_sum(r) == 48.35
    assert_reconciles(r)


PHARMACY = """
CVS pharmacy
store 1234
TYLENOL EX STR 100CT  11.99
  CVS COUPON  2.00-
GREETING CARD  4.99
BAND AID FLEX 30CT  5.49
SUBTOTAL  20.47
TAX  0.86
TOTAL  21.33
YOU SAVED  2.00
08/02/2026
"""


def test_pharmacy_coupon_and_items_that_look_like_noise():
    r = parse(PHARMACY)
    assert r.header["normalized_merchant_name"] == "CVS Pharmacy"
    assert "GREETING CARD" in names(r)
    assert "BAND AID FLEX 30CT" in names(r)
    assert any(i["line_total"] == -2.00 for i in r.items)
    assert r.header["purchased_at"] == "2026-08-02T12:00:00"
    assert r.reconciled
    assert_reconciles(r)
    cats = {i["item_name"]: i["category_name"] for i in r.items}
    assert cats["TYLENOL EX STR 100CT"] == "Medical expenses"
    assert cats["GREETING CARD"] == "Gifts"


def test_weight_and_qty_rows_attach_to_named_item():
    r = parse("""
Kroger
BANANAS
2.10 lb @ 0.59 /lb  1.24
COKE 12PK
2 @ 5.99
SUBTOTAL  13.22
TAX  0.00
TOTAL  13.22
09/01/2026
""")
    bananas, coke = r.items
    assert bananas["item_name"] == "BANANAS" and bananas["quantity"] == 2.10 and bananas["unit"] == "lb"
    assert bananas["line_total"] == 1.24
    assert coke["item_name"] == "COKE 12PK" and coke["quantity"] == 2 and coke["line_total"] == 11.98
    assert r.reconciled


def test_unreadable_gap_adds_explicit_balancing_line():
    # One item's price is unreadable OCR garbage, so items fall short of the subtotal.
    r = parse("""
Safeway
MILK  3.49
EGGS L@RGE  $#.9?
BREAD  2.99
SUBTOTAL  10.97
TAX  0.00
TOTAL  10.97
09/10/2026
""")
    assert not r.reconciled
    gap_line = r.items[-1]
    assert gap_line["item_name"] == UNREADABLE_ITEMS_NAME
    assert gap_line["line_total"] == 4.49
    assert any("please review" in w for w in r.warnings)
    assert_reconciles(r)
    assert r.confidence < 0.8


def test_misread_tax_is_repaired_when_items_match_subtotal():
    r = parse("""
Target
SHAMPOO  6.99
TOOTHPASTE  3.49
SUBTOTAL  10.48
TAX  8.00
TOTAL  11.30
09/12/2026
""")
    assert r.header["tax"] == 0.82
    assert r.reconciled
    assert any("Tax adjusted" in w for w in r.warnings)


def test_ocr_digit_drift_and_glued_flags():
    r = parse("""
Trader Joe's
ORGANIC SPINACH  2.49F
HUMMUS  3,99 F
SUBTOTAL  6.48
TOTAL  6.4O
09/05/2026
""")
    assert r.header["amount"] == 6.40 or r.header["amount"] == 6.48
    assert [i["line_total"] for i in r.items][:2] == [2.49, 3.99]


def test_no_items_falls_back_to_single_line():
    r = parse("""
Blue Bottle Coffee
TOTAL  5.40
09/22/2026 08:01
""")
    assert r.header["category_name"] == "Dining out"
    assert len(r.items) == 1 and r.items[0]["line_total"] == 5.40
    assert not r.reconciled
    assert r.confidence < 0.75
    assert any("No item prices" in w for w in r.warnings)


def test_unknown_merchant_with_no_date_or_total_is_low_confidence():
    r = parse("""
SOME PLACE
THING  3.00
OTHER THING  4.00
""")
    assert r.confidence < 0.5
    assert any("purchase date" in w for w in r.warnings)


@pytest.mark.parametrize(
    "line,expected",
    [
        ("DATE 2026-09-01 10:15", "2026-09-01T10:15:00"),
        ("14-Sep-2026", "2026-09-14T12:00:00"),
        ("25/08/2026 9:05 am", "2026-08-25T09:05:00"),
        ("Sept 3, 2026 12:30 AM", "2026-09-03T00:30:00"),
    ],
)
def test_date_formats(line, expected):
    r = parse(f"Kroger\n{line}\nTOTAL  1.00\n")
    assert r.header["purchased_at"] == expected


def test_future_and_ancient_dates_are_rejected():
    r = parse("Kroger\n01/01/2030\n01/01/2001\nTOTAL  1.00\n")
    assert r.header["purchased_at"] == ""


def test_group_rows_joins_price_column_and_separates_stacked_lines():
    frags = [
        OcrFragment("BANANAS", 20, 100, 120, 20),
        OcrFragment("0.69 F", 400, 102, 70, 20),
        OcrFragment("MILK", 20, 130, 60, 20),
        OcrFragment("3.48", 400, 131, 50, 20),
        OcrFragment("WALMART", 150, 20, 200, 40),
    ]
    rows = group_rows(frags, image_width=500)
    assert [r.text for r in rows] == ["WALMART", "BANANAS  0.69 F", "MILK  3.48"]


def test_real_ocr_on_rendered_receipt():
    """Smoke test through the actual RapidOCR models (skipped where the wheel is missing)."""
    pytest.importorskip("rapidocr_onnxruntime")
    import io

    from PIL import Image, ImageDraw, ImageFont

    from varavu_selavu_service.services.ocr import engine

    lines = [ln for ln in PHARMACY.strip("\n").split("\n")]
    img = Image.new("RGB", (620, 40 + len(lines) * 34), "white")
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("DejaVuSansMono.ttf", 20)
    except OSError:
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 20)
        except OSError:
            font = ImageFont.load_default(size=20)
    for i, ln in enumerate(lines):
        if "  " in ln:
            left, right = ln.rsplit("  ", 1)
            draw.text((25, 20 + i * 34), left, fill="black", font=font)
            draw.text((600 - draw.textlength(right, font=font), 20 + i * 34), right, fill="black", font=font)
        else:
            draw.text((25, 20 + i * 34), ln, fill="black", font=font)
    buf = io.BytesIO()
    img.rotate(2, expand=True, fillcolor="white").save(buf, "JPEG", quality=80)

    rows = engine.read_receipt(buf.getvalue(), "image/jpeg")
    r = ReceiptTextParser(today=TODAY).parse([row.text for row in rows])
    assert r.header["normalized_merchant_name"] == "CVS Pharmacy"
    assert r.header["amount"] == 21.33
    assert r.reconciled
