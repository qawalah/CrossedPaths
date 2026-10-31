import hashlib
import hmac
import os
import time

import jwt
from cryptography.fernet import Fernet

_N, _R, _P = 2 ** 14, 8, 1


def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${h.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, h = stored.split("$")
        calc = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(calc.hex(), h)
    except Exception:
        return False


def make_token(user_id: str, secret: str, days: int = 14) -> str:
    return jwt.encode({"sub": user_id, "exp": int(time.time()) + days * 86400}, secret, algorithm="HS256")


def read_token(token: str, secret: str):
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])["sub"]
    except Exception:
        return None


def fernet(key: str) -> Fernet:
    return Fernet(key.encode() if isinstance(key, str) else key)
