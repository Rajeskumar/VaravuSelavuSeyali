"""Receipt routes with the non-LLM engines: /parse with local/hybrid OCR, and /parse_ocr."""
from unittest.mock import patch

import pytest

from varavu_selavu_service.api.routes import get_receipt_service
from varavu_selavu_service.db.models import AiUsageDaily
from varavu_selavu_service.services import ai_quota_service
from varavu_selavu_service.services.ocr.layout import OcrRow
from varavu_selavu_service.services.receipt_service import ReceiptService

PARSE_URL = "/api/v1/ingest/receipt/parse"
PARSE_OCR_URL = "/api/v1/ingest/receipt/parse_ocr"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
READ_RECEIPT = "varavu_selavu_service.services.ocr.engine.read_receipt"

CLEAR_RECEIPT = [
    "Trader Joe's",
    "09/05/2026 14:02",
    "ORGANIC SPINACH  2.49",
    "HUMMUS  3.99",
    "SUBTOTAL  6.48",
    "TAX  0.00",
    "TOTAL  6.48",
]
# No total, no date, unknown store: the rule parser can't vouch for this one.
MESSY_RECEIPT = ["SOME PLACE", "THING  3.00", "OTHER THING  4.00"]
GEMINI_RESULT = {
    "header": {
        "merchant_name": "Some Place", "purchased_at": "2026-09-05T10:00:00", "amount": 7.0,
        "tax": 0, "tip": 0, "discount": 0, "main_category_name": "Other", "category_name": "General",
    },
    "items": [{"line_no": 1, "item_name": "Thing", "line_total": 7.0, "category_name": "General"}],
}


@pytest.fixture(autouse=True)
def _reset_spend_cache():
    ai_quota_service.reset_spend_cache()
    yield
    ai_quota_service.reset_spend_cache()


@pytest.fixture
def engine(test_client, monkeypatch):
    monkeypatch.setenv("AI_ENABLED", "true")
    monkeypatch.setenv("AI_RECEIPT_DAILY_LIMIT", "5")
    monkeypatch.setenv("AI_GLOBAL_DAILY_BUDGET_USD", "100")

    def use(name):
        test_client.app.dependency_overrides[get_receipt_service] = lambda: ReceiptService(engine=name)

    yield use
    test_client.app.dependency_overrides.pop(get_receipt_service, None)


def _rows(lines):
    return [OcrRow(text=t, y=float(i), conf=0.99) for i, t in enumerate(lines)]


def _upload(client):
    return client.post(PARSE_URL, files={"file": ("r.png", PNG_MAGIC + b"img", "image/png")})


def _receipt_usage(db):
    db.expire_all()
    row = db.query(AiUsageDaily).filter_by(user_email="test@user.com", feature="receipt").first()
    return row.count if row else 0


def test_local_engine_reads_receipt_without_llm(test_client, db_session, engine):
    engine("local")
    with patch(READ_RECEIPT, return_value=_rows(CLEAR_RECEIPT)), patch.object(ReceiptService, "_call_gemini") as llm:
        res = _upload(test_client)
    assert res.status_code == 200, res.text
    body = res.json()
    llm.assert_not_called()
    assert body["source"] == "ocr"
    assert body["confidence"] >= 0.9
    assert body["header"]["merchant_name"] == "Trader Joe's"
    assert body["header"]["merchant_name_raw"] == "Trader Joe's"
    assert body["header"]["amount"] == 6.48
    assert body["header"]["category_name"] == "Groceries"
    assert [i["item_name"] for i in body["items"]] == ["ORGANIC SPINACH", "HUMMUS"]
    assert body["fingerprint"]
    assert _receipt_usage(db_session) == 0


def test_hybrid_confident_read_skips_llm_and_quota(test_client, db_session, engine):
    engine("hybrid")
    with patch(READ_RECEIPT, return_value=_rows(CLEAR_RECEIPT)), patch.object(ReceiptService, "_call_gemini") as llm:
        body = _upload(test_client).json()
    llm.assert_not_called()
    assert body["source"] == "ocr"
    assert _receipt_usage(db_session) == 0


def test_hybrid_unsure_read_falls_back_to_llm_and_is_metered(test_client, db_session, engine):
    engine("hybrid")
    with patch(READ_RECEIPT, return_value=_rows(MESSY_RECEIPT)), patch.object(
        ReceiptService, "_call_gemini", return_value=GEMINI_RESULT
    ) as llm:
        body = _upload(test_client).json()
    llm.assert_called_once()
    assert body["source"] == "ocr+llm"
    assert body["header"]["amount"] == 7.0
    assert _receipt_usage(db_session) == 1


def test_hybrid_over_quota_returns_ocr_result_with_note(test_client, db_session, engine, monkeypatch):
    engine("hybrid")
    monkeypatch.setenv("AI_RECEIPT_DAILY_LIMIT", "0")
    with patch(READ_RECEIPT, return_value=_rows(MESSY_RECEIPT)), patch.object(ReceiptService, "_call_gemini") as llm:
        res = _upload(test_client)
    assert res.status_code == 200
    llm.assert_not_called()
    body = res.json()
    assert body["source"] == "ocr"
    assert any("AI limit" in w for w in body["warnings"])


def test_hybrid_llm_failure_refunds_and_returns_ocr_result(test_client, db_session, engine):
    engine("hybrid")
    with patch(READ_RECEIPT, return_value=_rows(MESSY_RECEIPT)), patch.object(
        ReceiptService, "_call_gemini", side_effect=RuntimeError("provider down")
    ):
        res = _upload(test_client)
    assert res.status_code == 200
    assert res.json()["source"] == "ocr"
    assert _receipt_usage(db_session) == 0


def test_hybrid_ocr_crash_uses_llm(test_client, db_session, engine):
    engine("hybrid")
    with patch(READ_RECEIPT, side_effect=RuntimeError("bad image")), patch.object(
        ReceiptService, "_call_gemini", return_value=GEMINI_RESULT
    ):
        body = _upload(test_client).json()
    assert body["source"] == "llm"
    assert _receipt_usage(db_session) == 1


def test_local_engine_ocr_crash_is_a_clean_422(test_client, db_session, engine):
    engine("local")
    with patch(READ_RECEIPT, side_effect=RuntimeError("bad image")):
        res = _upload(test_client)
    assert res.status_code == 422


def _line(text, x, y, w=100, h=20):
    return {"text": text, "box": [x, y, w, h], "conf": 0.98}


def test_parse_ocr_groups_on_device_lines(test_client, db_session, engine):
    engine("hybrid")
    lines = [
        _line("Trader Joe's", 150, 10, 200, 30),
        _line("09/05/2026 14:02", 20, 50, 200),
        _line("ORGANIC SPINACH", 20, 90, 200),
        _line("2.49", 400, 92, 50),
        _line("HUMMUS", 20, 120),
        _line("3.99", 400, 121, 50),
        _line("SUBTOTAL", 20, 150),
        _line("6.48", 400, 150, 50),
        _line("TOTAL", 20, 180),
        _line("6.48", 400, 181, 50),
    ]
    with patch.object(ReceiptService, "_call_gemini") as llm:
        res = test_client.post(PARSE_OCR_URL, json={"lines": lines, "image_width": 500, "image_height": 400})
    assert res.status_code == 200, res.text
    llm.assert_not_called()
    body = res.json()
    assert body["needs_image"] is False
    assert body["header"]["amount"] == 6.48
    assert [(i["item_name"], i["line_total"]) for i in body["items"]] == [("ORGANIC SPINACH", 2.49), ("HUMMUS", 3.99)]
    assert _receipt_usage(db_session) == 0


def test_parse_ocr_flags_weak_reads_for_image_upload(test_client, db_session, engine):
    engine("hybrid")
    res = test_client.post(PARSE_OCR_URL, json={"lines": [{"text": t} for t in MESSY_RECEIPT]})
    assert res.status_code == 200
    assert res.json()["needs_image"] is True


def test_parse_ocr_caps_payload(test_client, db_session, engine):
    engine("hybrid")
    too_many = [{"text": "X  1.00"}] * 401
    assert test_client.post(PARSE_OCR_URL, json={"lines": too_many}).status_code == 422
    too_long = [{"text": "X" * 201}]
    assert test_client.post(PARSE_OCR_URL, json={"lines": too_long}).status_code == 422


def test_parse_ocr_low_recognition_scores_request_image(test_client, engine):
    engine('hybrid')
    lines = [{'text': t, 'conf': 0.6} for t in CLEAR_RECEIPT]
    with patch.object(ReceiptService, '_call_gemini') as llm:
        res = test_client.post(PARSE_OCR_URL, json={'lines': lines})
    assert res.status_code == 200
    assert res.json()['needs_image'] is True
    llm.assert_not_called()
