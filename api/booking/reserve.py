"""
Vercel Python serverless function — POST /api/booking/reserve

Receives JSON body:
  {
    depName, arrName,
    date,                  # YYYYMMDD
    time,                  # HHmm or HHmmss
    trainNo,
    passengers,
    seatType,              # "standard" | "first"
    live                   # bool: when true + env opts in, actually reserves
  }

Returns the same JSON envelope as the local helper used to:
  { ok, stage, mode, train, reservation?, error?, ... }
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler
from typing import Any

# Make the shared PatchedKorail helper importable.
_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
for path in (os.path.join(_REPO_ROOT, "scripts"), _REPO_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)


def _seat_option(seat_type: str):
    from korail2 import ReserveOption  # type: ignore

    if seat_type == "first":
        return ReserveOption.SPECIAL_ONLY
    return ReserveOption.GENERAL_ONLY


def _passengers(count: int):
    from korail2 import AdultPassenger  # type: ignore

    return [AdultPassenger(count)]


_TRAIN_KEYS = (
    "train_type",
    "train_type_name",
    "train_no",
    "train_group",
    "dep_name",
    "arr_name",
    "dep_date",
    "arr_date",
    "dep_time",
    "arr_time",
    "run_date",
    "general_seat_state",
    "special_seat_state",
)

_RESERVATION_KEYS = (
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


def _to_dict(obj: Any, keys: tuple[str, ...]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k in keys:
        if hasattr(obj, k):
            v = getattr(obj, k)
            try:
                json.dumps(v)
                out[k] = v
            except TypeError:
                out[k] = str(v)
    return out


def _normalize_time(t: str) -> str:
    digits = "".join(c for c in str(t) if c.isdigit())
    if len(digits) >= 6:
        return digits[:6]
    if len(digits) == 4:
        return digits + "00"
    return digits.ljust(6, "0")[:6]


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
            "hint": "ensure scripts/ktx_booking.py is deployed + korail2-ncard/pycryptodome in requirements.txt",
        }
    try:
        korail = PatchedKorail(korail_id, korail_pw, auto_login=False)
    except Exception as e:  # noqa: BLE001
        return None, {"ok": False, "stage": "init", "error": str(e)}

    server_reply: dict[str, Any] | None = None
    try:
        last = {"json": None}
        orig_post = korail._session.post

        def _capture(url, *args, **kwargs):
            r = orig_post(url, *args, **kwargs)
            if "Login" in url:
                try:
                    last["json"] = json.loads(r.text)
                except Exception:
                    last["json"] = {"raw": r.text[:400]}
            return r

        korail._session.post = _capture  # type: ignore[assignment]
        ok = korail.login()
        server_reply = last["json"]
    except Exception as e:  # noqa: BLE001
        return None, {
            "ok": False,
            "stage": "login",
            "error": f"login raised: {e}",
            "trace": traceback.format_exc(limit=2),
            "serverReply": server_reply,
        }

    if not ok:
        msg = "login returned falsy"
        if isinstance(server_reply, dict):
            cd = server_reply.get("h_msg_cd")
            txt = server_reply.get("h_msg_txt") or ""
            msg = f"login failed (h_msg_cd={cd}): {txt.splitlines()[0] if txt else ''}"
        return None, {"ok": False, "stage": "login", "error": msg, "serverReply": server_reply}

    return korail, None


def _process(body: dict[str, Any]) -> dict[str, Any]:
    required = ["depName", "arrName", "date", "time", "trainNo", "passengers", "seatType"]
    missing = [k for k in required if not body.get(k)]
    if missing:
        return {"ok": False, "stage": "input", "error": f"missing keys: {missing}"}

    env_live = os.environ.get("KORAIL_RESERVE_LIVE") == "1"
    live = env_live and bool(body.get("live"))

    korail, err = _login_or_error()
    if err is not None or korail is None:
        return err or {"ok": False, "stage": "login", "error": "unknown login failure"}

    try:
        trains = korail.search_train(
            body["depName"],
            body["arrName"],
            body["date"],
            _normalize_time(body["time"]),
            include_no_seats=True,
        )
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "stage": "search", "error": f"search_train failed: {e}"}

    target_no = str(body["trainNo"]).lstrip("0") or "0"
    candidates = []
    for t in trains:
        tn = str(getattr(t, "train_no", "")).lstrip("0") or "0"
        if tn == target_no:
            candidates.append(t)
    if not candidates:
        return {
            "ok": False,
            "stage": "match",
            "error": f"train {body['trainNo']} not in {len(trains)} search results",
            "candidates": [_to_dict(t, _TRAIN_KEYS) for t in trains[:5]],
        }

    train = candidates[0]
    train_dict = _to_dict(train, _TRAIN_KEYS)

    if not live:
        return {
            "ok": True,
            "stage": "dry-run",
            "mode": "dry",
            "train": train_dict,
            "liveAllowed": env_live,
            "effectiveLive": False,
            "requestedLive": bool(body.get("live")),
        }

    try:
        rsv = korail.reserve(
            train,
            passengers=_passengers(int(body["passengers"])),
            option=_seat_option(body["seatType"]),
        )
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "stage": "reserve",
            "error": f"reserve failed: {e}",
            "train": train_dict,
            "trace": traceback.format_exc(limit=2),
        }

    return {
        "ok": True,
        "stage": "reserved",
        "mode": "live",
        "liveAllowed": True,
        "effectiveLive": True,
        "requestedLive": True,
        "train": train_dict,
        "reservation": _to_dict(rsv, _RESERVATION_KEYS),
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
