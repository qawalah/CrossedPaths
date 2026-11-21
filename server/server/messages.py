"""Text of push notifications, in the language of the device that receives them.

The app tells the server its interface language when it registers for push (devices.lang); anything
else gets English. Arabic is plain, everyday wording, by meaning rather than word for word, like the
interface itself (see static/i18n.js).
"""

LRM = "‎"   # keeps "@name" as one left-to-right unit inside an Arabic sentence


def _ar_plural(n, one, two, few, many):
    """Arabic plural forms: 1, 2, 3-10, then 11 and up (the last also covers 0 and 100)."""
    m = n % 100
    if n == 1:
        return one
    if n == 2:
        return two
    if 3 <= m <= 10:
        return few.format(n=n)
    return many.format(n=n)


def _en_plural(n, one, other):
    return one if n == 1 else other.format(n=n)


def push_text(kind, lang="en", **v):
    """(title, body) for a notification. kind: new_request | request_accepted | check_request |
    connected | check_done. v carries who (a handle) and, for check_done, n; connected also takes checking."""
    ar = lang == "ar"
    who = v.get("who", "")
    who_txt = (LRM + "@" + who + LRM) if ar else "@" + who
    if kind == "new_request":
        return ("طلب جديد", f"{who_txt} يبي يقارن مساراته بمسارك") if ar else ("New request", f"{who_txt} wants to check paths with you")
    if kind == "request_accepted":
        return ("تم قبول طلبك", f"{who_txt} قبل طلبك") if ar else ("Request accepted", f"{who_txt} accepted your request")
    if kind == "check_request":
        return ("نقارن المسارات؟", f"{who_txt} يبي يعرف إذا تقاطعت مساراتكم") if ar else ("Check paths?", f"{who_txt} wants to check if your paths crossed")
    if kind == "connected":
        if ar:
            return "تم الربط", f"تم الربط مع {who_txt}" + (" · نقارن مساراتكم الحين" if v.get("checking") else "")
        return "Connected", f"You're connected with {who_txt}" + (" - checking your paths now" if v.get("checking") else "")
    if kind == "check_done":
        n = int(v.get("n", 0))
        if ar:
            body = _ar_plural(n, "لقينا تقاطع واحد", "لقينا تقاطعين", "لقينا {n} تقاطعات", "لقينا {n} تقاطع") if n else "ما لقينا أي تقاطع"
            return "انتهت المقارنة", body
        return "Check finished", _en_plural(n, "1 crossing found", "{n} crossings found") if n else "No crossings found"
    raise ValueError(kind)
