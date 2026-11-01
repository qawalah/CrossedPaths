"""Draw journeys along streets instead of straight lines. Map display only.

Sparse histories (Google Timeline above all) keep a trip as a handful of points, so a straight
line between them cuts through buildings and water. For each long hop we ask a router for the
street route and use it when it looks plausible; otherwise the straight line stays.

Matching never uses this: it only changes how a person's OWN path is drawn for them.
"""
from __future__ import annotations

import time
from typing import Callable, Optional

from .geo import haversine_m
from .parser import Point

SPARSE_M = 150.0        # shorter hops already follow the street closely enough
MAX_HOP_M = 50_000.0    # longer hops are guesswork either way
MAX_SPEED_MS = 70.0     # faster is a flight (the matcher ignores those too)
DETOUR = 2.0            # a route more than twice the straight line (plus slack) is not this trip:
DETOUR_SLACK_M = 200.0  # usually a train or ferry with no road beside it
GAP_S = 1800.0          # the map never joins points further apart in time than this

# route((lat, lon), (lat, lon), costing) -> ([(lat, lon), ...], length_m) or None
Router = Callable[[tuple, tuple, str], Optional[tuple]]


def costing_for(mode: str | None, speed_ms: float) -> str | None:
    """Valhalla costing for a hop, or None to leave it straight."""
    if mode == "skip":
        return None
    if mode in ("road", "foot", "bike"):
        return {"road": "auto", "foot": "pedestrian", "bike": "bicycle"}[mode]
    return "pedestrian" if speed_ms < 2.5 else "auto"   # unknown: walking pace or not


def snap_points(points: list[Point], route: Router, budget_s: float = 30.0, max_routes: int = 2000) -> list[Point]:
    """Points (sorted by time) with street routes filled in between sparse neighbours.
    Stops routing (but keeps the points) once the time budget or route count runs out."""
    if len(points) < 2:
        return list(points)
    deadline = time.monotonic() + budget_s
    routes = 0
    out: list[Point] = []
    for a, b in zip(points, points[1:]):
        out.append(a)
        if routes >= max_routes or time.monotonic() > deadline:
            continue
        dt = b.t - a.t
        if dt <= 0 or dt > GAP_S:
            continue
        d = float(haversine_m(a.lat, a.lon, b.lat, b.lon))
        if d < SPARSE_M or d > MAX_HOP_M or d / dt > MAX_SPEED_MS:
            continue
        mode = "skip" if "skip" in (a.mode, b.mode) else (a.mode or b.mode)
        costing = costing_for(mode, d / dt)
        if costing is None:
            continue
        routes += 1
        try:
            r = route((a.lat, a.lon), (b.lat, b.lon), costing)
        except Exception:  # noqa: BLE001 - a failed route just means a straight line
            r = None
        if not r:
            continue
        shape, length = r
        if len(shape) < 2 or length > DETOUR * d + DETOUR_SLACK_M or length / dt > MAX_SPEED_MS:
            continue
        # Times along the route by distance travelled.
        seg = [float(haversine_m(p[0], p[1], q[0], q[1])) for p, q in zip(shape, shape[1:])]
        total = sum(seg) or 1.0
        run = 0.0
        for (lat, lon), s in zip(shape[1:-1], seg):
            run += s
            out.append(Point(a.t + dt * run / total, lat, lon, None, "path", mode))
    out.append(points[-1])
    return out


def decode_polyline(s: str, precision: int = 6) -> list[tuple[float, float]]:
    """Google/Valhalla encoded polyline -> [(lat, lon)]."""
    coords, idx, lat, lon, f = [], 0, 0, 0, 10 ** precision
    while idx < len(s):
        vals = []
        for _ in range(2):
            shift = res = 0
            while True:
                b = ord(s[idx]) - 63
                idx += 1
                res |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            vals.append(~(res >> 1) if res & 1 else res >> 1)
        lat += vals[0]
        lon += vals[1]
        coords.append((lat / f, lon / f))
    return coords
