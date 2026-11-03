"""Street maps: editable routing options, and maps uploaded from the admin's device in pieces."""
import base64
import io
import os
import shutil
import sys
import tarfile
import tempfile
import time

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

from crosspaths.parser import Point
from crosspaths.snap import RouteOptions, snap_points
from server import roads as roads_mod
from server import runner
from test_api import make_client, reg

GRID_PBF = os.path.join(HERE, "data", "grid.osm.pbf")


def test_routing_options_are_editable_kept_in_range_and_resettable():
    app, c, d = make_client(ADMIN_HANDLES={"boss"})
    h, other = reg(c, "boss"), reg(c, "someone")
    assert c.get("/api/admin/roads/settings", headers=other).status_code == 403
    s = c.get("/api/admin/roads/settings", headers=h).get_json()
    assert s["values"]["gap_max_min"] == 30 and s["defaults"]["detour"] == 2.0 and s["limits"]["walk_max_kmh"] == [2, 30]
    r = c.put("/api/admin/roads/settings", headers=h, json={"gap_max_min": 45, "detour": 99, "walk_max_kmh": "7", "nonsense": 1})
    v = r.get_json()["values"]
    assert v["gap_max_min"] == 45 and v["detour"] == 5.0 and v["walk_max_kmh"] == 7 and "nonsense" not in v
    assert c.get("/api/config").get_json()["gap_rules"]["gap_max_min"] == 45      # clients show the new default
    roads = roads_mod.roads_for(app.config)
    o = roads.route_options()
    assert o.walk_max_ms == pytest.approx(7 / 3.6) and o.detour == 5.0
    assert roads.gap_rules({"gap_max_min": "10", "gap_max_km": ""}).max_gap_s == 600      # an export can still override
    assert c.put("/api/admin/roads/settings", headers=h, json={"reset": True}).get_json()["values"]["gap_max_min"] == 30
    shutil.rmtree(d)


def test_snap_follows_the_options():
    calls = []

    def router(a, b, costing):
        calls.append(costing)
        return [a, b], 1000.0
    hop = [Point(0, 24.70, 46.70, None, "path"), Point(300, 24.709, 46.70, None, "path")]   # 1 km in 5 min: 12 km/h
    snap_points(hop, router)
    snap_points(hop, router, opts=RouteOptions(walk_max_ms=20 / 3.6))
    assert calls == ["auto", "pedestrian"]
    calls.clear()
    snap_points(hop, router, opts=RouteOptions(min_hop_m=2000))
    assert calls == []


def _send(c, h, data, kind="tiles", name="Test grid", piece=None, as_json=False):
    r = c.post("/api/admin/roads/uploads", headers=h, json={"name": name, "kind": kind, "size": len(data)})
    assert r.status_code == 201, r.get_json()
    up = r.get_json()
    piece = piece or up["chunk_bytes"]
    for off in range(0, len(data), piece):
        chunk = data[off:off + piece]
        if as_json:
            r = c.put(f"/api/admin/roads/uploads/{up['upload_id']}", headers=h, json={"offset": off, "data": base64.b64encode(chunk).decode()})
        else:
            r = c.put(f"/api/admin/roads/uploads/{up['upload_id']}?offset={off}", headers=h, data=chunk, content_type="application/octet-stream")
        assert r.status_code == 200, r.get_json()
    return up


def _wait(c, h):
    for _ in range(300):
        regs = c.get("/api/admin/roads", headers=h).get_json()["regions"]
        if regs and regs[0]["state"] not in roads_mod.BUSY:
            return regs
        time.sleep(0.1)
    return regs


def test_bad_archives_and_pieces_are_refused():
    app, c, d = make_client(ADMIN_HANDLES={"boss"})
    h = reg(c, "boss")
    up = _send(c, h, b"not a tar at all", piece=5)
    # a piece that already arrived can be sent again; one that skips ahead can't
    assert c.put(f"/api/admin/roads/uploads/{up['upload_id']}?offset=0", headers=h, data=b"not a", content_type="application/octet-stream").status_code == 200
    assert c.post(f"/api/admin/roads/uploads/{up['upload_id']}/finish", headers=h).status_code == 200
    regs = _wait(c, h)
    assert regs[0]["state"] == "failed" and "tar" in regs[0]["error"] and regs[0]["source"] == "upload"
    # a tar with no tiles, or trying to escape its folder
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tf:
        info = tarfile.TarInfo("../../evil/2/000/1.gph"); info.size = 3; tf.addfile(info, io.BytesIO(b"abc"))
    up = _send(c, h, buf.getvalue(), name="Evil")
    c.post(f"/api/admin/roads/uploads/{up['upload_id']}/finish", headers=h)
    regs = [r for r in _wait(c, h) if r["name"] == "Evil"]
    assert not os.path.exists(os.path.join(d, "evil"))
    # unfinished uploads can be cancelled, and free the slot for the next one
    r = c.post("/api/admin/roads/uploads", headers=h, json={"name": "Half", "kind": "tiles", "size": 100})
    assert c.post("/api/admin/roads/uploads", headers=h, json={"name": "Other", "kind": "tiles", "size": 100}).status_code == 409
    assert c.delete(f"/api/admin/roads/uploads/{r.get_json()['upload_id']}", headers=h).status_code == 200
    assert c.post("/api/admin/roads/uploads", headers=h, json={"name": "Other", "kind": "tiles", "size": 100}).status_code == 201
    shutil.rmtree(d)


@pytest.mark.skipif(roads_mod.valhalla is None, reason="pyvalhalla not installed")
def test_tiles_built_elsewhere_upload_and_route():
    sys.path.insert(0, os.path.join(os.path.dirname(HERE), "tools"))
    import build_road_tiles
    work = tempfile.mkdtemp()
    out = os.path.join(work, "grid.tar.gz")
    build_road_tiles.main([GRID_PBF, out])
    data = open(out, "rb").read()

    app, c, d = make_client(ADMIN_HANDLES={"boss"})
    h = reg(c, "boss")
    up = _send(c, h, data, piece=max(1, len(data) // 3), as_json=True)   # as the Android app sends it
    assert c.post(f"/api/admin/roads/uploads/{up['upload_id']}/finish", headers=h).status_code == 200
    regs = _wait(c, h)
    assert regs[0]["state"] == "ready" and regs[0]["name"] == "Test grid" and regs[0]["parent"] == "Uploaded", regs
    route = runner.street_router(app.config)
    a, b = Point(0, 24.7001, 46.7001, None, "path", "road"), Point(240, 24.7071, 46.7079, None, "path", "road")
    assert len(snap_points([a, b], route)) > 3
    assert c.delete(f"/api/admin/roads/{regs[0]['id']}", headers=h).status_code == 200
    shutil.rmtree(d)
    shutil.rmtree(work)
