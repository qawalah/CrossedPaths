"""Prototype of the "secure" matching mode from the README roadmap: neither side ever
sends its raw timeline anywhere. Instead each phone:

  1. Runs an ECDH (X25519) key exchange for this one check, giving both sides the same
     shared secret without either learning anything about the other's location.
  2. Buckets its own resampled track into (spatial cell, time window) cells sized to the
     check's radius/window - the same units the full matcher uses.
  3. Hashes each cell with HMAC-SHA256 under a per-check key derived from that secret,
     so the token reveals nothing about the cell unless you already know the key.
  4. To avoid missing a real crossing that lands just across a grid boundary, each side
     also hashes the 8 neighbouring cells and the neighbouring time bucket ("dilation") -
     a standard trick in proximity-PSI schemes.
  5. The two token sets are exchanged (relayed by the server, which only ever sees opaque
     hashes) and intersected. A shared token means "we were both near this cell at this
     time" - each side reconstructs the actual place/time from its OWN samples only,
     never from the other side's data, exactly like the server never has to.

This is a working demonstration of the *shape* of the private design, not a
production PSI implementation:

  - It's PSI via a shared secret, not an oblivious PRF. Someone who can brute-force the
    (small) space of plausible cells for a given key can still test membership - fine for
    two consenting phones with a fresh per-check secret, not fine for a hostile relay.
    Step 2 in the README (OPRF-based PSI) removes this weakness.
  - Dilation multiplies the token count by ~27x per sample. That's an acceptable trade for
    a phone-to-phone exchange but should be capacity-limited (thin the track first).
  - Quantization is coarser than the exact-distance matcher, so results are approximate;
    see tests/test_secure.py for how closely it tracks crosspaths.matcher on the same data.
"""
from __future__ import annotations

import hashlib
import hmac
import math
from dataclasses import dataclass

from cryptography.hazmat.primitives import hashes as _hashes
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .geo import haversine_m
from .matcher import Params, Samples, resample

_NEIGHBORS = [(dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)]


# ---------------- key exchange ----------------

def generate_keypair():
    """One side of an X25519 exchange. Call once per check; never reuse across checks."""
    sk = x25519.X25519PrivateKey.generate()
    return sk, sk.public_key().public_bytes_raw()


def derive_shared_key(my_private_key, their_public_bytes: bytes, check_id: str) -> bytes:
    """Both sides get the same 32-byte key. check_id salts it so no two checks share a key
    even if (accidentally) the same keypair were ever reused."""
    shared = my_private_key.exchange(x25519.X25519PublicKey.from_public_bytes(their_public_bytes))
    return HKDF(algorithm=_hashes.SHA256(), length=32, salt=check_id.encode(), info=b"crosspaths-v1").derive(shared)


# ---------------- tokenization ----------------

@dataclass
class TokenSet:
    tokens: frozenset          # every hash sent to the other side (dilated)
    index: dict                # base (non-dilated) token -> list of sample indices, for MY reconstruction
    samples: Samples           # my own resampled track (never sent anywhere)


def _cell_size_deg(radius_m: float, lat: float):
    dlat = radius_m / 111_320.0
    dlon = radius_m / (111_320.0 * max(math.cos(math.radians(lat)), 0.15))
    return dlat, dlon


def _token(key: bytes, cx: int, cy: int, bucket: int) -> bytes:
    return hmac.new(key, f"{cx}:{cy}:{bucket}".encode(), hashlib.sha256).digest()


def tokenize(points, key: bytes, p: Params = Params()) -> TokenSet:
    S = resample(points, p)
    tokens, index = set(), {}
    for i in range(len(S)):
        dlat, dlon = _cell_size_deg(p.radius_m, S.lat[i])
        cx, cy = int(S.lon[i] // dlon), int(S.lat[i] // dlat)
        bucket = int(S.t[i] // p.window_s)
        base = _token(key, cx, cy, bucket)
        index.setdefault(base, []).append(i)
        tokens.add(base)
        for dx, dy in _NEIGHBORS:                       # spatial dilation
            for db in (-1, 0, 1):                        # temporal dilation
                if dx or dy or db:
                    tokens.add(_token(key, cx + dx, cy + dy, bucket + db))
    return TokenSet(frozenset(tokens), index, S)


# ---------------- intersection + reconstruction ----------------

@dataclass
class SecureCrossing:
    t: float
    lat: float
    lon: float
    speed_ms: float
    kind: str


def intersect(a: TokenSet, b: TokenSet) -> frozenset:
    """What the server (or either phone) does with the two token sets: a plain set
    intersection over opaque hashes. Neither side's raw cells are ever visible here."""
    return a.tokens & b.tokens


def reconstruct(mine: TokenSet, matched: frozenset, still_speed_ms: float = 1.5) -> list[SecureCrossing]:
    """Turn a match into events using only MY OWN samples - never the other side's."""
    hit_idx = sorted({i for tok in matched if tok in mine.index for i in mine.index[tok]})
    out = []
    for i in hit_idx:
        S = mine.samples
        kind = "same_place" if S.speed[i] < still_speed_ms else "passing"
        out.append(SecureCrossing(float(S.t[i]), float(S.lat[i]), float(S.lon[i]), float(S.speed[i]), kind))
    return out


def merge_events(events: list[SecureCrossing], merge_gap_s: float = 600.0, merge_dist_m: float = 300.0):
    """Collapse consecutive hits into spans, same idea as matcher.find_crossings."""
    if not events:
        return []
    events = sorted(events, key=lambda e: e.t)
    groups, cur = [], [events[0]]
    for e in events[1:]:
        prev = cur[-1]
        if e.t - prev.t <= merge_gap_s and haversine_m(e.lat, e.lon, prev.lat, prev.lon) <= merge_dist_m:
            cur.append(e)
        else:
            groups.append(cur)
            cur = [e]
    groups.append(cur)
    out = []
    for g in groups:
        lat = sum(e.lat for e in g) / len(g)
        lon = sum(e.lon for e in g) / len(g)
        speed = sum(e.speed_ms for e in g) / len(g)
        out.append({
            "start_t": g[0].t, "end_t": g[-1].t, "lat": lat, "lon": lon,
            "kind": "same_place" if speed < 1.5 else "passing",
        })
    return out


def run_secure_check(points_a, points_b, check_id: str, params: Params = Params()):
    """End-to-end demo of the flow (normally split across two phones + a relay).
    Returns each side's OWN reconstructed events - never the other side's raw data."""
    sk_a, pk_a = generate_keypair()
    sk_b, pk_b = generate_keypair()
    key_a = derive_shared_key(sk_a, pk_b, check_id)
    key_b = derive_shared_key(sk_b, pk_a, check_id)
    assert key_a == key_b, "ECDH did not agree - keys must be derived from the exchanged public bytes"

    ta = tokenize(points_a, key_a, params)
    tb = tokenize(points_b, key_b, params)
    matched = intersect(ta, tb)   # this is ALL a relay server would ever see

    return {
        "a_events": merge_events(reconstruct(ta, matched)),
        "b_events": merge_events(reconstruct(tb, matched)),
        "matched_tokens": len(matched),
        "a_token_count": len(ta.tokens),
        "b_token_count": len(tb.tokens),
    }
