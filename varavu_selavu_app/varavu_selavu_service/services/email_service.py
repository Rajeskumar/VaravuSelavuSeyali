"""Generic email service – sends SMTP messages via Gmail relay."""

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import Header
from email.utils import formataddr
from varavu_selavu_service.core.config import Settings

import logging

_settings = Settings()
logger = logging.getLogger(__name__)


def send_email(
    *,
    form_type: str,
    user_email: str,
    subject: str,
    message_body: str,
    name: str | None = None,
) -> bool:
    """
    Send a generic email via SMTP.

    Parameters
    ----------
    form_type : str
        Identifies the form origin, e.g. ``feature_request`` or ``contact_us``.
    user_email : str
        Who submitted the form.
    subject : str
        Email subject line.
    message_body : str
        Main body text.
    name : str, optional
        Submitter's name.

    Returns
    -------
    bool
        ``True`` if the email was sent successfully.
    """
    sender = _settings.MAIL_FROM
    recipient = _settings.MAIL_TO or _settings.MAIL_FROM  # send to MAIL_TO, fallback to MAIL_FROM

    msg = MIMEMultipart("alternative")
    msg["Subject"] = Header(f"[{form_type.upper().replace('_', ' ')}] {subject}", "utf-8")
    
    # Gmail requires the 'From' address to match the authenticated account.
    # We put the user's name/email in the display name portion, and set a Reply-To header.
    display_name = name or (user_email if user_email != "anonymous" else "Unknown User")
    msg["From"] = formataddr((str(Header(display_name, "utf-8")), sender))
    msg["To"] = recipient
    
    if user_email and user_email != "anonymous":
        msg.add_header("Reply-To", user_email)

    # ---- plain text part ----
    text_lines = [
        f"Form type : {form_type}",
        f"From      : {name or 'N/A'} <{user_email}>",
        f"Subject   : {subject}",
        "",
        "Message:",
        message_body,
    ]
    text_part = MIMEText("\n".join(text_lines), "plain", "utf-8")

    # ---- HTML part ----
    html_body = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
        <h2 style="color:#059669">{form_type.replace('_', ' ').title()}</h2>
        <table style="border-collapse:collapse;width:100%">
            <tr><td style="padding:8px;font-weight:bold;color:#475569">From</td>
                <td style="padding:8px">{name or 'N/A'} &lt;{user_email}&gt;</td></tr>
            <tr style="background:#f8fafc"><td style="padding:8px;font-weight:bold;color:#475569">Subject</td>
                <td style="padding:8px">{subject}</td></tr>
        </table>
        <div style="margin-top:16px;padding:16px;background:#f8fafc;border-radius:8px;white-space:pre-wrap">{message_body}</div>
        <p style="margin-top:24px;font-size:12px;color:#94a3b8">Sent from TrackSpense App</p>
    </div>
    """
    html_part = MIMEText(html_body, "html", "utf-8")

    msg.attach(text_part)
    msg.attach(html_part)

    if not _settings.MAIL_USERNAME or not _settings.MAIL_PASSWORD:
        logger.warning("MAIL_USERNAME or MAIL_PASSWORD not configured. Skipping actual email send.")
        logger.info("Mock Email Output:\n%s", msg.as_string())
        return True

    try:
        with smtplib.SMTP(_settings.MAIL_SERVER, _settings.MAIL_PORT) as server:
            server.starttls()
            server.login(_settings.MAIL_USERNAME, _settings.MAIL_PASSWORD)
            server.sendmail(sender, [recipient], msg.as_string())
    except smtplib.SMTPAuthenticationError as e:
        logger.error("SMTP Authentication failed. Check your MAIL_USERNAME and MAIL_PASSWORD (use an App Password for Gmail).", exc_info=True)
        raise Exception(f"SMTP Authentication failed: {e}") from e
    except Exception as e:
        logger.error("Failed to send email via SMTP.", exc_info=True)
        raise

    return True
