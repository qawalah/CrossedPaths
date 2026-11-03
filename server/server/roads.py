"""Street maps for drawing journeys along roads (see crosspaths/snap.py).

An admin picks countries in Settings. For each one the server downloads the OpenStreetMap
extract from Geofabrik, builds Valhalla routing data from it in the background and keeps
only that (DATA_DIR/roads/<region>/tiles). Routing then runs inside this process: nobody's
path ever leaves the server, only the static map files are fetched.

Without the optional `pyvalhalla` package, or with no country ready, nothing is snapped and
journeys are drawn as before.
"""
from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import tarfile
import threading
import time
import uuid
import urllib.error
import urllib.request
from pathlib import Path

from crosspaths.snap import GapRules, RouteOptions, decode_polyline

try:
    import valhalla
    from valhalla._scripts import PYVALHALLA_BIN_DIR
except Exception:  # noqa: BLE001 - optional: snapping is simply off without it
    valhalla = None
    PYVALHALLA_BIN_DIR = None

CATALOG_MAX_AGE_S = 7 * 86400
# Display names that replace Geofabrik's own (region id -> name).
NAME_OVERRIDES = {"israel-and-palestine": "Palestine"}
CACHE_BYTES = 64 * 1024 * 1024   # Valhalla's in-memory tile cache: keep RAM low on a small host
SEARCH_CUTOFF_M = 300            # don't snap to a road further than this from the recorded point
TILE_DEG, TILE_COLS = 0.25, 1440  # Valhalla level-2 (local roads) tile grid
BUSY = ("downloading", "uploading", "building", "installing")
UPLOAD_CHUNK_MB = 8              # one request each, so a slow or dropped connection only repeats one piece
UPLOAD_KINDS = {"tiles": ".tar", "pbf": ".osm.pbf"}
UPLOAD_IDLE_S = 30 * 60          # an upload nobody has added to for this long is dropped (it holds the job slot)

# Routing options an admin can change (Settings → Street maps → Routing options). Each is
# (default, lowest, highest). The defaults are the values chosen when street maps were added.
SETTINGS = {
    # drawing journeys along streets
    "snap_min_hop_m": (150, 20, 2000),         # shorter hops already follow the street closely enough
    "snap_max_hop_km": (50, 1, 300),           # longer hops are guesswork either way
    "snap_max_gap_min": (30, 1, 240),          # never join points further apart in time than this
    "walk_max_kmh": (9, 2, 30),                # unknown mode: slower is walking, faster is a car
    "detour": (2.0, 1.1, 5.0),                 # a route longer than this x the straight line is not the trip...
    "detour_slack_m": (200, 0, 5000),          # ...plus this much slack
    "search_cutoff_m": (300, 20, 2000),        # don't snap to a road further than this from a point
    # estimated car routes in exports (experimental): which gaps are filled by default
    "gap_max_min": (30, 1, 180),
    "gap_max_km": (50, 0.5, 300),
    "gap_min_kmh": (15, 1, 200),
    "gap_max_kmh": (130, 10, 250),
}


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
        self._settings = self._load_settings()
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

    # ---------- routing options ----------
    def _settings_path(self):
        return self.root / "settings.json"

    def _load_settings(self):
        try:
            saved = json.loads(self._settings_path().read_text())
        except (OSError, ValueError):
            saved = {}
        return {k: self._clean(k, saved.get(k, d)) for k, (d, _lo, _hi) in SETTINGS.items()}

    @staticmethod
    def _clean(key, v):
        d, lo, hi = SETTINGS[key]
        try:
            v = max(lo, min(hi, float(v)))
        except (TypeError, ValueError):
            v = d
        return round(v, 2) if isinstance(d, float) else int(round(v))

    def settings(self):
        """Current routing options, with their defaults and limits for the settings screen."""
        return {"values": dict(self._settings),
                "defaults": {k: d for k, (d, _lo, _hi) in SETTINGS.items()},
                "limits": {k: [lo, hi] for k, (_d, lo, hi) in SETTINGS.items()}}

    def save_settings(self, patch):
        """Change some options (unknown keys are ignored, values are kept within limits).
        reset=True puts every option back to its default."""
        if patch.get("reset"):
            new = {k: d for k, (d, _lo, _hi) in SETTINGS.items()}
        else:
            new = dict(self._settings)
            for k, v in patch.items():
                if k in SETTINGS:
                    new[k] = self._clean(k, v)
        tmp = self._settings_path().with_suffix(".tmp")
        tmp.write_text(json.dumps(new))
        tmp.replace(self._settings_path())
        self._settings = new
        self.version += 1            # drawn days are cached by this: redraw them with the new options
        return self.settings()

    def route_options(self) -> RouteOptions:
        o = self._settings
        return RouteOptions(min_hop_m=o["snap_min_hop_m"], max_hop_m=o["snap_max_hop_km"] * 1000.0,
                            max_gap_s=o["snap_max_gap_min"] * 60.0, walk_max_ms=o["walk_max_kmh"] / 3.6,
                            detour=o["detour"], detour_slack_m=o["detour_slack_m"])

    def gap_defaults(self):
        o = self._settings
        return {k: o[k] for k in ("gap_max_min", "gap_max_km", "gap_min_kmh", "gap_max_kmh")}

    def gap_rules(self, overrides=None) -> GapRules:
        """Export gap rules: the admin's defaults, with whatever the person changed for this export."""
        r = self.gap_defaults()
        for k, v in (overrides or {}).items():
            if k in r and v not in (None, ""):
                r[k] = self._clean(k, v)
        return GapRules(max_gap_min=r["gap_max_min"], max_km=r["gap_max_km"], min_kmh=r["gap_min_kmh"], max_kmh=r["gap_max_kmh"])

    def _recover(self):
        """A restart kills any running job: mark it failed and clear its leftovers."""
        shutil.rmtree(self.root / "_uploads", ignore_errors=True)   # half-sent uploads can't be resumed after a restart
        for d in self.root.iterdir():
            meta = self._read_meta(d.name) if d.is_dir() else None
            if meta and meta.get("state") in BUSY:
                self._cleanup(d)
                ready = (d / "tiles").exists()
                self._write_meta(d.name, state="ready" if ready else "failed", progress=None,
                                 error=None if ready else (
                                     "Stopped when the server restarted. Preparing a map needs 1-4 GB of memory; on a smaller "
                                     "server, build the map on a computer and upload it instead."))

    @staticmethod
    def _cleanup(d: Path):
        for name in ("region.osm.pbf", "region.osm.pbf.part", "upload.tar"):
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
        self._drop_stale_uploads()
        out = []
        for d in sorted(p for p in self.root.iterdir() if not p.name.startswith("_")):
            meta = self._read_meta(d.name) if d.is_dir() else None
            if meta:
                out.append({k: meta.get(k) for k in ("id", "region_id", "name", "parent", "state", "error", "progress",
                                                     "disk_mb", "started_at", "finished_at", "osm_date", "source")})
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
        names = {p.get("id"): NAME_OVERRIDES.get(p.get("id"), p.get("name")) for p in props}
        out = [{"id": p["id"], "name": NAME_OVERRIDES.get(p["id"]) or p.get("name") or p["id"], "parent": names.get(p.get("parent")) or "",
                "url": (p.get("urls") or {}).get("pbf")}
               for p in props if p.get("id") and (p.get("urls") or {}).get("pbf")]
        return sorted(out, key=lambda x: x["name"].lower())

    # ---------- download + build ----------
    def _drop_stale_uploads(self):
        for up, u in list(getattr(self, "_uploads", {}).items()):
            if time.time() - u["at"] > UPLOAD_IDLE_S:
                self.cancel_upload(up)
                self._write_meta(u["rid"], state="failed", error="The upload stopped before it finished. Try again.") \
                    if (self.root / u["rid"]).exists() else None

    def start(self, region_id):
        """Start downloading and building one region. Raises ValueError with a message for the user."""
        self._drop_stale_uploads()
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
        self._install(rid, d, new)

    @staticmethod
    def _coverage_of(tiles: Path):
        lvl2 = tiles / "2"
        return sorted({int("".join(f.relative_to(lvl2).with_suffix("").parts)) for f in lvl2.rglob("*.gph")}) \
            if lvl2.exists() else []

    def _install(self, rid, d, new):
        """Swap freshly built or unpacked tiles (d/tiles.new) in as this region's map."""
        cov = self._coverage_of(new)
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

    # ---------- upload (when the server can't download or build a map itself) ----------
    def start_upload(self, name, kind, size):
        """Start receiving a map from an admin's device, in chunks. kind: "tiles" (a .tar of Valhalla
        tiles built elsewhere - no building here, so it works on a small server) or "pbf" (an
        OpenStreetMap extract the server then builds, which needs 1-4 GB of memory)."""
        if kind not in UPLOAD_KINDS:
            raise ValueError("Upload a .tar of routing tiles or an .osm.pbf file")
        if kind == "pbf" and not self.supported:
            raise ValueError("Building from an .osm.pbf needs the pyvalhalla package on the server. Upload ready-made tiles instead.")
        name = re.sub(r"\s+", " ", str(name or "")).strip()[:80] or "Uploaded map"
        size = int(size or 0)
        if size <= 0:
            raise ValueError("The file is empty")
        if size > self.max_download_mb * 1e6 * (3 if kind == "tiles" else 1):
            raise ValueError(f"That file is bigger than this server allows (ROADS_MAX_DOWNLOAD_MB={self.max_download_mb:,}).")
        if shutil.disk_usage(self.root).free < size * (2 if kind == "tiles" else 4):
            raise ValueError("Not enough disk space on the server for this map.")
        self._drop_stale_uploads()
        if not self._job_lock.acquire(blocking=False):
            raise ValueError("Another map is being prepared. Wait for it to finish.")
        try:
            slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "map"
            rid = f"upload__{slug}"
            up = uuid.uuid4().hex
            (self.root / "_uploads").mkdir(exist_ok=True)
            (self.root / "_uploads" / up).write_bytes(b"")
            self._uploads = getattr(self, "_uploads", {})
            self._uploads[up] = {"rid": rid, "name": name, "kind": kind, "size": size, "at": time.time()}
            self._write_meta(rid, region_id=None, name=name, parent="Uploaded", source="upload", state="uploading", error=None,
                             progress={"done_mb": 0, "total_mb": round(size / 1e6, 1)}, started_at=time.time(), finished_at=None)
        except Exception:
            self._job_lock.release()
            raise
        return {"upload_id": up, "id": rid, "chunk_bytes": UPLOAD_CHUNK_MB * 1024 * 1024}

    def _upload(self, up):
        u = getattr(self, "_uploads", {}).get(up)
        if not u or not re.fullmatch(r"[0-9a-f]{32}", up):
            raise KeyError(up)
        return u, self.root / "_uploads" / up

    def write_chunk(self, up, offset, data: bytes):
        """Append one piece at `offset`. Re-sending a piece that already arrived is harmless."""
        u, path = self._upload(up)
        have = path.stat().st_size
        offset = int(offset)
        if offset + len(data) <= have:
            return have                                   # a retry of something we already have
        if offset != have:
            raise ValueError(f"Expected the piece at {have}, got {offset}")
        if have + len(data) > u["size"]:
            raise ValueError("More data than the file size given")
        with open(path, "ab") as f:
            f.write(data)
        have += len(data)
        u["at"] = time.time()
        self._write_meta(u["rid"], progress={"done_mb": round(have / 1e6, 1), "total_mb": round(u["size"] / 1e6, 1)})
        return have

    def finish_upload(self, up):
        u, path = self._upload(up)
        if path.stat().st_size != u["size"]:
            raise ValueError("The upload isn't complete yet")
        self._uploads.pop(up, None)
        d = self.root / u["rid"]
        d.mkdir(parents=True, exist_ok=True)
        target = d / ("upload.tar" if u["kind"] == "tiles" else "region.osm.pbf")
        path.replace(target)
        threading.Thread(target=self._upload_job, args=(u["rid"], d, u["kind"]), daemon=True, name=f"roads-{u['rid']}").start()
        return u["rid"]

    def cancel_upload(self, up):
        try:
            u, path = self._upload(up)
        except KeyError:
            return
        self._uploads.pop(up, None)
        path.unlink(missing_ok=True)
        d = self.root / u["rid"]
        if (d / "tiles").exists():
            self._write_meta(u["rid"], state="ready", progress=None, error=None)
        else:
            shutil.rmtree(d, ignore_errors=True)
        self._job_lock.release()

    def _upload_job(self, rid, d, kind):
        try:
            if kind == "pbf":
                self._build(rid, d)
            else:
                self._write_meta(rid, state="installing", progress=None)
                self._unpack(d / "upload.tar", d / "tiles.new")
                self._install(rid, d, d / "tiles.new")
        except Exception as ex:  # noqa: BLE001
            msg = str(ex) if isinstance(ex, (ValueError, RuntimeError)) else f"{type(ex).__name__}: {ex}"
            self._write_meta(rid, state="ready" if (d / "tiles").exists() else "failed", error=msg[:300],
                             progress=None, finished_at=time.time())
        finally:
            self._cleanup(d)
            self._job_lock.release()

    @staticmethod
    def _unpack(tar_path: Path, out: Path):
        """Unpack a tiles archive safely: only plain files under 0/, 1/, 2/ (and 3/), wherever the
        archive puts that folder (valhalla_tiles/2/..., tiles/2/... or 2/... all work)."""
        shutil.rmtree(out, ignore_errors=True)
        out.mkdir(parents=True)
        n = 0
        try:
            with tarfile.open(tar_path) as tf:
                for m in tf:
                    if not m.isfile():
                        continue
                    parts = [p for p in Path(m.name).parts if p not in ("", ".", "/")]
                    if any(p == ".." for p in parts):
                        continue
                    lv = next((i for i, p in enumerate(parts) if p in ("0", "1", "2", "3")), None)
                    if lv is None or not parts[-1].endswith(".gph"):
                        continue
                    rel = Path(*parts[lv:])
                    dest = out / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    src = tf.extractfile(m)
                    with open(dest, "wb") as f:
                        shutil.copyfileobj(src, f, 1 << 20)
                    n += 1
        except tarfile.TarError as ex:
            raise ValueError("That isn't a .tar of Valhalla routing tiles.") from ex
        if not n:
            raise ValueError("No routing tiles (.gph files) found in that archive.")

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
            cut = self._settings.get("search_cutoff_m", SEARCH_CUTOFF_M)
            req = {"locations": [{"lat": a[0], "lon": a[1], "search_cutoff": cut},
                                 {"lat": b[0], "lon": b[1], "search_cutoff": cut}],
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
