"""Sign-in identities other than username + password (phone number, Google).

An identity is (provider, keyed hash of the subject) pointing at a user. A new identity gets a
short-lived signup token that is traded for an account once the person picks a username.

Adding another way to prove a phone number later (e.g. Firebase phone auth) only needs a route
that ends in the same PHONE identity, so it lands on the same account.
"""
import time

import jwt
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

PHONE, GOOGLE = "phone", "google"
SIGNUP_MINUTES = 15


def _signup_secret(secret: str) -> str:
    # A different key from session tokens, so a signup token can never be used as one.
    return "signup:" + secret


def make_signup_token(provider: str, subject_hash: str, secret: str) -> str:
    claims = {"purpose": "signup", "p": provider, "s": subject_hash, "exp": int(time.time()) + SIGNUP_MINUTES * 60}
    return jwt.encode(claims, _signup_secret(secret), algorithm="HS256")


def read_signup_token(token: str, secret: str):
    try:
        c = jwt.decode(str(token or ""), _signup_secret(secret), algorithms=["HS256"])
    except Exception:
        return None
    if c.get("purpose") != "signup" or c.get("p") not in (PHONE, GOOGLE) or not c.get("s"):
        return None
    return c["p"], c["s"]


def find_user(db, provider: str, subject_hash: str):
    return db.execute("SELECT u.* FROM auth_identities i JOIN users u ON u.id=i.user_id "
                      "WHERE i.provider=? AND i.subject_hash=?", (provider, subject_hash)).fetchone()


def link(db, user_id: str, provider: str, subject_hash: str) -> None:
    db.execute("INSERT INTO auth_identities (provider, subject_hash, user_id, created_at) VALUES (?,?,?,?)",
               (provider, subject_hash, user_id, time.time()))


def methods(db, user) -> list:
    out = ["password"] if user["pw_hash"] else []
    out += [r["provider"] for r in db.execute(
        "SELECT DISTINCT provider FROM auth_identities WHERE user_id=? ORDER BY provider", (user["id"],))]
    return out


def verify_google(token: str, client_ids: list) -> str:
    """Google account id (`sub`) from a Google ID token, or ValueError."""
    try:
        claims = google_id_token.verify_oauth2_token(token, google_requests.Request(), client_ids)
    except Exception as e:
        raise ValueError("invalid_google_token") from e
    if not claims.get("email_verified") or not claims.get("sub"):
        raise ValueError("invalid_google_token")
    return claims["sub"]
