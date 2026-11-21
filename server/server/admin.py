"""Server-wide numbers for the admin view. Aggregates only: no tracks, places or who-met-whom."""
import json
import os
import shutil
import time

DAY = 86400


def _dir_bytes(path):
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def _one(db, sql, args=()):
    return db.execute(sql, args).fetchone()[0] or 0


def _grouped(db, sql, args=()):
    return {r[0]: r[1] for r in db.execute(sql, args).fetchall()}


def stats(db, cfg, started_at):
    now = time.time()
    d7, d30 = now - 7 * DAY, now - 30 * DAY
    data_dir = cfg["DATA_DIR"]
    places_dir = os.path.join(data_dir, "places")
    place_files = sorted(f[:-4] for f in os.listdir(places_dir) if f.endswith(".txt")) if os.path.isdir(places_dir) else []
    try:
        disk = shutil.disk_usage(data_dir)
        disk_free, disk_total = disk.free, disk.total
    except OSError:
        disk_free = disk_total = None

    def active_since(t):
        return _one(db, "SELECT COUNT(DISTINCT user_id) FROM audit_log WHERE at>? AND user_id IS NOT NULL", (t,))

    def audit_count(actions, since=None):
        q = "SELECT COUNT(*) FROM audit_log WHERE action IN (%s)" % ",".join("?" * len(actions))
        args = list(actions)
        if since:
            q += " AND at>?"; args.append(since)
        return _one(db, q, args)

    created = ("check_created", "check_created_in_person")
    done = db.execute("SELECT meta FROM audit_log WHERE action='check_done'").fetchall()
    found = [json.loads(r["meta"] or "{}").get("events", 0) for r in done]

    # One row per day for the last 30 days.
    daily = {}
    for r in db.execute("SELECT date(at,'unixepoch') d, action, COUNT(*) n FROM audit_log WHERE at>? "
                        "AND action IN ('register','upload','check_created','check_created_in_person','check_done','result_opened') "
                        "GROUP BY d, action", (d30,)).fetchall():
        key = {"check_created_in_person": "checks", "check_created": "checks", "register": "signups",
               "upload": "uploads", "check_done": "done", "result_opened": "results_opened"}[r["action"]]
        row = daily.setdefault(r["d"], {"day": r["d"], "signups": 0, "uploads": 0, "checks": 0, "done": 0, "results_opened": 0})
        row[key] += r["n"]
    for r in db.execute("SELECT date(at,'unixepoch') d, COUNT(DISTINCT user_id) n FROM audit_log WHERE at>? "
                        "AND user_id IS NOT NULL GROUP BY d", (d30,)).fetchall():
        daily.setdefault(r["d"], {"day": r["d"], "signups": 0, "uploads": 0, "checks": 0, "done": 0, "results_opened": 0})["active"] = r["n"]

    limits = {"upload": cfg["LIMIT_UPLOADS_PER_DAY"], "connection_request": cfg["LIMIT_REQUESTS_PER_DAY"],
              "check": cfg["LIMIT_CHECKS_PER_DAY"]}
    at_limit = {a: _one(db, "SELECT COUNT(*) FROM usage_counters WHERE day=date('now') AND action=? AND n>=?", (a, n))
                for a, n in limits.items()}
    return {
        "server": {
            "version": cfg["VERSION"], "uptime_s": round(now - started_at),
            "db_bytes": sum(os.path.getsize(p) for p in (cfg["DATA_PATH"], cfg["DATA_PATH"] + "-wal") if os.path.exists(p)),
            "uploads_bytes": _dir_bytes(os.path.join(data_dir, "uploads")),
            "places_bytes": _dir_bytes(places_dir),
            "disk_free_bytes": disk_free, "disk_total_bytes": disk_total,
            "registration_open": bool(cfg["ALLOW_REGISTRATION"]), "invite_required": bool(cfg["INVITE_CODE"]),
            "place_names": bool(cfg["PLACE_NAMES"]),
        },
        "users": {
            "total": _one(db, "SELECT COUNT(*) FROM users"),
            "new_7d": _one(db, "SELECT COUNT(*) FROM users WHERE created_at>?", (d7,)),
            "new_30d": _one(db, "SELECT COUNT(*) FROM users WHERE created_at>?", (d30,)),
            "active_1d": active_since(now - DAY), "active_7d": active_since(d7), "active_30d": active_since(d30),
            "keep_until_deleted": _one(db, "SELECT COUNT(*) FROM users WHERE keep_hours=0"),
            "devices": _grouped(db, "SELECT platform, COUNT(DISTINCT user_id) FROM devices GROUP BY platform"),
        },
        "connections": _grouped(db, "SELECT status, COUNT(*) FROM connections GROUP BY status"),
        "checks": {
            "total": audit_count(created), "last_7d": audit_count(created, d7),
            "in_person": audit_count(("check_created_in_person",)),
            "finished": len(found), "with_crossings": sum(1 for n in found if n),
            "crossings_found": sum(found),
            "current": _grouped(db, "SELECT status, COUNT(*) FROM checks GROUP BY status"),
            "recent_errors": [{"at": r["finished_at"], "error": r["error"]} for r in db.execute(
                "SELECT finished_at, error FROM checks WHERE status='failed' ORDER BY finished_at DESC LIMIT 5").fetchall()],
        },
        "uploads": {
            "total": _one(db, "SELECT COUNT(*) FROM uploads"),
            "last_7d": _one(db, "SELECT COUNT(*) FROM uploads WHERE created_at>?", (d7,)),
            "stored": _one(db, "SELECT COUNT(*) FROM uploads WHERE purged_at IS NULL"),
            "points_stored": _one(db, "SELECT SUM(points_count) FROM uploads WHERE purged_at IS NULL"),
            "by_format": _grouped(db, "SELECT fmt, COUNT(*) FROM uploads GROUP BY fmt ORDER BY 2 DESC"),
            "by_trust": _grouped(db, "SELECT COALESCE(trust_level,'unknown'), COUNT(*) FROM uploads GROUP BY 1"),
        },
        "views": {
            "results_opened_7d": audit_count(("result_opened",), d7),
            "results_opened_30d": audit_count(("result_opened",), d30),
            "results_opened_total": audit_count(("result_opened",)),
        },
        "places": {"downloaded": place_files, "world_ready": "cities500" in place_files,
                   "countries": sum(1 for f in place_files if len(f) == 2)},
        "pairing": {
            "connection_requests": audit_count(("connection_request",)),
            "in_person": _grouped(db, "SELECT substr(action,8), COUNT(*) FROM audit_log WHERE action LIKE 'paired\\_%' ESCAPE '\\' GROUP BY 1"),
        },
        "security": {
            "failed_logins_24h": _one(db, "SELECT COUNT(*) FROM login_failures WHERE at>?", (now - DAY,)),
            "users_at_daily_limit": at_limit,
        },
        "daily": sorted(daily.values(), key=lambda r: r["day"]),
    }
