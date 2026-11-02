"""Street maps: travel modes, snapping, admin API, and a real Valhalla build on a tiny grid.

tests/data/grid.osm.pbf is a made-up 5x5 grid of streets about 200 m apart, south-west corner
at (24.70, 46.70). No network is used.
"""
import json
import os
import shutil
import sys
import tempfile
import time

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

from crosspaths.parser import Point, parse_timeline, travel_mode
from crosspaths.snap import costing_for, decode_polyline, snap_points
from server import roads as roads_mod
from server import runner
from server.store import load_points, save_points
from test_api import make_client, reg

GRID_PBF = os.path.join(HERE, "data", "grid.osm.pbf")


# ---------- travel modes from Google exports ----------

def test_travel_mode_names():
    assert travel_mode("IN_PASSENGER_VEHICLE") == "road"
    assert travel_mode("in passenger vehicle") == "road"
    assert travel_mode("WALKING") == "foot"
    assert travel_mode("CYCLING") == "bike"
    assert travel_mode("IN_TRAIN") == "skip" and travel_mode("FLYING") == "skip" and travel_mode("IN_FERRY") == "skip"
    assert travel_mode("UNKNOWN_ACTIVITY_TYPE") is None and travel_mode(None) is None


def test_on_device_export_tags_path_points_with_the_trip_mode():
    data = {"semanticSegments": [
        {"startTime": "2024-05-01T10:00:00Z", "endTime": "2024-05-01T10:30:00Z",
         "activity": {"start": {"latLng": "24.70°, 46.70°"}, "end": {"latLng": "24.75°, 46.75°"},
                      "topCandidate": {"type": "IN_TRAIN"}}},
        {"startTime": "2024-05-01T10:00:00Z", "endTime": "2024-05-01T12:00:00Z",
         "timelinePath": [{"point": "24.71°, 46.71°", "time": "2024-05-01T10:10:00Z"},
                          {"point": "24.80°, 46.80°", "time": "2024-05-01T11:10:00Z"}]}]}
    pts = parse_timeline(data).points
    modes = {(p.src, round(p.t)): p.mode for p in pts}
    assert all(m == "skip" for (src, _), m in modes.items() if src == "activity")
    t_in, t_out = 1714558200, 1714561800      # 10:10 (inside the train trip) and 11:10 (after it)
    assert modes[("path", t_in)] == "skip"
    assert modes[("path", t_out)] is None


def test_legacy_semantic_history_mode():
    data = {"timelineObjects": [{"activitySegment": {
        "duration": {"startTimestamp": "2020-01-01T10:00:00Z", "endTimestamp": "2020-01-01T10:20:00Z"},
        "startLocation": {"latitudeE7": 247000000, "longitudeE7": 467000000},
        "endLocation": {"latitudeE7": 247100000, "longitudeE7": 467100000},
        "activityType": "WALKING"}}]}
    assert {p.mode for p in parse_timeline(data).points} == {"foot"}


def test_store_keeps_modes_and_reads_old_files():
    d = tempfile.mkdtemp()
    from cryptography.fernet import Fernet
    cfg = {"DATA_DIR": d, "DATA_KEY": Fernet.generate_key().decode()}
    pts = [Point(1, 24.7, 46.7, None, "path", "road"), Point(2, 24.7, 46.7, None, "record")]
    save_points(cfg, "u1", pts)
    assert [p.mode for p in load_points(cfg, "u1")] == ["road", None]
    shutil.rmtree(d)


# ---------- snapping with a fake router ----------

def _hop(mode=None, dist_deg=0.01, dt=300):
    return [Point(0, 24.70, 46.70, None, "path", mode), Point(dt, 24.70, 46.70 + dist_deg, None, "path", mode)]


def _fake_router(calls, length_factor=1.3):
    def route(a, b, costing):
        calls.append(costing)
        mid = ((a[0] + b[0]) / 2 + 0.002, (a[1] + b[1]) / 2)
        from crosspaths.geo import haversine_m
        return [a, mid, b], float(haversine_m(a[0], a[1], b[0], b[1])) * length_factor
    return route


def test_snap_inserts_route_points_with_times_in_between():
    calls = []
    out = snap_points(_hop("road"), _fake_router(calls))
    assert calls == ["auto"] and len(out) == 3
    assert 0 < out[1].t < 300 and out[1].lat == pytest.approx(24.702)


def test_snap_skips_trains_short_hops_flights_and_detours():
    calls = []
    assert len(snap_points(_hop("skip"), _fake_router(calls))) == 2
    assert len(snap_points(_hop(dist_deg=0.0005), _fake_router(calls))) == 2        # ~50 m: already fine
    assert len(snap_points(_hop(dist_deg=1.0, dt=600), _fake_router(calls))) == 2   # ~100 km in 10 min
    assert calls == []
    assert len(snap_points(_hop("road"), _fake_router(calls, length_factor=3))) == 2  # route 3x longer: not this trip
    assert len(snap_points(_hop("road"), lambda a, b, c: None)) == 2                   # no road found


def test_costing_guess():
    assert costing_for(None, 1.2) == "pedestrian" and costing_for(None, 15) == "auto"
    assert costing_for("bike", 5) == "bicycle" and costing_for("skip", 5) is None


def test_decode_polyline6():
    assert decode_polyline("_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI") == [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)]


# ---------- admin API ----------

CATALOG = {"features": [
    {"properties": {"id": "asia", "name": "Asia", "urls": {"pbf": "https://download.geofabrik.de/asia-latest.osm.pbf"}}},
    {"properties": {"id": "test-grid", "parent": "asia", "name": "Test grid",
                    "urls": {"pbf": "https://download.geofabrik.de/asia/test-grid-latest.osm.pbf"}}}]}


def _seed_catalog(d):
    os.makedirs(os.path.join(d, "roads"), exist_ok=True)
    with open(os.path.join(d, "roads", "catalog.json"), "w") as f:
        json.dump(CATALOG, f)


def test_admin_only():
    _, c, d = make_client(ADMIN_HANDLES={"boss"})
    h_user, h_admin = reg(c, "someone"), reg(c, "boss")
    assert c.get("/api/me", headers=h_user).get_json()["is_admin"] is False
    assert c.get("/api/me", headers=h_admin).get_json()["is_admin"] is True
    assert c.get("/api/admin/roads", headers=h_user).status_code == 403
    assert c.post("/api/admin/roads", headers=h_user, json={"region": "test-grid"}).status_code == 403
    r = c.get("/api/admin/roads", headers=h_admin)
    assert r.status_code == 200 and r.get_json()["regions"] == []
    _seed_catalog(d)
    cat = c.get("/api/admin/roads/catalog", headers=h_admin).get_json()
    assert {"id": "test-grid", "name": "Test grid", "parent": "Asia"} in cat
    assert c.post("/api/admin/roads", headers=h_admin, json={"region": "nope"}).status_code == 400
    assert c.delete("/api/admin/roads/nope", headers=h_admin).status_code == 404
    assert c.delete("/api/admin/roads/..", headers=h_admin).status_code == 404
    shutil.rmtree(d)


# ---------- the real thing: build routing data and draw along streets ----------

@pytest.mark.skipif(roads_mod.valhalla is None, reason="pyvalhalla not installed")
def test_download_build_route_and_delete(monkeypatch):
    app, c, d = make_client(ADMIN_HANDLES={"boss"})
    h = reg(c, "boss")
    _seed_catalog(d)

    def fake_download(self, rid, region_dir, url):      # no network in tests
        assert url.endswith("test-grid-latest.osm.pbf")
        shutil.copy(GRID_PBF, region_dir / "region.osm.pbf")
    monkeypatch.setattr(roads_mod.RoadMaps, "_download", fake_download)

    r = c.post("/api/admin/roads", headers=h, json={"region": "test-grid"})
    assert r.status_code == 200, r.get_json()
    for _ in range(300):
        regs = c.get("/api/admin/roads", headers=h).get_json()["regions"]
        if regs and regs[0]["state"] not in ("downloading", "building"):
            break
        time.sleep(0.1)
    assert regs[0]["state"] == "ready", regs
    assert regs[0]["region_id"] == "test-grid" and regs[0]["disk_mb"] is not None

    route = runner.street_router(app.config)
    assert route is not None
    # Diagonal across the grid: a straight line cuts through the blocks, the route follows streets.
    a, b = Point(0, 24.7001, 46.7001, None, "path", "road"), Point(240, 24.7071, 46.7079, None, "path", "road")
    out = snap_points([a, b], route)
    assert len(out) > 3
    inner = out[1:-1]
    on_street = lambda p: min(abs(p.lat - (24.70 + i * 0.0018)) for i in range(5)) < 2e-4 or \
        min(abs(p.lon - (46.70 + j * 0.002)) for j in range(5)) < 2e-4
    assert all(on_street(p) for p in inner)
    assert all(a.t < p.t < b.t for p in inner)
    # Outside the downloaded area nothing happens.
    far = [Point(0, 10.0, 10.0, None, "path", "road"), Point(240, 10.0, 10.01, None, "path", "road")]
    assert len(snap_points(far, route)) == 2

    assert c.delete(f"/api/admin/roads/{regs[0]['id']}", headers=h).status_code == 200
    assert runner.street_router(app.config) is None
    shutil.rmtree(d)
