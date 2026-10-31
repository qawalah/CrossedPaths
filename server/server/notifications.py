"""Push notifications via Expo's push service.

Because the mobile app is built with Expo, we can push through https://exp.host without
holding our own FCM/APNs credentials — Expo's build service manages those. Each device
registers its "ExponentPushToken[...]" after asking the user for permission; we just POST
to Expo's endpoint and it fans out to the right platform.

This makes a real request over the network when called, so it needs outbound internet
access from wherever the server runs (a Synology NAS is fine as long as it can reach
exp.host over HTTPS). Failures are swallowed - a missed push should never break the
underlying action (connection request, check finishing, etc).
"""
import json
import urllib.error
import urllib.request

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def send_expo_push(tokens: list[str], title: str, body: str, data: dict | None = None, timeout: float = 5.0):
    """Best-effort push. Returns True if the request was accepted, False otherwise."""
    tokens = [t for t in tokens if t and t.startswith("ExponentPushToken")]
    if not tokens:
        return False
    messages = [{"to": t, "title": title, "body": body, "data": data or {}, "sound": "default"} for t in tokens]
    req = urllib.request.Request(
        EXPO_PUSH_URL, data=json.dumps(messages).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False
