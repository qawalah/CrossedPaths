"""Small geodesy helpers (spherical earth is plenty for 100 m matching)."""
import numpy as np

EARTH_R = 6371008.8  # metres


def haversine_m(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = (np.radians(np.asarray(x, dtype=float)) for x in (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_R * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def to_xyz(lat, lon):
    """Lat/lon (deg) -> Nx3 cartesian metres on the sphere. Safe at poles and the antimeridian."""
    la, lo = np.radians(np.asarray(lat, dtype=float)), np.radians(np.asarray(lon, dtype=float))
    return EARTH_R * np.column_stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])


def from_xyz(xyz):
    xyz = np.atleast_2d(xyz)
    x, y, z = xyz[:, 0], xyz[:, 1], xyz[:, 2]
    r = np.sqrt(x * x + y * y + z * z)
    return np.degrees(np.arcsin(z / r)), np.degrees(np.arctan2(y, x))
