"""Privacy layer: anchor-zone (home/work) exclusion and output blurring."""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np

from .geo import haversine_m
from .matcher import Crossing, Params, resample


@dataclass
class Zone:
    lat: float
    lon: float
    radius_m: float = 400.0
    label: str = "auto"


def detect_anchor_zones(points, p: Params = Params(), n: int = 2, min_share: float = 0.08,
                        cell_deg: float = 0.003, radius_m: float = 400.0, cluster_m: float = 250.0) -> list[Zone]:
    """Guess the places where someone spends most of their stationary time (home, work).

    Seeds on the densest grid cell, then claims every stationary sample within cluster_m of
    that cell's centroid - so a home that straddles a cell boundary (GPS noise) is still ONE zone.
    Users confirm/edit the detected zones before a check runs.
    """
    S = resample(points, p)
    slow = S.speed < 1.0
    total = int(slow.sum())
    if total == 0:
        return []
    lat, lon = S.lat[slow], S.lon[slow]
    cells = np.floor(lat / cell_deg).astype(np.int64) * 1_000_003 + np.floor(lon / cell_deg).astype(np.int64)
    free = np.ones(total, bool)
    zones = []
    for _ in range(n):
        if not free.any():
            break
        uniq, counts = np.unique(cells[free], return_counts=True)
        seed = cells == uniq[np.argmax(counts)]
        seed &= free
        clat, clon = lat[seed].mean(), lon[seed].mean()
        near = free & (haversine_m(lat, lon, clat, clon) <= cluster_m)
        if near.sum() / total < min_share:
            break
        zones.append(Zone(float(lat[near].mean()), float(lon[near].mean()), radius_m))
        free &= ~near
    return zones


def in_any_zone(lat: float, lon: float, zones) -> bool:
    return any(float(haversine_m(lat, lon, z.lat, z.lon)) <= z.radius_m for z in zones)


def blur_latlon(lat: float, lon: float, grid_m: float = 100.0):
    """Snap to the centre of a ~grid_m cell so exact positions are never revealed."""
    dlat = grid_m / 111_320.0
    dlon = grid_m / (111_320.0 * max(math.cos(math.radians(lat)), 0.01))
    return (round((math.floor(lat / dlat) + 0.5) * dlat, 6),
            round((math.floor(lon / dlon) + 0.5) * dlon, 6))


def _iso(t: float) -> str:
    return datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sanitize(events: list[Crossing], grid_m: float = 100.0, time_round_s: int = 900) -> list[dict]:
    """What the other party is allowed to see: blurred place, rounded times, no raw distances.

    Once times are rounded, two matches from one encounter (e.g. sat in a cafe, then walked
    off the same way) would show as overlapping entries - "Same place 21:30-22:15" next to
    "Passed each other 22:00-22:15". Overlapping or touching windows are merged into one,
    described by its longest part.
    """
    groups: list[dict] = []
    for e in sorted(events, key=lambda x: x.start_t):
        start = math.floor(e.start_t / time_round_s) * time_round_s
        end = max(math.ceil(e.end_t / time_round_s) * time_round_s, start + time_round_s)
        if groups and start <= groups[-1]["end"]:
            g = groups[-1]
            g["end"] = max(g["end"], end)
            g["raw_end"] = max(g["raw_end"], e.end_t)
            if e.duration_s > g["main"].duration_s:
                g["main"] = e
        else:
            groups.append({"start": start, "end": end, "raw_start": e.start_t, "raw_end": e.end_t, "main": e})
    out = []
    for i, g in enumerate(groups, 1):
        e = g["main"]
        lat, lon = blur_latlon(e.lat, e.lon, grid_m)
        out.append({
            "id": i,
            "start": _iso(g["start"]),
            "end": _iso(g["end"]),
            "lat": lat,
            "lon": lon,
            "blur_m": grid_m,
            "kind": e.kind,
            "duration_min": max(5, int(round((g["raw_end"] - g["raw_start"]) / 300)) * 5),  # 5-minute buckets
            "offset_min": int(round(e.time_offset_s / 60 / 5) * 5),  # 5-minute buckets
        })
    return out
