"""How-likely-you-saw-each-other grades, estimated car routes for gaps, and fixed check settings."""
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

from crosspaths.exporters import to_csv, to_geojson, to_gpx
from crosspaths.likelihood import grade
from crosspaths.matcher import Crossing
from crosspaths.parser import Point
from crosspaths.privacy import sanitize
from crosspaths.snap import GapRules, estimate_gaps

T = 1522618200.0


def cr(kind, dur, dist=10, offset=0, speed=0.2, filled=0.0):
    return Crossing(T, T + dur, T, T + dur, 52.5, 13.4, dist, offset, 20, speed, kind, filled)


def test_grades_follow_the_kind_of_crossing():
    assert grade(cr("same_place", 3600)) == (3, "spent_time")
    assert grade(cr("same_place", 600)) == (2, "met_briefly")
    assert grade(cr("shared_route", 900, speed=1.3)) == (2, "walked_together")
    assert grade(cr("shared_route", 900, speed=15)) == (1, "travelled_same_way")
    assert grade(cr("passing", 120, dist=30, speed=1.4)) == (1, "crossed_paths")
    assert grade(cr("passing", 120, dist=30, speed=14)) == (0, "passed_by")      # a car going by
    assert grade(cr("passing", 120, dist=90, speed=1.4)) == (0, "passed_by")     # edge of range


def test_grades_step_down_for_distance_time_apart_and_filled_in_positions():
    assert grade(cr("same_place", 3600, dist=90))[0] == 2
    assert grade(cr("same_place", 3600, offset=600))[0] == 2
    assert grade(cr("same_place", 3600, filled=1200))[0] == 2      # filled-in data counts, weakly
    assert grade(cr("same_place", 3600, dist=90, offset=600, filled=1200))[0] == 0
    assert grade(cr("passing", 60, dist=90, speed=20, offset=900))[0] == 0   # never below 0


def test_shared_entries_carry_the_grade_and_merged_ones_keep_the_likeliest():
    cafe = Crossing(T, T + 2400, T, T + 2400, 52.5, 13.4, 5, 0, 20, 0.2, "same_place")
    walk = Crossing(T + 2460, T + 2700, T + 2460, T + 2700, 52.501, 13.402, 80, 0, 300, 1.4, "passing")
    out = sanitize([walk, cafe])
    assert len(out) == 1 and out[0]["seen"] == 3 and out[0]["how"] == "spent_time"
    alone = sanitize([walk])
    assert alone[0]["seen"] == 0 and alone[0]["how"] == "passed_by"


# ---------- estimated car routes ----------

def straight_router(a, b, costing):
    assert costing == "auto"
    mid = ((a[0] + b[0]) / 2 + 0.001, (a[1] + b[1]) / 2)
    from crosspaths.geo import haversine_m
    length = float(haversine_m(a[0], a[1], mid[0], mid[1]) + haversine_m(mid[0], mid[1], b[0], b[1]))
    return [a, mid, b], length


def pts():
    # a 6 km drive in 6 minutes (60 km/h), a 300 m walk over 5 minutes, and a 600 km "flight" in an hour
    return [Point(T, 52.50, 13.40), Point(T + 360, 52.554, 13.40),
            Point(T + 660, 52.5567, 13.40), Point(T + 4260, 57.95, 13.40)]


def test_only_car_like_gaps_get_an_estimated_route():
    gaps = estimate_gaps(pts(), straight_router)
    assert len(gaps) == 1
    g = gaps[0]
    assert g[0].t == T and g[-1].t == T + 360 and all(p.src == "estimated" for p in g)
    assert T < g[1].t < T + 360


def test_gap_rules_can_be_changed():
    assert estimate_gaps(pts(), straight_router, GapRules(max_gap_min=5)) == []      # the 6-min drive is too long now
    assert len(estimate_gaps(pts(), straight_router, GapRules(min_kmh=2, min_km=0.2))) == 2  # the walk counts too


def test_implausible_routes_are_dropped():
    def detour(a, b, costing):
        return [a, (a[0] + 1, a[1]), b], 500_000.0
    assert estimate_gaps(pts(), detour) == []
    assert estimate_gaps(pts(), lambda *a: None) == []


def test_exports_keep_estimated_points_apart():
    p, gaps = pts()[:2], estimate_gaps(pts(), straight_router)
    gpx = to_gpx(p, estimated=gaps)
    assert gpx.count("<trk>") == 2 and "Estimated car routes" in gpx and "<type>estimated</type>" in gpx
    only = to_gpx([], estimated=gaps)
    assert only.count("<trk>") == 1 and "Estimated car routes" in only
    gj = json.loads(to_geojson(p, estimated=gaps))
    lines = [f for f in gj["features"] if f["geometry"]["type"] == "LineString"]
    assert len(lines) == 1 and lines[0]["properties"]["estimated"] is True
    rows = to_csv(p, estimated=gaps).strip().splitlines()
    assert rows[0] == "time,latitude,longitude,accuracy,estimated,gap"
    assert sum(r.split(",")[4] == "1" for r in rows[1:]) == 1 and sum(r.split(",")[4] == "0" for r in rows[1:]) == 2
    assert to_csv(p).splitlines()[0] == "time,latitude,longitude,accuracy"     # unchanged without the option


# ---------- API ----------

def test_export_with_estimates_and_fixed_check_settings():
    import synth
    from test_api import A_FILE, make_client, reg, setup_pair, upload
    app, c, d = make_client()
    ha, hb, ua, ub, conn = setup_pair(c)
    plain = c.get(f"/api/uploads/{ua['id']}/export?format=gpx", headers=ha)
    emb = c.get(f"/api/uploads/{ua['id']}/export?format=gpx&estimated=embed&gap_max_min=20", headers=ha)
    assert emb.status_code == 200 and emb.headers["X-Street-Maps"] == "0" and emb.headers["X-Estimated-Gaps"] == "0"
    assert emb.data == plain.data          # no street maps on this server: nothing to add
    only = c.get(f"/api/uploads/{ua['id']}/export?format=csv&estimated=only", headers=ha)
    assert only.status_code == 200 and "-estimated.csv" in only.headers["Content-Disposition"]
    assert c.get(f"/api/uploads/{ua['id']}/export?estimated=maybe", headers=ha).status_code == 400
    # people can't pick the closeness or time tolerance any more
    r = c.post("/api/checks", headers=ha, json={"connection_id": conn, "upload_id": ua["id"], "radius_m": 400, "window_min": 120})
    assert r.status_code == 201 and r.get_json()["radius_m"] == 100 and r.get_json()["window_min"] == 15


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("PASS", name)


def test_crossings_map_lists_only_my_finished_checks():
    from test_api import make_client, reg, setup_pair, wait_done
    app, c, d = make_client()
    ha, hb, ua, ub, conn = setup_pair(c)
    hc = reg(c, "carol")
    assert c.get("/api/crossings", headers=ha).get_json() == []
    cid = c.post("/api/checks", headers=ha, json={"connection_id": conn, "upload_id": ua["id"]}).get_json()["id"]
    c.post(f"/api/checks/{cid}/consent", headers=hb, json={"upload_id": ub["id"]})
    wait_done(c, ha, cid)
    mine = c.get("/api/crossings", headers=ha).get_json()
    assert mine and all(e["other"] == "bob.b" for e in mine) and {"lat", "lon", "seen", "place"} <= set(mine[0])
    theirs = c.get("/api/crossings", headers=hb).get_json()
    assert len(theirs) == len(mine) and all(e["other"] == "alice" for e in theirs)
    assert c.get("/api/crossings", headers=hc).get_json() == []


def test_day_preview_of_estimated_routes_without_street_maps():
    from test_api import make_client, reg, upload, A_FILE
    import synth
    app, c, d = make_client()
    h = reg(c, "alice")
    u = upload(c, h, A_FILE).get_json()
    s = c.get(f"/api/uploads/{u['id']}/summary", headers=h).get_json()
    y = s["years"][0]; m = y["months"][0]; day = m["days"][0]
    date = f"{y['year']}-{m['month']:02d}-{day['day']:02d}"
    r = c.get(f"/api/uploads/{u['id']}/day?date={date}&estimated=1", headers=h).get_json()
    assert r["street_maps"] is False and r["estimated"] == [] and r["segments"]
    assert "estimated" not in c.get(f"/api/uploads/{u['id']}/day?date={date}", headers=h).get_json()
