"""How likely two people actually saw each other during a crossing (never a prediction).

A crossing only says both were within the check's distance and time. Whether they noticed each
other is a guess, and GPS is never perfect, so this is a deliberately rough four-step grade:

    3 likely · 2 possibly · 1 less likely · 0 unlikely

plus a short label for what the crossing looked like ("how"). Both people see the same grade,
worked out once on the server from the exact (unblurred) match. The thresholds are coarse on
purpose so the grade can't be used to read distances finer than the blurred place.

Base, from what kind of crossing it was:
  spent_time          stopped at the same place for 30 min or more        3
  met_briefly         stopped at the same place, shorter                  2
  walked_together     moved the same way at walking pace                  2
  travelled_same_way  moved the same way faster (car, bus, train)         1
  crossed_paths       passed each other on foot, close                    1
  passed_by           any other pass (at the edge of range, or driving)   0

Then one step down for each of:
  - never closer than CLOSE_M
  - more than OFFSET_S apart in time at the spot (one may have left before the other came)
  - the match rests on positions filled in across a gap of FILLED_S or more (counts, but weakly)
"""
from __future__ import annotations

WALK_MS = 2.0          # ~7 km/h: faster is a vehicle, and nobody sees much from one
LONG_S = 30 * 60       # a stop this long at the same place is "spent time"
CLOSE_M = 75.0         # never closer than this: one step down
NEAR_PASS_M = 50.0     # a pass on foot this close is "crossed paths", not just "passed by"
OFFSET_S = 5 * 60      # more apart in time than this at the same spot: one step down
FILLED_S = 10 * 60     # matched positions filled in across a gap this long: one step down

TIERS = ("unlikely", "less_likely", "possibly", "likely")


def grade(c) -> tuple[int, str]:
    """(tier 0..3, how) for one matcher Crossing."""
    walking = c.mean_speed_ms < WALK_MS
    if c.kind == "same_place":
        how, base = ("spent_time", 3) if c.duration_s >= LONG_S else ("met_briefly", 2)
    elif c.kind == "shared_route":
        how, base = ("walked_together", 2) if walking else ("travelled_same_way", 1)
    elif walking and c.min_dist_m <= NEAR_PASS_M:
        how, base = "crossed_paths", 1
    else:
        how, base = "passed_by", 0
    down = 0
    if c.min_dist_m > CLOSE_M:
        down += 1
    if abs(c.time_offset_s) > OFFSET_S:
        down += 1
    if getattr(c, "filled_s", 0.0) >= FILLED_S:
        down += 1
    return max(0, min(3, base - down)), how
