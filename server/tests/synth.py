"""Synthetic two-person week used by the tests and the README demo."""
import json
import math
import random
from datetime import datetime, timezone

BASE = datetime(2025, 6, 2, tzinfo=timezone.utc).timestamp()  # a Monday, 00:00 UTC
H = 3600

# places (Berlin-ish, purely synthetic)
A_HOME = (52.5200, 13.4050)
B_HOME = (52.5600, 13.3700)          # ~5 km from A, approaches the office from the other side
WORK_A = (52.5300, 13.4300)
WORK_B = (52.5303, 13.4302)          # same office building, ~35 m apart
CAFE_A = (52.5400, 13.3900)          # deliberately NOT on anyone's commute line
CAFE_B = (52.54015, 13.39015)        # ~20 m from A's spot
PARK_A = (52.5100, 13.3800)
PARK_B = (52.5122, 13.3800)          # ~245 m away -> must NOT match at 100 m
P = (52.5000, 13.2000)               # opposite ends of a 27 km road
Q = (52.5000, 13.6000)


def _stays(person):
    """List of (lat, lon, t_start, t_end); moves are implied between consecutive stays."""
    home, work = (A_HOME, WORK_A) if person == "A" else (B_HOME, WORK_B)
    s = []
    for d in range(7):
        b = BASE + d * 24 * H
        if d == 2:   # cafe together, 12:00-12:30 (A) / 12:05-12:40 (B)
            if person == "A":
                s += [(*home, b, b + 8 * H), (*work, b + 9 * H, b + 11.6 * H), (*CAFE_A, b + 12 * H, b + 12.5 * H),
                      (*work, b + 12.85 * H, b + 17 * H), (*home, b + 18 * H, b + 24 * H)]
            else:
                s += [(*home, b, b + 8 * H), (*work, b + 9 * H, b + 11.6 * H), (*CAFE_B, b + 12.08 * H, b + 12.67 * H),
                      (*work, b + 13 * H, b + 17 * H), (*home, b + 18 * H, b + 24 * H)]
        elif d == 3:  # same cafe, 3.5 hours apart -> no match
            t = 12 if person == "A" else 15.5
            c = CAFE_A if person == "A" else CAFE_B
            s += [(*home, b, b + 8 * H), (*work, b + 9 * H, b + (t - 0.4) * H), (*c, b + t * H, b + (t + 0.5) * H),
                  (*work, b + (t + 0.85) * H, b + 17 * H), (*home, b + 18 * H, b + 24 * H)]
        elif d == 4:  # park, 245 m apart -> no match
            p = PARK_A if person == "A" else PARK_B
            s += [(*home, b, b + 8 * H), (*p, b + 12 * H, b + 13 * H), (*home, b + 15 * H, b + 24 * H)]
        elif d == 5:  # opposite ends of the road, swap at 18:00 -> cross mid-way at 18:15
            a_from, a_to = (P, Q) if person == "A" else (Q, P)
            s += [(*home, b, b + 8 * H), (*work, b + 9 * H, b + 15 * H), (*a_from, b + 16 * H, b + 18 * H),
                  (*a_to, b + 18.5 * H, b + 19.5 * H), (*home, b + 20.5 * H, b + 24 * H)]
        else:
            s += [(*home, b, b + 8 * H), (*work, b + 9 * H, b + 17 * H), (*home, b + 18 * H, b + 24 * H)]
    return s


def raw_points(person, seed):
    """Organic-looking GPS fixes: jittered intervals, ~3 m noise, varying accuracy."""
    rng = random.Random(seed)
    stays = _stays(person)
    pts = []

    def fix(t, lat, lon, kind):
        n = 3.0 / 111_320
        pts.append((t, lat + rng.gauss(0, n), lon + rng.gauss(0, n / math.cos(math.radians(lat))),
                    rng.choice([5, 8, 10, 12, 16, 20, 25, 30]), kind))

    for i, (la, lo, t0, t1) in enumerate(stays):
        t = t0
        while t < t1:                       # stationary: a fix every ~5 min
            fix(t, la, lo, "stay"); t += rng.uniform(240, 360)
        fix(t1, la, lo, "stay")
        if i + 1 < len(stays):              # wait, then travel at ~8 m/s (or faster if the schedule demands)
            nla, nlo, nt0, _ = stays[i + 1]
            dist = math.hypot((nla - la) * 111_320, (nlo - lo) * 111_320 * math.cos(math.radians(la)))
            depart = max(t1, nt0 - dist / 8.0)
            t = t1
            while t < depart:               # still at the old place
                fix(t, la, lo, "stay"); t += rng.uniform(240, 360)
            t = depart
            while t < nt0:                  # moving, a fix every ~20-45 s
                f = (t - depart) / (nt0 - depart)
                fix(t, la + f * (nla - la), lo + f * (nlo - lo), "move")
                t += rng.uniform(20, 45)
    pts.sort()
    return pts


def _iso(t):
    return datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def to_records_json(pts):
    """Legacy Takeout Records.json"""
    return {"locations": [{"latitudeE7": round(la * 1e7), "longitudeE7": round(lo * 1e7),
                           "accuracy": acc, "timestamp": _iso(t)} for t, la, lo, acc, _ in pts]}


def to_on_device_json(pts):
    """New on-device format: visits for stays, timelinePath for movement."""
    segs, cur = [], []

    def flush():
        if cur:
            segs.append({"startTime": _iso(cur[0][0]), "endTime": _iso(cur[-1][0]),
                         "timelinePath": [{"point": f"{la:.7f}°, {lo:.7f}°", "time": _iso(t)} for t, la, lo in cur]})
            cur.clear()

    i = 0
    while i < len(pts):
        if pts[i][4] == "stay":
            flush()
            j = i
            while j + 1 < len(pts) and pts[j + 1][4] == "stay":
                j += 1
            la = sum(p[1] for p in pts[i:j + 1]) / (j - i + 1)
            lo = sum(p[2] for p in pts[i:j + 1]) / (j - i + 1)
            segs.append({"startTime": _iso(pts[i][0]), "endTime": _iso(pts[j][0]),
                         "visit": {"topCandidate": {"placeLocation": {"latLng": f"{la:.7f}°, {lo:.7f}°"}}}})
            i = j + 1
        else:
            cur.append((pts[i][0], pts[i][1], pts[i][2]))
            i += 1
    flush()
    return {"semanticSegments": segs, "rawSignals": []}


def spoofed_records_json(n=1500):
    """A fabricated drive: ruler-straight, constant 20 m/s, fixed 1 s cadence, 5-decimal coords,
    one accuracy value, plus a teleport."""
    locs = []
    for i in range(n):
        t = BASE + i
        lat = round(52.5 + i * 20 / 111_320, 5)
        lon = round(13.4, 5)
        if i == 700:
            lat += 0.5  # teleport ~55 km
        locs.append({"latitudeE7": round(lat * 1e7), "longitudeE7": round(lon * 1e7), "accuracy": 10, "timestamp": _iso(t)})
    return {"locations": locs}


def write_samples(outdir):
    import os
    os.makedirs(outdir, exist_ok=True)
    with open(f"{outdir}/person_a_on_device.json", "w") as f:
        json.dump(to_on_device_json(raw_points("A", 11)), f)
    with open(f"{outdir}/person_b_records.json", "w") as f:
        json.dump(to_records_json(raw_points("B", 22)), f)
    with open(f"{outdir}/spoofed_records.json", "w") as f:
        json.dump(spoofed_records_json(), f)


if __name__ == "__main__":
    write_samples("samples")
