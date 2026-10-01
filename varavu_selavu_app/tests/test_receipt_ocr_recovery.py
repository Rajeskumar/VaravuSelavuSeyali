"""Regression coverage for receipt preprocessing, recovery and false confidence."""
import os
from pathlib import Path
from unittest.mock import patch

import pytest
from PIL import Image, ImageDraw

from varavu_selavu_service.services.ocr.engine import _crop_receipt, _prepare_image
from varavu_selavu_service.services.ocr.layout import OcrRow
from varavu_selavu_service.services.receipt_service import ReceiptService
from varavu_selavu_service.services.receipt_text_parser import ReceiptTextParser
from scripts.eval_receipts import run_engine

CLEAR = ['India Bazaar', '8/8/2025 9:25:39 PM',
         '2 FS FRESH CHAPATHI 10 PC  $7.98',
         '1 FS FRESH CURRY LEAVES BIG  $2.99',
         '1FS LAXMI SPANISH PEANUTS  $8.49',
         '1 FS GS MOR KUZHAMBU 14OZ  $7.99',
         'SCL FS FRESH GINGER PER LB  $0.32',
         '0.16 1b @ $1.99/1b', '1FS DOSA BATTER  $5.49',
         'Subtotal  $33.26', 'GRAND TOTAL  $33.26']
READ = 'varavu_selavu_service.services.ocr.engine.read_receipt'


def rows(texts, score=0.99):
    return [OcrRow(t, float(i), score) for i, t in enumerate(texts)]


def test_weight_quantity_and_product_suffixes():
    r = ReceiptTextParser().parse(CLEAR)
    assert r.header['amount'] == 33.26
    assert len(r.items) == 6
    assert r.items[0]['quantity'] == 2
    assert r.items[0]['unit_price'] == 3.99
    assert r.items[0]['item_name'].endswith('10 PC')
    assert r.items[2]['item_name'] == 'FS LAXMI SPANISH PEANUTS'
    ginger = r.items[4]
    assert ginger['quantity'] == 0.16
    assert ginger['unit'] == 'lb'
    assert ginger['unit_price'] == 1.99
    assert ginger['line_total'] == 0.32
    assert ginger['item_name'].endswith('PER LB')
    assert r.confidence >= 0.85


def test_never_remove_a_product_to_fit_wrong_total():
    r = ReceiptTextParser().parse(['Walmart', '09/20/2026', 'MILK  3.00',
                                 'BREAD  4.00', 'EGGS  5.00', 'TOTAL  9.00'])
    assert [i['item_name'] for i in r.items[:3]] == ['MILK', 'BREAD', 'EGGS']
    assert r.confidence < 0.75
    assert r.warnings


def test_low_quality_prices_cannot_pass_from_balancing_alone():
    result = ReceiptService().parse_ocr_rows(CLEAR, recognition_scores=[0.6] * len(CLEAR))
    assert result['confidence'] < 0.75
    assert any('OCR confidence' in w for w in result['warnings'])


def test_crop_preserves_resolution_and_uncertain_scene():
    image = Image.new('RGB', (2400, 3200), 'black')
    ImageDraw.Draw(image).rectangle((800, 200, 1600, 3000), fill='white')
    cropped = _crop_receipt(image)
    assert 800 <= cropped.width < 850
    assert cropped.height >= 2800
    blank = Image.new('RGB', (1200, 1600), 'white')
    assert _crop_receipt(blank).size == blank.size
    two = Image.new('RGB', (2400, 1600), 'black')
    draw = ImageDraw.Draw(two)
    draw.rectangle((100, 100, 1000, 1500), fill='white')
    draw.rectangle((1400, 100, 2300, 1500), fill='white')
    assert _crop_receipt(two).size == two.size
    sideways = image.transpose(Image.Transpose.ROTATE_90)
    prepared = _prepare_image(sideways)
    assert prepared.height > prepared.width * 2


def test_clear_read_skips_retries_and_weak_read_recovers():
    svc = ReceiptService(engine='local')
    with patch(READ, return_value=rows(CLEAR)) as reader, patch.object(svc, '_call_gemini') as llm:
        assert svc.parse_ocr(b'image')['confidence'] >= 0.85
        assert reader.call_count == 1
        llm.assert_not_called()
    with patch(READ, side_effect=[rows(['UNKNOWN']), rows(CLEAR)]) as reader:
        assert svc.parse_ocr(b'image')['header']['amount'] == 33.26
        assert reader.call_count == 2


def test_recovery_is_bounded_and_keeps_best_result():
    svc = ReceiptService(engine='local')
    partial = rows(['Walmart', '09/20/2026', 'TOTAL  10.00'])
    with patch(READ, side_effect=[partial, [], []]) as reader:
        assert svc.parse_ocr(b'image')['header']['amount'] == 10
        assert reader.call_count == 3
    with patch(READ, side_effect=[partial, RuntimeError('recovery failed')]):
        assert svc.parse_ocr(b'image')['header']['amount'] == 10
    with patch(READ, return_value=partial) as reader, patch(
        'varavu_selavu_service.services.receipt_service.time.monotonic', side_effect=[0, 21, 21]
    ):
        svc.parse_ocr(b'image')
        assert reader.call_count == 1


def test_eval_cache_does_not_repeat_paid_calls():
    svc = ReceiptService()
    with patch.object(svc, 'parse_ocr', return_value={'confidence': 0.2}) as local, patch.object(
        svc, 'parse', return_value={'header': {'amount': 33.26}}
    ) as llm:
        cache = {}
        run_engine(svc, 'local', b'image', 'image/png', cache)
        run_engine(svc, 'gemini', b'image', 'image/png', cache)
        result = run_engine(svc, 'hybrid', b'image', 'image/png', cache)
        assert result['_llm_called']
        local.assert_called_once()
        llm.assert_called_once()
    with patch.object(svc, 'parse_ocr', side_effect=RuntimeError('OCR failed')), patch.object(
        svc, 'parse', return_value={'header': {'amount': 33.26}}
    ):
        assert run_engine(svc, 'hybrid', b'image', 'image/png', {})['_llm_called']


@pytest.mark.parametrize('filename', ['IMG_3302.jpg', 'test_receipt.png'])
def test_private_receipt_samples(filename):
    """Opt in with RECEIPT_SAMPLE_DIR; personal photos are never checked in."""
    folder = os.environ.get('RECEIPT_SAMPLE_DIR')
    if not folder:
        pytest.skip('Set RECEIPT_SAMPLE_DIR to run private receipt regression images')
    svc = ReceiptService(engine='local')
    with patch.object(svc, '_call_gemini') as llm:
        r = svc.parse_ocr((Path(folder) / filename).read_bytes())
        llm.assert_not_called()
    assert r['header']['merchant_name'] == 'India Bazaar'
    assert r['header']['purchased_at'] == '2025-08-08T21:25:39'
    assert r['header']['amount'] == 33.26
    assert [i['line_total'] for i in r['items']] == [7.98, 2.99, 8.49, 7.99, 0.32, 5.49]
    for item, word in zip(r['items'], ['CHAPATHI', 'CURRY', 'PEANUTS', 'KUZHAMBU', 'GINGER', 'DOSA']):
        assert word in item['item_name']
    assert r['items'][0]['quantity'] == 2
    assert r['items'][4]['quantity'] == 0.16
    assert r['items'][4]['unit'] == 'lb'
    assert r['items'][4]['unit_price'] == 1.99
    assert r['confidence'] >= 0.75
    assert not r['warnings']
