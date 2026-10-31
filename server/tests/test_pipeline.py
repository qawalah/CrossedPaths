"""Run with pytest, or simply:  python3 tests/test_pipeline.py"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import synth
from crosspaths import Params, assess, find_crossings, parse_timeline, run_check


def _tracks():
    a = parse_timeline(synth.to_on_device_json(synth.raw_points("A", 11)))
    b = parse_timeline(synth.to_records_json(synth.raw_points("B", 22)))
    return a, b


def test_parsers_detect_formats():
    a, b = _tracks()
    assert a.fmt == "on-device" and len(a) > 100
    assert b.fmt == "records" and len(b) > 500


def test_semantic_history_parser():
    data = {"timelineObjects": [
        {"placeVisit": {"location": {"latitudeE7": 525200000, "longitudeE7": 134050000},
                        "duration": {"startTimestamp": "2025-06-02T08:00:00Z", "endTimestamp": "2025-06-02T09:00:00Z"}}},
        {"activitySegment": {"startLocation": {"latitudeE7": 525200000, "longitudeE7": 134050000},
                             "endLocation": {"latitudeE7": 525300000, "longitudeE7": 134300000},
                             "duration": {"startTimestamp": "2025-06-02T09:00:00Z", "endTimestamp": "2025-06-02T09:30:00Z"},
                             "waypointPath": {"waypoints": [{"latE7": 525250000, "lngE7": 134150000}]}}}]}
    tr = parse_timeline(data)
    assert tr.fmt == "semantic-history" and len(tr) == 4  # visit end == activity start, deduped
    assert tr.points[-1].t - tr.points[0].t == 5400


def test_finds_cafe_and_road_crossing_only_after_exclusions():
    a, b = _tracks()
    p = Params(radius_m=100, window_s=900)
    raw = find_crossings(a.points, b.points, p)
    assert len(raw) >= 7                       # same office every day
    res = run_check(a, b, p)
    kinds = sorted(e["kind"] for e in res["events"])
    assert kinds == ["passing", "same_place"], res["events"]
    cafe = next(e for e in res["events"] if e["kind"] == "same_place")
    assert cafe["start"][:10] == "2025-06-04"
    assert 15 <= cafe["duration_min"] <= 60
    assert abs(cafe["lat"] - synth.CAFE_A[0]) < 0.002 and abs(cafe["lon"] - synth.CAFE_A[1]) < 0.002
    road = next(e for e in res["events"] if e["kind"] == "passing")
    assert road["start"].startswith("2025-06-07T18")
    assert abs(road["lat"] - 52.5) < 0.005 and abs(road["lon"] - 13.4) < 0.01
    assert res["stats"]["excluded_in_home_work_zones"] >= 7


def test_no_match_for_3h_apart_or_245m_apart():
    a, b = _tracks()
    res = run_check(a, b, Params(radius_m=100, window_s=900))
    days = {e["start"][:10] for e in res["events"]}
    assert "2025-06-05" not in days            # same cafe, 3.5 hours apart
    assert "2025-06-06" not in days            # park, 245 m apart


def test_parameters_are_respected():
    a, b = _tracks()
    wide = run_check(a, b, Params(radius_m=300, window_s=900))
    assert "2025-06-06" in {e["start"][:10] for e in wide["events"]}    # park now matches
    longw = run_check(a, b, Params(radius_m=100, window_s=4 * 3600))
    assert "2025-06-05" in {e["start"][:10] for e in longw["events"]}   # 3.5 h apart now matches


def test_date_trim():
    a, b = _tracks()
    p = Params(t_from=synth.BASE + 5 * 86400, t_to=synth.BASE + 7 * 86400)
    res = run_check(a, b, p)
    assert [e["kind"] for e in res["events"]] == ["passing"]


def test_output_is_blurred():
    a, b = _tracks()
    res = run_check(a, b, Params())
    for e in res["events"]:
        assert e["start"][14:16] in ("00", "15", "30", "45")
        assert "min_dist_m" not in e and e["blur_m"] == 100


def test_organic_tracks_score_high_and_spoof_scores_low():
    a, b = _tracks()
    assert assess(a.points).level == "high", assess(a.points)
    assert assess(b.points).level == "high", assess(b.points)
    fake = parse_timeline(synth.spoofed_records_json())
    r = assess(fake.points)
    assert r.level == "low", (r.score, r.reasons)
    assert len(r.reasons) >= 3


def _flight(seed, offset_s):
    """An hour at the Casablanca gate, then a 6.5 h flight to Riyadh with a GPS fix every ~4 min."""
    import random
    from crosspaths.parser import Point
    cmn, ruh, t0 = (33.367, -7.59), (24.957, 46.698), 1472650000.0
    rng, pts, dur = random.Random(seed), [], 6.5 * 3600
    t = t0 - 3600
    while t < t0:
        pts.append(Point(t, cmn[0] + rng.gauss(0, 2e-5), cmn[1] + rng.gauss(0, 2e-5), 10, "record"))
        t += rng.uniform(200, 320)
    t = t0
    while t < t0 + dur:
        f = (t - t0) / dur
        pts.append(Point(t + offset_s, cmn[0] + f * (ruh[0] - cmn[0]), cmn[1] + f * (ruh[1] - cmn[1]), 30, "record"))
        t += rng.uniform(180, 300)
    return pts, cmn


def test_flights_never_match_mid_air():
    a, cmn = _flight(1, 0)
    b, _ = _flight(2, 20)
    ev = find_crossings(a, b, Params(radius_m=100, window_s=900))
    assert ev, "the shared hour at the gate should still match"
    for e in ev:   # every crossing is at the airport, none in the Sahara
        assert abs(e.lat - cmn[0]) < 0.01 and abs(e.lon - cmn[1]) < 0.01, e


def test_overlapping_rounded_events_are_merged():
    from crosspaths.matcher import Crossing
    from crosspaths.privacy import sanitize
    t = 1522618200.0  # 2018-04-01 21:30 UTC
    cafe = Crossing(t, t + 2400, t, t + 2400, 52.5, 13.4, 5, 900, 20, 0.2, "same_place")
    walk = Crossing(t + 2460, t + 2700, t + 2460, t + 2700, 52.501, 13.402, 8, 0, 300, 1.4, "passing")
    later = Crossing(t + 6 * 3600, t + 6 * 3600 + 600, 0, 0, 52.6, 13.5, 5, 0, 20, 0.1, "same_place")
    out = sanitize([walk, cafe, later])
    assert len(out) == 2, out
    assert out[0]["kind"] == "same_place" and out[0]["start"] == "2018-04-01T21:30:00Z" and out[0]["end"] == "2018-04-01T22:15:00Z"
    assert out[1]["start"] == "2018-04-02T03:30:00Z"


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            t0 = time.time()
            try:
                fn()
                print(f"PASS  {name}  ({time.time() - t0:.1f}s)")
            except Exception as ex:  # noqa: BLE001
                failed += 1
                print(f"FAIL  {name}: {type(ex).__name__}: {ex}")
    sys.exit(1 if failed else 0)
