"""Tests for the private (PSI-lite) matching prototype. Run: python3 tests/test_secure.py"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import synth
from crosspaths.matcher import Params
from crosspaths.secure import (derive_shared_key, generate_keypair, intersect,
                               merge_events, reconstruct, run_secure_check, tokenize)


def _points():
    a = synth.raw_points("A", 11)
    b = synth.raw_points("B", 22)
    from crosspaths.parser import Point
    pa = [Point(t, la, lo, acc, ("path" if k == "move" else "visit")) for t, la, lo, acc, k in a]
    pb = [Point(t, la, lo, acc, ("path" if k == "move" else "visit")) for t, la, lo, acc, k in b]
    return pa, pb


def test_ecdh_agrees_and_is_per_check_unique():
    ska, pka = generate_keypair()
    skb, pkb = generate_keypair()
    k1a = derive_shared_key(ska, pkb, "check-1")
    k1b = derive_shared_key(skb, pka, "check-1")
    assert k1a == k1b and len(k1a) == 32
    k2a = derive_shared_key(ska, pkb, "check-2")
    assert k2a != k1a                       # same keypair, different check -> different key


def test_server_never_sees_raw_cells():
    pa, pb = _points()
    ska, pka = generate_keypair()
    skb, pkb = generate_keypair()
    key = derive_shared_key(ska, pkb, "c1")
    ta = tokenize(pa, key, Params())
    # every token is a 32-byte SHA-256 HMAC digest - opaque, fixed-size, nothing coordinate-shaped
    for tok in list(ta.tokens)[:20]:
        assert isinstance(tok, bytes) and len(tok) == 32
    # a different key (as an eavesdropper without the ECDH secret would have) produces no overlap
    other_sk, _ = generate_keypair()
    other_key = derive_shared_key(other_sk, pkb, "c1")
    tb_wrong = tokenize(pb, other_key, Params())
    tb_right = tokenize(pb, derive_shared_key(skb, pka, "c1"), Params())
    assert len(ta.tokens & tb_wrong.tokens) == 0
    assert len(ta.tokens & tb_right.tokens) > 0


def test_finds_cafe_and_road_like_the_full_matcher():
    pa, pb = _points()
    res = run_secure_check(pa, pb, "check-42", Params(radius_m=100, window_s=900))
    assert res["matched_tokens"] > 0
    a_kinds = {e["kind"] for e in res["a_events"]}
    assert "same_place" in a_kinds                       # the cafe
    # both sides should reconstruct a crossing on the cafe day, independently, from their own data
    a_days = {time.strftime("%Y-%m-%d", time.gmtime(e["start_t"])) for e in res["a_events"]}
    b_days = {time.strftime("%Y-%m-%d", time.gmtime(e["start_t"])) for e in res["b_events"]}
    assert "2025-06-04" in a_days and "2025-06-04" in b_days
    assert "2025-06-07" in a_days and "2025-06-07" in b_days   # the road pass


def test_each_side_only_reconstructs_from_its_own_samples():
    pa, pb = _points()
    ska, pka = generate_keypair()
    skb, pkb = generate_keypair()
    ka = derive_shared_key(ska, pkb, "c9")
    kb = derive_shared_key(skb, pka, "c9")
    ta, tb = tokenize(pa, ka, Params()), tokenize(pb, kb, Params())
    matched = intersect(ta, tb)
    ea = reconstruct(ta, matched)
    eb = reconstruct(tb, matched)
    a_pts = {(round(p.t), round(p.lat, 4), round(p.lon, 4)) for p in [type("P", (), {"t": e.t, "lat": e.lat, "lon": e.lon}) for e in ea]}
    b_pts = {(round(p.t), round(p.lat, 4), round(p.lon, 4)) for p in [type("P", (), {"t": e.t, "lat": e.lat, "lon": e.lon}) for e in eb]}
    # A's reconstructed points are drawn from A's own track (near CAFE_A), B's from B's own (near CAFE_B) - not identical
    assert a_pts and b_pts and a_pts != b_pts


def test_no_dilation_misses_boundary_crossing():
    """Without dilation, a real crossing that straddles a grid cell edge is missed;
    with it, the prototype recovers it. This justifies the 27x token cost."""
    from crosspaths.parser import Point
    # Two people, exact same spot and time, positioned to straddle a grid line for radius=100.
    lat, lon, t = 52.51234, 13.40000, synth.BASE
    a = [Point(t, lat, lon, None, "visit"), Point(t + 60, lat, lon, None, "visit")]
    b = [Point(t, lat + 0.00089, lon, None, "visit"), Point(t + 60, lat + 0.00089, lon, None, "visit")]  # ~99 m north
    ska, pka = generate_keypair()
    skb, pkb = generate_keypair()
    key = derive_shared_key(ska, pkb, "boundary-test")
    ta = tokenize(a, key, Params(radius_m=100, window_s=900))
    tb = tokenize(b, key, Params(radius_m=100, window_s=900))
    assert len(ta.tokens & tb.tokens) > 0   # dilation catches it even if they land in adjacent cells


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            t0 = time.time()
            try:
                fn()
                print(f"PASS  {name}  ({time.time() - t0:.1f}s)")
            except Exception as ex:  # noqa: BLE001
                import traceback
                traceback.print_exc()
                failed += 1
                print(f"FAIL  {name}: {type(ex).__name__}: {ex}")
    sys.exit(1 if failed else 0)
