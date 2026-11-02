"""Sends sign-in codes with the WhatsApp Business Cloud API (Meta).

Needs an approved *authentication* template with a copy-code button. Never logs the number
or the code.
"""
import requests


class DeliveryFailed(Exception):
    pass


def send_whatsapp_code(phone: str, code: str, lang: str, cfg) -> None:
    token, phone_id, template = cfg.get("WHATSAPP_TOKEN"), cfg.get("WHATSAPP_PHONE_ID"), cfg.get("WHATSAPP_TEMPLATE")
    if not (token and phone_id and template):
        raise DeliveryFailed("not_configured")
    langs = [x.strip() for x in (cfg.get("WHATSAPP_TEMPLATE_LANGS") or "en").split(",") if x.strip()] or ["en"]
    payload = {
        "messaging_product": "whatsapp",
        "to": phone.lstrip("+"),
        "type": "template",
        "template": {
            "name": template,
            "language": {"code": lang if lang in langs else langs[0]},
            "components": [
                {"type": "body", "parameters": [{"type": "text", "text": code}]},
                {"type": "button", "sub_type": "url", "index": "0", "parameters": [{"type": "text", "text": code}]},
            ],
        },
    }
    url = f"https://graph.facebook.com/{cfg.get('WHATSAPP_API_VERSION') or 'v20.0'}/{phone_id}/messages"
    try:
        r = requests.post(url, json=payload, headers={"Authorization": "Bearer " + token}, timeout=10)
    except requests.RequestException as e:
        raise DeliveryFailed(type(e).__name__) from None
    if not 200 <= r.status_code < 300:
        raise DeliveryFailed(f"http_{r.status_code}")
