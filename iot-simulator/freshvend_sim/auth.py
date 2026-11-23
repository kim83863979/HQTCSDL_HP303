"""Optional HMAC authentication for messages shared by Backend and devices."""
from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any, Dict, Optional


def _canonical_payload(payload: Dict[str, Any]) -> bytes:
    unsigned = {key: value for key, value in payload.items() if key != "signature"}
    return json.dumps(
        unsigned,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
        allow_nan=False,
    ).encode("utf-8")


def sign_payload(payload: Dict[str, Any], secret: Optional[str]) -> Dict[str, Any]:
    if not secret:
        return payload
    signed = {key: value for key, value in payload.items() if key != "signature"}
    signed["signature"] = hmac.new(
        secret.encode("utf-8"),
        _canonical_payload(signed),
        hashlib.sha256,
    ).hexdigest()
    return signed


def verify_payload(payload: Dict[str, Any], secret: Optional[str]) -> bool:
    if not secret:
        return True
    signature = payload.get("signature")
    if not isinstance(signature, str) or len(signature) != 64:
        return False
    expected = sign_payload(payload, secret)["signature"]
    return hmac.compare_digest(signature, expected)
