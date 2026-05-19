"""
Vercel Python serverless function — POST /api/booking/cancel

Body: { rsvId }
Returns: { ok, stage, rsv_id?, reservation?, error?, ... }
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


def _reservation_to_dict(r: Any) -> dict[str, Any]:
    keys = (
        "rsv_id",
        "rsv_no",
        "journey_no",
        "journey_cnt",
        "buy_limit_date",
        "buy_limit_time",
        "price",
        "seat_no",
        "seat_no_count",
        "train_type_name",
        "dep_name",
        "arr_name",
        "dep_date",
        "dep_time",
        "arr_time",
    )
    out: dict[str, Any] = {}
    for k in keys:
        if hasattr(r, k):
            v = getattr(r, k)
            try:
                json.dumps(v)
                out[k] = v
            except TypeError:
                out[k] = str(v)
    return out


def _login_or_error() -> tuple[Any | None, dict[str, Any] | None]:
    korail_id = os.environ.get("KORAIL_ID")
    korail_pw = os.environ.get("KORAIL_PASSWORD")
    if not korail_id or not korail_pw:
        return None, {
            "ok": False,
            "stage": "env",
            "error": "KORAIL_ID / KORAIL_PASSWORD not set",
        }
    try:
        from ktx_booking import PatchedKorail  # type: ignore
    except Exception as e:  # noqa: BLE001
        return None, {
            "ok": False,
            "stage": "import",
            "error": f"PatchedKorail not importable: {e}",
        }
    try:
        korail = PatchedKorail(korail_id, korail_pw, auto_login=False)
        try:
            from korail_tls import apply_legacy_tls  # type: ignore

            apply_legacy_tls(korail._session)
        except Exception:  # noqa: BLE001
            pass
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
    rsv_id = str(body.get("rsvId") or body.get("rsvNo") or "").strip()
    if not rsv_id:
        return {"ok": False, "stage": "input", "error": "rsvId is required"}

    if os.environ.get("KORAIL_RESERVE_LIVE") != "1":
        return {
            "ok": False,
            "stage": "env",
            "error": "취소도 KORAIL_RESERVE_LIVE=1 이어야 실제 호출됩니다.",
            "liveAllowed": False,
        }

    korail, err = _login_or_error()
    if err is not None or korail is None:
        return err or {"ok": False, "stage": "login", "error": "unknown login failure"}

    try:
        reservations = korail.reservations()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "stage": "list", "error": str(e)}

    target = None
    candidates = []
    for r in reservations:
        rid = str(getattr(r, "rsv_id", "") or "").strip()
        rno = str(getattr(r, "rsv_no", "") or "").strip()
        candidates.append({"rsv_id": rid, "rsv_no": rno})
        if rid == rsv_id or rno == rsv_id:
            target = r
            break

    if target is None:
        return {
            "ok": False,
            "stage": "match",
            "error": f"reservation {rsv_id} not found in {len(reservations)} active reservations",
            "candidates": candidates,
        }

    try:
        korail.cancel(target)
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "stage": "cancel",
            "error": str(e),
            "trace": traceback.format_exc(limit=2),
        }

    return {
        "ok": True,
        "stage": "cancelled",
        "rsv_id": rsv_id,
        "reservation": _reservation_to_dict(target),
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
