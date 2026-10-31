"""API end-to-end tests. Run:  python3 tests/test_api.py"""
import io
import json
import os
import shutil
import pytest
import sqlite3
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import synth
from cryptography.fernet import Fernet
from server import runner
from server.app import create_app


def make_client(**extra):
    d = tempfile.mkdtemp()
    cfg = {"DATA_DIR": d, "SECRET_KEY": "test-secret-key-test-secret-key-1234", "DATA_KEY": Fernet.generate_key().decode(),
           "TESTING": True, "INVITE_CODE": "", "PLACE_NAMES": False}   # tests never touch the network
    cfg.update(extra)
    app = create_app(cfg, start_background=False)
    return app, app.test_client(), d


def reg(c, handle, pw="correct-horse-battery"):
    r = c.post("/api/register", json={"handle": handle, "password": pw})
    assert r.status_code == 200, r.get_json()
    return {"Authorization": "Bearer " + r.get_json()["token"]}


def upload(c, h, payload):
    r = c.post("/api/uploads", headers=h, data={"file": (io.BytesIO(json.dumps(payload).encode()), "t.json")},
               content_type="multipart/form-data")
    return r


A_FILE = synth.to_on_device_json(synth.raw_points("A", 11))
B_FILE = synth.to_records_json(synth.raw_points("B", 22))


def setup_pair(c):
    ha, hb = reg(c, "alice"), reg(c, "bob.b")
    ua = upload(c, ha, A_FILE).get_json()
    ub = upload(c, hb, B_FILE).get_json()
    assert c.post("/api/connections", headers=ha, json={"handle": "@Bob.B"}).status_code == 201
    incoming = c.get("/api/connections", headers=hb).get_json()
    assert incoming[0]["direction"] == "incoming" and incoming[0]["other"] == "alice"
    assert c.post(f"/api/connections/{incoming[0]['id']}/respond", headers=hb, json={"action": "accept"}).status_code == 200
    return ha, hb, ua, ub, incoming[0]["id"]


def wait_done(c, h, cid, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = c.get(f"/api/checks/{cid}", headers=h).get_json()
        if r["status"] in ("done", "failed"):
            return r
        time.sleep(0.2)
    raise AssertionError("check did not finish")


def test_full_flow_and_privacy():
    app, c, d = make_client()
    ha, hb, ua, ub, conn = setup_pair(c)
    assert ua["format"] == "on-device" and ub["format"] == "records"
    assert ua["trust"]["level"] == "high" and len(ua["zones"]) == 2

    # Nothing runs until BOTH consent
    r = c.post("/api/checks", headers=ha, json={"connection_id": conn, "upload_id": ua["id"], "radius_m": 100, "window_min": 15})
    assert r.status_code == 201, r.get_json()
    chk = r.get_json()
    assert chk["status"] == "awaiting_consent" and chk["my_consent"] and not chk["their_consent"]
    assert "events" not in c.get(f"/api/checks/{chk['id']}", headers=ha).get_json()
    assert c.get(f"/api/checks/{chk['id']}/my-track", headers=ha).get_json()["windows"] == []

    # Bob consents -> runs
    r = c.post(f"/api/checks/{chk['id']}/consent", headers=hb, json={"upload_id": ub["id"]})
    assert r.status_code == 200, r.get_json()
    res = wait_done(c, ha, chk["id"])
    assert res["status"] == "done", res
    kinds = sorted(e["kind"] for e in res["events"])
    assert kinds == ["passing", "same_place"], res["events"]

    # Privacy: no raw/excluded counts, coarse trust only, no counterpart data in the response
    blob = json.dumps(res)
    for forbidden in ("raw_events", "excluded", "min_dist", "track", "segments"):
        assert forbidden not in blob, forbidden
    assert res["their_trust"] == "high" and res["other"] == "bob.b"

    # Each user only gets their OWN track, and only in windows around the crossings
    assert c.get(f"/api/checks/{chk['id']}/my-track", headers=ha).get_json()["legacy"] is False
    wa = c.get(f"/api/checks/{chk['id']}/my-track", headers=ha).get_json()["windows"]
    wb = c.get(f"/api/checks/{chk['id']}/my-track", headers=hb).get_json()["windows"]
    assert len(wa) == len(res["events"]) == 2      # the two crossings are days apart -> 2 windows
    assert wa != wb
    for w, e in zip(wa, res["events"]):
        pts = [p for s in w["segments"] for p in s]
        assert pts and all(w["from"] <= p[0] <= w["to"] for p in pts)
        assert w["to"] - w["from"] <= 8 * 3600     # a few hours, not the whole week
    from server import runner
    legacy = runner.windows_from_legacy([[[1000, 1, 1], [1100, 1, 1.001]], [[90000, 2, 2], [90100, 2, 2.001]]],
                                        [{"start": "1970-01-01T00:15:00Z", "end": "1970-01-01T00:30:00Z"}])
    assert len(legacy) == 1 and legacy[0]["segments"] == [[[1000, 1, 1], [1100, 1, 1.001]]]

    # Strangers can't see it
    hc = reg(c, "mallory")
    assert c.get(f"/api/checks/{chk['id']}", headers=hc).status_code == 404
    assert c.get(f"/api/checks/{chk['id']}/my-track", headers=hc).status_code == 404
    assert c.get("/api/checks").get_json()["error"]  # unauthenticated

    # Raw files are encrypted on disk
    f = os.path.join(d, "uploads", ua["id"] + ".bin")
    assert os.path.exists(f) and b"latitude" not in open(f, "rb").read()
    shutil.rmtree(d, ignore_errors=True)


def test_declined_and_blocked_and_rules():
    app, c, d = make_client()
    ha, hb, ua, ub, conn = setup_pair(c)
    chk = c.post("/api/checks", headers=ha, json={"connection_id": conn, "upload_id": ua["id"]}).get_json()
    assert c.post("/api/checks", headers=ha, json={"connection_id": conn, "upload_id": ua["id"]}).status_code == 409  # one open check
    assert c.post(f"/api/checks/{chk['id']}/decline", headers=hb).status_code == 200
    assert c.get(f"/api/checks/{chk['id']}", headers=ha).get_json()["status"] == "declined"
    # using someone else's upload is refused
    r = c.post("/api/checks", headers=ha, json={"connection_id": conn, "upload_id": ub["id"]})
    assert r.status_code == 404
    # can't check with non-accepted connections
    hc = reg(c, "carol")
    assert c.post("/api/connections", headers=hc, json={"handle": "alice"}).status_code == 201
    pend = c.get("/api/connections", headers=hc).get_json()[0]
    assert c.post("/api/checks", headers=hc, json={"connection_id": pend["id"], "upload_id": "x"}).status_code == 404
    # block: the blocked user gets a silent 202 and nothing happens
    inc = [x for x in c.get("/api/connections", headers=ha).get_json() if x["other"] == "carol"][0]
    assert c.post(f"/api/connections/{inc['id']}/respond", headers=ha, json={"action": "block"}).status_code == 200
    assert c.post("/api/connections", headers=hc, json={"handle": "alice"}).status_code == 202
    assert all(x["other"] != "carol" for x in c.get("/api/connections", headers=ha).get_json())
    shutil.rmtree(d, ignore_errors=True)


def test_auth_rules():
    app, c, d = make_client(INVITE_CODE="letmein")
    assert c.post("/api/register", json={"handle": "x1", "password": "correct-horse-battery"}).status_code == 403
    ok = c.post("/api/register", json={"handle": "dave", "password": "correct-horse-battery", "invite": "letmein"})
    assert ok.status_code == 200
    assert c.post("/api/register", json={"handle": "dave", "password": "correct-horse-battery", "invite": "letmein"}).status_code == 409
    assert c.post("/api/register", json={"handle": "Bad Name!", "password": "correct-horse-battery", "invite": "letmein"}).status_code == 400
    assert c.post("/api/register", json={"handle": "erin", "password": "short", "invite": "letmein"}).status_code == 400
    assert c.post("/api/login", json={"handle": "dave", "password": "correct-horse-battery"}).status_code == 200
    for _ in range(8):
        c.post("/api/login", json={"handle": "dave", "password": "wrong"})
    assert c.post("/api/login", json={"handle": "dave", "password": "correct-horse-battery"}).status_code == 429
    shutil.rmtree(d, ignore_errors=True)


def test_upload_validation_trust_and_reuse():
    app, c, d = make_client()
    h1, h2 = reg(c, "user1"), reg(c, "user2")
    assert upload(c, h1, {"foo": 1}).status_code == 400
    assert upload(c, h1, [1, 2, 3]).status_code == 400
    r = upload(c, h1, synth.spoofed_records_json())
    assert r.status_code == 201 and r.get_json()["trust"]["level"] == "low" and len(r.get_json()["trust"]["reasons"]) >= 3
    # the same timeline reused under another account is flagged
    r2 = upload(c, h2, synth.spoofed_records_json())
    assert "different account" in " ".join(r2.get_json()["trust"]["reasons"])
    tiny = {"locations": [{"latitudeE7": 1, "longitudeE7": 1, "timestamp": "2025-01-01T00:00:00Z"}] * 3}
    assert upload(c, h1, tiny).status_code == 400
    shutil.rmtree(d, ignore_errors=True)


def test_rate_limits_and_size_limit():
    app, c, d = make_client(LIMIT_UPLOADS_PER_DAY=2, MAX_UPLOAD_MB=1)
    h = reg(c, "ratel")
    small = synth.spoofed_records_json(200)
    assert upload(c, h, small).status_code == 201
    assert upload(c, h, small).status_code == 201
    assert upload(c, h, small).status_code == 429
    big = c.post("/api/uploads", headers=h, data={"file": (io.BytesIO(b"x" * (2 * 1024 * 1024)), "big.json")}, content_type="multipart/form-data")
    assert big.status_code == 413
    shutil.rmtree(d, ignore_errors=True)


def test_purge_and_expiry():
    app, c, d = make_client(UPLOAD_TTL_HOURS=0.0001, RESULTS_TTL_DAYS=0.00001)
    ha, hb, ua, ub, conn = setup_pair(c)
    time.sleep(0.5)
    runner.purge(app)
    assert not os.path.exists(os.path.join(d, "uploads", ua["id"] + ".bin"))
    assert c.get("/api/uploads", headers=ha).get_json() == []
    r = c.post("/api/checks", headers=ha, json={"connection_id": conn, "upload_id": ua["id"]})
    assert r.status_code == 410      # expired upload must be re-uploaded
    shutil.rmtree(d, ignore_errors=True)


def test_results_expire_and_delete():
    app, c, d = make_client(RESULTS_TTL_DAYS=0.00001)
    ha, hb, ua, ub, conn = setup_pair(c)
    chk = c.post("/api/checks", headers=ha, json={"connection_id": conn, "upload_id": ua["id"]}).get_json()
    c.post(f"/api/checks/{chk['id']}/consent", headers=hb, json={"upload_id": ub["id"]})
    assert wait_done(c, ha, chk["id"])["status"] == "done"
    time.sleep(1.2)
    runner.purge(app)
    assert c.get(f"/api/checks/{chk['id']}", headers=ha).status_code == 404   # results gone, incl. own track
    shutil.rmtree(d, ignore_errors=True)


def test_zones_edit_changes_result():
    app, c, d = make_client()
    ha, hb, ua, ub, conn = setup_pair(c)
    # Alice drops all zones AND Bob keeps his: the shared office is still excluded via Bob's zone
    assert c.put(f"/api/uploads/{ua['id']}/zones", headers=ha, json={"zones": []}).status_code == 200
    chk = c.post("/api/checks", headers=ha, json={"connection_id": conn, "upload_id": ua["id"]}).get_json()
    c.post(f"/api/checks/{chk['id']}/consent", headers=hb, json={"upload_id": ub["id"]})
    assert sorted(e["kind"] for e in wait_done(c, ha, chk["id"])["events"]) == ["passing", "same_place"]
    # Both drop zones: office matches come back
    assert c.put(f"/api/uploads/{ub['id']}/zones", headers=hb, json={"zones": []}).status_code == 200
    c.delete(f"/api/checks/{chk['id']}", headers=ha)
    chk2 = c.post("/api/checks", headers=ha, json={"connection_id": conn, "upload_id": ua["id"]}).get_json()
    c.post(f"/api/checks/{chk2['id']}/consent", headers=hb, json={"upload_id": ub["id"]})
    assert len(wait_done(c, ha, chk2["id"])["events"]) > 2
    shutil.rmtree(d, ignore_errors=True)


def test_static_and_pwa_files():
    app, c, d = make_client()
    r = c.get("/")
    assert r.status_code == 200 and b"CrossPaths" in r.data
    assert c.get("/manifest.webmanifest").status_code == 200
    sw = c.get("/sw.js")
    assert sw.status_code == 200 and sw.headers.get("Service-Worker-Allowed") == "/"
    for f in ("icon-192.png", "icon-512.png", "icon-maskable-512.png"):
        assert c.get("/static/" + f).status_code == 200
    cfg = c.get("/api/config").get_json()
    assert cfg["map_style"].startswith("https://") and cfg["max_upload_mb"] == 80
    assert cfg["version"] and cfg["version"] != "unknown"
    shutil.rmtree(d, ignore_errors=True)


def test_home_straddling_cell_boundary_is_one_zone():
    # B's synthetic home sits exactly on a detection-grid boundary; it must not become two zones.
    from crosspaths.geo import haversine_m
    app, c, d = make_client()
    hb = reg(c, "boundary")
    z = upload(c, hb, B_FILE).get_json()["zones"]
    assert len(z) == 2
    assert float(haversine_m(z[0]["lat"], z[0]["lon"], z[1]["lat"], z[1]["lon"])) > 1000
    shutil.rmtree(d, ignore_errors=True)


def test_device_registration_and_unregister():
    app, c, d = make_client()
    h = reg(c, "devuser")
    assert c.post("/api/devices", headers=h, json={"platform": "ios", "push_token": "ExponentPushToken[abc123]"}).status_code == 200
    assert c.post("/api/devices", headers=h, json={"platform": "bogus", "push_token": "x"}).status_code == 400
    assert c.post("/api/devices", headers=h, json={"platform": "android"}).status_code == 400
    # same token twice upserts, doesn't duplicate
    assert c.post("/api/devices", headers=h, json={"platform": "ios", "push_token": "ExponentPushToken[abc123]"}).status_code == 200
    con = __import__("server.db", fromlist=["connect"]).connect(app.config["DATA_PATH"])
    n = con.execute("SELECT COUNT(*) c FROM devices").fetchone()["c"]
    con.close()
    assert n == 1
    assert c.delete("/api/devices", headers=h, json={"push_token": "ExponentPushToken[abc123]"}).status_code == 200
    shutil.rmtree(d, ignore_errors=True)


def test_notify_is_best_effort_and_never_breaks_the_request():
    # No real network in this sandbox; send_expo_push should fail closed without raising.
    from server.notifications import send_expo_push
    ok = send_expo_push(["ExponentPushToken[doesnotmatter]"], "t", "b")
    assert ok in (True, False)   # must not raise
    app, c, d = make_client()
    ha, hb, ua, ub, conn = setup_pair(c)
    r = c.post("/api/checks", headers=ha, json={"connection_id": conn, "upload_id": ua["id"]})
    assert r.status_code == 201   # request succeeds even though no device is registered / no network
    shutil.rmtree(d, ignore_errors=True)


def test_timeline_summary_day_and_visits():
    app, c, d = make_client()
    h = reg(c, "solo")
    u = upload(c, h, A_FILE).get_json()

    summary = c.get(f"/api/uploads/{u['id']}/summary", headers=h).get_json()
    assert summary["years"] and summary["from"] and summary["to"]
    y = summary["years"][0]
    assert y["year"] == 2025 and y["count"] > 0
    m = y["months"][0]
    assert m["month"] == 6 and m["days"]
    day = m["days"][0]["day"]
    date_str = f"2025-06-{day:02d}"

    r = c.get(f"/api/uploads/{u['id']}/day?date={date_str}", headers=h)
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["date"] == date_str
    assert sum(len(s) for s in body["segments"]) > 0
    # a day with no data returns an empty (not erroring) result
    empty = c.get(f"/api/uploads/{u['id']}/day?date=2030-01-01", headers=h).get_json()
    assert empty["segments"] == []
    assert c.get(f"/api/uploads/{u['id']}/day?date=not-a-date", headers=h).status_code == 400

    # Days follow the viewer's time zone: the synthetic week starts Mon 00:00 UTC, which is
    # already 03:00 on Monday in Riyadh (UTC+3) but still Sunday evening in New York (UTC-4).
    first_utc = summary["years"][0]["months"][0]["days"][0]["day"]
    ny = c.get(f"/api/uploads/{u['id']}/summary?tz=-240", headers=h).get_json()
    assert ny["years"][0]["months"][0]["days"][0]["day"] == first_utc - 1
    from server.analysis import day_range, tz_param
    assert day_range("2025-06-03", 180) == (synth.BASE + 86400 - 3 * 3600, synth.BASE + 2 * 86400 - 3 * 3600)
    assert tz_param("180") == 180 and tz_param("junk") == 0 and tz_param("99999") == 840
    assert c.get(f"/api/uploads/{u['id']}/day?date=2025-06-03&tz=180", headers=h).status_code == 200

    # visits: search near Alice's home, which she visits every day in the synthetic week
    r = c.get(f"/api/uploads/{u['id']}/visits?lat={synth.A_HOME[0]}&lon={synth.A_HOME[1]}&radius_m=150", headers=h)
    assert r.status_code == 200, r.get_json()
    visits = r.get_json()["visits"]
    assert len(visits) >= 5   # home every morning/evening, merged per stay
    assert all(v["end"] >= v["start"] for v in visits)
    # somewhere she never went
    far = c.get(f"/api/uploads/{u['id']}/visits?lat=0&lon=0&radius_m=150", headers=h).get_json()
    assert far["visits"] == []
    assert c.get(f"/api/uploads/{u['id']}/visits?lat=999&lon=0", headers=h).status_code == 400
    assert c.get(f"/api/uploads/{u['id']}/visits?lon=0", headers=h).status_code == 400

    # someone else's upload is not visible via any of the three
    h2 = reg(c, "solo2")
    assert c.get(f"/api/uploads/{u['id']}/summary", headers=h2).status_code == 404
    assert c.get(f"/api/uploads/{u['id']}/day?date={date_str}", headers=h2).status_code == 404
    assert c.get(f"/api/uploads/{u['id']}/visits?lat=0&lon=0", headers=h2).status_code == 404

    # expired upload -> 410 on all three, not silently empty
    app2, c2, d2 = make_client(UPLOAD_TTL_HOURS=0.0001)
    h3 = reg(c2, "solo3")
    u2 = upload(c2, h3, A_FILE).get_json()
    time.sleep(0.5)
    runner.purge(app2)
    assert c2.get(f"/api/uploads/{u2['id']}/summary", headers=h3).status_code == 410
    assert c2.get(f"/api/uploads/{u2['id']}/day?date={date_str}", headers=h3).status_code == 410
    assert c2.get(f"/api/uploads/{u2['id']}/visits?lat=0&lon=0", headers=h3).status_code == 410
    shutil.rmtree(d, ignore_errors=True)
    shutil.rmtree(d2, ignore_errors=True)


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


def _fake_geonames(data_dir):
    """Tiny stand-ins for the GeoNames files, so place naming is tested offline."""
    d = os.path.join(data_dir, "places")
    os.makedirs(d, exist_ok=True)
    row = lambda gid, name, alt, lat, lon, fc, code, cc, pop: "\t".join(
        [str(gid), name, name, alt, str(lat), str(lon), fc, code, cc, "", "", "", "", "", str(pop), "", "", "Europe/Berlin", "2024-01-01"]) + "\n"
    with open(os.path.join(d, "cities500.txt"), "w", encoding="utf-8") as f:
        f.write(row(1, "Berlin", "Berlin,برلين", 52.5244, 13.4105, "P", "PPLC", "DE", 3426354))
        f.write(row(2, "Potsdam", "Potsdam", 52.3989, 13.0657, "P", "PPLA", "DE", 140000))
    with open(os.path.join(d, "DE.txt"), "w", encoding="utf-8") as f:
        f.write(row(10, "Prenzlauer Berg", "Prenzlauer Berg", 52.5389, 13.4246, "P", "PPLX", "DE", 0))
        f.write(row(11, "Mitte", "Mitte,ميته", 52.5200, 13.4050, "P", "PPLX", "DE", 0))
        f.write(row(12, "Cafe Square", "Cafe Square", synth.CAFE_A[0], synth.CAFE_A[1], "S", "SQR", "DE", 0))


def test_place_names_offline_and_lazy():
    from server.places import Places
    d0 = tempfile.mkdtemp()
    _fake_geonames(d0)
    p = Places(d0)
    n = p.name(52.5201, 13.4049)
    assert n["place"] == "Mitte, Berlin" and n["place_ar"] == "ميته، برلين"
    assert p.name(synth.CAFE_A[0], synth.CAFE_A[1])["landmark"] == "Cafe Square"
    assert p.name(0.0, -30.0) == {"place": "", "place_ar": "", "landmark": "", "landmark_ar": ""}   # open sea
    far = p.name(53.06, 13.41)   # ~60 km north of Berlin, no town in the fake data within 40 km
    assert far["place"].endswith("km N of Berlin") and 55 <= int(far["place"].split()[0]) <= 65, far
    assert far["place_ar"].endswith("شمال برلين")
    shutil.rmtree(d0, ignore_errors=True)

    # End to end: a finished check carries names; results made without names get them lazily.
    app, c, d = make_client(PLACE_NAMES=True)
    _fake_geonames(d)
    ha, hb, ua, ub, conn = setup_pair(c)
    chk = c.post("/api/checks", headers=ha, json={"connection_id": conn, "upload_id": ua["id"]}).get_json()
    c.post(f"/api/checks/{chk['id']}/consent", headers=hb, json={"upload_id": ub["id"]})
    res = wait_done(c, ha, chk["id"])
    assert res["events"] and all(e["place"].endswith("Berlin") for e in res["events"]), res["events"]
    cafe = next(e for e in res["events"] if e["kind"] == "same_place")
    assert cafe["landmark"] == "Cafe Square"
    import sqlite3
    con = sqlite3.connect(os.path.join(d, "crosspaths.db"))
    con.execute("UPDATE crossing_events SET place=NULL, place_ar=NULL, landmark=NULL, landmark_ar=NULL")
    con.commit(); con.close()
    again = c.get(f"/api/checks/{chk['id']}", headers=hb).get_json()
    assert all(e["place"].endswith("Berlin") for e in again["events"])
    shutil.rmtree(d, ignore_errors=True)


def test_old_database_is_migrated():
    import sqlite3
    d = tempfile.mkdtemp()
    con = sqlite3.connect(os.path.join(d, "crosspaths.db"))   # crossing_events as created by 0.7.0
    con.execute("CREATE TABLE crossing_events (id INTEGER PRIMARY KEY AUTOINCREMENT, check_id TEXT NOT NULL, starts_at TEXT NOT NULL, "
                "ends_at TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, blur_m INTEGER NOT NULL, kind TEXT NOT NULL, "
                "duration_min INTEGER NOT NULL, offset_min INTEGER NOT NULL)")
    con.commit(); con.close()
    from server.db import init_db
    init_db(d)
    init_db(d)   # idempotent
    cols = {r[1] for r in sqlite3.connect(os.path.join(d, "crosspaths.db")).execute("PRAGMA table_info(crossing_events)")}
    assert {"place", "place_ar", "landmark", "landmark_ar"} <= cols
    # names that came out empty before the "km from <town>" fallback are retried, once
    con = sqlite3.connect(os.path.join(d, "crosspaths.db"))
    con.execute("PRAGMA user_version = 0")
    con.execute("INSERT INTO crossing_events (check_id, starts_at, ends_at, lat, lon, blur_m, kind, duration_min, offset_min, place) "
                "VALUES ('c', 'a', 'b', 1, 1, 100, 'same_place', 5, 0, '')")
    con.commit(); con.close()
    init_db(d)
    con = sqlite3.connect(os.path.join(d, "crosspaths.db"))
    assert con.execute("SELECT place FROM crossing_events").fetchone()[0] is None
    assert con.execute("PRAGMA user_version").fetchone()[0] == 1
    con.close()
    shutil.rmtree(d, ignore_errors=True)


def test_pair_by_code_connects_and_checks_in_one_shot():
    app, c, d = make_client()
    ha, hb = reg(c, "alice"), reg(c, "bob.b")
    ua = upload(c, ha, synth.to_on_device_json(synth.raw_points("A", 11))).get_json()
    ub = upload(c, hb, synth.to_records_json(synth.raw_points("B", 22))).get_json()

    r = c.post("/api/pair/code", headers=ha, json={"upload_id": ua["id"]})
    assert r.status_code == 201, r.get_json()
    code = r.get_json()
    assert len(code["code"]) == 10 and code["url"].endswith("/pair/" + code["code"])
    assert c.get("/pair/" + code["code"]).status_code == 200          # invite link opens the web app

    prev = c.get(f"/api/pair/code/{code['code'].lower()}", headers=hb).get_json()   # typed in lowercase still works
    assert prev["from"] == "alice" and prev["they_have_timeline"] is True
    assert c.post("/api/pair/redeem", headers=ha, json={"code": code["code"]}).status_code == 400   # own code

    r = c.post("/api/pair/redeem", headers=hb, json={"code": code["code"], "upload_id": ub["id"]})
    assert r.status_code == 200, r.get_json()
    res = r.get_json()
    assert res["other"] == "alice" and res["check"] and res["check"]["status"] in ("running", "done")
    assert [x["status"] for x in c.get("/api/connections", headers=ha).get_json()] == ["accepted"]
    done = wait_done(c, ha, res["check"]["id"])
    assert done["status"] == "done" and done["my_consent"] and done["their_consent"]
    # the person who showed the QR sees who scanned it, and the check
    mine = c.get(f"/api/pair/code/{code['code']}", headers=ha).get_json()
    assert mine["mine"] and mine["used"] and mine["other"] == "bob.b" and mine["check"]["id"] == res["check"]["id"]
    # single use
    assert c.post("/api/pair/redeem", headers=hb, json={"code": code["code"], "upload_id": ub["id"]}).status_code == 404

    # meeting again later: already connected -> just a new check
    code2 = c.post("/api/pair/code", headers=ha, json={"upload_id": ua["id"]}).get_json()
    again = c.post("/api/pair/redeem", headers=hb, json={"code": code2["code"], "upload_id": ub["id"]}).get_json()
    assert again["connection_id"] == res["connection_id"] and again["check"]["id"] != res["check"]["id"]
    shutil.rmtree(d, ignore_errors=True)


def test_pair_edge_cases():
    app, c, d = make_client()
    ha, hb, hc = reg(c, "alice"), reg(c, "bob.b"), reg(c, "carol")
    ua = upload(c, ha, synth.to_on_device_json(synth.raw_points("A", 11))).get_json()
    # no timeline on one side: connected, no check, and a note saying why
    code = c.post("/api/pair/code", headers=ha, json={"upload_id": ua["id"]}).get_json()["code"]
    res = c.post("/api/pair/redeem", headers=hb, json={"code": code}).get_json()
    assert res["check"] is None and "@bob.b" in res["note"] and res["other"] == "alice"
    # blocked: carol blocks alice, then alice's code can't connect them
    c.post("/api/connections", headers=ha, json={"handle": "carol"})
    cid = c.get("/api/connections", headers=hc).get_json()[0]["id"]
    c.post(f"/api/connections/{cid}/respond", headers=hc, json={"action": "block"})
    code = c.post("/api/pair/code", headers=ha, json={}).get_json()["code"]
    assert c.post("/api/pair/redeem", headers=hc, json={"code": code}).status_code == 403
    # expired
    code = c.post("/api/pair/code", headers=ha, json={}).get_json()["code"]
    import sqlite3
    con = sqlite3.connect(os.path.join(d, "crosspaths.db"))
    con.execute("UPDATE pair_codes SET expires_at=0 WHERE code=?", (code,)); con.commit(); con.close()
    assert c.post("/api/pair/redeem", headers=hb, json={"code": code}).status_code == 404
    assert c.post("/api/pair/redeem", headers=hb, json={"code": "NOPE"}).status_code == 404
    shutil.rmtree(d, ignore_errors=True)


def test_shake_to_connect():
    app, c, d = make_client()
    ha, hb, hc, hd = reg(c, "alice"), reg(c, "bob.b"), reg(c, "carol"), reg(c, "dave")
    ua = upload(c, ha, synth.to_on_device_json(synth.raw_points("A", 11))).get_json()
    ub = upload(c, hb, synth.to_records_json(synth.raw_points("B", 22))).get_json()
    here = {"lat": 24.7114, "lon": 46.6744, "acc": 20}

    a = c.post("/api/pair/shake", headers=ha, json={**here, "upload_id": ua["id"]}).get_json()
    assert a["status"] == "waiting"
    # someone shaking 5 km away at the same moment is not a match
    far = c.post("/api/pair/shake", headers=hc, json={"lat": 24.75, "lon": 46.70, "acc": 20}).get_json()
    assert far["status"] == "waiting"
    b = c.post("/api/pair/shake", headers=hb, json={"lat": 24.7116, "lon": 46.6745, "acc": 15, "upload_id": ub["id"]}).get_json()
    assert b["status"] == "paired" and b["other"] == "alice" and b["check"]
    a2 = c.get(f"/api/pair/shake/{a['id']}", headers=ha).get_json()
    assert a2["status"] == "paired" and a2["other"] == "bob.b" and a2["check"]["id"] == b["check"]["id"]
    assert wait_done(c, ha, b["check"]["id"])["status"] == "done"
    assert c.get(f"/api/pair/shake/{a['id']}", headers=hb).status_code == 404   # can't read someone else's shake

    # a crowd: carol and dave shake together, and alice shakes right next to them at the same
    # moment -> alice is told it's ambiguous instead of being paired with the wrong person
    import sqlite3
    con = sqlite3.connect(os.path.join(d, "crosspaths.db"))
    con.execute("UPDATE shakes SET at = at - 60"); con.commit(); con.close()   # earlier shakes are history now
    assert c.post("/api/pair/shake", headers=hc, json=here).get_json()["status"] == "waiting"
    assert c.post("/api/pair/shake", headers=hd, json=here).get_json()["status"] == "paired"
    x = c.post("/api/pair/shake", headers=ha, json=here).get_json()
    assert x["status"] == "ambiguous"

    # a lone shake times out
    lone = c.post("/api/pair/shake", headers=hd, json={"lat": 10, "lon": 10, "acc": 10}).get_json()
    con = sqlite3.connect(os.path.join(d, "crosspaths.db"))
    con.execute("UPDATE shakes SET at = at - 60 WHERE id=?", (lone["id"],)); con.commit(); con.close()
    assert c.get(f"/api/pair/shake/{lone['id']}", headers=hd).get_json()["status"] == "timeout"
    assert c.post("/api/pair/shake", headers=hd, json={"lat": "x"}).status_code == 400
    shutil.rmtree(d, ignore_errors=True)


def test_upload_retention_is_the_users_choice():
    app, c, d = make_client()
    ha = reg(c, "keeper")
    assert c.get("/api/config").get_json()["upload_keep_options"] == [24.0, 168.0, 720.0, 0.0]
    assert c.get("/api/me", headers=ha).get_json()["upload_keep_hours"] == 24.0
    u = upload(c, ha, A_FILE).get_json()
    assert u["expires_at"] - u["created_at"] == pytest.approx(24 * 3600, abs=5)

    # "until I delete it": existing uploads are kept too, and new ones never expire
    r = c.put("/api/me/settings", headers=ha, json={"upload_keep_hours": 0})
    assert r.status_code == 200 and r.get_json()["upload_keep_hours"] == 0.0
    assert c.get("/api/uploads", headers=ha).get_json()[0]["expires_at"] is None
    assert upload(c, ha, A_FILE).get_json()["expires_at"] is None
    runner.purge(app)
    assert len(c.get("/api/uploads", headers=ha).get_json()) == 2

    # Only the offered choices; going back to 24 h deletes anything older straight away
    assert c.put("/api/me/settings", headers=ha, json={"upload_keep_hours": 5}).status_code == 400
    con = sqlite3.connect(os.path.join(d, "crosspaths.db"))
    con.execute("UPDATE uploads SET created_at = created_at - 30*3600 WHERE id=?", (u["id"],)); con.commit(); con.close()
    assert c.put("/api/me/settings", headers=ha, json={"upload_keep_hours": 24}).status_code == 200
    left = c.get("/api/uploads", headers=ha).get_json()
    assert [x["id"] for x in left] != [] and u["id"] not in [x["id"] for x in left]
    assert not os.path.exists(os.path.join(d, "uploads", u["id"] + ".bin"))
    shutil.rmtree(d, ignore_errors=True)

    # A server limit removes the longer choices
    app, c, d = make_client(UPLOAD_KEEP_MAX_DAYS=7)
    hb = reg(c, "capped")
    assert c.get("/api/config").get_json()["upload_keep_options"] == [24.0, 168.0]
    assert c.put("/api/me/settings", headers=hb, json={"upload_keep_hours": 0}).status_code == 400
    shutil.rmtree(d, ignore_errors=True)


def test_config_instance_is_stable_and_server_specific():
    app, c, d = make_client()
    a = c.get("/api/config").get_json()["instance"]
    assert len(a) == 16 and a == c.get("/api/config").get_json()["instance"]
    assert app.config["SECRET_KEY"] not in a
    app2, c2, d2 = make_client(SECRET_KEY="another-secret-key-another-secret-key-99")
    assert c2.get("/api/config").get_json()["instance"] != a
    shutil.rmtree(d, ignore_errors=True); shutil.rmtree(d2, ignore_errors=True)


def test_upload_many_files_and_archives():
    from test_importers import gpx, fit, zipped
    app, c, d = make_client()
    h = reg(c, "runner")
    pts = synth.raw_points("A", 11)
    files = [(io.BytesIO(gpx(pts[:400])), "1.gpx"), (io.BytesIO(fit(pts[400:800])), "2.fit"), (io.BytesIO(b"nope"), "x.txt")]
    r = c.post("/api/uploads", headers=h, data={"file": files}, content_type="multipart/form-data")
    j = r.get_json()
    assert r.status_code == 201, j
    assert j["format"] in ("fit+gpx (2 files)", "gpx+fit (2 files)") and j["import"]["skipped"] == 1
    z = zipped([("activities/a.gpx", gpx(pts[800:1200]))])
    r = c.post("/api/uploads", headers=h, data={"file": (io.BytesIO(z), "export.zip")}, content_type="multipart/form-data")
    assert r.status_code == 201 and r.get_json()["format"] == "gpx"
    r = c.post("/api/uploads", headers=h, data={"file": (io.BytesIO(b"hello"), "x.txt")}, content_type="multipart/form-data")
    assert r.status_code == 400 and "GPX" in r.get_json()["error"]
    shutil.rmtree(d, ignore_errors=True)
