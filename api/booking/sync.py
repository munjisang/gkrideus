"""
Vercel Python serverless function — POST /api/booking/sync

Body: { "rsvIds": ["...", "..."] }
Compares the given reservation IDs against the live list from Korail and
returns which are still active vs disappeared (cancelled/expired/paid).

Returns:
  {
    ok: true,
    active: ["..."],          # still present in Korail's reservations()
    cancelled: ["..."],       # not present → likely cancelled or expired
    totalActive: N            # total live reservations on this Korail account
  }
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler
from typing import Any

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
for path in (os.path.join(_REPO_ROOT, "scripts"), _REPO_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)


def _login_or_error() -> tuple[Any | None, dict[str, Any] | None]:
    korail_id = os.environ.get("KORAIL_ID")
    korail_pw = os.environ.get("KORAIL_PASSWORD")
    if not korail_id or not korail_pw:
        return None, {"ok": False, "stage": "env", "error": "KORAIL_ID/PASSWORD not set"}
    try:
        from ktx_booking import PatchedKorail  # type: ignore
    except Exception as e:  # noqa: BLE001
        return None, {"ok": False, "stage": "import", "error": str(e)}
    try:
        korail = PatchedKorail(korail_id, korail_pw, auto_login=False)
        if not korail.login():
            return None, {"ok": False, "stage": "login", "error": "login failed"}
    except Exception as e:  # noqa: BLE001
        return None, {
            "ok": False,
            "stage": "login",
            "error": str(e),
            "trace": traceback.format_exc(limit=2),
        }
    return korail, None


def _process(body: dict[str, Any]) -> dict[str, Any]:
    raw = body.get("rsvIds", [])
    if not isinstance(raw, list):
        return {"ok": False, "stage": "input", "error": "rsvIds must be a list"}
    rsv_ids = [str(x).strip() for x in raw if str(x).strip()]
    # Empty input → nothing to check but still report account state.
    if not rsv_ids:
        return {"ok": True, "active": [], "cancelled": [], "totalActive": 0}

    korail, err = _login_or_error()
    if err is not None or korail is None:
        return err or {"ok": False, "stage": "login", "error": "unknown login failure"}

    try:
        reservations = korail.reservations()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "stage": "list", "error": str(e)}

    active_set: set[str] = set()
    for r in reservations:
        rid = str(getattr(r, "rsv_id", "") or "").strip()
        rno = str(getattr(r, "rsv_no", "") or "").strip()
        if rid:
            active_set.add(rid)
        if rno:
            active_set.add(rno)

    active = [x for x in rsv_ids if x in active_set]
    cancelled = [x for x in rsv_ids if x not in active_set]
    return {
        "ok": True,
        "active": active,
        "cancelled": cancelled,
        "totalActive": len(reservations),
    }


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._send(400, {"ok": False, "error": "invalid JSON body"})
            return
        if not isinstance(body, dict):
            self._send(400, {"ok": False, "error": "body must be a JSON object"})
            return
        try:
            result = _process(body)
        except Exception as e:  # noqa: BLE001
            result = {
                "ok": False,
                "stage": "crash",
                "error": str(e),
                "trace": traceback.format_exc(limit=3),
            }
        self._send(200 if result.get("ok") else 502, result)

    def _send(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
