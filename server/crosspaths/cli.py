"""python -m crosspaths.cli a.json b.json [--radius 100] [--window 15] [--keep-anchors]"""
import argparse
import json

from .matcher import Params
from .parser import load_track
from .pipeline import run_check


def main():
    ap = argparse.ArgumentParser(description="Check whether two Timeline exports crossed paths")
    ap.add_argument("a"); ap.add_argument("b")
    ap.add_argument("--radius", type=float, default=100, help="metres")
    ap.add_argument("--window", type=float, default=15, help="minutes")
    ap.add_argument("--keep-anchors", action="store_true", help="do not exclude detected home/work zones")
    ap.add_argument("--debug", action="store_true", help="include server-side trust detail")
    args = ap.parse_args()

    res = run_check(load_track(args.a), load_track(args.b),
                    Params(radius_m=args.radius, window_s=args.window * 60),
                    exclude_anchors=not args.keep_anchors)
    if not args.debug:
        res.pop("_trust_detail", None)
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
