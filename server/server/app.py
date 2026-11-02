"""CrossPaths API (Flask). One process, SQLite, encrypted timeline files on disk."""
import hashlib
import json
import os
import re
import threading
import time
from collections import OrderedDict
from functools import wraps

from flask import Flask, Response, abort, g, jsonify, request, send_from_directory

from crosspaths.geo import haversine_m
from crosspaths.exporters import FORMATS as EXPORT_FORMATS
from crosspaths.importers import FRIENDLY, Limits, merge_points, parse_files, sources_of
from crosspaths.privacy import detect_anchor_zones
from crosspaths.snap import snap_points
from crosspaths.spoofcheck import assess

from . import analysis, retention, runner
from .roads import roads_for
from .config import Config
from .notifications import send_expo_push
from .db import audit, close_db, get_db, init_db, new_id
from .security import hash_password, make_token, read_token, verify_password
from .store import delete_points, load_points, save_points

HANDLE_RE = re.compile(r"^[a-z0-9_.]{3,30}$")
HERE = os.path.dirname(os.path.abspath(__file__))


def create_app(overrides=None, start_background=True):
    overrides = overrides or {}
    if "SECRET_KEY" in overrides and "DATA_KEY" in overrides:
        os.makedirs(overrides.get("DATA_DIR", Config.DATA_DIR), exist_ok=True)
    else:
        Config.load_keys()
    app = Flask(__name__, static_folder=os.path.join(HERE, "static"), static_url_path="/static")
    app.config.from_object(Config)
    app.config.update(overrides)
    app.config["MAX_CONTENT_LENGTH"] = app.config["MAX_UPLOAD_MB"] * 1024 * 1024
    app.config["DATA_PATH"] = init_db(app.config["DATA_DIR"])
    app.teardown_appcontext(close_db)
    if start_background:
        runner.purge(app)
        runner.start_purge_loop(app)

    # ---------------- helpers ----------------
    def err(msg, code=400):
        resp = jsonify({"error": msg})
        resp.status_code = code
        abort(resp)

    def auth(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            h = request.headers.get("Authorization", "")
            uid = read_token(h[7:], app.config["SECRET_KEY"]) if h.startswith("Bearer ") else None
            user = get_db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone() if uid else None
            if not user:
                err("Please sign in", 401)
            g.user = user
            return fn(*a, **kw)
        return wrapper

    def today():
        return time.strftime("%Y-%m-%d", time.gmtime())

    def limit(action, per_day, key=None):
        db = get_db()
        uid = key or g.user["id"]
        row = db.execute("SELECT n FROM usage_counters WHERE user_id=? AND action=? AND day=?", (uid, action, today())).fetchone()
        if row and row["n"] >= per_day:
            err("Daily limit reached for this action. Try again tomorrow.", 429)
        db.execute("INSERT INTO usage_counters (user_id, action, day, n) VALUES (?,?,?,1) "
                   "ON CONFLICT(user_id, action, day) DO UPDATE SET n = n + 1", (uid, action, today()))

    def body():
        return request.get_json(silent=True) or {}

    def is_admin(u):
        return u["handle"].lower() in app.config["ADMIN_HANDLES"]

    def user_dict(u):
        return {"id": u["id"], "handle": u["handle"], "display_name": u["display_name"],
                "upload_keep_hours": retention.keep_hours(app.config, u), "is_admin": is_admin(u)}

    def admin(fn):
        """Only usernames listed in ADMIN_HANDLES (use under @auth)."""
        @wraps(fn)
        def wrapper(*a, **kw):
            if not is_admin(g.user):
                err("Only the server's admins can do this", 403)
            return fn(*a, **kw)
        return wrapper

    def num(v, lo, hi, default):
        try:
            return max(lo, min(hi, float(v)))
        except (TypeError, ValueError):
            return default

    def opt_ts(v):
        return None if v in (None, "") else float(v)

    def notify(user_id, title, msg, data=None):
        toks = [r["push_token"] for r in get_db().execute(
            "SELECT push_token FROM devices WHERE user_id=?", (user_id,)).fetchall()]
        if toks:
            threading.Thread(target=send_expo_push, args=(toks, title, msg, data), daemon=True).start()

    # ---------------- static / config ----------------
    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/manifest.webmanifest")
    def manifest():
        return send_from_directory(app.static_folder, "manifest.webmanifest", mimetype="application/manifest+json")

    @app.get("/sw.js")
    def sw():
        resp = send_from_directory(app.static_folder, "sw.js", mimetype="text/javascript")
        resp.headers["Service-Worker-Allowed"] = "/"
        return resp

    @app.get("/api/config")
    def config():
        c = app.config
        return jsonify({"map_style": c["MAP_STYLE_URL"], "max_upload_mb": c["MAX_UPLOAD_MB"],
                        "invite_required": bool(c["INVITE_CODE"]), "registration_open": c["ALLOW_REGISTRATION"],
                        "upload_ttl_hours": c["UPLOAD_TTL_HOURS"], "results_ttl_days": c["RESULTS_TTL_DAYS"],
                        "upload_keep_options": retention.keep_options(c),
                        # Same value at every address of this server (main, backup, tunnel), different on any
                        # other server: lets the app switch addresses without ever sending its token elsewhere.
                        "instance": hashlib.sha256(("instance:" + c["SECRET_KEY"]).encode()).hexdigest()[:16],
                        "version": c["VERSION"]})

    @app.after_request
    def headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        if request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.errorhandler(413)
    def too_big(_e):
        return jsonify({"error": f"File too large (limit {app.config['MAX_UPLOAD_MB']} MB). Trim the export to a shorter date range, or upload only the files with your routes, and try again."}), 413

    # ---------------- auth ----------------
    @app.post("/api/register")
    def register():
        c, d = app.config, body()
        if not c["ALLOW_REGISTRATION"]:
            err("Registration is closed", 403)
        if c["INVITE_CODE"] and d.get("invite") != c["INVITE_CODE"]:
            err("Invalid invite code", 403)
        handle = str(d.get("handle", "")).strip().lower().lstrip("@")
        pw = str(d.get("password", ""))
        if not HANDLE_RE.match(handle):
            err("Username must be 3-30 characters: letters, digits, _ or .")
        if len(pw) < 10:
            err("Password must be at least 10 characters")
        db = get_db()
        if db.execute("SELECT 1 FROM users WHERE handle=?", (handle,)).fetchone():
            err("That username is taken", 409)
        uid = new_id()
        db.execute("INSERT INTO users (id, handle, display_name, pw_hash, created_at) VALUES (?,?,?,?,?)",
                   (uid, handle, (d.get("display_name") or handle)[:40], hash_password(pw), time.time()))
        audit(db, uid, "register")
        db.commit()
        return jsonify({"token": make_token(uid, c["SECRET_KEY"]), "user": {"id": uid, "handle": handle, "display_name": d.get("display_name") or handle}})

    @app.post("/api/login")
    def login():
        d, db = body(), get_db()
        handle = str(d.get("handle", "")).strip().lower().lstrip("@")
        fails = db.execute("SELECT COUNT(*) c FROM login_failures WHERE handle=? AND at>?", (handle, time.time() - 900)).fetchone()["c"]
        if fails >= 8:
            err("Too many attempts. Wait 15 minutes.", 429)
        u = db.execute("SELECT * FROM users WHERE handle=?", (handle,)).fetchone()
        if not u or not verify_password(str(d.get("password", "")), u["pw_hash"]):
            db.execute("INSERT INTO login_failures (handle, at) VALUES (?,?)", (handle, time.time()))
            db.commit()
            err("Wrong username or password", 401)
        return jsonify({"token": make_token(u["id"], app.config["SECRET_KEY"]), "user": user_dict(u)})

    @app.get("/api/me")
    @auth
    def me():
        return jsonify(user_dict(g.user))

    @app.put("/api/me/settings")
    @auth
    def update_settings():
        d, db = body(), get_db()
        if "upload_keep_hours" in d:
            try:
                h = float(d["upload_keep_hours"])
            except (TypeError, ValueError):
                h = -1.0
            if h not in retention.keep_options(app.config):
                err("That isn't one of the choices this server allows")
            db.execute("UPDATE users SET keep_hours=? WHERE id=?", (h, g.user["id"]))
            # Applies to timelines already uploaded too: shortening it deletes the ones past it now.
            for r in db.execute("SELECT id, created_at FROM uploads WHERE user_id=? AND purged_at IS NULL", (g.user["id"],)).fetchall():
                db.execute("UPDATE uploads SET purge_after=? WHERE id=?", (retention.purge_time(r["created_at"], h), r["id"]))
            audit(db, g.user["id"], "settings", None, {"upload_keep_hours": h})
            db.commit()
            runner.purge(app)
        return jsonify(user_dict(db.execute("SELECT * FROM users WHERE id=?", (g.user["id"],)).fetchone()))

    # ---------------- push devices ----------------
    @app.post("/api/devices")
    @auth
    def register_device():
        d = body()
        platform, token = d.get("platform"), str(d.get("push_token", "")).strip()
        if platform not in ("ios", "android") or not token:
            err("platform (ios|android) and push_token are required")
        db, now = get_db(), time.time()
        db.execute("INSERT INTO devices (id, user_id, platform, push_token, created_at, last_seen) VALUES (?,?,?,?,?,?) "
                   "ON CONFLICT(user_id, push_token) DO UPDATE SET last_seen=excluded.last_seen, platform=excluded.platform",
                   (new_id(), g.user["id"], platform, token, now, now))
        db.commit()
        return jsonify({"ok": True})

    @app.delete("/api/devices")
    @auth
    def unregister_device():
        token = str(body().get("push_token", "")).strip()
        db = get_db()
        db.execute("DELETE FROM devices WHERE user_id=? AND push_token=?", (g.user["id"], token))
        db.commit()
        return jsonify({"ok": True})

    # ---------------- uploads ----------------
    def upload_dict(r):
        reasons = json.loads(r["trust_reasons"] or "[]")
        return {"id": r["id"], "format": r["fmt"], "points": r["points_count"],
                "from": r["ts_min"], "to": r["ts_max"], "created_at": r["created_at"],
                "expires_at": None if r["purge_after"] >= retention.FOREVER else r["purge_after"], "expired": r["purged_at"] is not None,
                "trust": {"level": r["trust_level"], "score": r["trust_score"], "reasons": reasons},
                "zones": json.loads(r["zones"] or "[]"), "sources": sources_list(r)}

    def sources_list(r):
        """What a timeline was built from. Uploads from before 0.13.0 didn't record it: one source."""
        try:
            got = json.loads(r["sources"]) if r["sources"] else None
        except (TypeError, ValueError):
            got = None
        return got or [{"label": FRIENDLY.get(r["fmt"], r["fmt"]), "files": 1, "points": r["points_count"], "added_at": r["created_at"]}]

    def combine_sources(lists):
        """Same kind of source added twice (two Strava imports) shows once, with the totals."""
        out = {}
        for e in lists:
            o = out.setdefault(e["label"], {"label": e["label"], "files": 0, "points": 0, "added_at": e.get("added_at")})
            o["files"] += int(e.get("files") or 0)
            o["points"] += int(e.get("points") or 0)
            o["added_at"] = min(x for x in (o["added_at"], e.get("added_at")) if x is not None) if e.get("added_at") is not None else o["added_at"]
        return sorted(out.values(), key=lambda e: -e["points"])

    def gather_sources(skip_id=None):
        """Points from this request: uploaded files (any format, photo scans included) plus other
        timelines of yours named in merge_ids. Returns (points, sources, import report, merged rows)."""
        files = [f for f in request.files.getlist("file") if f]
        ids = []
        for v in request.form.getlist("merge_ids"):
            ids += [x for x in v.split(",") if x and x != skip_id and x not in ids]
        if not files and not ids:
            err("Choose at least one source: a file, a photo scan or one of your timelines")
        if len(files) > 2000:
            err("Too many files at once (limit 2000). Zip them, or upload them in a few goes.")
        if len(ids) > 50:
            err("Too many timelines at once (limit 50)")
        now, pts, sources, imported, rows = time.time(), [], [], None, []
        if files:
            mb = app.config["MAX_UPLOAD_MB"] * 1024 * 1024
            try:
                # Zips are read one file at a time; cap what they may expand to on a small host.
                track, imported = parse_files(((f.filename, f.read()) for f in files),
                                              Limits(max_entry_bytes=2 * mb, max_total_bytes=8 * mb))
            except ValueError:
                err("Couldn't find any time-stamped locations in " + ("this file" if len(files) == 1 else "these files") +
                    ". Use a Google Maps Timeline export, or GPX, TCX, FIT, KML, GeoJSON or CSV files with times "
                    "(from Strava, Apple Health, Garmin, Samsung Health, Swarm and similar apps).")
            pts += track.points
            sources += sources_of(imported, now)
        for i in ids:
            r = own_upload(i)
            if r["purged_at"] is not None:
                err("One of those timelines has expired or was deleted. Choose it again from the list.", 410)
            pts += load_points(app.config, i)
            sources += sources_list(r)
            rows.append(r)
        return merge_points(pts), sources, imported, rows

    def save_timeline(pts, sources, existing=None):
        """Score, protect (home/work zones) and store a timeline; update `existing` in place if given."""
        if len(pts) < 20:
            err("That's too few location points to compare (at least 20 are needed).")
        report = assess(pts)
        score, level, reasons = report.score, report.level, list(report.reasons)
        sha = hashlib.sha256(json.dumps([[round(p.t), round(p.lat, 5), round(p.lon, 5)] for p in pts[:2000]]).encode()).hexdigest()
        db = get_db()
        if db.execute("SELECT 1 FROM uploads WHERE sha256=? AND user_id<>?", (sha, g.user["id"])).fetchone():
            score, level = min(score, 20), "low"
            reasons.append("Same timeline was uploaded by a different account")
        auto = [{"lat": z.lat, "lon": z.lon, "radius_m": z.radius_m, "label": "auto"} for z in detect_anchor_zones(pts)]
        if existing is not None:
            # Keep the person's own edits; only add home/work areas the new data reveals.
            zones = json.loads(existing["zones"] or "[]")
            zones += [z for z in auto if all(haversine_m(z["lat"], z["lon"], k["lat"], k["lon"]) > max(z["radius_m"], k["radius_m"]) for k in zones)]
        else:
            zones = auto
        sources = combine_sources(sources)
        fmt = ", ".join(e["label"] for e in sources)[:120]
        now = time.time()
        purge = retention.purge_time(now, retention.keep_hours(app.config, g.user))
        uid = existing["id"] if existing is not None else new_id()
        save_points(app.config, uid, pts)
        if existing is not None:
            db.execute("UPDATE uploads SET fmt=?, points_count=?, ts_min=?, ts_max=?, trust_score=?, trust_level=?, trust_reasons=?, "
                       "sha256=?, zones=?, purge_after=?, sources=? WHERE id=?",
                       (fmt, len(pts), pts[0].t, pts[-1].t, score, level, json.dumps(reasons), sha, json.dumps(zones), purge,
                        json.dumps(sources), uid))
        else:
            db.execute("INSERT INTO uploads (id, user_id, fmt, points_count, ts_min, ts_max, trust_score, trust_level, trust_reasons, "
                       "sha256, zones, created_at, purge_after, sources) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                       (uid, g.user["id"], fmt, len(pts), pts[0].t, pts[-1].t, score, level, json.dumps(reasons), sha,
                        json.dumps(zones), now, purge, json.dumps(sources)))
        return uid, level

    def finish(uid, level, imported, merged, action):
        db = get_db()
        removed = []
        if request.form.get("remove_merged") in ("1", "true") and merged:
            for r in merged:            # the person chose to fold those timelines into this one
                delete_points(app.config, r["id"])
                db.execute("UPDATE uploads SET purged_at=? WHERE id=?", (time.time(), r["id"]))
                removed.append(r["id"])
        row = db.execute("SELECT * FROM uploads WHERE id=?", (uid,)).fetchone()
        audit(db, g.user["id"], action, uid, {"points": row["points_count"], "trust": level, "merged": len(merged), "removed": len(removed)})
        db.commit()
        out = upload_dict(row)
        out["import"] = {"formats": imported.formats if imported else {}, "skipped": len(imported.skipped) if imported else 0,
                         "skipped_names": imported.skipped[:5] if imported else [], "removed": removed}
        return out

    @app.post("/api/uploads")
    @auth
    def upload():
        """A new timeline from one or more sources: files, a photo scan, and/or your other timelines."""
        request.files  # read the body first, so an oversized upload is "too large" (413), not a used-up try
        limit("upload", app.config["LIMIT_UPLOADS_PER_DAY"])
        pts, sources, imported, merged = gather_sources()
        uid, level = save_timeline(pts, sources)
        return jsonify(finish(uid, level, imported, merged, "upload")), 201

    @app.post("/api/uploads/<upload_id>/sources")
    @auth
    def add_sources(upload_id):
        """Add more sources to a timeline you already have. Its points are combined and re-checked."""
        existing = own_upload(upload_id)
        if existing["purged_at"] is not None:
            err("That timeline has expired. Please build it again.", 410)
        request.files
        limit("upload", app.config["LIMIT_UPLOADS_PER_DAY"])
        pts, sources, imported, merged = gather_sources(skip_id=upload_id)
        before = len(load_points(app.config, upload_id))
        all_pts = merge_points(load_points(app.config, upload_id) + pts)
        uid, level = save_timeline(all_pts, sources_list(existing) + sources, existing)
        out = finish(uid, level, imported, merged, "add_sources")
        out["import"]["added_points"] = len(all_pts) - before
        return jsonify(out)

    @app.get("/api/uploads/<upload_id>/export")
    @auth
    def export_upload(upload_id):
        """Download your own timeline (all its sources combined) as GPX, GeoJSON or CSV."""
        u = own_upload(upload_id)
        if u["purged_at"] is not None:
            err("That upload has expired. Please upload your timeline again.", 410)
        kind = (request.args.get("format") or "gpx").lower()
        if kind not in EXPORT_FORMATS:
            err("format must be gpx, geojson or csv")
        write, mime = EXPORT_FORMATS[kind]
        pts = load_points(app.config, upload_id)
        day = time.strftime("%Y-%m-%d", time.gmtime(u["ts_min"] or 0))
        audit(get_db(), g.user["id"], "export", upload_id, {"format": kind})
        get_db().commit()
        return Response(write(pts), mimetype=mime,
                        headers={"Content-Disposition": f'attachment; filename="crosspaths-timeline-{day}.{kind}"'})

    @app.get("/api/uploads")
    @auth
    def list_uploads():
        rows = get_db().execute("SELECT * FROM uploads WHERE user_id=? AND purged_at IS NULL ORDER BY created_at DESC", (g.user["id"],)).fetchall()
        return jsonify([upload_dict(r) for r in rows])

    def own_upload(upload_id):
        r = get_db().execute("SELECT * FROM uploads WHERE id=? AND user_id=?", (upload_id, g.user["id"])).fetchone()
        if not r:
            err("Upload not found", 404)
        return r

    @app.delete("/api/uploads/<upload_id>")
    @auth
    def delete_upload(upload_id):
        own_upload(upload_id)
        delete_points(app.config, upload_id)
        db = get_db()
        db.execute("UPDATE uploads SET purged_at=? WHERE id=?", (time.time(), upload_id))
        db.commit()
        return jsonify({"ok": True})

    @app.put("/api/uploads/<upload_id>/zones")
    @auth
    def put_zones(upload_id):
        own_upload(upload_id)
        zones = []
        for z in (body().get("zones") or [])[:20]:
            try:
                lat, lon = float(z["lat"]), float(z["lon"])
                if abs(lat) > 90 or abs(lon) > 180:
                    raise ValueError
                zones.append({"lat": lat, "lon": lon, "radius_m": num(z.get("radius_m", 400), 50, 5000, 400), "label": str(z.get("label", ""))[:30]})
            except (KeyError, TypeError, ValueError):
                err("Each zone needs lat, lon and radius_m")
        db = get_db()
        db.execute("UPDATE uploads SET zones=? WHERE id=?", (json.dumps(zones), upload_id))
        db.commit()
        return jsonify({"zones": zones})

    @app.get("/api/uploads/<upload_id>/summary")
    @auth
    def upload_summary(upload_id):
        u = own_upload(upload_id)
        if u["purged_at"] is not None:
            err("That upload has expired. Please upload your timeline again.", 410)
        return jsonify(analysis.summarize_track(load_points(app.config, upload_id), analysis.tz_param(request.args.get("tz"))))

    @app.get("/api/uploads/<upload_id>/day")
    @auth
    def upload_day(upload_id):
        u = own_upload(upload_id)
        if u["purged_at"] is not None:
            err("That upload has expired. Please upload your timeline again.", 410)
        try:
            t0, t1 = analysis.day_range(request.args.get("date", ""), analysis.tz_param(request.args.get("tz")))
        except ValueError:
            err("date must be in YYYY-MM-DD format")
        route = runner.street_router(app.config)
        key = (upload_id, t0, t1, roads_for(app.config).version if route else 0)
        segs = day_cache_get(key)
        if segs is None:
            day_pts = analysis.points_in_range(load_points(app.config, upload_id), t0, t1)
            if route is not None:
                day_pts = snap_points(day_pts, route, budget_s=6, max_routes=600)
            segs = runner.thin_track(day_pts, max_points=2000, min_move_m=15)
            day_cache_put(key, segs)
        return jsonify({"segments": segs, "date": request.args.get("date")})

    # Street-snapped days take a moment to route, and people flick back and forth between days.
    day_cache, day_cache_lock = OrderedDict(), threading.Lock()

    def day_cache_get(key):
        with day_cache_lock:
            if key in day_cache:
                day_cache.move_to_end(key)
                return day_cache[key]
        return None

    def day_cache_put(key, segs):
        with day_cache_lock:
            day_cache[key] = segs
            while len(day_cache) > 64:
                day_cache.popitem(last=False)

    @app.get("/api/uploads/<upload_id>/visits")
    @auth
    def upload_visits(upload_id):
        u = own_upload(upload_id)
        if u["purged_at"] is not None:
            err("That upload has expired. Please upload your timeline again.", 410)
        try:
            lat, lon = float(request.args.get("lat")), float(request.args.get("lon"))
        except (TypeError, ValueError):
            err("lat and lon query parameters are required")
        if abs(lat) > 90 or abs(lon) > 180:
            err("Invalid coordinates")
        radius = num(request.args.get("radius_m", 150), 25, 2000, 150)
        visits = analysis.find_visits(load_points(app.config, upload_id), lat, lon, radius_m=radius)
        return jsonify({"visits": visits, "radius_m": radius, "lat": lat, "lon": lon})

    # ---------------- connections ----------------
    def conn_dict(r):
        mine = g.user["id"]
        other = r["addressee_handle"] if r["requester_id"] == mine else r["requester_handle"]
        return {"id": r["id"], "status": r["status"], "other": other,
                "direction": "outgoing" if r["requester_id"] == mine else "incoming", "created_at": r["created_at"]}

    CONN_SQL = ("SELECT c.*, ur.handle AS requester_handle, ua.handle AS addressee_handle FROM connections c "
                "JOIN users ur ON ur.id=c.requester_id JOIN users ua ON ua.id=c.addressee_id ")

    @app.get("/api/connections")
    @auth
    def list_connections():
        rows = get_db().execute(CONN_SQL + "WHERE (c.requester_id=? OR c.addressee_id=?) AND c.status IN ('pending','accepted') ORDER BY c.created_at DESC",
                                (g.user["id"], g.user["id"])).fetchall()
        return jsonify([conn_dict(r) for r in rows])

    @app.post("/api/connections")
    @auth
    def request_connection():
        handle = str(body().get("handle", "")).strip().lower().lstrip("@")
        db, me_id = get_db(), g.user["id"]
        limit("connection_request", app.config["LIMIT_REQUESTS_PER_DAY"])
        other = db.execute("SELECT * FROM users WHERE handle=?", (handle,)).fetchone()
        if not other:
            err("No user with that username", 404)
        if other["id"] == me_id:
            err("That's you")
        ex = db.execute("SELECT * FROM connections WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)",
                        (me_id, other["id"], other["id"], me_id)).fetchone()
        now = time.time()
        if ex:
            if ex["status"] == "blocked":
                if ex["addressee_id"] == me_id:          # I blocked them; sending a request lifts my own block
                    db.execute("UPDATE connections SET requester_id=?, addressee_id=?, status='pending', created_at=?, responded_at=NULL WHERE id=?",
                               (me_id, other["id"], now, ex["id"]))
                else:                                    # they blocked me: look like success, do nothing
                    return jsonify({"ok": True}), 202
            elif ex["status"] in ("pending", "accepted"):
                err("You already have a request or connection with this user", 409)
            elif ex["status"] == "declined":
                if ex["responded_at"] and now - ex["responded_at"] < 7 * 86400:
                    err("This request was declined recently. Try again later.", 429)
                db.execute("UPDATE connections SET requester_id=?, addressee_id=?, status='pending', created_at=?, responded_at=NULL WHERE id=?",
                           (me_id, other["id"], now, ex["id"]))
        else:
            db.execute("INSERT INTO connections (id, requester_id, addressee_id, status, created_at) VALUES (?,?,?,'pending',?)",
                       (new_id(), me_id, other["id"], now))
        audit(db, me_id, "connection_request", other["id"])
        db.commit()
        notify(other["id"], "New request", f"@{g.user['handle']} wants to check paths with you")
        return jsonify({"ok": True}), 201

    @app.post("/api/connections/<cid>/respond")
    @auth
    def respond_connection(cid):
        db = get_db()
        c = db.execute("SELECT * FROM connections WHERE id=? AND addressee_id=? AND status='pending'", (cid, g.user["id"])).fetchone()
        if not c:
            err("Request not found", 404)
        action = body().get("action")
        status = {"accept": "accepted", "decline": "declined", "block": "blocked"}.get(action)
        if not status:
            err("action must be accept, decline or block")
        db.execute("UPDATE connections SET status=?, responded_at=? WHERE id=?", (status, time.time(), cid))
        audit(db, g.user["id"], f"connection_{status}", cid)
        db.commit()
        if status == "accepted":
            notify(c["requester_id"], "Request accepted", f"@{g.user['handle']} accepted your request")
        return jsonify({"ok": True, "status": status})

    @app.delete("/api/connections/<cid>")
    @auth
    def remove_connection(cid):
        db = get_db()
        c = db.execute("SELECT * FROM connections WHERE id=? AND (requester_id=? OR addressee_id=?)", (cid, g.user["id"], g.user["id"])).fetchone()
        if not c:
            err("Connection not found", 404)
        db.execute("DELETE FROM connections WHERE id=?", (cid,))   # cascades to their checks and results
        db.commit()
        return jsonify({"ok": True})

    # ---------------- checks ----------------
    def my_check(check_id):
        db = get_db()
        c = db.execute("SELECT * FROM checks WHERE id=?", (check_id,)).fetchone()
        if not c or not db.execute("SELECT 1 FROM check_participants WHERE check_id=? AND user_id=?", (check_id, g.user["id"])).fetchone():
            err("Check not found", 404)
        if c["status"] == "awaiting_consent" and c["expires_at"] < time.time():
            db.execute("UPDATE checks SET status='expired' WHERE id=?", (check_id,))
            db.commit()
            c = db.execute("SELECT * FROM checks WHERE id=?", (check_id,)).fetchone()
        return c

    def check_summary(c):
        db, me_id = get_db(), g.user["id"]
        parts = db.execute("SELECT p.*, u.handle FROM check_participants p JOIN users u ON u.id=p.user_id WHERE p.check_id=?", (c["id"],)).fetchall()
        me = next(p for p in parts if p["user_id"] == me_id)
        other = next(p for p in parts if p["user_id"] != me_id)
        done = c["status"] == "done"
        n = db.execute("SELECT COUNT(*) n FROM crossing_events WHERE check_id=?", (c["id"],)).fetchone()["n"] if done else None
        return {"id": c["id"], "status": c["status"], "other": other["handle"],
                "initiated_by_me": c["initiated_by"] == me_id,
                "radius_m": c["radius_m"], "window_min": c["window_s"] // 60,
                "my_consent": me["consented_at"] is not None, "their_consent": other["consented_at"] is not None,
                "created_at": c["created_at"], "expires_at": c["expires_at"], "results_expire": c["results_expire"],
                "events_count": n, "error": c["error"] if c["status"] == "failed" else None,
                # Counterpart trust is only revealed once the check is done, and only as a coarse level.
                "their_trust": other["trust_level"] if done else None}

    def valid_upload_for_me(upload_id):
        u = own_upload(upload_id)
        if u["purged_at"] is not None:
            err("That upload has expired. Please upload your timeline again.", 410)
        return u

    def claim_participant(db, check_id, user_id, upload, d):
        df, dt = opt_ts(d.get("date_from")), opt_ts(d.get("date_to"))
        if df is not None and dt is not None and df >= dt:
            err("Date range is empty")
        db.execute("UPDATE check_participants SET upload_id=?, date_from=?, date_to=?, consented_at=?, trust_level=? WHERE check_id=? AND user_id=?",
                   (upload["id"], df, dt, time.time(), upload["trust_level"], check_id, user_id))
        audit(db, user_id, "consent_given", check_id, {"upload": upload["id"]})

    @app.post("/api/checks")
    @auth
    def create_check():
        d, db, me_id = body(), get_db(), g.user["id"]
        c = db.execute(CONN_SQL + "WHERE c.id=? AND c.status='accepted' AND (c.requester_id=? OR c.addressee_id=?)",
                       (d.get("connection_id"), me_id, me_id)).fetchone()
        if not c:
            err("You can only check with accepted connections", 404)
        upload = valid_upload_for_me(d.get("upload_id"))
        other_id = c["addressee_id"] if c["requester_id"] == me_id else c["requester_id"]
        limit("check", app.config["LIMIT_CHECKS_PER_DAY"])
        limit("check_pair:" + other_id, app.config["LIMIT_CHECKS_PER_PAIR_PER_DAY"])
        if db.execute("SELECT 1 FROM checks WHERE connection_id=? AND status IN ('awaiting_consent','running')", (c["id"],)).fetchone():
            err("There is already an open check with this person", 409)
        cid, now = new_id(), time.time()
        db.execute("INSERT INTO checks (id, connection_id, initiated_by, radius_m, window_s, status, created_at, expires_at) VALUES (?,?,?,?,?,'awaiting_consent',?,?)",
                   (cid, c["id"], me_id, int(num(d.get("radius_m"), 25, 500, 100)), int(num(d.get("window_min"), 1, 240, 15) * 60),
                    now, now + app.config["CHECK_INVITE_DAYS"] * 86400))
        db.execute("INSERT INTO check_participants (check_id, user_id) VALUES (?,?), (?,?)", (cid, me_id, cid, other_id))
        claim_participant(db, cid, me_id, upload, d)
        audit(db, me_id, "check_created", cid)
        db.commit()
        notify(other_id, "Check paths?", f"@{g.user['handle']} wants to check if your paths crossed")
        return jsonify(check_summary(my_check(cid))), 201

    @app.get("/api/checks")
    @auth
    def list_checks():
        rows = get_db().execute("SELECT c.* FROM checks c JOIN check_participants p ON p.check_id=c.id WHERE p.user_id=? ORDER BY c.created_at DESC LIMIT 50",
                                (g.user["id"],)).fetchall()
        return jsonify([check_summary(my_check(r["id"])) for r in rows])

    @app.post("/api/checks/<check_id>/consent")
    @auth
    def consent(check_id):
        d, db, me_id = body(), get_db(), g.user["id"]
        c = my_check(check_id)
        if c["status"] != "awaiting_consent":
            err("This check is no longer waiting for consent", 409)
        me = db.execute("SELECT * FROM check_participants WHERE check_id=? AND user_id=?", (check_id, me_id)).fetchone()
        if me["consented_at"] is not None:
            err("You already consented", 409)
        claim_participant(db, check_id, me_id, valid_upload_for_me(d.get("upload_id")), d)
        ready = db.execute("SELECT COUNT(*) n FROM check_participants WHERE check_id=? AND consented_at IS NOT NULL", (check_id,)).fetchone()["n"] == 2
        if ready:
            db.execute("UPDATE checks SET status='running' WHERE id=?", (check_id,))
        db.commit()
        if ready:
            threading.Thread(target=runner.run_check_job, args=(app, check_id), daemon=True).start()
        return jsonify(check_summary(my_check(check_id)))

    @app.post("/api/checks/<check_id>/decline")
    @auth
    def decline(check_id):
        c = my_check(check_id)
        if c["status"] != "awaiting_consent":
            err("This check is no longer waiting for consent", 409)
        db = get_db()
        db.execute("UPDATE checks SET status='declined' WHERE id=?", (check_id,))
        audit(db, g.user["id"], "check_declined", check_id)
        db.commit()
        return jsonify({"ok": True})

    @app.get("/api/checks/<check_id>")
    @auth
    def get_check(check_id):
        c = my_check(check_id)
        out = check_summary(c)
        if c["status"] == "done":
            db = get_db()
            ev = db.execute("SELECT * FROM crossing_events WHERE check_id=? ORDER BY starts_at", (check_id,)).fetchall()
            unnamed = [e for e in ev if e["place"] is None]
            if unnamed and app.config["PLACE_NAMES"]:   # results from before names existed, or the first download failed
                names = runner.name_events(app.config, [{"lat": e["lat"], "lon": e["lon"]} for e in unnamed])
                if any(n is not None for n in names):
                    runner.store_names(db, [(e["id"], n) for e, n in zip(unnamed, names)])
                    db.commit()
                    ev = db.execute("SELECT * FROM crossing_events WHERE check_id=? ORDER BY starts_at", (check_id,)).fetchall()
            out["events"] = [{"id": i + 1, "start": e["starts_at"], "end": e["ends_at"], "lat": e["lat"], "lon": e["lon"],
                              "blur_m": e["blur_m"], "kind": e["kind"], "duration_min": e["duration_min"], "offset_min": e["offset_min"],
                              "place": e["place"] or "", "place_ar": e["place_ar"] or "",
                              "landmark": e["landmark"] or "", "landmark_ar": e["landmark_ar"] or ""}
                             for i, e in enumerate(ev)]
        return jsonify(out)

    @app.get("/api/checks/<check_id>/my-track")
    @auth
    def my_track(check_id):
        """Your own path, cut into windows of a few hours around each crossing."""
        my_check(check_id)
        db = get_db()
        r = db.execute("SELECT track_json FROM check_participants WHERE check_id=? AND user_id=?", (check_id, g.user["id"])).fetchone()
        stored = json.loads(r["track_json"]) if r and r["track_json"] else None
        if isinstance(stored, dict):
            windows = stored.get("windows", [])
        elif isinstance(stored, list):   # computed before windows existed
            ev = db.execute("SELECT starts_at AS start, ends_at AS end FROM crossing_events WHERE check_id=?", (check_id,)).fetchall()
            windows = runner.windows_from_legacy(stored, [dict(e) for e in ev])
        else:
            windows = []
        # legacy: computed before 0.7.0, when only a thinned whole-history track was stored -
        # the app suggests running the check again to see your path around each crossing.
        return jsonify({"windows": windows, "legacy": isinstance(stored, list)})

    @app.delete("/api/checks/<check_id>")
    @auth
    def delete_check(check_id):
        my_check(check_id)
        db = get_db()
        db.execute("DELETE FROM checks WHERE id=?", (check_id,))
        audit(db, g.user["id"], "check_deleted", check_id)
        db.commit()
        return jsonify({"ok": True})

    # ---------------- admin: street maps ----------------
    @app.get("/api/admin/roads")
    @auth
    @admin
    def roads_status():
        r = roads_for(app.config)
        return jsonify({"supported": r.supported, "enabled": bool(app.config["STREET_SNAP"]),
                        "max_download_mb": r.max_download_mb, "regions": r.regions()})

    @app.get("/api/admin/roads/catalog")
    @auth
    @admin
    def roads_catalog():
        try:
            items = roads_for(app.config).catalog()
        except Exception:  # noqa: BLE001
            err("Couldn't load the list of countries from download.geofabrik.de. Check the server's internet access.", 502)
        return jsonify([{k: c[k] for k in ("id", "name", "parent")} for c in items])

    @app.post("/api/admin/roads")
    @auth
    @admin
    def roads_add():
        region = str(body().get("region") or "").strip()
        if not region:
            err("Pick a region")
        try:
            rid = roads_for(app.config).start(region)
        except ValueError as ex:
            err(str(ex), 409 if "Another map" in str(ex) else 400)
        except Exception:  # noqa: BLE001
            err("Couldn't load the list of countries from download.geofabrik.de. Check the server's internet access.", 502)
        db = get_db()
        audit(db, g.user["id"], "roads_add", rid)
        db.commit()
        return jsonify({"ok": True, "id": rid})

    @app.delete("/api/admin/roads/<rid>")
    @auth
    @admin
    def roads_delete(rid):
        try:
            roads_for(app.config).delete(rid)
        except KeyError:
            err("Not found", 404)
        except ValueError as ex:
            err(str(ex), 409)
        db = get_db()
        audit(db, g.user["id"], "roads_delete", rid)
        db.commit()
        return jsonify({"ok": True})

    # ---------------- in-person pairing: QR code / invite link / shake ----------------
    # Meeting in person replaces the request -> accept -> request a check -> consent dance:
    # each person does one explicit thing on a screen that says "connect and check our paths
    # now", which is both people agreeing to both. If both have a timeline uploaded the check
    # starts immediately; otherwise they're just connected.
    PAIR_TTL_S = 600
    SHAKE_WINDOW_S = 4.0        # shakes this close in time can pair...
    SHAKE_WAIT_S = 10.0         # ...and a lone shake gives up after this long
    CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"   # no 0/O, 1/I/L mix-ups when typed
    shake_lock = threading.Lock()   # one gunicorn worker (see Dockerfile), so this serialises matching

    def usable_upload(user_id, upload_id):
        if not upload_id:
            return None
        return get_db().execute("SELECT * FROM uploads WHERE id=? AND user_id=? AND purged_at IS NULL",
                                (upload_id, user_id)).fetchone()

    def handle_of(user_id):
        r = get_db().execute("SELECT handle FROM users WHERE id=?", (user_id,)).fetchone()
        return r["handle"] if r else "?"

    def pair_users(a_id, a_up, b_id, b_up, radius_m, window_s, how):
        """Connect a and b (b is the one making this request) and, if both have a usable
        upload, start a check right away. Returns (connection_id, check_id or None, note)."""
        db, now = get_db(), time.time()
        if a_id == b_id:
            err("That's your own code. The other person needs to scan it.")
        ex = db.execute("SELECT * FROM connections WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)",
                        (a_id, b_id, b_id, a_id)).fetchone()
        if ex and ex["status"] == "blocked":
            err("You can't connect with this person.", 403)
        if ex:
            conn_id = ex["id"]
            if ex["status"] != "accepted":
                db.execute("UPDATE connections SET status='accepted', responded_at=? WHERE id=?", (now, conn_id))
        else:
            conn_id = new_id()
            db.execute("INSERT INTO connections (id, requester_id, addressee_id, status, created_at, responded_at) VALUES (?,?,?,'accepted',?,?)",
                       (conn_id, a_id, b_id, now, now))
        audit(db, b_id, "paired_" + how, a_id)
        ua, ub = usable_upload(a_id, a_up), usable_upload(b_id, b_up)
        check_id, note, start = None, "", False
        if not (ua and ub):
            who = [h for h, u in ((handle_of(a_id), ua), (handle_of(b_id), ub)) if not u]
            note = ("Connected. No check ran because " + " and ".join("@" + w for w in who) +
                    (" hasn't" if len(who) == 1 else " haven't") + " got a timeline uploaded. Upload one, then use Check paths.")
        else:
            open_chk = db.execute("SELECT * FROM checks WHERE connection_id=? AND status IN ('awaiting_consent','running')", (conn_id,)).fetchone()
            if open_chk and open_chk["status"] == "running":
                check_id, note = open_chk["id"], "A check with them is already running."
            else:
                limit("check", app.config["LIMIT_CHECKS_PER_DAY"])
                if open_chk:   # an earlier request was waiting for consent: both just agreed in person
                    check_id = open_chk["id"]
                    db.execute("UPDATE checks SET status='running' WHERE id=?", (check_id,))
                else:
                    check_id = new_id()
                    db.execute("INSERT INTO checks (id, connection_id, initiated_by, radius_m, window_s, status, created_at, expires_at) "
                               "VALUES (?,?,?,?,?,'running',?,?)", (check_id, conn_id, a_id, radius_m, window_s, now, now + 86400))
                    db.execute("INSERT INTO check_participants (check_id, user_id) VALUES (?,?), (?,?)", (check_id, a_id, check_id, b_id))
                for uid, up in ((a_id, ua), (b_id, ub)):
                    db.execute("UPDATE check_participants SET upload_id=?, date_from=NULL, date_to=NULL, consented_at=?, trust_level=? "
                               "WHERE check_id=? AND user_id=?", (up["id"], now, up["trust_level"], check_id, uid))
                audit(db, b_id, "check_created_in_person", check_id)
                start = True
        db.commit()
        if start:
            threading.Thread(target=runner.run_check_job, args=(app, check_id), daemon=True).start()
        notify(a_id, "Connected", f"You're connected with @{handle_of(b_id)}" + (" - checking your paths now" if start else ""))
        return conn_id, check_id, note

    def pair_result(conn_id, check_id, note, other_id):
        return {"other": handle_of(other_id), "connection_id": conn_id, "note": note,
                "check": check_summary(my_check(check_id)) if check_id else None}

    def pair_settings(d):
        return int(num(d.get("radius_m"), 25, 500, 100)), int(num(d.get("window_min"), 1, 240, 15) * 60)

    @app.post("/api/pair/code")
    @auth
    def pair_code_create():
        d, db = body(), get_db()
        limit("pair_code", 50)
        up = usable_upload(g.user["id"], d.get("upload_id"))
        if d.get("upload_id") and not up:
            err("That upload has expired. Please upload your timeline again.", 410)
        import secrets
        code, now = "".join(secrets.choice(CODE_ALPHABET) for _ in range(10)), time.time()
        radius, window = pair_settings(d)
        db.execute("INSERT INTO pair_codes (code, user_id, upload_id, radius_m, window_s, created_at, expires_at) VALUES (?,?,?,?,?,?,?)",
                   (code, g.user["id"], up["id"] if up else None, radius, window, now, now + PAIR_TTL_S))
        db.commit()
        return jsonify({"code": code, "expires_at": now + PAIR_TTL_S, "url": request.host_url.rstrip("/") + "/pair/" + code}), 201

    def live_code(code):
        r = get_db().execute("SELECT * FROM pair_codes WHERE code=?", (str(code).strip().upper(),)).fetchone()
        if not r or r["used_at"] is not None or r["expires_at"] < time.time():
            err("This code has expired or was already used. Ask for a new one.", 404)
        return r

    @app.get("/api/pair/code/<code>")
    @auth
    def pair_code_preview(code):
        r = get_db().execute("SELECT * FROM pair_codes WHERE code=?", (str(code).strip().upper(),)).fetchone()
        if r and r["user_id"] == g.user["id"]:   # the person showing the QR polls this to see who scanned it
            out = {"mine": True, "used": r["used_at"] is not None, "expired": r["expires_at"] < time.time() and r["used_at"] is None}
            if r["redeemed_by"]:
                out.update(pair_result(None, r["check_id"], r["note"] or "", r["redeemed_by"]))
            return jsonify(out)
        r = live_code(code)
        return jsonify({"mine": False, "from": handle_of(r["user_id"]), "expires_at": r["expires_at"],
                        "they_have_timeline": usable_upload(r["user_id"], r["upload_id"]) is not None,
                        "radius_m": r["radius_m"], "window_min": r["window_s"] // 60})

    @app.post("/api/pair/redeem")
    @auth
    def pair_redeem():
        d, db = body(), get_db()
        r = live_code(d.get("code", ""))
        if r["user_id"] == g.user["id"]:
            err("That's your own code. The other person needs to scan it.")
        db.execute("UPDATE pair_codes SET used_at=? WHERE code=? AND used_at IS NULL", (time.time(), r["code"]))
        conn_id, check_id, note = pair_users(r["user_id"], r["upload_id"], g.user["id"], d.get("upload_id"), r["radius_m"], r["window_s"], "code")
        db.execute("UPDATE pair_codes SET redeemed_by=?, check_id=?, note=? WHERE code=?", (g.user["id"], check_id, note, r["code"]))
        db.commit()
        return jsonify(pair_result(conn_id, check_id, note, r["user_id"]))

    def match_shake(me):
        """Pair `me` with the one other recent, nearby, waiting shake. Called under shake_lock."""
        db = get_db()
        near = []
        for s in db.execute("SELECT * FROM shakes WHERE id<>? AND user_id<>? AND at BETWEEN ? AND ?",
                            (me["id"], me["user_id"], me["at"] - SHAKE_WINDOW_S, me["at"] + SHAKE_WINDOW_S)).fetchall():
            reach = min(1500.0, max(150.0, s["acc"] + me["acc"] + 50.0))
            if float(haversine_m(me["lat"], me["lon"], s["lat"], s["lon"])) <= reach:
                near.append(s)
        cands = [s for s in near if s["status"] == "waiting"]
        # More than one other person shaking here and now (waiting, or already paired between
        # themselves) means a crowd: refuse rather than risk connecting the wrong two people.
        if len({s["user_id"] for s in near}) > 1:
            db.execute("UPDATE shakes SET status='ambiguous' WHERE id=?", (me["id"],))
            db.commit()
            return
        if not cands:
            return
        other = cands[0]
        conn_id, check_id, note = pair_users(other["user_id"], other["upload_id"], me["user_id"], me["upload_id"], 100, 900, "shake")
        res = json.dumps({"connection_id": conn_id, "check_id": check_id, "note": note,
                          "users": [other["user_id"], me["user_id"]]})
        db.execute("UPDATE shakes SET status='paired', result=? WHERE id IN (?,?)", (res, other["id"], me["id"]))
        db.commit()

    def shake_dict(s):
        if s["status"] == "paired":
            r = json.loads(s["result"])
            other = next(u for u in r["users"] if u != g.user["id"])
            return {"status": "paired", **pair_result(r["connection_id"], r["check_id"], r["note"], other)}
        if s["status"] == "waiting" and time.time() - s["at"] > SHAKE_WAIT_S:
            return {"status": "timeout"}
        return {"status": s["status"]}

    @app.post("/api/pair/shake")
    @auth
    def shake_create():
        d, db = body(), get_db()
        try:
            lat, lon = float(d["lat"]), float(d["lon"])
            acc = num(d.get("acc", 50), 1, 5000, 50)
            if abs(lat) > 90 or abs(lon) > 180:
                raise ValueError
        except (KeyError, TypeError, ValueError):
            err("lat and lon are required")
        limit("shake", 100)
        up = usable_upload(g.user["id"], d.get("upload_id"))
        sid, now = new_id(), time.time()
        with shake_lock:
            db.execute("DELETE FROM shakes WHERE at < ?", (now - 600,))
            db.execute("INSERT INTO shakes (id, user_id, upload_id, lat, lon, acc, at) VALUES (?,?,?,?,?,?,?)",
                       (sid, g.user["id"], up["id"] if up else None, lat, lon, acc, now))
            db.commit()
            match_shake(db.execute("SELECT * FROM shakes WHERE id=?", (sid,)).fetchone())
        return jsonify({"id": sid, **shake_dict(db.execute("SELECT * FROM shakes WHERE id=?", (sid,)).fetchone())}), 201

    @app.get("/api/pair/shake/<sid>")
    @auth
    def shake_status(sid):
        db = get_db()
        s = db.execute("SELECT * FROM shakes WHERE id=? AND user_id=?", (sid, g.user["id"])).fetchone()
        if not s:
            err("Not found", 404)
        if s["status"] == "waiting" and time.time() - s["at"] <= SHAKE_WAIT_S:
            with shake_lock:   # also try from this side, in case both shakes arrived at the same instant
                match_shake(s)
            s = db.execute("SELECT * FROM shakes WHERE id=?", (sid,)).fetchone()
        return jsonify({"id": sid, **shake_dict(s)})

    @app.get("/pair/<code>")
    def pair_page(code):   # invite links open the web app, which shows the "connect & check" screen
        return send_from_directory(app.static_folder, "index.html")

    return app
