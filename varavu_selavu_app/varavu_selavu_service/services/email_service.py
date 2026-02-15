
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from varavu_selavu_service.core.config import Settings
import logging

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def send_email(self, subject: str, body: str, to_email: str, reply_to: str | None = None, from_email: str | None = None):
        if not self.settings.MAIL_USERNAME or not self.settings.MAIL_PASSWORD:
            logger.warning("Email credentials not set. Skipping email sending.")
            return

        msg = MIMEMultipart()
        # Use custom from_email if provided, otherwise default to config
        # Note: Gmail may rewrite this to the authenticated user
        msg["From"] = from_email or self.settings.MAIL_FROM or self.settings.MAIL_USERNAME
        msg["To"] = to_email
        msg["Subject"] = subject
        
        if reply_to:
            msg["Reply-To"] = reply_to

        msg.attach(MIMEText(body, "plain"))

        try:
            with smtplib.SMTP(self.settings.MAIL_SERVER, self.settings.MAIL_PORT) as server:
                server.starttls()
                server.login(self.settings.MAIL_USERNAME, self.settings.MAIL_PASSWORD)
                server.send_message(msg)
                logger.info(f"Email sent to {to_email}")
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            raise
