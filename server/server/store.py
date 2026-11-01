"""Encrypted-at-rest storage of parsed timelines (short-lived; purged by runner.purge)."""
import io
import os

import numpy as np

from crosspaths.parser import Point

from .security import fernet

_SRC = ["record", "path", "visit", "activity", "track"]  # append only: stored files use the index
_MODE = [None, "road", "foot", "bike", "skip"]             # same (files from before 0.13 have no modes)


def _path(data_dir, upload_id):
    d = os.path.join(data_dir, "uploads")
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, f"{upload_id}.bin")


def save_points(cfg, upload_id, points):
    buf = io.BytesIO()
    np.savez_compressed(
        buf,
        t=np.array([p.t for p in points], dtype=np.float64),
        lat=np.array([p.lat for p in points], dtype=np.float64),
        lon=np.array([p.lon for p in points], dtype=np.float64),
        acc=np.array([np.nan if p.acc is None else p.acc for p in points], dtype=np.float32),
        src=np.array([_SRC.index(p.src) if p.src in _SRC else 0 for p in points], dtype=np.uint8),
        mode=np.array([_MODE.index(p.mode) if p.mode in _MODE else 0 for p in points], dtype=np.uint8),
    )
    with open(_path(cfg["DATA_DIR"], upload_id), "wb") as f:
        f.write(fernet(cfg["DATA_KEY"]).encrypt(buf.getvalue()))


def load_points(cfg, upload_id):
    with open(_path(cfg["DATA_DIR"], upload_id), "rb") as f:
        raw = fernet(cfg["DATA_KEY"]).decrypt(f.read())
    z = np.load(io.BytesIO(raw))
    t, lat, lon, acc, src = z["t"], z["lat"], z["lon"], z["acc"], z["src"]
    mode = z["mode"] if "mode" in z.files else np.zeros(len(t), dtype=np.uint8)
    return [Point(float(t[i]), float(lat[i]), float(lon[i]),
                  None if np.isnan(acc[i]) else float(acc[i]), _SRC[int(src[i])], _MODE[int(mode[i])])
            for i in range(len(t))]


def delete_points(cfg, upload_id):
    try:
        os.remove(_path(cfg["DATA_DIR"], upload_id))
    except FileNotFoundError:
        pass
