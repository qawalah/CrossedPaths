"""Core matching engine.

Pipeline:  raw points -> densified samples -> 4-D KD-tree join (x, y, z, scaled time) ->
           exact distance/time filter -> best match per sample -> merge into events.

Why densify? Two cars closing at 30 m/s can pass within 100 m of each other while every
*logged* point is a kilometre away. Sampling by BOTH time (step_s) and distance (radius/2)
guarantees no crossing is missed to aliasing.
"""
from __future__ import annotations

import itertools
from dataclasses import dataclass

import numpy as np
from scipy.spatial import cKDTree

from .geo import EARTH_R, from_xyz, haversine_m, to_xyz


@dataclass
class Params:
    radius_m: float = 100.0      # "close enough" distance
    window_s: float = 900.0      # "at about the same time" tolerance when someone is stationary (15 min)
    moving_window_s: float = 180.0  # tolerance when BOTH are moving (else every commuter on a road matches)
    still_speed_ms: float = 1.5  # below this a person counts as stationary
    step_s: float = 60.0         # max time between samples
    merge_gap_s: float = 600.0   # hits closer than this (in time)...
    merge_dist_m: float | None = None  # ...and in space are one event (default: 3 x radius)
    moving_gap_s: float = 1800.0  # never interpolate across longer gaps when moving...
    still_gap_s: float = 6 * 3600.0  # ...but allow long gaps if the person stayed put
    still_dist_m: float = 200.0
    # Faster than this (~250 km/h) is a flight: positions in between are pure guesswork and
    # "passing" someone at 900 km/h means nothing, so such stretches are never matched.
    max_speed_ms: float = 70.0
    t_from: float | None = None  # optional date trimming (unix seconds)
    t_to: float | None = None


@dataclass
class Samples:
    t: np.ndarray
    lat: np.ndarray
    lon: np.ndarray
    speed: np.ndarray

    def __len__(self):
        return len(self.t)


@dataclass
class Crossing:
    start_t: float
    end_t: float
    b_start_t: float
    b_end_t: float
    lat: float
    lon: float
    min_dist_m: float
    time_offset_s: float   # median (their time - my time) at the crossing
    spread_m: float
    mean_speed_ms: float
    kind: str              # same_place | passing | shared_route

    @property
    def duration_s(self) -> float:
        return self.end_t - self.start_t


def _empty() -> Samples:
    z = np.array([], dtype=float)
    return Samples(z, z, z, z)


def resample(points, p: Params) -> Samples:
    if len(points) < 2:
        return _empty()
    pts = sorted(points, key=lambda q: q.t)
    t = np.array([q.t for q in pts])
    lat = np.array([q.lat for q in pts])
    lon = np.array([q.lon for q in pts])

    dt = np.diff(t)
    d = haversine_m(lat[:-1], lon[:-1], lat[1:], lon[1:])
    still = (d <= p.still_dist_m) & (dt <= p.still_gap_s)
    safe_dt = np.where(dt > 0, dt, 1.0)
    fast = (d / safe_dt) > p.max_speed_ms
    ok = (dt > 0) & (still | (dt <= p.moving_gap_s)) & ~fast

    n = np.maximum(np.ceil(dt / p.step_s), np.ceil(d / (p.radius_m / 2)))
    n = np.where(ok, np.maximum(n, 1), 0).astype(np.int64)
    total = int(n.sum())
    if total == 0:
        return _empty()

    idx = np.repeat(np.arange(len(n)), n)
    offs = np.arange(total) - np.repeat(np.cumsum(n) - n, n)
    f = offs / n[idx]
    dlon = ((lon[idx + 1] - lon[idx] + 180) % 360) - 180
    s_t = t[idx] + f * dt[idx]
    s_lat = lat[idx] + f * (lat[idx + 1] - lat[idx])
    s_lon = ((lon[idx] + f * dlon + 180) % 360) - 180
    s_sp = d[idx] / safe_dt[idx]

    keep = np.ones(total, bool)
    if p.t_from is not None:
        keep &= s_t >= p.t_from
    if p.t_to is not None:
        keep &= s_t <= p.t_to
    return Samples(s_t[keep], s_lat[keep], s_lon[keep], s_sp[keep])


def find_crossings(a_points, b_points, p: Params = Params()) -> list[Crossing]:
    A, B = resample(a_points, p), resample(b_points, p)
    if len(A) == 0 or len(B) == 0:
        return []

    t0 = min(A.t.min(), B.t.min())
    kt = p.radius_m / p.window_s  # scales seconds so |dt| <= window  <=>  |dt*kt| <= radius
    XA = np.column_stack([to_xyz(A.lat, A.lon), (A.t - t0) * kt])
    XB = np.column_stack([to_xyz(B.lat, B.lon), (B.t - t0) * kt])

    # Chebyshev (p=inf) box in (x,y,z,t): a cheap superset of "within radius AND within window".
    lists = cKDTree(XA).query_ball_tree(cKDTree(XB), r=p.radius_m, p=np.inf)
    lens = np.fromiter((len(l) for l in lists), dtype=np.int64, count=len(lists))
    if lens.sum() == 0:
        return []
    ia = np.repeat(np.arange(len(lists)), lens)
    ib = np.fromiter(itertools.chain.from_iterable(lists), dtype=np.int64, count=int(lens.sum()))

    dist = haversine_m(A.lat[ia], A.lon[ia], B.lat[ib], B.lon[ib])
    # Time tolerance depends on behaviour: if at least one person is stationary (café, park,
    # bus stop) allow the full window; if both are moving only near-simultaneous passes count.
    one_still = np.minimum(A.speed[ia], B.speed[ib]) < p.still_speed_ms
    tol = np.where(one_still, p.window_s, min(p.moving_window_s, p.window_s))
    ok = (dist <= p.radius_m) & (np.abs(A.t[ia] - B.t[ib]) <= tol)
    ia, ib, dist = ia[ok], ib[ok], dist[ok]
    if len(ia) == 0:
        return []

    order = np.lexsort((dist, ia))           # best (closest) partner for each of my samples
    ia, ib, dist = ia[order], ib[order], dist[order]
    first = np.r_[True, ia[1:] != ia[:-1]]
    ia, ib, dist = ia[first], ib[first], dist[first]

    ta = A.t[ia]
    merge_dist = p.merge_dist_m if p.merge_dist_m is not None else 3 * p.radius_m
    jump = haversine_m(A.lat[ia][:-1], A.lon[ia][:-1], A.lat[ia][1:], A.lon[ia][1:])
    # New event on a time gap OR a spatial jump: otherwise "work -> cafe -> work" chains into one blob.
    group = np.r_[0, np.cumsum((np.diff(ta) > p.merge_gap_s) | (jump > merge_dist))]
    events = []
    for g in np.unique(group):
        m = group == g
        a_i, b_i, dd = ia[m], ib[m], dist[m]
        # Time-weighted speed: moving stretches are sampled every few metres, stationary ones
        # once a minute, so a plain per-sample mean calls a day spent together at one place
        # "moving" because of the two commutes in it.
        ta_ev = A.t[a_i]
        w = np.clip(np.gradient(ta_ev), 0, 2 * p.step_s) if len(ta_ev) > 1 else np.ones(1)
        if w.sum() <= 0:
            w = np.ones(len(ta_ev))
        speed = float(np.average((A.speed[a_i] + B.speed[b_i]) / 2, weights=w))
        start, end = float(A.t[a_i].min()), float(A.t[a_i].max())
        dur = end - start
        if speed < p.still_speed_ms:
            kind = "same_place"
        elif dur <= 2 * p.moving_window_s:
            kind = "passing"
        else:
            kind = "shared_route"
        if kind == "same_place":
            # Stationary: the centre of the cluster is a fair "where".
            xyz = np.vstack([to_xyz(A.lat[a_i], A.lon[a_i]), to_xyz(B.lat[b_i], B.lon[b_i])])
        else:
            # Moving: the centroid of a long shared drive can sit kilometres off any road, so use
            # the moment they were most nearly at the same spot at the same time - a place both
            # people actually were. (Smallest distance alone isn't it: two cars driving opposite
            # ways match the same tarmac minutes apart along the whole matched stretch.)
            k = int(np.lexsort((dd, np.abs(B.t[b_i] - A.t[a_i])))[0])
            xyz = np.vstack([to_xyz(A.lat[a_i[k:k + 1]], A.lon[a_i[k:k + 1]]),
                             to_xyz(B.lat[b_i[k:k + 1]], B.lon[b_i[k:k + 1]])])
        c = xyz.mean(axis=0)
        c = c / np.linalg.norm(c) * EARTH_R
        clat, clon = from_xyz(c)
        spread = float(haversine_m(A.lat[a_i], A.lon[a_i], clat[0], clon[0]).max())
        events.append(Crossing(
            start_t=start, end_t=end,
            b_start_t=float(B.t[b_i].min()), b_end_t=float(B.t[b_i].max()),
            lat=float(clat[0]), lon=float(clon[0]),
            min_dist_m=float(dd.min()),
            time_offset_s=float(np.median(B.t[b_i] - A.t[a_i])),
            spread_m=spread, mean_speed_ms=speed, kind=kind,
        ))
    return events
