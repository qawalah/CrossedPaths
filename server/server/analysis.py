"""Read-only analysis of ONE person's own stored points: a year/month/day summary (for
the drill-down picker), a single day's points, and "visits near a place" search. None of
this touches another user's data - it's the private, single-timeline side of the app.
"""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from crosspaths.geo import haversine_m


def summarize_track(points, tz_min: int = 0):
    """Counts only - no coordinates - so this is small and fast even for 10+ years.
    Days are calendar days in the viewer's time zone (tz_min = minutes east of UTC)."""
    if not points:
        return {"years": [], "from": None, "to": None}
    t = np.array([p.t for p in points], dtype=np.float64)
    day_epoch = np.floor((t + tz_min * 60) / 86400).astype(np.int64)
    days, counts = np.unique(day_epoch, return_counts=True)

    years: dict[int, dict[int, list[dict]]] = {}
    for de, cnt in zip(days.tolist(), counts.tolist()):
        d = datetime.fromtimestamp(de * 86400, tz=timezone.utc)
        years.setdefault(d.year, {}).setdefault(d.month, []).append({"day": d.day, "count": int(cnt)})

    out = []
    for y in sorted(years):
        months = []
        y_count = 0
        for m in sorted(years[y]):
            days_list = sorted(years[y][m], key=lambda x: x["day"])
            m_count = sum(x["count"] for x in days_list)
            y_count += m_count
            months.append({"month": m, "count": m_count, "days": days_list})
        out.append({"year": y, "count": y_count, "months": months})
    return {"years": out, "from": float(t.min()), "to": float(t.max())}


def day_range(date_str: str, tz_min: int = 0):
    """'YYYY-MM-DD' -> (start, end) unix seconds for that calendar day in the viewer's zone."""
    d = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    start = d.timestamp() - tz_min * 60
    return start, start + 86400


def tz_param(v) -> int:
    """Minutes east of UTC from a query string; anything odd falls back to UTC."""
    try:
        return max(-840, min(840, int(float(v))))
    except (TypeError, ValueError):
        return 0


def points_in_range(points, t0: float, t1: float):
    return [p for p in points if t0 <= p.t < t1]


def find_visits(points, lat: float, lon: float, radius_m: float = 150.0, merge_gap_s: float = 3600.0):
    """Every time the track came within radius_m of (lat, lon), merged into visits: two
    close passes less than merge_gap_s apart count as one visit, longer gaps split them."""
    if not points:
        return []
    t = np.array([p.t for p in points], dtype=np.float64)
    la = np.array([p.lat for p in points], dtype=np.float64)
    lo = np.array([p.lon for p in points], dtype=np.float64)
    within = haversine_m(la, lo, lat, lon) <= radius_m
    idx = np.where(within)[0]
    if idx.size == 0:
        return []
    tt = t[idx]
    gaps = np.diff(tt)
    group = np.r_[0, np.cumsum(gaps > merge_gap_s)]
    visits = []
    for g in np.unique(group):
        sel = idx[group == g]
        visits.append({"start": float(t[sel[0]]), "end": float(t[sel[-1]]), "count": int(sel.size)})
    visits.sort(key=lambda v: v["start"])
    return visits
