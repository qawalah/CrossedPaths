"""Street maps for drawing journeys along roads (see crosspaths/snap.py).

An admin picks countries in Settings. For each one the server downloads the OpenStreetMap
extract from Geofabrik, builds Valhalla routing data from it in the background and keeps
only that (DATA_DIR/roads/<region>/tiles). Routing then runs inside this process: nobody's
path ever leaves the server, only the static map files are fetched.

Without the optional `pyvalhalla` package, or with no country ready, nothing is snapped and
journeys are drawn as before.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

from crosspaths.snap import decode_polyline

try:
    import valhalla
    from valhalla._scripts import PYVALHALLA_BIN_DIR
except Exception:  # noqa: BLE001 - optional: snapping is simply off without it
    valhalla = None
    PYVALHALLA_BIN_DIR = None

CATALOG_MAX_AGE_S = 7 * 86400
CACHE_BYTES = 64 * 1024 * 1024   # Valhalla's in-memory tile cache: keep RAM low on a small host
SEARCH_CUTOFF_M = 300            # don't snap to a road further than this from the recorded point
TILE_DEG, TILE_COLS = 0.25, 1440  # Valhalla level-2 (local roads) tile grid
BUSY = ("downloading", "building")


def tile_id(lat: float, lon: float) -> int:
    row = min(int((lat + 90) / TILE_DEG), int(180 / TILE_DEG) - 1)
    col = min(int((lon + 180) / TILE_DEG), TILE_COLS - 1)
    return row * TILE_COLS + col


def _dir_mb(p: Path) -> float:
    return round(sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) / 1e6, 1) if p.exists() else 0.0


class RoadMaps:
    def __init__(self, data_dir, catalog_url, max_download_mb):
        self.root = Path(data_dir) / "roads"
        self.root.mkdir(parents=True, exist_ok=True)
        self.catalog_url = catalog_url
        self.max_download_mb = max_download_mb
        self._job_lock = threading.Lock()     # one download/build at a time
        self._route_lock = threading.Lock()   # Valhalla actors aren't shared between threads
        self._actors = {}
        self._coverage = {}                   # region id -> set of tile ids
        self.version = 0                      # bumps whenever coverage changes (cache key)
        self._recover()
        self._load_coverage()

    @property
    def supported(self) -> bool:
        return valhalla is not None

    # ---------- state on disk ----------
    def _meta_path(self, rid):
        return self.root / rid / "meta.json"

    def _read_meta(self, rid):
        try:
            return json.loads(self._meta_path(rid).read_text())
        except (OSError, ValueError):
            return None

    def _write_meta(self, rid, **changes):
        meta = self._read_meta(rid) or {"id": rid}
        meta.update(changes)
        p = self._meta_path(rid)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(meta))
        tmp.replace(p)
        return meta

    def _recover(self):
        """A restart kills any running job: mark it failed and clear its leftovers."""
        for d in self.root.iterdir():
            meta = self._read_meta(d.name) if d.is_dir() else None
            if meta and meta.get("state") in BUSY:
                self._cleanup(d)
                ready = (d / "tiles").exists()
                self._write_meta(d.name, state="ready" if ready else "failed", progress=None,
                                 error=None if ready else "Stopped when the server restarted. Try again.")

    @staticmethod
    def _cleanup(d: Path):
        for name in ("region.osm.pbf", "region.osm.pbf.part"):
            (d / name).unlink(missing_ok=True)
        shutil.rmtree(d / "tiles.new", ignore_errors=True)

    def _load_coverage(self):
        cov = {}
        for d in self.root.iterdir():
            meta = self._read_meta(d.name) if d.is_dir() else None
            if meta and (d / "tiles").exists() and (d / "coverage.json").exists():
                try:
                    cov[d.name] = set(json.loads((d / "coverage.json").read_text()))
                except (OSError, ValueError):
                    pass
        with self._route_lock:
            self._coverage = cov
            self._actors = {}
            self.version += 1

    def regions(self):
        out = []
        for d in sorted(self.root.iterdir()):
            meta = self._read_meta(d.name) if d.is_dir() else None
            if meta:
                out.append({k: meta.get(k) for k in ("id", "region_id", "name", "parent", "state", "error", "progress",
                                                     "disk_mb", "started_at", "finished_at", "osm_date")})
        return out

    # ---------- catalog (Geofabrik's list of extracts) ----------
    def catalog(self):
        cache = self.root / "catalog.json"
        fresh = cache.exists() and time.time() - cache.stat().st_mtime < CATALOG_MAX_AGE_S
        if not fresh:
            try:
                req = urllib.request.Request(self.catalog_url, headers={"User-Agent": "CrossPaths server"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = json.loads(r.read())
                tmp = cache.with_suffix(".tmp")
                tmp.write_text(json.dumps(data))
                tmp.replace(cache)
            except Exception:  # noqa: BLE001 - fall back to an old copy if there is one
                if not cache.exists():
                    raise
        data = json.loads(cache.read_text())
        props = [f.get("properties", {}) for f in data.get("features", [])]
        names = {p.get("id"): p.get("name") for p in props}
        out = [{"id": p["id"], "name": p.get("name") or p["id"], "parent": names.get(p.get("parent")) or "",
                "url": (p.get("urls") or {}).get("pbf")}
               for p in props if p.get("id") and (p.get("urls") or {}).get("pbf")]
        return sorted(out, key=lambda x: x["name"].lower())

    # ---------- download + build ----------
    def start(self, region_id):
        """Start downloading and building one region. Raises ValueError with a message for the user."""
        if not self.supported:
            raise ValueError("Street maps need the pyvalhalla package on the server (it's in the Docker image).")
        entry = next((c for c in self.catalog() if c["id"] == region_id), None)
        if not entry or not str(entry["url"]).startswith("https://"):
            raise ValueError("Unknown region")
        if not self._job_lock.acquire(blocking=False):
            raise ValueError("Another map is being prepared. Wait for it to finish.")
        try:
            rid = region_id.replace("/", "__")
            self._write_meta(rid, region_id=region_id, name=entry["name"], parent=entry["parent"], state="downloading",
                             error=None, progress={"done_mb": 0, "total_mb": None}, started_at=time.time(), finished_at=None)
        except Exception:
            self._job_lock.release()
            raise
        threading.Thread(target=self._job, args=(rid, entry["url"]), daemon=True, name=f"roads-{rid}").start()
        return rid

    def _job(self, rid, url):
        d = self.root / rid
        try:
            try:
                self._download(rid, d, url)
            except (OSError, urllib.error.URLError) as ex:
                raise RuntimeError(f"Couldn't download the map from Geofabrik ({getattr(ex, 'reason', ex)}). "
                                   "Check the server's internet access and try again.") from ex
            self._build(rid, d)
        except Exception as ex:  # noqa: BLE001
            msg = str(ex) if isinstance(ex, (ValueError, RuntimeError)) else f"{type(ex).__name__}: {ex}"
            self._write_meta(rid, state="ready" if (d / "tiles").exists() else "failed", error=msg[:300],
                             progress=None, finished_at=time.time())
        finally:
            self._cleanup(d)
            self._job_lock.release()

    def _download(self, rid, d, url):
        part = d / "region.osm.pbf.part"
        req = urllib.request.Request(url, headers={"User-Agent": "CrossPaths server"})
        with urllib.request.urlopen(req, timeout=60) as r:
            total = int(r.headers.get("Content-Length") or 0)
            limit = self.max_download_mb * 1e6
            if total > limit:
                raise ValueError(f"This region is {total / 1e6:,.0f} MB, over the {self.max_download_mb:,} MB limit "
                                 "(ROADS_MAX_DOWNLOAD_MB). Pick a single country or a smaller region.")
            free = shutil.disk_usage(self.root).free
            if total and free < total * 4:
                raise ValueError(f"Not enough disk space: about {total * 4 / 1e9:.1f} GB is needed while it's prepared.")
            done, last = 0, 0.0
            with open(part, "wb") as f:
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    done += len(chunk)
                    if done > limit:
                        raise ValueError(f"Download is over the {self.max_download_mb:,} MB limit (ROADS_MAX_DOWNLOAD_MB).")
                    f.write(chunk)
                    if time.time() - last > 1:
                        last = time.time()
                        self._write_meta(rid, progress={"done_mb": round(done / 1e6, 1), "total_mb": round(total / 1e6, 1) if total else None})
            osm_date = r.headers.get("Last-Modified")
        part.replace(d / "region.osm.pbf")
        self._write_meta(rid, osm_date=osm_date)

    def _build(self, rid, d):
        self._write_meta(rid, state="building", progress=None)
        new = d / "tiles.new"
        shutil.rmtree(new, ignore_errors=True)
        new.mkdir()
        conf = valhalla.get_config(tile_extract="", tile_dir=str(new))
        conf["mjolnir"]["concurrency"] = 1          # slower, but RAM stays within a small server
        conf_path = d / "build.json"
        conf_path.write_text(json.dumps(conf))
        with open(d / "build.log", "wb") as log:
            proc = subprocess.run([str(Path(PYVALHALLA_BIN_DIR) / "valhalla_build_tiles"), "-c", str(conf_path), str(d / "region.osm.pbf")],
                                  stdout=log, stderr=subprocess.STDOUT, timeout=12 * 3600,
                                  preexec_fn=lambda: os.nice(10))   # keep the app responsive meanwhile
        conf_path.unlink(missing_ok=True)
        if proc.returncode != 0:
            if proc.returncode in (-9, 137):
                raise RuntimeError("The server ran out of memory while preparing this map. Give the container more "
                                   "memory (mem_limit in docker-compose.yml) or pick a smaller region.")
            raise RuntimeError(f"Preparing the map failed (code {proc.returncode}); see data/roads/{rid}/build.log")
        cov = sorted({int("".join(f.relative_to(new / "2").with_suffix("").parts)) for f in (new / "2").rglob("*.gph")}) \
            if (new / "2").exists() else []
        if not cov:
            raise RuntimeError("The map has no roads in it.")
        old = d / "tiles"
        with self._route_lock:                     # swap while nobody is routing on the old data
            self._actors.pop(rid, None)
            if old.exists():
                shutil.rmtree(old)
            new.replace(old)
        (d / "coverage.json").write_text(json.dumps(cov))
        (d / "build.log").unlink(missing_ok=True)
        self._write_meta(rid, state="ready", error=None, progress=None, finished_at=time.time(), disk_mb=_dir_mb(old))
        self._load_coverage()

    def delete(self, rid):
        if not rid or "/" in rid or "\\" in rid or rid.startswith("."):
            raise KeyError(rid)
        meta = self._read_meta(rid)
        if not meta:
            raise KeyError(rid)
        if meta.get("state") in BUSY:
            raise ValueError("Wait until this map has finished preparing.")
        with self._route_lock:
            self._actors.pop(rid, None)
        shutil.rmtree(self.root / rid, ignore_errors=True)
        self._load_coverage()

    # ---------- routing ----------
    def has_maps(self) -> bool:
        return self.supported and bool(self._coverage)

    def _region_for(self, a, b):
        ta, tb = tile_id(*a), tile_id(*b)
        return next((rid for rid, cov in self._coverage.items() if ta in cov and tb in cov), None)

    def _actor(self, rid):
        if rid not in self._actors:
            conf = valhalla.get_config(tile_extract="", tile_dir=str(self.root / rid / "tiles"))
            conf["mjolnir"]["max_cache_size"] = CACHE_BYTES
            self._actors[rid] = valhalla.Actor(conf)
        return self._actors[rid]

    def route(self, a, b, costing):
        """Street route between two (lat, lon) points: ([(lat, lon), ...], length_m) or None."""
        with self._route_lock:
            rid = self._region_for(a, b)
            if rid is None:
                return None
            req = {"locations": [{"lat": a[0], "lon": a[1], "search_cutoff": SEARCH_CUTOFF_M},
                                 {"lat": b[0], "lon": b[1], "search_cutoff": SEARCH_CUTOFF_M}],
                   "costing": costing, "directions_type": "none"}
            try:
                r = self._actor(rid).route(req)
            except Exception:  # noqa: BLE001 - no road nearby, no connection...
                return None
        legs = (r.get("trip") or {}).get("legs") or []
        if not legs:
            return None
        shape = decode_polyline(legs[0]["shape"])
        return shape, float(r["trip"]["summary"]["length"]) * 1000.0

    def router(self):
        """A route function for snap_points, or None when there's nothing to snap with."""
        return self.route if self.has_maps() else None


_instances: dict = {}
_instances_lock = threading.Lock()


def roads_for(cfg) -> RoadMaps:
    key = cfg["DATA_DIR"]
    with _instances_lock:
        if key not in _instances:
            _instances[key] = RoadMaps(key, cfg["ROADS_CATALOG_URL"], cfg["ROADS_MAX_DOWNLOAD_MB"])
        return _instances[key]
