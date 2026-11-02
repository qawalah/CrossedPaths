"""Parsers for Google Timeline exports.

Three shapes are handled (the parser is deliberately tolerant, because Google has
changed the format more than once - verify against a fresh export before shipping):

1. Legacy Takeout "Records.json"            {"locations": [{latitudeE7, longitudeE7, timestamp, accuracy}]}
2. Legacy "Semantic Location History"       {"timelineObjects": [{placeVisit|activitySegment}]}
3. New on-device export (2024+)             {"semanticSegments": [...], "rawSignals": [...]}
   (also accepted when the top level is a bare list of segments)
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np

from .geo import haversine_m

_NUM = re.compile(r"-?\d+(?:\.\d+)?")
_EPOCH = re.compile(r"\d+(?:\.\d+)?")


@dataclass
class Point:
    t: float                 # unix seconds (UTC)
    lat: float
    lon: float
    acc: float | None = None  # metres, when the export carries it
    src: str = "record"      # record | path | visit | activity  (raw GPS-like vs. synthetic endpoints)
    mode: str | None = None  # road | foot | bike | skip (train, plane, boat...), when the export says


@dataclass
class Track:
    points: list[Point]
    fmt: str

    def __len__(self) -> int:
        return len(self.points)


# ---------- primitive helpers ----------

def _ts(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        x = float(v)
        return x / 1000 if x > 1e11 else x
    s = str(v).strip()
    if _EPOCH.fullmatch(s):
        x = float(s)
        return x / 1000 if x > 1e11 else x
    s = re.sub(r"\s*(UTC|GMT)$", "Z", s, flags=re.I)        # "2024-05-01 12:00:00 UTC"
    s = re.sub(r"^(\d{4})/(\d{2})/(\d{2})", r"\1-\2-\3", s)  # "2024/05/01 12:00:00"
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.timestamp()


def _latlng(v):
    """'48.8584°, 2.2945°' | 'geo:48.85,2.29' -> (lat, lon)."""
    if not isinstance(v, str):
        return None
    nums = _NUM.findall(v)
    if len(nums) < 2:
        return None
    lat, lon = float(nums[0]), float(nums[1])
    return (lat, lon) if abs(lat) <= 90 and abs(lon) <= 180 else None


def _e7(d, la="latitudeE7", lo="longitudeE7"):
    if not isinstance(d, dict) or la not in d or lo not in d:
        return None
    return d[la] / 1e7, d[lo] / 1e7


# Google's activity types -> how the trip may be drawn along streets (see snap.py).
_MODES = {
    "road": {"IN_PASSENGER_VEHICLE", "IN_VEHICLE", "IN_ROAD_VEHICLE", "DRIVING", "IN_CAR", "IN_BUS", "IN_TAXI", "MOTORCYCLING"},
    "foot": {"WALKING", "RUNNING", "HIKING", "ON_FOOT"},
    "bike": {"CYCLING", "ON_BICYCLE", "BIKING"},
    "skip": {"FLYING", "IN_TRAIN", "IN_SUBWAY", "IN_TRAM", "IN_RAIL_VEHICLE", "IN_FERRY", "IN_BOAT", "SAILING",
             "BOATING", "KAYAKING", "ROWING", "SURFING", "SKIING", "IN_GONDOLA_LIFT", "IN_CABLECAR", "IN_FUNICULAR"},
}


def travel_mode(activity_type) -> str | None:
    """'IN_PASSENGER_VEHICLE' / 'in passenger vehicle' -> 'road'; unknown -> None."""
    if not isinstance(activity_type, str):
        return None
    k = activity_type.strip().upper().replace(" ", "_")
    return next((m for m, names in _MODES.items() if k in names), None)


def _tag_modes(points, spans):
    """Give path points the mode of the activity they fall in ((t0, t1, mode) spans)."""
    spans = sorted(s for s in spans if s[2])
    if not spans:
        return
    for p in points:
        if p.mode is None and p.src in ("path", "activity"):
            for t0, t1, m in spans:
                if t0 <= p.t <= t1:
                    p.mode = m
                    break
                if t0 > p.t:
                    break


# ---------- format 1: Records.json ----------

def _parse_records(data) -> list[Point]:
    out = []
    for loc in data.get("locations", []):
        t = _ts(loc.get("timestamp") or loc.get("timestampMs"))
        ll = _e7(loc)
        if t is not None and ll:
            out.append(Point(t, ll[0], ll[1], loc.get("accuracy"), "record"))
    return out


# ---------- format 2: Semantic Location History ----------

def _spread_times(chain, t0, t1):
    """Waypoints have no timestamps: distribute them over [t0, t1] by cumulative distance."""
    la = np.array([c[0] for c in chain])
    lo = np.array([c[1] for c in chain])
    seg = haversine_m(la[:-1], lo[:-1], la[1:], lo[1:])
    cum = np.concatenate([[0], np.cumsum(seg)])
    frac = cum / cum[-1] if cum[-1] > 0 else np.linspace(0, 1, len(chain))
    return [Point(t0 + (t1 - t0) * f, c[0], c[1], None, "path") for f, c in zip(frac, chain)]


def _parse_semantic_history(objs) -> list[Point]:
    out = []
    for o in objs:
        if "placeVisit" in o:
            v = o["placeVisit"]
            d = v.get("duration", {})
            t0 = _ts(d.get("startTimestamp") or d.get("startTimestampMs"))
            t1 = _ts(d.get("endTimestamp") or d.get("endTimestampMs"))
            ll = _e7(v.get("location"))
            if ll and t0 is not None and t1 is not None:
                out += [Point(t0, *ll, None, "visit"), Point(t1, *ll, None, "visit")]
        elif "activitySegment" in o:
            a = o["activitySegment"]
            d = a.get("duration", {})
            t0 = _ts(d.get("startTimestamp") or d.get("startTimestampMs"))
            t1 = _ts(d.get("endTimestamp") or d.get("endTimestampMs"))
            mode = travel_mode(a.get("activityType"))
            raw = (a.get("simplifiedRawPath") or {}).get("points")
            if raw:
                for p in raw:
                    t = _ts(p.get("timestamp") or p.get("timestampMs"))
                    ll = _e7(p, "latE7", "lngE7")
                    if t is not None and ll:
                        out.append(Point(t, *ll, p.get("accuracyMeters"), "path", mode))
                continue
            chain = [_e7(a.get("startLocation"))]
            chain += [_e7(w, "latE7", "lngE7") for w in (a.get("waypointPath") or {}).get("waypoints", [])]
            chain.append(_e7(a.get("endLocation")))
            chain = [c for c in chain if c]
            if len(chain) >= 2 and t0 is not None and t1 is not None:
                pts = _spread_times(chain, t0, t1)
                for q in pts:
                    q.mode = mode
                out += pts
    return out


# ---------- format 3: on-device export ----------

def _parse_segments(segs) -> list[Point]:
    out, spans = [], []
    for s in segs:
        t0, t1 = _ts(s.get("startTime")), _ts(s.get("endTime"))
        for p in s.get("timelinePath") or []:
            ll = _latlng(p.get("point"))
            t = _ts(p.get("time"))
            if t is None and t0 is not None and p.get("durationMinutesOffsetFromStartTime") is not None:
                t = t0 + 60 * float(p["durationMinutesOffsetFromStartTime"])
            if ll and t is not None:
                out.append(Point(t, *ll, None, "path"))
        v = s.get("visit")
        if v and t0 is not None and t1 is not None:
            loc = (v.get("topCandidate") or {}).get("placeLocation")
            ll = _latlng(loc.get("latLng") if isinstance(loc, dict) else loc)
            if ll:
                out += [Point(t0, *ll, None, "visit"), Point(t1, *ll, None, "visit")]
        a = s.get("activity")
        if a and t0 is not None and t1 is not None:
            spans.append((t0, t1, travel_mode((a.get("topCandidate") or {}).get("type"))))
            st = _latlng((a.get("start") or {}).get("latLng"))
            en = _latlng((a.get("end") or {}).get("latLng"))
            if st:
                out.append(Point(t0, *st, None, "activity"))
            if en:
                out.append(Point(t1, *en, None, "activity"))
    # The path points of a trip usually sit in their own segment, so match them up by time.
    _tag_modes(out, spans)
    return out


def _parse_raw_signals(sigs) -> list[Point]:
    out = []
    for s in sigs:
        pos = s.get("position")
        if not isinstance(pos, dict):
            continue
        ll = _latlng(pos.get("LatLng") or pos.get("latLng"))
        t = _ts(pos.get("timestamp"))
        if ll and t is not None:
            out.append(Point(t, *ll, pos.get("accuracyMeters"), "record"))
    return out


def _parse_photo_points(items) -> list[Point]:
    """CrossPaths' own format: GPS EXIF pulled from the phone's photo library.
    [{"t": unix_seconds, "lat": .., "lon": .., "acc": metres|null}, ...]"""
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        try:
            t, lat, lon = float(it["t"]), float(it["lat"]), float(it["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        if abs(lat) > 90 or abs(lon) > 180:
            continue
        acc = it.get("acc")
        try:
            acc = float(acc) if acc is not None else None
        except (TypeError, ValueError):
            acc = None
        out.append(Point(t, lat, lon, acc, "record"))
    return out


# ---------- entry points ----------

def parse_timeline(data) -> Track:
    if isinstance(data, list):
        pts, fmt = _parse_segments(data), "segments-list"
    elif "locations" in data:
        pts, fmt = _parse_records(data), "records"
    elif "timelineObjects" in data:
        pts, fmt = _parse_semantic_history(data["timelineObjects"]), "semantic-history"
    elif "semanticSegments" in data or "rawSignals" in data:
        pts = _parse_segments(data.get("semanticSegments", [])) + _parse_raw_signals(data.get("rawSignals", []))
        fmt = "on-device"
    elif "photoPoints" in data:
        pts, fmt = _parse_photo_points(data["photoPoints"]), "photo-library"
    else:
        raise ValueError("Unrecognised Timeline export format")
    pts.sort(key=lambda p: p.t)
    dedup, last = [], None
    for p in pts:
        key = (round(p.t, 3), round(p.lat, 7), round(p.lon, 7))
        if key != last:
            dedup.append(p)
        last = key
    return Track(dedup, fmt)


def load_track(path: str) -> Track:
    with open(path, "r", encoding="utf-8") as f:
        return parse_timeline(json.load(f))
