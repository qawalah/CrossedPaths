"""Background work: running checks and purging expired data."""
import json
import threading
import time

from crosspaths.matcher import Params
from crosspaths.parser import Track
from crosspaths.pipeline import run_check
from crosspaths.privacy import Zone

from .db import audit, connect
from .places import places_for
from .notifications import send_expo_push
from .store import delete_points, load_points

_one_at_a_time = threading.Semaphore(1)   # keep RAM bounded on a small NAS


def _trim(points, df, dt):
    return [p for p in points if (df is None or p.t >= df) and (dt is None or p.t <= dt)]


def thin_track(points, max_points=3000, min_move_m=40.0, gap_s=1800):
    """Own-track for the map: drop near-duplicates, split on long gaps, cap the size.
    A one-point segment is kept: it's a stay (e.g. a whole day at home is often just one or
    two points far apart in a semantic export) and clients draw it as a dot."""
    from crosspaths.geo import haversine_m
    segs, cur, last = [], [], None
    for p in points:
        if last is not None and p.t - last.t > gap_s:
            if cur:
                segs.append(cur)
            cur, last = [], None
        if last is None or float(haversine_m(p.lat, p.lon, last.lat, last.lon)) >= min_move_m or p.t - last.t > 600:
            cur.append([round(p.t), round(p.lat, 5), round(p.lon, 5)])
            last = p
    if cur:
        segs.append(cur)
    total = sum(len(s) for s in segs)
    if total > max_points:
        k = -(-total // max_points)
        segs = [s[::k] + ([s[-1]] if (len(s) - 1) % k else []) for s in segs]
    return segs


WINDOW_PAD_S = 3 * 3600      # own path shown this long before/after each crossing
MAX_TRACK_POINTS = 60000     # across all windows of one check (keeps the response a few MB at most)


def _iso_ts(s):
    from datetime import datetime, timezone
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()


def event_windows(events, pad_s=WINDOW_PAD_S):
    """[start-pad, end+pad] around every (sanitized) event, overlapping windows merged."""
    spans = sorted((_iso_ts(e["start"]) - pad_s, _iso_ts(e["end"]) + pad_s) for e in events)
    out = []
    for a, b in spans:
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def track_windows(points, events):
    """The person's OWN path, but only around the crossings - replaying six years of history
    on one map is unreadable, and nobody needs it to understand a crossing."""
    wins = event_windows(events)
    if not wins:
        return []
    per = max(200, min(1500, MAX_TRACK_POINTS // len(wins)))
    pts = sorted(points, key=lambda p: p.t)
    ts = [p.t for p in pts]
    import bisect
    out = []
    for a, b in wins:
        sub = pts[bisect.bisect_left(ts, a):bisect.bisect_right(ts, b)]
        out.append({"from": round(a), "to": round(b), "segments": thin_track(sub, max_points=per, min_move_m=15)})
    return out


def windows_from_legacy(segments, events):
    """Results computed before windows existed stored one thinned whole-history track."""
    flat = sorted((p for s in segments for p in s), key=lambda p: p[0])
    out = []
    for a, b in event_windows(events):
        sub = [p for p in flat if a <= p[0] <= b]
        segs, cur = [], []
        for p in sub:
            if cur and p[0] - cur[-1][0] > 1800:
                if len(cur) > 1:
                    segs.append(cur)
                cur = []
            cur.append(p)
        if len(cur) > 1:
            segs.append(cur)
        out.append({"from": round(a), "to": round(b), "segments": segs})
    return out


def name_events(cfg, events):
    """Offline place names for (sanitized, already blurred) events: a list of dicts, or of
    None where names aren't available right now (no internet yet for the first download)."""
    if not cfg.get("PLACE_NAMES") or not events:
        return [None] * len(events)
    try:
        return places_for(cfg["DATA_DIR"]).name_many([(e["lat"], e["lon"]) for e in events])
    except Exception:  # noqa: BLE001 - names are a nicety; never fail a check over them
        return [None] * len(events)


def store_names(con, rows_and_names):
    for row_id, n in rows_and_names:
        if n is not None:
            con.execute("UPDATE crossing_events SET place=?, place_ar=?, landmark=?, landmark_ar=? WHERE id=?",
                        (n["place"], n["place_ar"], n["landmark"], n["landmark_ar"], row_id))


def run_check_job(app, check_id):
    with _one_at_a_time:
        con = connect(app.config["DATA_PATH"])
        try:
            _run(app, con, check_id)
        except Exception as ex:  # noqa: BLE001
            con.execute("UPDATE checks SET status='failed', error=?, finished_at=? WHERE id=?",
                        (f"{type(ex).__name__}: {ex}"[:300], time.time(), check_id))
            con.commit()
        finally:
            con.close()


def _run(app, con, check_id):
    cfg = app.config
    chk = con.execute("SELECT * FROM checks WHERE id=?", (check_id,)).fetchone()
    parts = con.execute("SELECT p.*, u.zones FROM check_participants p JOIN uploads u ON u.id=p.upload_id "
                        "WHERE p.check_id=? ORDER BY p.user_id", (check_id,)).fetchall()
    if len(parts) != 2:
        raise RuntimeError("uploads no longer available")
    tracks, zones = [], []
    for p in parts:
        pts = _trim(load_points(cfg, p["upload_id"]), p["date_from"], p["date_to"])
        tracks.append(pts)
        zones.append([Zone(z["lat"], z["lon"], z.get("radius_m", 400), z.get("label", "")) for z in json.loads(p["zones"])])

    res = run_check(Track(tracks[0], "x"), Track(tracks[1], "x"),
                    Params(radius_m=chk["radius_m"], window_s=chk["window_s"]),
                    exclude_anchors=False, zones_a=zones[0], zones_b=zones[1],
                    blur_m=cfg["BLUR_M"], with_trust=False)

    names = name_events(cfg, res["events"])
    for e, n in zip(res["events"], names):
        n = n or {}
        con.execute("INSERT INTO crossing_events (check_id, starts_at, ends_at, lat, lon, blur_m, kind, duration_min, offset_min, "
                    "place, place_ar, landmark, landmark_ar) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (check_id, e["start"], e["end"], e["lat"], e["lon"], int(e["blur_m"]), e["kind"],
                     e["duration_min"], e["offset_min"], n.get("place"), n.get("place_ar"), n.get("landmark"), n.get("landmark_ar")))
    for p, pts in zip(parts, tracks):     # each user's OWN path around the crossings, only ever returned to them
        con.execute("UPDATE check_participants SET track_json=? WHERE check_id=? AND user_id=?",
                    (json.dumps({"v": 2, "windows": track_windows(pts, res["events"])}), check_id, p["user_id"]))
    now = time.time()
    con.execute("UPDATE checks SET status='done', finished_at=?, results_expire=? WHERE id=?",
                (now, now + cfg["RESULTS_TTL_DAYS"] * 86400, check_id))
    # The count of matches inside home/work zones is NOT shown to users (it would reveal shared workplaces).
    audit(con, None, "check_done", check_id, {"events": len(res["events"]), "zone_excluded": res["stats"]["excluded_in_home_work_zones"]})
    con.commit()

    n = len(res["events"])
    msg = f"{n} crossing{'s' if n != 1 else ''} found" if n else "No crossings found"
    for p in parts:
        toks = [r["push_token"] for r in con.execute("SELECT push_token FROM devices WHERE user_id=?", (p["user_id"],)).fetchall()]
        if toks:
            threading.Thread(target=send_expo_push, args=(toks, "Check finished", msg), daemon=True).start()


def purge(app):
    """Delete expired raw uploads, expired results, lapsed invitations. Safe to call any time."""
    cfg = app.config
    con = connect(cfg["DATA_PATH"])
    try:
        now = time.time()
        for r in con.execute("SELECT id FROM uploads WHERE purged_at IS NULL AND purge_after < ?", (now,)).fetchall():
            delete_points(cfg, r["id"])
            con.execute("UPDATE uploads SET purged_at=? WHERE id=?", (now, r["id"]))
        con.execute("DELETE FROM checks WHERE results_expire IS NOT NULL AND results_expire < ?", (now,))
        con.execute("UPDATE checks SET status='expired' WHERE status='awaiting_consent' AND expires_at < ?", (now,))
        con.execute("DELETE FROM login_failures WHERE at < ?", (now - 86400,))
        con.execute("DELETE FROM pair_codes WHERE expires_at < ?", (now - 86400,))
        con.execute("DELETE FROM shakes WHERE at < ?", (now - 600,))
        con.execute("DELETE FROM usage_counters WHERE day < date('now','-7 day')")
        con.commit()
    finally:
        con.close()


def start_purge_loop(app, every_s=3600):
    def loop():
        while True:
            try:
                purge(app)
            except Exception:  # noqa: BLE001
                pass
            time.sleep(every_s)
    threading.Thread(target=loop, daemon=True, name="purge").start()
