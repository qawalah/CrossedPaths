"""Offline place names for crossings ("Al Murūj, Riyadh" / "المروج، الرياض").

Uses GeoNames (https://www.geonames.org, CC-BY 4.0) files stored on the server:
  * cities500   - every town/city in the world, downloaded once (~14 MB zipped)
  * <CC>.zip    - one country's detailed file (neighbourhoods, malls, airports, parks...),
                  downloaded the first time a crossing falls in that country
After that everything runs locally. Only those static files are fetched - no coordinates or
anything about users ever leave the server.

Failure-tolerant by design: if a download fails (no internet), crossings simply have no name
and the lookup is retried later.
"""
from __future__ import annotations

import io
import os
import sys
import threading
import time
import urllib.request
import zipfile

import numpy as np
from scipy.spatial import cKDTree

from crosspaths.geo import haversine_m, to_xyz

BASE_URL = os.environ.get("GEONAMES_URL", "https://download.geonames.org/export/dump")
RETRY_AFTER_S = 3600

# Feature codes worth naming a crossing after ("near Riyadh Park Mall").
# (Hotels and schools are left out: thousands of them, often with odd transliterated names.)
LANDMARK_CODES = {
    "AIRP", "AIRF", "MALL", "UNIV", "HSP", "STDM", "MSQE", "CH", "TMPL", "MUS", "RSTN", "MTRO",
    "BUSTN", "PRT", "CSTL", "PAL", "ZOO", "SQR", "MKT", "LIBR", "PRK", "AMUS", "GDN", "BCH",
    "PIER", "TOWR", "MNMT", "HSTS",
}
LANDMARK_M = 250       # a landmark this close is "where" the crossing was
NEIGHBOURHOOD_M = 2500  # nearest neighbourhood (PPLX) within this
CITY_M = 40000          # nearest town/city within this
REMOTE_M = 250000       # out in the desert / on a highway: "35 km NE of Al Kharj", up to this far
_DIRS_EN = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
_DIRS_AR = ["شمال", "شمال شرق", "شرق", "جنوب شرق", "جنوب", "جنوب غرب", "غرب", "شمال غرب"]


def _bearing8(lat1, lon1, lat2, lon2):
    """Compass direction (0-7: N, NE, ... NW) of point 2 as seen from point 1."""
    import math
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    b = math.degrees(math.atan2(math.sin(dl) * math.cos(p2), math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)))
    return int(((b + 360) % 360 + 22.5) // 45) % 8


def _has_arabic(s: str) -> bool:
    return any("؀" <= ch <= "ۿ" for ch in s)


def _arabic_alt(alternates: str) -> str:
    for a in alternates.split(","):
        a = a.strip()
        if a and _has_arabic(a):
            return a
    return ""


class _Index:
    """Points + names + a KD-tree over unit-sphere xyz for nearest-neighbour lookups.
    Compact numpy columns, since a world list of towns is ~200k rows on a small NAS."""

    def __init__(self, lat, lon, name, name_ar, code, pop, cc):
        self.lat = np.asarray(lat, dtype=np.float64)
        self.lon = np.asarray(lon, dtype=np.float64)
        self.name, self.name_ar = name, name_ar
        self.code = np.asarray(code, dtype="<U5")
        self.pop = np.asarray(pop, dtype=np.int64)
        self.cc = np.asarray(cc, dtype="<U2")
        self.tree = cKDTree(to_xyz(self.lat, self.lon)) if len(name) else None

    def candidates(self, lat, lon, max_m, k=8, mask=None):
        """[(metres, index)] of up to k nearest within max_m, optionally only where mask[i]."""
        if self.tree is None:
            return []
        _, idx = self.tree.query(to_xyz(np.array([lat]), np.array([lon])), k=min(k, len(self.name)))
        idx = np.atleast_1d(idx[0])
        idx = idx[idx < len(self.name)]
        if mask is not None:
            idx = idx[mask[idx]]
        if not len(idx):
            return []
        m = haversine_m(lat, lon, self.lat[idx], self.lon[idx])
        return sorted((float(d), int(i)) for d, i in zip(m, idx) if d <= max_m)

    def nearest(self, lat, lon, max_m, k=8, mask=None):
        c = self.candidates(lat, lon, max_m, k, mask)
        return c[0][1] if c else None


class Places:
    def __init__(self, data_dir: str):
        self.dir = os.path.join(data_dir, "places")
        os.makedirs(self.dir, exist_ok=True)
        self._lock = threading.Lock()
        self._cities = None
        self._countries: dict[str, _Index] = {}
        self._failed: dict[str, float] = {}   # file -> when it last failed (retry later)

    # ---------- downloads ----------
    def _fetch(self, name: str, keep=None) -> str | None:
        """Path to <name>.txt, downloading <name>.zip once (and keeping only the rows `keep`
        accepts, to save disk). None if unavailable right now."""
        txt = os.path.join(self.dir, name + ".txt")
        if os.path.exists(txt):
            return txt
        if time.time() - self._failed.get(name, 0) < RETRY_AFTER_S:
            return None
        try:
            req = urllib.request.Request(f"{BASE_URL}/{name}.zip", headers={"User-Agent": "CrossPaths self-hosted server"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            tmp = txt + ".part"
            with zipfile.ZipFile(io.BytesIO(data)) as z, z.open(name + ".txt") as src, \
                    open(tmp, "w", encoding="utf-8") as f:
                for line in io.TextIOWrapper(src, encoding="utf-8"):   # streamed: low peak RAM
                    p = line.split("\t", 8)
                    if keep is None or (len(p) > 7 and keep(p[6], p[7])):
                        f.write(line)
            del data
            os.replace(tmp, txt)
            return txt
        except Exception:  # noqa: BLE001 - offline / blocked / bad file: just try again later
            self._failed[name] = time.time()
            return None

    @staticmethod
    def _read(path, keep):
        cols = ([], [], [], [], [], [], [])
        with open(path, encoding="utf-8") as f:
            for line in f:
                p = line.rstrip("\n").split("\t")
                if len(p) < 15 or not keep(p[6], p[7]):
                    continue
                try:
                    lat, lon, pop = float(p[4]), float(p[5]), int(p[14] or 0)
                except ValueError:
                    continue
                ar = _arabic_alt(p[3])
                for c, v in zip(cols, (lat, lon, p[1], sys.intern(ar) if not ar else ar, p[7], pop, p[8])):
                    c.append(v)
        return _Index(*cols)

    def _cities_index(self):
        if self._cities is None:
            path = self._fetch("cities500")
            if not path:
                return None
            self._cities = self._read(path, lambda c, f: c == "P")
        return self._cities

    def _country_index(self, cc: str):
        if cc not in self._countries:
            keep = lambda c, f: (c == "P" and f == "PPLX") or f in LANDMARK_CODES  # noqa: E731
            path = self._fetch(cc, keep)
            if not path:
                return None
            self._countries[cc] = self._read(path, keep)
            if len(self._countries) > 4:   # small LRU: NAS RAM is precious
                self._countries.pop(next(iter(self._countries)))
        return self._countries[cc]

    def release(self):
        """Drop the in-memory indexes (~100 MB); they're rebuilt from disk in ~2 s when next
        needed. Called after naming a batch, so the NAS doesn't carry them between checks."""
        with self._lock:
            self._cities = None
            self._countries.clear()

    def name_many(self, coords):
        """Names for a list of (lat, lon), then free the memory."""
        try:
            return [self.name(la, lo) for la, lo in coords]
        finally:
            self.release()

    # ---------- lookup ----------
    def name(self, lat: float, lon: float) -> dict | None:
        """{"place", "place_ar", "landmark", "landmark_ar"} or None if names are unavailable."""
        with self._lock:
            cities = self._cities_index()
            if cities is None:
                return None
            # The city: big cities sprawl, so weigh distance against size - north Riyadh is
            # "Riyadh", not the small town that happens to be 5 km closer.
            cands = cities.candidates(lat, lon, CITY_M, k=64, mask=cities.pop >= 1000)
            ci = min(cands, key=lambda c: (c[0] + 300) / np.sqrt(cities.pop[c[1]]))[1] if cands else cities.nearest(lat, lon, CITY_M)
            any_i = cities.nearest(lat, lon, 400000, k=1)
            cc = str(cities.cc[any_i]) if any_i is not None else None
            hood = mark = None
            if cc:
                detail = self._country_index(cc)
                if detail is not None:
                    hi = detail.nearest(lat, lon, NEIGHBOURHOOD_M, k=16, mask=detail.code == "PPLX")
                    li = detail.nearest(lat, lon, LANDMARK_M, k=16, mask=detail.code != "PPLX")
                    hood = (detail.name[hi], detail.name_ar[hi]) if hi is not None else None
                    mark = (detail.name[li], detail.name_ar[li]) if li is not None else None
            # A small populated place from the world list can stand in for a neighbourhood.
            if hood is None:
                ni = cities.nearest(lat, lon, NEIGHBOURHOOD_M, k=8, mask=cities.pop < 15000)
                if ni is not None and ni != ci:
                    hood = (cities.name[ni], cities.name_ar[ni])
            city = (cities.name[ci], cities.name_ar[ci]) if ci is not None else None

            parts = [x for x in (hood, city) if x]
            if hood and city and hood[0] == city[0]:
                parts = [city]
            place = ", ".join(p[0] for p in parts)
            place_ar = "، ".join(p[1] or p[0] for p in parts) if any(p[1] for p in parts) else ""
            if not parts:   # nowhere near a town: say how far from the nearest real one, and which way
                far = cities.candidates(lat, lon, REMOTE_M, k=64, mask=cities.pop >= 5000) or cities.candidates(lat, lon, REMOTE_M, k=8)
                if far:
                    m, ti = far[0]
                    km = max(1, int(round(m / 1000)))
                    d = _bearing8(cities.lat[ti], cities.lon[ti], lat, lon)
                    place = f"{km} km {_DIRS_EN[d]} of {cities.name[ti]}"
                    place_ar = f"{km} كم {_DIRS_AR[d]} {cities.name_ar[ti]}" if cities.name_ar[ti] else ""
            return {"place": place, "place_ar": place_ar,
                    "landmark": mark[0] if mark else "", "landmark_ar": (mark[1] if mark else "")}


_instances: dict[str, Places] = {}
_inst_lock = threading.Lock()


def places_for(data_dir: str) -> Places:
    with _inst_lock:
        if data_dir not in _instances:
            _instances[data_dir] = Places(data_dir)
        return _instances[data_dir]
