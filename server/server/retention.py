"""How long a user's raw timeline uploads are kept - their choice, within the server's limit."""

FOREVER = 32503680000.0   # year 3000: the "keep until I delete it" purge time (purge_after is NOT NULL)
CHOICES = (24.0, 168.0, 720.0, 0.0)   # 24 hours, 7 days, 30 days, until deleted


def keep_options(cfg):
    """The choices this server allows, in hours (0 = until deleted)."""
    cap = float(cfg.get("UPLOAD_KEEP_MAX_DAYS") or 0) * 24
    out = [h for h in CHOICES if h and (not cap or h <= cap)]
    if not cap:
        out.append(0.0)
    default = float(cfg["UPLOAD_TTL_HOURS"])
    if default not in out:
        out.insert(0, default)
    return sorted(out, key=lambda h: h or float("inf"))


def keep_hours(cfg, user):
    """This user's effective setting, in hours (0 = until deleted)."""
    h = user["keep_hours"] if user is not None and "keep_hours" in user.keys() else None
    if h is None or float(h) not in keep_options(cfg):
        return float(cfg["UPLOAD_TTL_HOURS"])
    return float(h)


def purge_time(created_at, hours):
    return FOREVER if not hours else created_at + hours * 3600
