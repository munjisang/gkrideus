"""
Vercel Python serverless function — POST /api/booking/availability

Body: { depName, arrName, date, time }
Returns:
  {
    ok: true,
    trains: [
      { trainNo, trainType, generalSeatState, specialSeatState }, ...
    ]
  }

Looks up KORAIL's live seat state (general_seat_state / special_seat_state)
for every train on the requested route, so the front-end can overlay
"매진 / 예약가능" badges on the TAGO-priced result cards.
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


def _normalize_time(t: str) -> str:
    digits = "".join(c for c in str(t) if c.isdigit())
    if len(digits) >= 6:
        return digits[:6]
    if len(digits) == 4:
        return digits + "00"
    return digits.ljust(6, "0")[:6]


def _process(body: dict[str, Any]) -> dict[str, Any]:
    required = ["depName", "arrName", "date", "time"]
    missing = [k for k in required if not body.get(k)]
    if missing:
        return {"ok": False, "stage": "input", "error": f"missing keys: {missing}"}

    korail, err = _login_or_error()
    if err is not None or korail is None:
        return err or {"ok": False, "stage": "login", "error": "unknown login failure"}

    # _allday returns the FULL day's timetable; plain search_train only
    # returns the first ~8 trains from the given time, which means trains
    # later in the morning were missed and showed as "available" by default.
    try:
        trains = korail.search_train_allday(
            body["depName"],
            body["arrName"],
            body["date"],
            _normalize_time(body["time"]),
            include_no_seats=True,
        )
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "stage": "search", "error": str(e)}

    out: list[dict[str, Any]] = []
    for t in trains:
        train_no = str(getattr(t, "train_no", "") or "")
        if not train_no:
            continue
        out.append(
            {
                "trainNo": train_no,
                "trainType": str(getattr(t, "train_type", "") or ""),
                "trainTypeName": str(getattr(t, "train_type_name", "") or ""),
                # korail2-ncard 0.1.0 exposes these without the "_state" suffix.
                # Common codes: "00"=해당없음, "11"=예약가능, "12"=매진,
                #               "13"=좌석선택, "14"=예약대기, "15"=입석
                "generalSeat": str(getattr(t, "general_seat", "") or ""),
                "specialSeat": str(getattr(t, "special_seat", "") or ""),
                "reservePossible": str(getattr(t, "reserve_possible", "") or ""),
                # Human-readable string from Korail; for available trains often
                # contains the discounted fare (e.g. "59,800원\n5%적립").
                "reservePossibleName": str(
                    getattr(t, "reserve_possible_name", "") or ""
                ),
            }
        )

    return {"ok": True, "count": len(out), "trains": out}


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
