import logging
from datetime import timedelta

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..models import ConnectedAccount, utcnow
from ..security import decrypt, encrypt
from . import instagram as ig

log = logging.getLogger(__name__)


def refresh_account(db: Session, acc: ConnectedAccount) -> None:
    new, expires_in = ig.refresh(decrypt(acc.access_token_encrypted))
    now = utcnow()
    acc.access_token_encrypted = encrypt(new)
    acc.token_updated_at = now
    acc.token_expires_at = now + timedelta(seconds=expires_in)
    db.commit()


def refresh_expiring(db: Session, within_days: int = 10) -> int:
    """Refresh long-lived tokens nearing expiry (IG requires token age >= 24h)."""
    now = utcnow()
    accs = db.scalars(select(ConnectedAccount).where(
        ConnectedAccount.platform == "instagram",  # Facebook Page tokens do not expire
        ConnectedAccount.is_active.is_(True),
        ConnectedAccount.access_token_encrypted != "",
        ConnectedAccount.token_expires_at < now + timedelta(days=within_days),
        ConnectedAccount.token_expires_at > now,
        ConnectedAccount.token_updated_at < now - timedelta(hours=24),
    )).all()
    done = 0
    for a in accs:
        try:
            refresh_account(db, a)
            done += 1
        except Exception as e:
            db.rollback()
            log.warning("token refresh failed for %s: %s", a.external_id, e)
    # expired tokens can't be refreshed -> user must reconnect
    db.execute(text("UPDATE connected_accounts SET is_active = 0 "
                    "WHERE token_expires_at IS NOT NULL AND token_expires_at < UTC_TIMESTAMP()"))
    db.commit()
    return done


def cleanup_pending(db: Session) -> int:
    r = db.execute(text("DELETE FROM pending_dms WHERE created_at + INTERVAL ttl_minutes MINUTE < UTC_TIMESTAMP()"))
    db.commit()
    return r.rowcount or 0


def cleanup_events(db: Session, keep_days: int = 90) -> int:
    """Performance events older than keep_days are dropped to keep the table small."""
    r = db.execute(text("DELETE FROM keyword_events WHERE created_at < UTC_TIMESTAMP() - INTERVAL :d DAY"), {"d": keep_days})
    db.commit()
    return r.rowcount or 0
