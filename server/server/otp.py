"""Phone numbers and one-time sign-in codes.

Numbers are stored only as a keyed hash; codes only as a hash, single use, short lived,
burnt after 5 wrong tries. Sends are logged (hashed number + IP) for rate limits, which also
cap the messaging bill.
"""
import hashlib
import hmac
import re
import secrets
import time

MAX_TRIES = 5

# Arabic-Indic and Extended (Persian/Urdu) digits -> ASCII.
_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "0123456789" * 2)
# Spaces, dashes, dots, brackets and the invisible direction marks phones paste with numbers.
_JUNK = re.compile(r"[\s\-().‎‏‪-‮⁦-⁩]")
_E164 = re.compile(r"\+[1-9]\d{6,14}")


class OtpLimit(Exception):
    def __init__(self, scope):
        super().__init__(scope)
        self.scope = scope   # "phone" | "ip" | "day"


def ascii_digits(s) -> str:
    return str(s or "").translate(_DIGITS)


def normalize_phone(raw, allowed_prefixes=()) -> str:
    """E.164 (+<country><number>) or ValueError("bad_number" | "country_not_allowed").

    A number without its country code is refused rather than guessed.
    """
    s = _JUNK.sub("", ascii_digits(raw))
    if s.startswith("00"):
        s = "+" + s[2:]
    if not _E164.fullmatch(s):
        raise ValueError("bad_number")
    if allowed_prefixes and not any(s.startswith(p) for p in allowed_prefixes):
        raise ValueError("country_not_allowed")
    return s


def parse_prefixes(setting: str) -> list:
    return ["+" + p.strip().lstrip("+") for p in (setting or "").split(",") if p.strip()]


def keyed_hash(value: str, data_key: str, label: str) -> str:
    key = hmac.new(data_key.encode(), ("crosspaths:" + label).encode(), hashlib.sha256).digest()
    return hmac.new(key, value.encode(), hashlib.sha256).hexdigest()


def _code_hash(phone_hash: str, code: str) -> str:
    return hmac.new(phone_hash.encode(), code.encode(), hashlib.sha256).hexdigest()


def issue_code(db, phone_hash: str, ip: str, cfg, now=None) -> str:
    """New 6-digit code for this phone (replacing any earlier one). Raises OtpLimit."""
    now = now or time.time()
    db.execute("DELETE FROM otp_sends WHERE at<?", (now - 86400,))
    db.execute("DELETE FROM otp_codes WHERE expires_at<?", (now,))
    checks = (("phone", "phone_hash=? AND at>?", (phone_hash, now - 3600), cfg["LIMIT_OTP_PER_PHONE_PER_HOUR"]),
              ("ip", "ip=? AND at>?", (ip, now - 3600), cfg["LIMIT_OTP_PER_IP_PER_HOUR"]),
              ("day", "at>?", (now - 86400,), cfg["LIMIT_OTP_PER_DAY"]))
    for scope, where, args, cap in checks:
        if cap and db.execute(f"SELECT COUNT(*) FROM otp_sends WHERE {where}", args).fetchone()[0] >= cap:
            raise OtpLimit(scope)
    code = f"{secrets.randbelow(10 ** 6):06d}"
    db.execute("INSERT OR REPLACE INTO otp_codes (phone_hash, code_hash, expires_at, tries) VALUES (?,?,?,0)",
               (phone_hash, _code_hash(phone_hash, code), now + cfg["OTP_TTL_MINUTES"] * 60))
    db.execute("INSERT INTO otp_sends (phone_hash, ip, at) VALUES (?,?,?)", (phone_hash, ip, now))
    return code


def discard_code(db, phone_hash: str) -> None:
    db.execute("DELETE FROM otp_codes WHERE phone_hash=?", (phone_hash,))


def check_code(db, phone_hash: str, code, cfg, now=None) -> bool:
    """True once for the right, unexpired code. Wrong tries count; the 5th burns the code."""
    now = now or time.time()
    code = _JUNK.sub("", ascii_digits(code))
    row = db.execute("SELECT * FROM otp_codes WHERE phone_hash=?", (phone_hash,)).fetchone()
    if not row:
        return False
    if row["expires_at"] < now:
        discard_code(db, phone_hash)
        return False
    if hmac.compare_digest(row["code_hash"], _code_hash(phone_hash, code)):
        discard_code(db, phone_hash)
        return True
    if row["tries"] + 1 >= MAX_TRIES:
        discard_code(db, phone_hash)
    else:
        db.execute("UPDATE otp_codes SET tries=tries+1 WHERE phone_hash=?", (phone_hash,))
    return False
