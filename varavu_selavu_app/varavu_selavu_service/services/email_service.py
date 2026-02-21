"""Generic email service – sends SMTP messages via Gmail relay."""

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from varavu_selavu_service.core.config import Settings

_settings = Settings()


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
    recipient = _settings.MAIL_FROM  # send to the app owner's mailbox

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[{form_type.upper().replace('_', ' ')}] {subject}"
    msg["From"] = sender
    msg["To"] = recipient

    # ---- plain text part ----
    text_lines = [
        f"Form type : {form_type}",
        f"From      : {name or 'N/A'} <{user_email}>",
        f"Subject   : {subject}",
        "",
        "Message:",
        message_body,
    ]
    text_part = MIMEText("\n".join(text_lines), "plain")

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
        <p style="margin-top:24px;font-size:12px;color:#94a3b8">Sent from Varavu Selavu App</p>
    </div>
    """
    html_part = MIMEText(html_body, "html")

    msg.attach(text_part)
    msg.attach(html_part)

    with smtplib.SMTP(_settings.MAIL_SERVER, _settings.MAIL_PORT) as server:
        server.starttls()
        server.login(_settings.MAIL_USERNAME, _settings.MAIL_PASSWORD)
        server.sendmail(sender, [recipient], msg.as_string())

    return True
