"""Email notification service using Gmail SMTP."""

from __future__ import annotations

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

SMTP_EMAIL = os.getenv("SMTP_EMAIL", "cipheraisecurecloud@gmail.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")  # Gmail App Password
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


def _build_share_email_html(
    sharer_name: str,
    sharer_email: str,
    file_name: str,
    permission: str,
    frontend_url: str,
) -> str:
    """Return a styled HTML email body for a file-share notification."""
    open_link = f"{frontend_url}/shared"
    permission_label = "view" if permission == "view" else "view & download"

    return f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1,#818cf8);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:22px;letter-spacing:.5px;">
              🔐 CipherAI SecureCloud
            </h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 18px;font-size:16px;color:#333;">Hi there 👋</p>
            <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
              <strong style="color:#333;">{sharer_name or sharer_email}</strong> has shared a
              file with you on <strong>CipherAI SecureCloud</strong>.
            </p>
            <!-- File card -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f8f9ff;border:1px solid #e0e4ff;border-radius:8px;margin-bottom:28px;">
              <tr>
                <td style="padding:18px 22px;">
                  <p style="margin:0 0 6px;font-size:13px;color:#888;">Shared File</p>
                  <p style="margin:0 0 10px;font-size:16px;font-weight:600;color:#333;">📄 {file_name}</p>
                  <p style="margin:0;font-size:13px;color:#6366f1;">
                    Permission: <strong>{permission_label}</strong>
                  </p>
                </td>
              </tr>
            </table>
            <!-- CTA button -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <a href="{open_link}"
                   style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;
                          padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;
                          letter-spacing:.3px;">
                  Open Shared Files →
                </a>
              </td></tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px 28px;text-align:center;border-top:1px solid #eee;">
            <p style="margin:0;font-size:12px;color:#aaa;">
              You received this email because someone shared a file with you on CipherAI SecureCloud.<br>
              If you didn't expect this, you can safely ignore it.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def send_share_notification(
    recipient_email: str,
    sharer_name: str | None,
    sharer_email: str,
    file_name: str,
    permission: str = "view",
) -> bool:
    """Send a share-notification email. Returns True on success, False on failure.

    Silently returns False when SMTP credentials are not configured so the
    share flow is never blocked by email failures.
    """
    if not SMTP_PASSWORD:
        logger.warning("SMTP_PASSWORD not set – skipping share notification email.")
        return False

    subject = f"📄 {sharer_name or sharer_email} shared a file with you — CipherAI SecureCloud"
    html_body = _build_share_email_html(
        sharer_name=sharer_name or "",
        sharer_email=sharer_email,
        file_name=file_name,
        permission=permission,
        frontend_url=FRONTEND_URL,
    )

    msg = MIMEMultipart("alternative")
    msg["From"] = f"CipherAI SecureCloud <{SMTP_EMAIL}>"
    msg["To"] = recipient_email
    msg["Subject"] = subject

    # Plain-text fallback
    plain = (
        f"{sharer_name or sharer_email} shared \"{file_name}\" with you on CipherAI SecureCloud.\n"
        f"Permission: {permission}\n\n"
        f"Open your shared files: {FRONTEND_URL}/shared"
    )
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.send_message(msg)
        logger.info("Share notification sent to %s", recipient_email)
        return True
    except Exception:
        logger.exception("Failed to send share notification to %s", recipient_email)
        return False
