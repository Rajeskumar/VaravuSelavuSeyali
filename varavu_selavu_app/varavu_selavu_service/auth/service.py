from datetime import datetime, timedelta, timezone
from typing import Optional
import hashlib
import secrets
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from varavu_selavu_service.db.models import User, Expense, GroupMember, RefreshToken, EmailToken
from .security import hash_password, verify_password

# Verification links are low-stakes (a stale one just means "request a new one"), so a
# generous window avoids nagging a user who doesn't check email same-day. Reset links
# authorize an account takeover if intercepted, so they get a much tighter window.
EMAIL_VERIFY_TOKEN_TTL = timedelta(days=3)
PASSWORD_RESET_TOKEN_TTL = timedelta(hours=1)

# How long an already-rotated refresh token is still honored as a legitimate
# concurrent-request race (two tabs/devices refreshing within the same window)
# rather than treated as reuse/theft. Chosen short enough that a real attacker
# replaying a stolen-and-already-rotated token essentially never lands inside
# it, long enough to absorb real-world race conditions across instances.
GRACE_PERIOD = timedelta(minutes=1)


def _aware(dt: datetime) -> datetime:
    """Normalizes a datetime read back from the DB to timezone-aware UTC.
    Postgres (`timestamptz`) round-trips as aware; SQLite (used by the test
    suite) round-trips as naive — this makes comparisons against
    `datetime.now(timezone.utc)` safe under both, matching the existing
    pattern in GroupService.accept_invite."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def get_user(self, email: str) -> Optional[dict]:
        user = self.db.query(User).filter(User.email == email).first()
        if user:
            return {
                "id": str(user.id),
                "email": user.email,
                "name": user.name,
                "phone": user.phone,
                "address": user.address,
                "password_hash": user.password_hash,
                "created_at": user.created_at,
                "venmo_handle": user.venmo_handle,
                "paypal_handle": user.paypal_handle,
                "upi_id": user.upi_id,
            }
        return None

    def register_user(self, name: str, phone: Optional[str], email: str, password: str) -> bool:
        if self.get_user(email):
            return False
        hashed = hash_password(password)
        
        db_user = User(
            id=uuid.uuid4(),
            email=email,
            name=name,
            phone=phone,
            password_hash=hashed
        )
        try:
            self.db.add(db_user)
            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            return False

    def authenticate_user(self, email: str, password: str) -> bool:
        user = self.get_user(email)
        if not user:
            return False
        stored = (
            user.get("password_hash")
            or user.get("hashed_password")
            or user.get("password")
            or user.get("Password")
        )
        if stored is None:
            return False
        return verify_password(password, stored) or stored == password

    def reset_password(self, email: str, password: str) -> bool:
        user = self.db.query(User).filter(User.email == email).first()
        if not user:
            return False

        hashed = hash_password(password)
        user.password_hash = hashed
        self.db.commit()
        return True

    def is_email_verified(self, email: str) -> bool:
        user = self.db.query(User).filter(User.email == email).first()
        return bool(user and user.email_verified)

    def mark_email_verified(self, email: str) -> None:
        user = self.db.query(User).filter(User.email == email).first()
        if user:
            user.email_verified = True
            self.db.commit()

    @staticmethod
    def _hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def create_email_token(self, user_email: str, purpose: str, ttl: timedelta) -> str:
        """Mints a one-time token for the given purpose ("verify_email" or "reset_password")
        and returns the *raw* token — only its hash is persisted. The raw value goes straight
        into an emailed URL and is never stored or logged anywhere else."""
        token = secrets.token_urlsafe(32)
        self.db.add(EmailToken(
            id=uuid.uuid4(),
            user_email=user_email,
            token_hash=self._hash_token(token),
            purpose=purpose,
            expires_at=datetime.now(timezone.utc) + ttl,
        ))
        self.db.commit()
        return token

    def redeem_email_token(self, token: str, purpose: str) -> Optional[str]:
        """Validates and single-use-consumes a token, returning the associated user's email
        on success or None if it's unknown, expired, already used, or minted for a different
        purpose (a verify-email link can never double as a password-reset link)."""
        row = self.db.query(EmailToken).filter(EmailToken.token_hash == self._hash_token(token)).first()
        if row is None or row.purpose != purpose:
            return None
        if row.used_at is not None:
            return None
        if _aware(row.expires_at) < datetime.now(timezone.utc):
            return None
        row.used_at = datetime.now(timezone.utc)
        self.db.commit()
        return row.user_email

    def revoke_all_sessions_for_user(self, user_email: str, reason: str = "password_reset") -> None:
        """Ends every active session for a user — called after a password reset so a stolen
        password (the presumed reason for the reset) can't keep a session alive under the old
        credentials. Mirrors `revoke_family`'s per-row update but fans out across every family
        the user has, not just one."""
        family_ids = (
            self.db.query(RefreshToken.family_id)
            .filter(RefreshToken.user_email == user_email, RefreshToken.revoked_at.is_(None))
            .distinct()
            .all()
        )
        now = datetime.now(timezone.utc)
        for (family_id,) in family_ids:
            self.db.query(RefreshToken).filter(
                RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None)
            ).update({"revoked_at": now, "revoked_reason": reason}, synchronize_session=False)
        self.db.commit()

    def update_profile(
        self,
        email: str,
        name: Optional[str] = None,
        phone: Optional[str] = None,
        address: Optional[str] = None,
        venmo_handle: Optional[str] = None,
        paypal_handle: Optional[str] = None,
        upi_id: Optional[str] = None,
    ) -> bool:
        user = self.db.query(User).filter(User.email == email).first()
        if not user:
            return False

        if name is not None:
            user.name = name
        if phone is not None:
            user.phone = phone
        if address is not None:
            user.address = address
        if venmo_handle is not None:
            user.venmo_handle = venmo_handle
        if paypal_handle is not None:
            user.paypal_handle = paypal_handle
        if upi_id is not None:
            user.upi_id = upi_id
        self.db.commit()
        return True

    def delete_user(self, email: str) -> bool:
        user = self.db.query(User).filter(User.email == email).first()
        if not user:
            return False
        try:
            # Personal expenses are hard-deleted with the account (expense_items
            # cascade via expense_id). Group expenses are NOT touched here — the
            # expenses.user_email FK is ON DELETE SET NULL so they survive the
            # user delete below, per the "Anonymous User" strategy (spec §6.2/E12).
            self.db.query(Expense).filter(
                Expense.user_email == email, Expense.group_id.is_(None)
            ).delete(synchronize_session=False)

            # Anonymize the user's seat in every group they belonged to. user_email
            # on these rows is nulled automatically by ON DELETE SET NULL when the
            # users row is deleted below.
            self.db.query(GroupMember).filter(GroupMember.user_email == email).update(
                {"display_name": "Anonymous User"}, synchronize_session=False
            )

            self.db.delete(user)
            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            return False

    def register_refresh_token(
        self, jti: uuid.UUID, family_id: uuid.UUID, user_email: str, expires_at: datetime
    ) -> None:
        """Records a freshly-minted refresh token — either the first of a new family (login)
        or a rotation's successor (refresh), depending on whether `family_id` is newly
        generated or carried over by the caller."""
        self.db.add(RefreshToken(
            jti=jti, family_id=family_id, user_email=user_email, expires_at=expires_at,
        ))
        self.db.commit()

    # revoked_reason values that mean "this entire family is intentionally/permanently over,"
    # as opposed to "this one token was superseded by ordinary rotation churn." Any row in a
    # family carrying one of these means *no* token from that family gets grace-period
    # leniency anymore, even a different row whose own revoked_reason is still "rotated" —
    # logout (or an already-caught reuse) kills the whole session tree, not just whichever
    # token happened to be presented at that moment.
    _HARD_KILL_REASONS = {"logout", "reuse_detected", "password_reset"}

    def _family_hard_killed(self, family_id: uuid.UUID) -> bool:
        return self.db.query(RefreshToken).filter(
            RefreshToken.family_id == family_id,
            RefreshToken.revoked_reason.in_(self._HARD_KILL_REASONS),
        ).first() is not None

    def _is_reuse_within_grace(self, row: "RefreshToken", now: datetime) -> bool:
        return now - _aware(row.revoked_at) <= GRACE_PERIOD

    def rotate_refresh_token(self, jti: uuid.UUID, new_jti: uuid.UUID) -> uuid.UUID:
        """Validates the presented refresh token's `jti` and retires it as part of rotation.
        Returns the family_id the caller should register `new_jti` under.

        Raises 401 if the token is unknown or expired. Raises 401 (and revokes the *entire*
        family — RFC 9700-style cascading revocation) if it was already rotated and is being
        presented again outside GRACE_PERIOD, since that's a strong signal of theft: the
        legitimate client already moved on, so this presenter has a copy they shouldn't. A
        reuse *within* GRACE_PERIOD is treated as a benign concurrent-refresh race (two tabs,
        or web + a second device, both refreshing within the same window) rather than an
        attack, and is allowed through to mint another descendant in the same family — but
        only if that's what the prior revocation actually was (`revoked_reason` "rotated"); a
        token revoked by explicit logout or a previously-caught reuse is dead immediately and
        permanently, regardless of timing.
        """
        invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        row = self.db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
        if row is None:
            raise invalid

        now = datetime.now(timezone.utc)
        if _aware(row.expires_at) < now:
            raise invalid

        if row.revoked_at is not None:
            if self._family_hard_killed(row.family_id) or not self._is_reuse_within_grace(row, now):
                self.revoke_family(row.family_id, reason="reuse_detected")
                raise invalid
            # Within the grace window, and this family has never been logged out or already
            # caught reusing a token — not an error, fall through and register another
            # descendant of this same family.
        else:
            row.revoked_at = now
            row.revoked_reason = "rotated"
            row.replaced_by = new_jti
            self.db.commit()

        return row.family_id

    def exchange_legacy_refresh_token(self, jti: uuid.UUID, user_email: str, expires_at: datetime) -> uuid.UUID:
        """One-time upgrade path for sessions that predate this table (P0-1 migration): unlike
        `rotate_refresh_token`, an unknown `jti` here is the *expected* case — the token was
        minted before refresh-token tracking existed, not a sign of forgery (its signature
        already proved authenticity via `decode_token` before this is called). Registers the
        legacy token as pre-spent (it authorizes exactly one exchange) and starts a fresh
        family for the cookie-based session that replaces it. A second exchange attempt with
        the same legacy token follows the identical reuse/grace-period rule as normal rotation.

        A `jti` that turns out to *already* be tracked (e.g. a client calling this endpoint
        with a token straight from `/login`, not an actually-legacy one — not a real-world
        path, but not forbidden either) is handled too: if it was never used, it's simply spent
        under its existing family, same as any other one-time exchange; if it was already used,
        the normal reuse/grace-period rule applies.
        """
        invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        now = datetime.now(timezone.utc)

        row = self.db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
        if row is not None:
            if row.revoked_at is None:
                row.revoked_at = now
                row.revoked_reason = "exchanged"
                self.db.commit()
                return row.family_id
            if self._family_hard_killed(row.family_id) or not self._is_reuse_within_grace(row, now):
                self.revoke_family(row.family_id, reason="reuse_detected")
                raise invalid
            return row.family_id

        # Genuinely unknown — the expected case for a real pre-migration token: mint a new
        # family, and record this token as already-exchanged (it authorizes exactly one
        # exchange, never rotates further under its own jti).
        family_id = uuid.uuid4()
        self.db.add(RefreshToken(
            jti=jti, family_id=family_id, user_email=user_email,
            expires_at=expires_at, revoked_at=now, revoked_reason="exchanged",
        ))
        self.db.commit()
        return family_id

    def revoke_family(self, family_id: uuid.UUID, reason: str = "logout") -> None:
        self.db.query(RefreshToken).filter(
            RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None)
        ).update(
            {"revoked_at": datetime.now(timezone.utc), "revoked_reason": reason},
            synchronize_session=False,
        )
        self.db.commit()

    def revoke_refresh_token(self, jti: uuid.UUID) -> None:
        """Explicit logout — revokes the presented token's *entire family*, not just the one
        token, so a second tab/device's already-rotated descendant doesn't stay silently valid
        after the user explicitly logged out. Not grace-period-eligible: `revoked_reason`
        "logout" means any further presentation of a token from this family is rejected
        immediately, on purpose — the user asked for the session to be over."""
        row = self.db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
        if row is not None:
            self.revoke_family(row.family_id, reason="logout")
