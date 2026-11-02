"""Configuration from environment variables (see .env.example)."""
import json
import os
import secrets

from cryptography.fernet import Fernet


def _bool(name, default):
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _read_version():
    try:
        with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "VERSION")) as f:
            return f.read().strip()
    except OSError:
        return "unknown"


class Config:
    VERSION = _read_version()
    DATA_DIR = os.environ.get("DATA_DIR", os.path.abspath("./data"))
    MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "80"))          # JSON is parsed in RAM: keep modest on a 2 GB host
    UPLOAD_TTL_HOURS = float(os.environ.get("UPLOAD_TTL_HOURS", "24"))   # raw timeline lifetime (default; users can choose)
    UPLOAD_KEEP_MAX_DAYS = float(os.environ.get("UPLOAD_KEEP_MAX_DAYS", "0"))  # longest a user may keep uploads; 0 = no limit
    RESULTS_TTL_DAYS = float(os.environ.get("RESULTS_TTL_DAYS", "14"))   # results + own map track lifetime
    CHECK_INVITE_DAYS = float(os.environ.get("CHECK_INVITE_DAYS", "7"))  # unanswered check lapses
    ALLOW_REGISTRATION = _bool("ALLOW_REGISTRATION", True)
    INVITE_CODE = os.environ.get("INVITE_CODE", "").strip()              # if set, required at signup
    MAP_STYLE_URL = os.environ.get("MAP_STYLE_URL", "https://tiles.openfreemap.org/styles/liberty")
    LIMIT_UPLOADS_PER_DAY = int(os.environ.get("LIMIT_UPLOADS_PER_DAY", "10"))
    LIMIT_REQUESTS_PER_DAY = int(os.environ.get("LIMIT_REQUESTS_PER_DAY", "20"))
    LIMIT_CHECKS_PER_DAY = int(os.environ.get("LIMIT_CHECKS_PER_DAY", "10"))
    LIMIT_CHECKS_PER_PAIR_PER_DAY = int(os.environ.get("LIMIT_CHECKS_PER_PAIR_PER_DAY", "3"))
    BLUR_M = float(os.environ.get("BLUR_M", "100"))
    # Offline neighbourhood/city names for crossings, from GeoNames files downloaded once to
    # DATA_DIR/places (only static files are fetched; nothing about users leaves the server).
    PLACE_NAMES = _bool("PLACE_NAMES", True)
    # Usernames (comma-separated) that may manage server-wide things in Settings, e.g. street maps.
    ADMIN_HANDLES = {h.strip().lower().lstrip("@") for h in os.environ.get("ADMIN_HANDLES", "").split(",") if h.strip()}
    # Street maps: journeys are drawn along roads in countries an admin downloaded (OpenStreetMap
    # extracts from Geofabrik, turned into routing data on this server; see server/roads.py).
    STREET_SNAP = _bool("STREET_SNAP", True)
    ROADS_CATALOG_URL = os.environ.get("ROADS_CATALOG_URL", "https://download.geofabrik.de/index-v1-nogeom.json")
    ROADS_MAX_DOWNLOAD_MB = int(os.environ.get("ROADS_MAX_DOWNLOAD_MB", "1500"))

    @classmethod
    def load_keys(cls):
        """SECRET_KEY signs login tokens; DATA_KEY encrypts stored timelines. Generated on first run."""
        os.makedirs(cls.DATA_DIR, exist_ok=True)
        path = os.path.join(cls.DATA_DIR, "keys.json")
        keys = {}
        if os.path.exists(path):
            with open(path) as f:
                keys = json.load(f)
        changed = False
        if not os.environ.get("SECRET_KEY") and "SECRET_KEY" not in keys:
            keys["SECRET_KEY"] = secrets.token_urlsafe(48); changed = True
        if not os.environ.get("DATA_KEY") and "DATA_KEY" not in keys:
            keys["DATA_KEY"] = Fernet.generate_key().decode(); changed = True
        if changed:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as f:
                json.dump(keys, f)
        cls.SECRET_KEY = os.environ.get("SECRET_KEY") or keys["SECRET_KEY"]
        cls.DATA_KEY = os.environ.get("DATA_KEY") or keys["DATA_KEY"]
