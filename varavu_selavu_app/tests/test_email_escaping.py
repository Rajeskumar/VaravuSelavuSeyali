"""The contact/feedback email builds an HTML part by string interpolation, so
user-supplied fields must be escaped at that sink (P0-1)."""

from email import message_from_string
from unittest.mock import MagicMock, patch

import pytest

from varavu_selavu_service.services import email_service


@pytest.fixture(autouse=True)
def _mock_email_sending():
    """Overrides conftest's global autouse fixture of the same name — that one replaces
    send_email wholesale (return_value=True) so no test accidentally performs a real SMTP send,
    but this file deliberately exercises send_email's real HTML-escaping logic (P0-1). SMTP
    itself is still mocked, just at the lower smtplib.SMTP level, in _sent_html below."""
    yield


def _sent_html(**kwargs):
    """Returns the HTML part of the message handed to SMTP.

    send_email() short-circuits before sending when mail credentials are absent
    (the default in tests), so they are patched in to reach the transport.
    """
    payload = {
        "form_type": "contact_us",
        "user_email": "user@test.com",
        "subject": "Hello",
        "message_body": "Body",
        "name": "Sai",
    }
    payload.update(kwargs)

    with patch.object(email_service._settings, "MAIL_USERNAME", "user"), \
         patch.object(email_service._settings, "MAIL_PASSWORD", "pw"), \
         patch.object(email_service.smtplib, "SMTP") as smtp:
        server = MagicMock()
        smtp.return_value.__enter__.return_value = server
        email_service.send_email(**payload)
        raw = server.sendmail.call_args[0][2]

    msg = message_from_string(raw)
    html_part = next(p for p in msg.walk() if p.get_content_subtype() == "html")
    return html_part.get_payload(decode=True).decode("utf-8")


def test_script_in_message_body_is_escaped():
    html = _sent_html(message_body="<script>alert(1)</script>")
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_markup_in_name_is_escaped():
    html = _sent_html(name="<img src=x onerror=alert(1)>")
    assert "<img" not in html
    assert "&lt;img" in html


def test_markup_in_subject_is_escaped():
    html = _sent_html(subject="<b>urgent</b>")
    assert "<b>urgent</b>" not in html
    assert "&lt;b&gt;urgent&lt;/b&gt;" in html


def test_ordinary_content_still_renders():
    html = _sent_html(message_body="Please add budgets")
    assert "Please add budgets" in html
