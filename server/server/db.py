import json
import os
import sqlite3
import time
import uuid

from flask import current_app, g

HERE = os.path.dirname(os.path.abspath(__file__))


def connect(path=None):
    path = path or os.path.join(current_app.config["DATA_DIR"], "crosspaths.db")
    con = sqlite3.connect(path, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA busy_timeout = 30000")
    return con


def init_db(data_dir):
    path = os.path.join(data_dir, "crosspaths.db")
    con = sqlite3.connect(path)
    with open(os.path.join(HERE, "schema.sql")) as f:
        con.executescript(f.read())
    # Columns added after 0.7.0: CREATE TABLE IF NOT EXISTS doesn't add them to old databases.
    have = {r[1] for r in con.execute("PRAGMA table_info(crossing_events)")}
    for col in ("place", "place_ar", "landmark", "landmark_ar"):
        if col not in have:
            con.execute(f"ALTER TABLE crossing_events ADD COLUMN {col} TEXT")
    # user_version 1: crossings that got no name before "35 km NE of <town>" existed are
    # re-named the next time their result is opened.
    if "sources" not in {r[1] for r in con.execute("PRAGMA table_info(uploads)")}:
        con.execute("ALTER TABLE uploads ADD COLUMN sources TEXT")
    if "keep_hours" not in {r[1] for r in con.execute("PRAGMA table_info(users)")}:
        con.execute("ALTER TABLE users ADD COLUMN keep_hours REAL")
    if con.execute("PRAGMA user_version").fetchone()[0] < 1:
        con.execute("UPDATE crossing_events SET place=NULL, place_ar=NULL, landmark=NULL, landmark_ar=NULL WHERE place=''")
        con.execute("PRAGMA user_version = 1")
    con.commit()
    con.close()
    return path


def get_db():
    if "db" not in g:
        g.db = connect()
    return g.db


def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def new_id():
    return uuid.uuid4().hex


def audit(db, user_id, action, ref_id=None, meta=None):
    db.execute("INSERT INTO audit_log (at, user_id, action, ref_id, meta) VALUES (?,?,?,?,?)",
               (time.time(), user_id, action, ref_id, json.dumps(meta or {})))
