"""
Vercel Python serverless function — POST /api/booking/sync

Input:
  {
    "rsvIds": ["..."],                  # required (legacy)
    "matchers": [                       # optional — enables ticket lookup
      { "rsvId": "...", "trainNo": "001",
        "depDate": "20260530", "depTime": "0548" },
      ...
    ]
  }

Compares each `rsvId` against Korail's live reservation list. For ids that
have disappeared we consult `korail.tickets()` and try to match a real
issued ticket by `(train_no, dep_date, dep_time)` — if a match is found
the id is reported as `ticketed` with `carNo` / `seatNo`. Otherwise the id
is reported as `cancelled` (user-cancelled, expired, etc.).

Output:
  {
    ok: true,
    active:    ["..."],
    ticketed:  [{rsvId, carNo, seatNo, seatNoEnd, trainNo, depDate, depTime}],
    cancelled: ["..."],
    totalActive: N,
    totalTickets: N
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
for path in (
    os.path.join(_REPO_ROOT, "scripts"),
    os.path.join(_REPO_ROOT, "api"),
    _REPO_ROOT,
):
    if path not in sys.path:
        sys.path.insert(0, path)

from _lib.creds import load_korail_creds  # type: ignore  # noqa: E402


def _login_or_error() -> tuple[Any | None, dict[str, Any] | None]:
    korail_id, korail_pw = load_korail_creds()
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


def _norm_train_no(v: Any) -> str:
    """Strip leading zeros so '001' == '1' across our DB and Korail."""
    s = str(v or "").strip()
    s = s.lstrip("0")
    return s or "0"


def _norm_time(v: Any) -> str:
    """Keep HHMM only — Korail returns HHMMSS for tickets and HHMM for our matchers."""
    s = "".join(c for c in str(v or "") if c.isdigit())
    return s[:4]


def _ticket_key(train_no: Any, dep_date: Any, dep_time: Any) -> tuple[str, str, str]:
    return (_norm_train_no(train_no), str(dep_date or "").strip(), _norm_time(dep_time))


def _process(body: dict[str, Any]) -> dict[str, Any]:
    raw_ids = body.get("rsvIds", [])
    if not isinstance(raw_ids, list):
        return {"ok": False, "stage": "input", "error": "rsvIds must be a list"}
    rsv_ids = [str(x).strip() for x in raw_ids if str(x).strip()]

    matchers_raw = body.get("matchers") or []
    if not isinstance(matchers_raw, list):
        return {"ok": False, "stage": "input", "error": "matchers must be a list"}
    # Index matchers by rsvId for quick lookup later.
    matchers: dict[str, dict[str, Any]] = {}
    for m in matchers_raw:
        if not isinstance(m, dict):
            continue
        rid = str(m.get("rsvId") or "").strip()
        if not rid:
            continue
        matchers[rid] = m

    if not rsv_ids:
        return {
            "ok": True,
            "active": [],
            "cancelled": [],
            "ticketed": [],
            "totalActive": 0,
            "totalTickets": 0,
        }

    korail, err = _login_or_error()
    if err is not None or korail is None:
        return err or {"ok": False, "stage": "login", "error": "unknown login failure"}

    # ── reservations()
    try:
        reservations = korail.reservations()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "stage": "list", "error": str(e)}

    active_set: set[str] = set()
    for r in reservations:
        for attr in ("rsv_id", "rsv_no"):
            v = str(getattr(r, attr, "") or "").strip()
            if v:
                active_set.add(v)

    active = [x for x in rsv_ids if x in active_set]
    disappeared = [x for x in rsv_ids if x not in active_set]

    # ── tickets() — only if any rsvId disappeared AND we have matchers
    ticketed: list[dict[str, Any]] = []
    cancelled: list[str] = []
    total_tickets = 0
    if disappeared and matchers:
        try:
            tickets = korail.tickets()
        except Exception:  # noqa: BLE001
            tickets = []
        total_tickets = len(tickets)
        # Build ticket index by (train_no, dep_date, dep_time HHMM).
        by_key: dict[tuple[str, str, str], Any] = {}
        for t in tickets:
            key = _ticket_key(
                getattr(t, "train_no", ""),
                getattr(t, "dep_date", ""),
                getattr(t, "dep_time", ""),
            )
            # First-wins is fine — same key shouldn't appear twice.
            by_key.setdefault(key, t)

        for rid in disappeared:
            m = matchers.get(rid)
            if not m:
                cancelled.append(rid)
                continue
            key = _ticket_key(m.get("trainNo"), m.get("depDate"), m.get("depTime"))
            t = by_key.get(key)
            if t is None:
                cancelled.append(rid)
                continue
            ticketed.append({
                "rsvId": rid,
                "carNo": str(getattr(t, "car_no", "") or "") or None,
                "seatNo": str(getattr(t, "seat_no", "") or "") or None,
                "seatNoEnd": str(getattr(t, "seat_no_end", "") or "") or None,
                "trainNo": str(getattr(t, "train_no", "") or ""),
                "depDate": str(getattr(t, "dep_date", "") or ""),
                "depTime": str(getattr(t, "dep_time", "") or ""),
                "price": int(getattr(t, "price", 0) or 0),
                "buyerName": str(getattr(t, "buyer_name", "") or ""),
            })
    else:
        # No matchers → can't distinguish ticketed from cancelled. Be
        # conservative and report everything as cancelled (legacy behaviour).
        cancelled = list(disappeared)

    return {
        "ok": True,
        "active": active,
        "cancelled": cancelled,
        "ticketed": ticketed,
        "totalActive": len(reservations),
        "totalTickets": total_tickets,
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
