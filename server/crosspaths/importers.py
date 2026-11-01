"""Readers for location files that aren't Google Timeline exports.

One entry point, `parse_files`, takes the uploaded files (one or many) and returns a single
Track. Each file is recognised by its content, not its name:

- GPX (Strava, Apple Health workout routes, GPS logger apps), TCX (Garmin, Fitbit, Google Fit),
  KML/KMZ (gx:Track, time-stamped placemarks), FIT (Garmin and other watches, Strava archives)
- GeoJSON (Points with a time property, LineStrings with coordTimes / a 4th time coordinate)
- CSV with latitude / longitude / time columns (GPSLogger, OwnTracks, spreadsheets)
- JSON: Google Timeline (all formats), Swarm / Foursquare check-ins, and any list of
  {lat, lon, time}-like objects (Samsung Health location_data, OwnTracks, Dawarich, ...)
- .zip archives and .gz files of any of the above (Strava, Apple Health, Garmin, Swarm and
  Samsung Health exports all arrive as zips)

Like parser.py, this is deliberately tolerant: services change their exports. Verify against a
fresh export when a source stops working.
"""
from __future__ import annotations

import csv
import gzip
import io
import json
import re
import struct
import time
import zipfile
from dataclasses import dataclass, field
from xml.etree import ElementTree as ET

import numpy as np

from .parser import Point, Track, _spread_times, _ts, parse_timeline

FIT_EPOCH = 631065600          # 1989-12-31T00:00:00Z
CHECKIN_STAY_S = 30 * 60       # a check-in counts as being there for 30 minutes...
THIN_S = 5.0                   # ...and 1-per-second GPS tracks are thinned to one fix per 5 s
MIN_T = 946684800.0            # 2000-01-01: older "times" are almost always a parsing mistake

ZIP_EXT = (".gpx", ".tcx", ".kml", ".fit", ".geojson", ".json", ".csv")
SKIP_NAMES = ("export.xml", "export_cda.xml")   # Apple Health's huge record dump: no locations


@dataclass
class Limits:
    max_entry_bytes: int = 160 * 1024 * 1024     # one file once unzipped
    max_total_bytes: int = 640 * 1024 * 1024     # everything unzipped, per upload
    max_files: int = 20000
    max_depth: int = 2                           # zip inside a zip (Garmin) is fine; deeper is not


@dataclass
class ImportReport:
    formats: dict = field(default_factory=dict)  # fmt -> number of files
    points: dict = field(default_factory=dict)   # fmt -> points read (before de-duplication)
    skipped: list = field(default_factory=list)  # names of files that held no usable points
    files: int = 0
    _bytes: int = 0

    def label(self) -> str:
        if not self.formats:
            return "unknown"
        fmt = "+".join(sorted(self.formats, key=lambda k: -self.formats[k]))
        n = sum(self.formats.values())
        return fmt if n == 1 else f"{fmt} ({n} files)"


# What people call each format, for the list of sources a timeline was built from.
FRIENDLY = {
    "records": "Google Maps", "semantic-history": "Google Maps", "on-device": "Google Maps",
    "segments-list": "Google Maps", "photo-library": "Photos", "swarm": "Swarm check-ins",
    "gpx": "GPX", "tcx": "TCX", "fit": "FIT", "kml": "KML", "geojson": "GeoJSON", "csv": "CSV",
    "points": "JSON points",
}


def sources_of(rep: "ImportReport", at: float) -> list[dict]:
    """One entry per kind of source in this import, e.g. GPX (12 files, 30,000 points)."""
    merged: dict = {}
    for fmt, n in rep.formats.items():
        name = FRIENDLY.get(fmt, fmt.upper())
        e = merged.setdefault(name, {"label": name, "files": 0, "points": 0, "added_at": at})
        e["files"] += n
        e["points"] += rep.points.get(fmt, 0)
    return sorted(merged.values(), key=lambda e: -e["points"])


# ---------- small helpers ----------

def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def _f(v):
    if v is None:
        return None
    try:
        x = float(str(v).strip().replace(",", ".")) if isinstance(v, str) else float(v)
    except (TypeError, ValueError):
        return None
    return x if np.isfinite(x) else None


def _ok(t, lat, lon) -> bool:
    return (t is not None and lat is not None and lon is not None and MIN_T <= t <= time.time() + 86400
            and abs(lat) <= 90 and abs(lon) <= 180 and not (lat == 0 and lon == 0))


def _thin(pts: list[Point]) -> list[Point]:
    """Fitness apps log a fix every second. The matcher re-samples every 60 s / 50 m anyway, so
    keep one fix per THIN_S seconds (plus the last) - a fifth of the memory, same results."""
    if len(pts) < 3:
        return pts
    pts.sort(key=lambda p: p.t)
    out, last = [pts[0]], pts[0].t
    for p in pts[1:-1]:
        if p.t - last >= THIN_S:
            out.append(p)
            last = p.t
    out.append(pts[-1])
    return out


_COL = {
    "lat": ("lat", "latitude", "latitudedegrees", "latdeg", "latitudee7"),
    "lon": ("lon", "lng", "long", "longitude", "longitudedegrees", "londeg", "longitudee7"),
    "time": ("time", "timestamp", "datetime", "dateandtime", "timeutc", "utc", "utctime", "recordedat",
             "createdat", "starttime", "tst", "unixtime", "epoch", "t", "when", "gpstime", "isotime",
             "timestampms", "date"),
    "date": ("date", "day", "utcdate"),
    "acc": ("accuracy", "acc", "hacc", "horizontalaccuracy", "accuracymeters"),
}


def _norm_key(k: str) -> str:
    k = str(k).strip().lower()
    k = k.rsplit(".", 1)[-1]                      # Samsung: com.samsung.health.exercise.latitude
    k = re.sub(r"\(.*?\)|\[.*?\]", "", k)         # "Latitude (deg)", "time [utc]"
    return re.sub(r"[^a-z0-9]", "", k)


def _pick(keys, kind):
    """Map a normalised key list to the best column for `kind`, by priority order."""
    for want in _COL[kind]:
        for i, k in enumerate(keys):
            if k == want:
                return i
    return None


# ---------- XML: GPX, TCX, KML ----------

def _xml_root(data: bytes) -> str:
    head = data[:65536]
    if b"<!ENTITY" in head or b"<!entity" in head:
        raise ValueError("XML entity declarations are not allowed")
    for _, el in ET.iterparse(io.BytesIO(data), events=("start",)):
        return _local(el.tag).lower()
    raise ValueError("Empty XML")


def _child_text(el, name):
    for c in el:
        if _local(c.tag) == name:
            return (c.text or "").strip()
    return None


def _parse_gpx(data: bytes) -> list[Point]:
    out = []
    for _, el in ET.iterparse(io.BytesIO(data), events=("end",)):
        tag = _local(el.tag)
        if tag in ("trkpt", "rtept", "wpt"):
            t = _ts(_child_text(el, "time"))
            lat, lon = _f(el.get("lat")), _f(el.get("lon"))
            if _ok(t, lat, lon):
                out.append(Point(t, lat, lon, None, "track"))
            el.clear()
    return out


def _parse_tcx(data: bytes) -> list[Point]:
    out = []
    for _, el in ET.iterparse(io.BytesIO(data), events=("end",)):
        if _local(el.tag) != "Trackpoint":
            continue
        t, lat, lon = None, None, None
        for c in el.iter():
            n = _local(c.tag)
            if n == "Time":
                t = _ts((c.text or "").strip())
            elif n == "LatitudeDegrees":
                lat = _f(c.text)
            elif n == "LongitudeDegrees":
                lon = _f(c.text)
        if _ok(t, lat, lon):
            out.append(Point(t, lat, lon, None, "track"))
        el.clear()
    return out


def _kml_coords(text):
    """'lon,lat[,alt] lon,lat ...' -> [(lat, lon), ...]"""
    out = []
    for tok in (text or "").split():
        parts = tok.split(",")
        if len(parts) >= 2:
            lon, lat = _f(parts[0]), _f(parts[1])
            if lat is not None and lon is not None:
                out.append((lat, lon))
    return out


def _parse_kml(data: bytes) -> list[Point]:
    out = []
    for _, el in ET.iterparse(io.BytesIO(data), events=("end",)):
        tag = _local(el.tag)
        if tag == "Track":                       # gx:Track: <when> and <gx:coord> pairs, in order
            whens = [_ts((c.text or "").strip()) for c in el if _local(c.tag) == "when"]
            coords = []
            for c in el:
                if _local(c.tag) == "coord":
                    p = (c.text or "").split()
                    coords.append((_f(p[1]), _f(p[0])) if len(p) >= 2 else (None, None))
            for t, (lat, lon) in zip(whens, coords):
                if _ok(t, lat, lon):
                    out.append(Point(t, lat, lon, None, "track"))
            el.clear()
        elif tag == "Placemark":
            when = begin = end = None
            pt, line = None, None
            for c in el.iter():
                n = _local(c.tag)
                if n == "TimeStamp":
                    when = _ts(_child_text(c, "when"))
                elif n == "TimeSpan":
                    begin, end = _ts(_child_text(c, "begin")), _ts(_child_text(c, "end"))
                elif n == "Point":
                    cs = _kml_coords(_child_text(c, "coordinates"))
                    pt = cs[0] if cs else None
                elif n == "LineString":
                    line = _kml_coords(_child_text(c, "coordinates"))
            if pt and when is not None and _ok(when, *pt):
                out.append(Point(when, pt[0], pt[1], None, "record"))
            elif pt and begin is not None and end is not None and end >= begin and _ok(begin, *pt):
                out += [Point(begin, *pt, None, "visit"), Point(end, *pt, None, "visit")]
            elif line and len(line) >= 2 and begin is not None and end is not None and end > begin and _ok(begin, *line[0]):
                out += _spread_times(line, begin, end)
            el.clear()
    return out


# ---------- FIT (binary, Garmin's format) ----------

def _parse_fit(data: bytes) -> list[Point]:
    """Minimal FIT reader: only 'record' messages (global #20) with timestamp + position.
    Handles chained files, both byte orders, developer fields and compressed timestamps."""
    out, pos, n = [], 0, len(data)
    while pos + 12 <= n:
        hsize = data[pos]
        if hsize < 12 or data[pos + 8:pos + 12] != b".FIT":
            break
        dsize = struct.unpack_from("<I", data, pos + 4)[0]
        i, end = pos + hsize, min(pos + hsize + dsize, n)
        defs, last_ts = {}, None
        while i < end:
            h = data[i]
            i += 1
            if h & 0x80:                                     # compressed-timestamp data message
                d = defs.get((h >> 5) & 0x3)
                if d is None or i + d[5] > end:
                    break
                ts = None
                if last_ts is not None:
                    off = h & 0x1F
                    ts = (last_ts & ~0x1F) + off + (0x20 if off < (last_ts & 0x1F) else 0)
                    last_ts = ts
                rec, i = data[i:i + d[5]], i + d[5]
            elif h & 0x40:                                   # definition message
                if i + 5 > end:
                    break
                endian = ">" if data[i + 1] == 1 else "<"
                gnum = struct.unpack_from(endian + "H", data, i + 2)[0]
                nf, i, off = data[i + 4], i + 5, 0
                ts_o = lat_o = lon_o = None
                for _ in range(nf):
                    if i + 3 > end:
                        break
                    fnum, sz = data[i], data[i + 1]
                    if sz == 4:
                        if fnum == 253:
                            ts_o = off
                        elif fnum == 0:
                            lat_o = off
                        elif fnum == 1:
                            lon_o = off
                    off += sz
                    i += 3
                if h & 0x20 and i < end:                     # developer fields: just skip their bytes
                    nd, i = data[i], i + 1
                    for _ in range(nd):
                        if i + 3 > end:
                            break
                        off += data[i + 1]
                        i += 3
                defs[h & 0x0F] = (gnum, endian, ts_o, lat_o, lon_o, off)
                continue
            else:                                            # normal data message
                d = defs.get(h & 0x0F)
                if d is None or i + d[5] > end:
                    break
                ts, rec, i = None, data[i:i + d[5]], i + d[5]
            gnum, endian, ts_o, lat_o, lon_o, _ = d
            if ts_o is not None:
                v = struct.unpack_from(endian + "I", rec, ts_o)[0]
                if v != 0xFFFFFFFF:
                    ts = last_ts = v
            if gnum == 20 and ts is not None and lat_o is not None and lon_o is not None:
                la = struct.unpack_from(endian + "i", rec, lat_o)[0]
                lo = struct.unpack_from(endian + "i", rec, lon_o)[0]
                if la != 0x7FFFFFFF and lo != 0x7FFFFFFF:
                    t, lat, lon = ts + FIT_EPOCH, la * (180 / 2 ** 31), lo * (180 / 2 ** 31)
                    if _ok(t, lat, lon):
                        out.append(Point(float(t), lat, lon, None, "track"))
        pos = end + 2                                        # skip the file CRC
    return out


# ---------- CSV ----------

def _parse_csv(text: str) -> list[Point]:
    lines = text.splitlines()
    sample = "\n".join(lines[:20])
    try:
        delim = csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        delim = ","
    rows = csv.reader(lines, delimiter=delim)
    cols = None
    for k, row in enumerate(rows):                           # header may follow a metadata line (Samsung)
        keys = [_norm_key(c) for c in row]
        lat_i, lon_i, t_i = _pick(keys, "lat"), _pick(keys, "lon"), _pick(keys, "time")
        if lat_i is not None and lon_i is not None and t_i is not None:
            d_i = _pick(keys, "date")
            split_date = keys[t_i] == "time" and d_i is not None and d_i != t_i
            e7 = keys[lat_i].endswith("e7")
            cols = (lat_i, lon_i, t_i, d_i if split_date else None, _pick(keys, "acc"), e7)
            break
        if k >= 5:
            break
    if cols is None:
        return []
    lat_i, lon_i, t_i, d_i, acc_i, e7 = cols
    out, need = [], max(i for i in (lat_i, lon_i, t_i, d_i, acc_i) if i is not None)
    for row in rows:
        if len(row) <= need:
            continue
        lat, lon = _f(row[lat_i]), _f(row[lon_i])
        if e7 and lat is not None and lon is not None:
            lat, lon = lat / 1e7, lon / 1e7
        raw = f"{row[d_i].strip()} {row[t_i].strip()}" if d_i is not None else row[t_i]
        t = _ts(raw)
        if _ok(t, lat, lon):
            acc = _f(row[acc_i]) if acc_i is not None else None
            out.append(Point(t, lat, lon, acc, "track"))
    return out


# ---------- JSON: GeoJSON, check-ins, generic point lists ----------

_TIME_PROPS = ("time", "timestamp", "datetime", "date", "when", "created_at", "createdAt", "recorded_at",
               "tst", "start_time", "startTime")


def _prop_time(props):
    for k in _TIME_PROPS:
        if props.get(k) is not None:
            return _ts(props[k])
    return None


def _geojson_line(coords, times, props):
    out = []
    if times and len(times) == len(coords):
        for c, tv in zip(coords, times):
            t = _ts(tv)
            if len(c) >= 2 and _ok(t, _f(c[1]), _f(c[0])):
                out.append(Point(t, float(c[1]), float(c[0]), None, "track"))
        return out
    if coords and all(len(c) >= 4 for c in coords):          # [lon, lat, ele, time]
        for c in coords:
            t = _ts(c[3])
            if _ok(t, _f(c[1]), _f(c[0])):
                out.append(Point(t, float(c[1]), float(c[0]), None, "track"))
        return out
    t0 = _ts(props.get("start_time") or props.get("startTime") or props.get("begin"))
    t1 = _ts(props.get("end_time") or props.get("endTime") or props.get("end"))
    chain = [(float(c[1]), float(c[0])) for c in coords if len(c) >= 2]
    if len(chain) >= 2 and t0 is not None and t1 is not None and t1 > t0 and _ok(t0, *chain[0]):
        out += _spread_times(chain, t0, t1)
    return out


def _parse_geojson(obj) -> list[Point]:
    feats = obj.get("features") if obj.get("type") == "FeatureCollection" else [obj]
    out = []
    for f in feats or []:
        if not isinstance(f, dict):
            continue
        geom = f.get("geometry") if f.get("type") == "Feature" else f
        props = f.get("properties") or {}
        if not isinstance(geom, dict):
            continue
        gt, coords = geom.get("type"), geom.get("coordinates")
        times = props.get("coordTimes") or props.get("times") or (props.get("coordinateProperties") or {}).get("times")
        if gt == "Point" and isinstance(coords, list) and len(coords) >= 2:
            lat, lon = _f(coords[1]), _f(coords[0])
            t0 = _ts(props.get("start_time") or props.get("startTime") or props.get("begin"))
            t1 = _ts(props.get("end_time") or props.get("endTime") or props.get("end"))
            t = _prop_time(props)
            if t is None and len(coords) >= 4:
                t = _ts(coords[3])
            if t0 is not None and t1 is not None and t1 >= t0 and _ok(t0, lat, lon):
                out += [Point(t0, lat, lon, None, "visit"), Point(t1, lat, lon, None, "visit")]
            elif _ok(t, lat, lon):
                out.append(Point(t, lat, lon, _f(props.get("accuracy")), "record"))
        elif gt == "LineString" and isinstance(coords, list):
            out += _geojson_line(coords, times, props)
        elif gt == "MultiLineString" and isinstance(coords, list):
            for k, line in enumerate(coords):
                tk = times[k] if isinstance(times, list) and k < len(times) and isinstance(times[k], list) else None
                out += _geojson_line(line, tk, props)
    return out


def _is_checkin(it) -> bool:
    return isinstance(it, dict) and "createdAt" in it and ("venue" in it or it.get("type") in ("checkin", "venueless"))


def _parse_checkins(items) -> list[Point]:
    """Swarm / Foursquare: one point per check-in. A check-in means "I'm here now", so it becomes
    a short stay; it ends early if the next check-in comes sooner."""
    raw = []
    for it in items:
        if not _is_checkin(it):
            continue
        loc = (it.get("venue") or {}).get("location") or {}
        lat, lon = _f(it.get("lat", loc.get("lat"))), _f(it.get("lng", loc.get("lng")))
        t = _ts(it.get("createdAt"))
        if _ok(t, lat, lon):
            raw.append((t, lat, lon))
    raw.sort()
    out = []
    for k, (t, lat, lon) in enumerate(raw):
        stay = CHECKIN_STAY_S
        if k + 1 < len(raw):
            stay = max(0.0, min(stay, raw[k + 1][0] - t - 60))
        out += [Point(t, lat, lon, None, "visit"), Point(t + stay, lat, lon, None, "visit")]
    return out


def _generic_points(items) -> list[Point]:
    """A list of objects that each carry a position and a time, under any common key names."""
    dicts = [it for it in items[:200] if isinstance(it, dict)]
    if not dicts:
        return []
    keys = sorted({k for d in dicts for k in d})
    norm = [_norm_key(k) for k in keys]
    li, oi, ti = _pick(norm, "lat"), _pick(norm, "lon"), _pick(norm, "time")
    if li is None or oi is None or ti is None:
        return []
    lk, ok_, tk = keys[li], keys[oi], keys[ti]
    ai = _pick(norm, "acc")
    ak = keys[ai] if ai is not None else None
    e7 = norm[li].endswith("e7")
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        lat, lon, t = _f(it.get(lk)), _f(it.get(ok_)), _ts(it.get(tk))
        if e7 and lat is not None and lon is not None:
            lat, lon = lat / 1e7, lon / 1e7
        if _ok(t, lat, lon):
            out.append(Point(t, lat, lon, _f(it.get(ak)) if ak else None, "track"))
    return out


def _parse_json(obj) -> tuple[list[Point], str]:
    if isinstance(obj, dict) and obj.get("type") in ("FeatureCollection", "Feature", "LineString", "MultiLineString", "Point"):
        return _parse_geojson(obj), "geojson"
    # Swarm wraps check-ins as {"items": [...]} or the raw API's {"response": {"checkins": {"items": [...]}}}
    node = obj
    for k in ("response", "checkins"):
        if isinstance(node, dict) and isinstance(node.get(k), dict):
            node = node[k]
    items = node.get("items") if isinstance(node, dict) else node
    if isinstance(items, list) and any(_is_checkin(it) for it in items[:50]):
        return _parse_checkins(items), "swarm"
    try:                                                     # Google Timeline, or our own photo format
        tr = parse_timeline(obj)
        if len(tr):
            return tr.points, tr.fmt
    except (ValueError, KeyError, TypeError, AttributeError):
        pass
    if isinstance(obj, list):
        return _generic_points(obj), "points"
    if isinstance(obj, dict):                                # {"data": [...]}, {"locations": [...]}, ...
        for v in obj.values():
            if isinstance(v, list) and v and isinstance(v[0], dict):
                pts = _generic_points(v)
                if pts:
                    return pts, "points"
    return [], "json"


# ---------- dispatch ----------

def _parse_one(name: str, data: bytes, rep: ImportReport, lim: Limits, depth: int) -> list[Point]:
    head = data[:16]
    if head.startswith(b"PK\x03\x04"):
        return _parse_zip(name, data, rep, lim, depth)
    if head.startswith(b"\x1f\x8b"):
        return _parse_one(name[:-3] if name.lower().endswith(".gz") else name, _gunzip(data, lim), rep, lim, depth)
    if len(data) >= 12 and data[8:12] == b".FIT":
        pts, fmt = _parse_fit(data), "fit"
    else:
        text_head = data[:4096].lstrip(b"\xef\xbb\xbf \t\r\n")
        if text_head[:1] in (b"{", b"["):
            pts, fmt = _parse_json(json.loads(data.decode("utf-8-sig")))
        elif text_head[:1] == b"<":
            root = _xml_root(data)
            if root == "gpx":
                pts, fmt = _parse_gpx(data), "gpx"
            elif root == "trainingcenterdatabase":
                pts, fmt = _parse_tcx(data), "tcx"
            elif root == "kml":
                pts, fmt = _parse_kml(data), "kml"
            else:
                raise ValueError(f"Unsupported XML file ({root})")
        else:
            pts, fmt = _parse_csv(data.decode("utf-8-sig", errors="replace")), "csv"
    if fmt in ("gpx", "tcx", "fit", "csv", "points", "kml", "geojson"):
        pts = _thin_tracks(pts)
    if pts:
        rep.formats[fmt] = rep.formats.get(fmt, 0) + 1
        rep.points[fmt] = rep.points.get(fmt, 0) + len(pts)
    return pts


def _thin_tracks(pts):
    track = [p for p in pts if p.src == "track"]
    return _thin(track) + [p for p in pts if p.src != "track"] if len(track) > 2 else pts


def _gunzip(data: bytes, lim: Limits) -> bytes:
    with gzip.GzipFile(fileobj=io.BytesIO(data)) as g:
        out = g.read(lim.max_entry_bytes + 1)
    if len(out) > lim.max_entry_bytes:
        raise ValueError("File is too large once uncompressed")
    return out


def _parse_zip(name: str, data: bytes, rep: ImportReport, lim: Limits, depth: int) -> list[Point]:
    if depth >= lim.max_depth:
        return []
    out = []
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        infos = [i for i in z.infolist() if not i.is_dir()]
        names = {i.filename.lower() for i in infos}
        for info in infos:
            low = info.filename.lower()
            base = low.rsplit("/", 1)[-1]
            stem = low[:-3] if low.endswith(".gz") else low
            if base.startswith(".") or "__macosx/" in low or base in SKIP_NAMES:
                continue
            nested = low.endswith(".zip") or low.endswith(".kmz")
            if not nested and not stem.endswith(ZIP_EXT):
                continue
            # Swarm ships every file as both .json and .csv: read the JSON only.
            if stem.endswith(".csv") and (stem[:-4] + ".json") in names:
                continue
            if info.file_size > lim.max_entry_bytes or rep._bytes + info.file_size > lim.max_total_bytes:
                rep.skipped.append(info.filename)
                continue
            rep.files += 1
            if rep.files > lim.max_files:
                raise ValueError("Too many files in this archive")
            try:
                with z.open(info) as f:
                    blob = f.read(lim.max_entry_bytes + 1)
            except (RuntimeError, zipfile.BadZipFile, NotImplementedError, OSError):   # encrypted or broken entry
                rep.skipped.append(info.filename)
                continue
            rep._bytes += len(blob)
            if len(blob) > lim.max_entry_bytes or rep._bytes > lim.max_total_bytes:
                rep.skipped.append(info.filename)
                continue
            try:
                pts = _parse_one(info.filename, blob, rep, lim, depth + 1)
            except (ValueError, KeyError, TypeError, AttributeError, IndexError, struct.error,
                    ET.ParseError, UnicodeDecodeError, zipfile.BadZipFile, OSError, EOFError):
                pts = []
            if pts:
                out += pts
            elif not nested and not stem.endswith((".json", ".csv")):
                # JSON/CSV side files (settings, ratings, ...) are expected to be empty of points.
                rep.skipped.append(info.filename)
            del blob
    return out


def parse_files(files, limits: Limits | None = None) -> tuple[Track, ImportReport]:
    """files: iterable of (filename, bytes). Returns one combined, time-sorted, de-duplicated Track.
    Raises ValueError when nothing usable was found."""
    lim, rep, pts = limits or Limits(), ImportReport(), []
    for name, data in files:
        rep.files += 1
        try:
            got = _parse_one(name or "upload", data, rep, lim, 0)
        except (ValueError, KeyError, TypeError, AttributeError, IndexError, struct.error,
                ET.ParseError, UnicodeDecodeError, zipfile.BadZipFile, OSError, EOFError):
            got = []
        if not got:
            rep.skipped.append(name or "upload")
        pts += got
    if not pts:
        raise ValueError("No time-stamped locations found")
    pts.sort(key=lambda p: p.t)
    dedup, last = [], None
    for p in pts:
        key = (round(p.t, 3), round(p.lat, 7), round(p.lon, 7))
        if key != last:
            dedup.append(p)
        last = key
    return Track(dedup, rep.label()), rep


def merge_points(points) -> list[Point]:
    """Time-sort and drop exact duplicates (same time and place), e.g. after combining sources."""
    pts = sorted(points, key=lambda p: p.t)
    out, last = [], None
    for p in pts:
        key = (round(p.t, 3), round(p.lat, 7), round(p.lon, 7))
        if key != last:
            out.append(p)
        last = key
    return out
