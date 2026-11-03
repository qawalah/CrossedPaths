#!/usr/bin/env python3
"""Build street-map routing tiles on your own computer, to upload to a CrossPaths server that is
too small to build them itself (it needs 1-4 GB of memory; a 1 GB server gets restarted).

    pip install pyvalhalla
    python3 build_road_tiles.py gcc-states-latest.osm.pbf gcc-states-tiles.tar.gz
    python3 build_road_tiles.py https://download.geofabrik.de/asia/gcc-states-latest.osm.pbf gcc.tar.gz

Then on the server: Settings → Street maps → Upload a map, and pick the .tar.gz.
The input is an OpenStreetMap extract (.osm.pbf), e.g. from https://download.geofabrik.de.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path


def build(pbf: Path, out: Path, workdir: Path) -> int:
    try:
        import valhalla
        from valhalla._scripts import PYVALHALLA_BIN_DIR
    except ImportError:
        sys.exit("pyvalhalla is needed: pip install pyvalhalla")
    tiles = workdir / "tiles"
    tiles.mkdir()
    conf = valhalla.get_config(tile_extract="", tile_dir=str(tiles))
    conf_path = workdir / "build.json"
    conf_path.write_text(json.dumps(conf))
    subprocess.run([str(Path(PYVALHALLA_BIN_DIR) / "valhalla_build_tiles"), "-c", str(conf_path), str(pbf)], check=True)
    n = 0
    with tarfile.open(out, "w:gz" if out.name.endswith((".gz", ".tgz")) else "w") as tf:
        for f in sorted(tiles.rglob("*.gph")):
            tf.add(f, arcname=str(f.relative_to(tiles)))
            n += 1
    if not n:
        sys.exit("The build produced no tiles: is the input an .osm.pbf with roads in it?")
    return n


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="an .osm.pbf file, or its https:// address")
    ap.add_argument("output", help="the archive to write, e.g. my-country.tar.gz")
    a = ap.parse_args(argv)
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        src = a.source
        if src.startswith(("http://", "https://")):
            print("Downloading", src)
            pbf = work / "region.osm.pbf"
            with urllib.request.urlopen(urllib.request.Request(src, headers={"User-Agent": "CrossPaths tiles"})) as r, open(pbf, "wb") as f:
                shutil.copyfileobj(r, f, 1 << 20)
        else:
            pbf = Path(src)
        out = Path(a.output).resolve()
        n = build(pbf, out, work)
    print(f"Wrote {out} ({n} tiles, {os.path.getsize(out) / 1e6:.1f} MB). Upload it in Settings → Street maps.")


if __name__ == "__main__":
    main()
