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


def _send_email(recipient_email: str, subject: str, html_body: str, plain_body: str) -> bool:
    """Generic email sender. Returns True on success, False on failure."""
    if not SMTP_PASSWORD:
        logger.warning("SMTP_PASSWORD not set – skipping email to %s.", recipient_email)
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = f"CipherAI SecureCloud <{SMTP_EMAIL}>"
    msg["To"] = recipient_email
    msg["Subject"] = subject
    msg.attach(MIMEText(plain_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.send_message(msg)
        logger.info("Email sent to %s: %s", recipient_email, subject)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", recipient_email)
        return False


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
    subject = f"📄 {sharer_name or sharer_email} shared a file with you — CipherAI SecureCloud"
    html_body = _build_share_email_html(
        sharer_name=sharer_name or "",
        sharer_email=sharer_email,
        file_name=file_name,
        permission=permission,
        frontend_url=FRONTEND_URL,
    )
    plain = (
        f"{sharer_name or sharer_email} shared \"{file_name}\" with you on CipherAI SecureCloud.\n"
        f"Permission: {permission}\n\n"
        f"Open your shared files: {FRONTEND_URL}/shared"
    )
    return _send_email(recipient_email, subject, html_body, plain)


# ═══════════════════════════════════════════════════════════════════════════════
#  EXPIRY WARNING EMAILS
# ═══════════════════════════════════════════════════════════════════════════════

def _build_expiry_warning_owner_html(
    file_name: str, hours_left: int, expiry_time: str
) -> str:
    """HTML email for owner: your file is expiring soon."""
    extend_link = f"{FRONTEND_URL}/my-files"
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#f59e0b,#f97316);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:22px;letter-spacing:.5px;">
              ⏰ File Expiry Warning
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 18px;font-size:16px;color:#333;">Hi there 👋</p>
            <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
              Your file on <strong>CipherAI SecureCloud</strong> is expiring soon.
              Once expired, the file will be <strong>permanently deleted</strong> from your storage.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;margin-bottom:28px;">
              <tr>
                <td style="padding:18px 22px;">
                  <p style="margin:0 0 6px;font-size:13px;color:#92400e;">Expiring File</p>
                  <p style="margin:0 0 10px;font-size:16px;font-weight:600;color:#333;">📄 {file_name}</p>
                  <p style="margin:0;font-size:13px;color:#b45309;">
                    ⏳ Expires in <strong>~{hours_left} hour{"s" if hours_left != 1 else ""}</strong>
                  </p>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <a href="{extend_link}"
                   style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;
                          padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;">
                  Extend Expiry Time →
                </a>
              </td></tr>
            </table>
            <p style="margin:20px 0 0;font-size:13px;color:#999;text-align:center;">
              If you don't extend the expiry, the file will be permanently deleted.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 28px;text-align:center;border-top:1px solid #eee;">
            <p style="margin:0;font-size:12px;color:#aaa;">
              CipherAI SecureCloud — Secure File Storage
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def send_expiry_warning_owner(
    recipient_email: str,
    file_name: str,
    hours_left: int,
    expiry_time: str,
) -> bool:
    """Send expiry warning to the file owner."""
    subject = f"⏰ Your file \"{file_name}\" expires in ~{hours_left}h — CipherAI SecureCloud"
    html_body = _build_expiry_warning_owner_html(file_name, hours_left, expiry_time)
    plain = (
        f"Your file \"{file_name}\" on CipherAI SecureCloud will expire in approximately {hours_left} hours.\n"
        f"Once expired, the file will be permanently deleted.\n\n"
        f"Extend the expiry time: {FRONTEND_URL}/my-files"
    )
    return _send_email(recipient_email, subject, html_body, plain)


def _build_expiry_warning_shared_html(
    file_name: str, owner_email: str, hours_left: int, expiry_time: str
) -> str:
    """HTML email for shared user: a file shared with you is expiring soon."""
    shared_link = f"{FRONTEND_URL}/shared"
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#f59e0b,#ef4444);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:22px;letter-spacing:.5px;">
              ⏰ Shared File Expiring Soon
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 18px;font-size:16px;color:#333;">Hi there 👋</p>
            <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
              A file that was shared with you on <strong>CipherAI SecureCloud</strong> is expiring soon.
              Once expired, you will <strong>lose access</strong> to this file.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;margin-bottom:28px;">
              <tr>
                <td style="padding:18px 22px;">
                  <p style="margin:0 0 6px;font-size:13px;color:#92400e;">Expiring Shared File</p>
                  <p style="margin:0 0 10px;font-size:16px;font-weight:600;color:#333;">📄 {file_name}</p>
                  <p style="margin:0 0 6px;font-size:13px;color:#b45309;">
                    ⏳ Expires in <strong>~{hours_left} hour{"s" if hours_left != 1 else ""}</strong>
                  </p>
                  <p style="margin:0;font-size:13px;color:#6b7280;">
                    Owner: <strong>{owner_email}</strong>
                  </p>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;text-align:center;">
              💡 <strong>Want to keep access?</strong> You can request the owner to extend the
              expiry time from your Shared With Me page.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <a href="{shared_link}"
                   style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;
                          padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;">
                  View Shared Files →
                </a>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 28px;text-align:center;border-top:1px solid #eee;">
            <p style="margin:0;font-size:12px;color:#aaa;">
              CipherAI SecureCloud — Secure File Storage
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def send_expiry_warning_shared_user(
    recipient_email: str,
    file_name: str,
    owner_email: str,
    hours_left: int,
    expiry_time: str,
) -> bool:
    """Send expiry warning to a user who has a shared file about to expire."""
    subject = f"⏰ Shared file \"{file_name}\" expires in ~{hours_left}h — CipherAI SecureCloud"
    html_body = _build_expiry_warning_shared_html(file_name, owner_email, hours_left, expiry_time)
    plain = (
        f"A file shared with you (\"{file_name}\") on CipherAI SecureCloud "
        f"will expire in approximately {hours_left} hours.\n"
        f"Owner: {owner_email}\n\n"
        f"If you want to keep access, ask the owner to extend the expiry time.\n"
        f"View your shared files: {FRONTEND_URL}/shared"
    )
    return _send_email(recipient_email, subject, html_body, plain)


def send_extend_request_to_owner(
    owner_email: str,
    requester_email: str,
    file_name: str,
) -> bool:
    """Send email to file owner requesting expiry extension (triggered by shared user)."""
    subject = f"📩 {requester_email} requests expiry extension for \"{file_name}\""
    extend_link = f"{FRONTEND_URL}/my-files"
    html_body = f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1,#818cf8);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:22px;">📩 Extension Request</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 18px;font-size:16px;color:#333;">Hi there 👋</p>
            <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
              <strong>{requester_email}</strong> is requesting you to extend the expiry time
              for a file you shared with them on <strong>CipherAI SecureCloud</strong>.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f0f0ff;border:1px solid #e0e4ff;border-radius:8px;margin-bottom:28px;">
              <tr>
                <td style="padding:18px 22px;">
                  <p style="margin:0 0 6px;font-size:13px;color:#888;">File</p>
                  <p style="margin:0;font-size:16px;font-weight:600;color:#333;">📄 {file_name}</p>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <a href="{extend_link}"
                   style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;
                          padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;">
                  Manage Your Files →
                </a>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 28px;text-align:center;border-top:1px solid #eee;">
            <p style="margin:0;font-size:12px;color:#aaa;">CipherAI SecureCloud — Secure File Storage</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
    plain = (
        f"{requester_email} is requesting you to extend the expiry time for \"{file_name}\" "
        f"on CipherAI SecureCloud.\n\n"
        f"Manage your files: {FRONTEND_URL}/my-files"
    )
    return _send_email(owner_email, subject, html_body, plain)
