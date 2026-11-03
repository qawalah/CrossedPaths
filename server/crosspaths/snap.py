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


# ---------- estimated car routes for gaps (export only, experimental) ----------

class GapRules:
    """Which gaps between two recorded points get an estimated car route.

    Defaults (reviewed): a gap of up to 30 min, a straight line of 0.3-50 km, and an average
    speed of 15-130 km/h over it - i.e. what a car trip with no points in between looks like.
    Slower gaps are walking or stops, faster ones a train or a flight. The route found must
    also be plausible: at most twice the straight line, and drivable in the time available.
    """

    def __init__(self, max_gap_min: float = 30, max_km: float = 50, min_kmh: float = 15, max_kmh: float = 130,
                 min_km: float = 0.3):
        self.max_gap_s = max(1.0, float(max_gap_min)) * 60
        self.min_m = max(0.0, float(min_km)) * 1000
        self.max_m = max(self.min_m + 1, float(max_km) * 1000)
        self.min_ms = max(0.0, float(min_kmh)) / 3.6
        self.max_ms = max(self.min_ms + 0.1, float(max_kmh)) / 3.6

    def wants(self, a: Point, b: Point) -> bool:
        dt = b.t - a.t
        if dt <= 0 or dt > self.max_gap_s:
            return False
        d = float(haversine_m(a.lat, a.lon, b.lat, b.lon))
        return self.min_m <= d <= self.max_m and self.min_ms <= d / dt <= self.max_ms


def estimate_gaps(points: list[Point], route: Router, rules: GapRules | None = None,
                  budget_s: float = 40.0, max_routes: int = 3000) -> list[list[Point]]:
    """Estimated car routes for the gaps that look like car trips: one list of points per gap,
    from the recorded point before the gap to the one after it (both included, with their real
    times), timed evenly along the route. The recorded points themselves are never changed."""
    rules = rules or GapRules()
    pts = sorted(points, key=lambda p: p.t)
    deadline = time.monotonic() + budget_s
    out, routes = [], 0
    for a, b in zip(pts, pts[1:]):
        if routes >= max_routes or time.monotonic() > deadline:
            break
        if not rules.wants(a, b):
            continue
        routes += 1
        try:
            r = route((a.lat, a.lon), (b.lat, b.lon), "auto")
        except Exception:  # noqa: BLE001 - no route just means no estimate
            r = None
        if not r:
            continue
        shape, length = r
        d = float(haversine_m(a.lat, a.lon, b.lat, b.lon))
        dt = b.t - a.t
        if len(shape) < 2 or length > DETOUR * d + DETOUR_SLACK_M or length / dt > rules.max_ms:
            continue
        seg = [float(haversine_m(p[0], p[1], q[0], q[1])) for p, q in zip(shape, shape[1:])]
        total = sum(seg) or 1.0
        run, gap = 0.0, [Point(a.t, a.lat, a.lon, None, "estimated", "road")]
        for (lat, lon), s in zip(shape[1:-1], seg):
            run += s
            gap.append(Point(a.t + dt * run / total, lat, lon, None, "estimated", "road"))
        gap.append(Point(b.t, b.lat, b.lon, None, "estimated", "road"))
        out.append(gap)
    return out
