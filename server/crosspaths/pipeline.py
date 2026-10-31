"""End-to-end check: parse-ready tracks in, shareable result out."""
from __future__ import annotations

from dataclasses import asdict

from .matcher import Params, find_crossings
from .parser import Track
from .privacy import Zone, detect_anchor_zones, in_any_zone, sanitize
from .spoofcheck import assess


def run_check(a: Track, b: Track, params: Params = Params(), exclude_anchors: bool = True,
              zones_a: list[Zone] | None = None, zones_b: list[Zone] | None = None,
              blur_m: float = 100.0, with_trust: bool = True) -> dict:
    raw_events = find_crossings(a.points, b.points, params)

    zones: list[Zone] = list(zones_a or []) + list(zones_b or [])
    if exclude_anchors:
        zones += detect_anchor_zones(a.points, params) + detect_anchor_zones(b.points, params)
    kept = [e for e in raw_events if not in_any_zone(e.lat, e.lon, zones)]

    if with_trust:
        ta, tb = assess(a.points), assess(b.points)
    else:
        ta = tb = None
    return {
        "events": sanitize(kept, grid_m=blur_m),
        "stats": {
            "raw_events": len(raw_events),
            "excluded_in_home_work_zones": len(raw_events) - len(kept),
            "radius_m": params.radius_m,
            "window_min": params.window_s / 60,
        },
        # The counterpart only ever sees the coarse level, never the reasons.
        "trust": {"a": ta.level, "b": tb.level} if with_trust else None,
        "_trust_detail": {"a": asdict(ta), "b": asdict(tb)} if with_trust else None,  # server-side / debugging only
    }
