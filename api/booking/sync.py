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

from _lib.creds import (  # type: ignore  # noqa: E402
    load_korail_creds,
    load_service_creds_all,
)


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


_KORAIL_MYTICKETLIST_URL = (
    "https://smart.letskorail.com/classes/com.korail.mobile.myTicket.MyTicketList"
)
_KORAIL_TICKET_SEAT_URL = (
    "https://smart.letskorail.com/classes/com.korail.mobile.refunds.SelTicketInfo"
)


def _fetch_my_tickets_with_seats(korail: Any) -> list[dict[str, Any]]:
    """Replicate `korail.tickets()` but keep the FULL `tk_seat_info` array
    per ticket. The upstream library only extracts the first seat, so a
    booking for 3 passengers reports just one seat number.

    Returns a list of dicts shaped:
        {
          trainNo, depDate, depTime, depCode, arrCode,
          carNo, price, buyerName,
          seats: [{carNo, seatNo}, ...],   # one entry per passenger
        }
    """
    list_data = {
        "Device": getattr(korail, "_device", ""),
        "Version": getattr(korail, "_version", ""),
        "Key": getattr(korail, "_key", ""),
        "txtIndex": "1",
        "h_page_no": "1",
        "txtDeviceId": "",
        "h_abrd_dt_from": "",
        "h_abrd_dt_to": "",
    }
    try:
        r = korail._session.get(_KORAIL_MYTICKETLIST_URL, params=list_data)
        j = json.loads(r.text)
    except Exception:  # noqa: BLE001
        return []
    if str(j.get("strResult", "")) != "SUCC":
        return []

    out: list[dict[str, Any]] = []
    for info in j.get("reservation_list", []) or []:
        ticket_list = info.get("ticket_list") or []
        if not ticket_list:
            continue
        train_info = ticket_list[0].get("train_info") or []
        if not train_info:
            continue
        ti = train_info[0]
        sale_wct = str(ti.get("h_orgtk_wct_no") or "")
        sale_dt = str(ti.get("h_orgtk_ret_sale_dt") or "")
        sale_sq = str(ti.get("h_orgtk_sale_sqno") or "")
        sale_pw = str(ti.get("h_orgtk_ret_pwd") or "")

        # Pull all seats via the per-ticket detail call.
        seat_data = {
            "Device": getattr(korail, "_device", ""),
            "Version": getattr(korail, "_version", ""),
            "Key": getattr(korail, "_key", ""),
            "h_orgtk_wct_no": sale_wct,
            "h_orgtk_ret_sale_dt": sale_dt,
            "h_orgtk_sale_sqno": sale_sq,
            "h_orgtk_ret_pwd": sale_pw,
        }
        seats: list[dict[str, Any]] = []
        try:
            sr = korail._session.get(_KORAIL_TICKET_SEAT_URL, params=seat_data)
            sj = json.loads(sr.text)
        except Exception:  # noqa: BLE001
            sj = {}
        # KORAIL's response can split a multi-pax booking either across
        # `ticket_info[]` entries (1 seat per entry) or within a single
        # entry's `tk_seat_info[]` array. Iterate BOTH dimensions to
        # capture every seat regardless of layout.
        ticket_infos = (sj.get("ticket_infos") or {}).get("ticket_info") or []
        seen_seats: set[tuple[str, str]] = set()
        for ti_entry in ticket_infos:
            inner = ti_entry.get("tk_seat_info") or []
            if not inner:
                # Fallback: some legacy responses put seat fields directly
                # on the ticket_info entry rather than in tk_seat_info.
                inner = [ti_entry]
            for s in inner:
                car = str(
                    s.get("h_srcar_no")
                    or ti_entry.get("h_srcar_no")
                    or ti.get("h_srcar_no")
                    or ""
                )
                seat_no = str(s.get("h_seat_no") or "")
                if not seat_no:
                    continue
                key = (car, seat_no)
                if key in seen_seats:
                    continue
                seen_seats.add(key)
                seats.append({"carNo": car, "seatNo": seat_no})

        out.append({
            "trainNo": str(ti.get("h_trn_no") or ""),
            "depDate": str(ti.get("h_dpt_dt") or ""),
            "depTime": str(ti.get("h_dpt_tm") or ""),
            "depCode": str(ti.get("h_dpt_rs_stn_cd") or ""),
            "arrCode": str(ti.get("h_arv_rs_stn_cd") or ""),
            "carNo": str(ti.get("h_srcar_no") or ""),
            "price": int(str(ti.get("h_rcvd_amt") or "0") or "0"),
            "buyerName": str(ti.get("h_buy_ps_nm") or ""),
            "seats": seats,
            # Raw seat-detail payload — only kept for debugging via the
            # `debug: true` body flag. Consumers should ignore.
            "_rawSeatInfo": sj.get("ticket_infos"),
        })
    return out


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


def _sync_srt(srt_ids: list[str]) -> dict[str, Any] | None:
    """Reconcile SRT reservation IDs against SR's live list.

    SRT keeps a reservation visible in `get_reservations()` even after
    payment (with a `.paid` flag), so classification is simpler than
    KORAIL:
      • present + paid     → ticketed (seats from the reservation)
      • present + unpaid   → active (still pending payment)
      • absent             → cancelled (user-cancelled or deadline expired)

    A reservation belongs to exactly one SRT account, and `reserve.py`
    retries across every enabled account — so we MUST query them ALL
    and union the results, otherwise a reservation made on account #2
    looks "absent" when we only checked account #1 → false cancel.

    Returns None when SRT can't be verified at all (no account, library
    missing, every account failed to log in). The caller then leaves
    those IDs UNTOUCHED. If only SOME accounts fail, IDs that aren't
    found are also left untouched (not cancelled) — we can only declare
    a reservation cancelled when every account was successfully checked.
    """
    accounts = load_service_creds_all("srt")
    if not accounts:
        return None
    try:
        from SRT import SRT  # type: ignore
    except Exception:  # noqa: BLE001
        return None

    rsvs: list[Any] = []
    ok_count = 0
    for srt_id, srt_pw in accounts:
        try:
            srt = SRT(srt_id, srt_pw, auto_login=False)
            srt.login()
            acct_rsvs = srt.get_reservations(paid_only=False)
        except Exception:  # noqa: BLE001
            continue
        ok_count += 1
        rsvs.extend(acct_rsvs or [])
    if ok_count == 0:
        # Every SRT account failed — can't verify anything.
        return None
    # Only trust an "absent → cancelled" verdict when EVERY account was
    # reachable; a partial check could miss a reservation on a down one.
    checked_all = ok_count == len(accounts)

    by_id: dict[str, dict[str, Any]] = {}
    for r in rsvs:
        rid = str(getattr(r, "reservation_number", "") or "").strip()
        if not rid:
            continue
        seats: list[dict[str, Any]] = []
        for tk in getattr(r, "tickets", None) or []:
            car = str(getattr(tk, "car", "") or "")
            seat = str(getattr(tk, "seat", "") or "")
            if seat:
                seats.append({"carNo": car, "seatNo": seat})
        by_id[rid] = {
            "paid": bool(getattr(r, "paid", False)),
            "seats": seats,
            "trainNo": str(getattr(r, "train_number", "") or ""),
            "depDate": str(getattr(r, "dep_date", "") or ""),
            "depTime": str(getattr(r, "dep_time", "") or ""),
        }

    active: list[str] = []
    cancelled: list[str] = []
    ticketed: list[dict[str, Any]] = []
    for rid in srt_ids:
        info = by_id.get(rid)
        if info is None:
            # Absent — only flag cancelled when every account was checked.
            if checked_all:
                cancelled.append(rid)
        elif info["paid"]:
            seats = info["seats"]
            first = seats[0] if seats else {}
            ticketed.append({
                "rsvId": rid,
                "carNo": first.get("carNo") or None,
                "seatNo": first.get("seatNo") or None,
                "seatNoEnd": None,
                "seats": seats,
                "trainNo": info["trainNo"],
                "depDate": info["depDate"],
                "depTime": info["depTime"],
            })
        else:
            active.append(rid)
    return {
        "active": active,
        "cancelled": cancelled,
        "ticketed": ticketed,
        "totalReservations": len(rsvs),
        # Diagnostics — surfaced only when the request sets `debug: true`.
        "_debug": {
            "requestedIds": list(srt_ids),
            "foundIds": list(by_id.keys()),
            "accountsTotal": len(accounts),
            "accountsOk": ok_count,
            "checkedAll": checked_all,
        },
    }


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

    # Split IDs by operator. A matcher with service="srt" routes to SR;
    # everything else (or no matcher) defaults to KORAIL.
    def _service_of(rid: str) -> str:
        m = matchers.get(rid)
        s = str((m or {}).get("service") or "").lower()
        return "srt" if s == "srt" else "korail"

    korail_ids = [r for r in rsv_ids if _service_of(r) == "korail"]
    srt_ids = [r for r in rsv_ids if _service_of(r) == "srt"]

    active: list[str] = []
    cancelled: list[str] = []
    ticketed: list[dict[str, Any]] = []
    total_active = 0
    total_tickets = 0
    tickets_with_seats: list[dict[str, Any]] = []

    # ── SRT branch — verified separately; unverifiable IDs left untouched.
    srt_debug: dict[str, Any] | None = None
    if srt_ids:
        srt_result = _sync_srt(srt_ids)
        if srt_result is not None:
            active += srt_result["active"]
            cancelled += srt_result["cancelled"]
            ticketed += srt_result["ticketed"]
            srt_debug = srt_result.get("_debug")
        else:
            srt_debug = {"unverifiable": True}

    # ── KORAIL branch
    if not korail_ids:
        out: dict[str, Any] = {
            "ok": True,
            "active": active,
            "cancelled": cancelled,
            "ticketed": ticketed,
            "totalActive": total_active,
            "totalTickets": total_tickets,
        }
        if body.get("debug"):
            out["_debugSrt"] = srt_debug
        return out

    korail, err = _login_or_error()
    if err is not None or korail is None:
        return err or {"ok": False, "stage": "login", "error": "unknown login failure"}

    # ── reservations()
    try:
        reservations = korail.reservations()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "stage": "list", "error": str(e)}
    total_active = len(reservations)

    active_set: set[str] = set()
    for r in reservations:
        for attr in ("rsv_id", "rsv_no"):
            v = str(getattr(r, attr, "") or "").strip()
            if v:
                active_set.add(v)

    active += [x for x in korail_ids if x in active_set]
    disappeared = [x for x in korail_ids if x not in active_set]

    # ── tickets — only if any rsvId disappeared AND we have matchers.
    #
    # The upstream library's `korail.tickets()` only extracts
    # `tk_seat_info[0]` per ticket, losing per-passenger seats for
    # multi-pax bookings. We do the two underlying calls ourselves and
    # keep the full `tk_seat_info[]` array.
    #
    # NOTE: `ticketed` / `cancelled` / `total_tickets` / `tickets_with_seats`
    # are the SHARED lists declared above — KORAIL results are appended so
    # any SRT results merged earlier are preserved.
    if disappeared and matchers:
        try:
            tickets_with_seats = _fetch_my_tickets_with_seats(korail)
        except Exception:  # noqa: BLE001
            tickets_with_seats = []
        total_tickets = len(tickets_with_seats)
        # KORAIL splits multi-pax bookings into one `reservation_list`
        # entry PER PASSENGER — same train/date/time, different seat.
        # Aggregate by (train, date, time) so all seats are collected.
        by_key: dict[tuple[str, str, str], dict[str, Any]] = {}
        for t in tickets_with_seats:
            key = _ticket_key(t.get("trainNo"), t.get("depDate"), t.get("depTime"))
            if key in by_key:
                existing = by_key[key]
                existing_seats: list[dict[str, Any]] = existing.get("seats") or []
                seen_pairs = {
                    (s.get("carNo"), s.get("seatNo")) for s in existing_seats
                }
                for s in t.get("seats") or []:
                    sig = (s.get("carNo"), s.get("seatNo"))
                    if sig not in seen_pairs:
                        existing_seats.append(s)
                        seen_pairs.add(sig)
                existing["seats"] = existing_seats
            else:
                # Shallow copy so we don't mutate the original list element.
                by_key[key] = {**t, "seats": list(t.get("seats") or [])}

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
            seats = t.get("seats") or []
            first = seats[0] if seats else {}
            entry: dict[str, Any] = {
                "rsvId": rid,
                "carNo": first.get("carNo") or t.get("carNo") or None,
                "seatNo": first.get("seatNo") or None,
                "seatNoEnd": None,  # library doesn't fill this reliably
                "seats": seats,
                "trainNo": t.get("trainNo", ""),
                "depDate": t.get("depDate", ""),
                "depTime": t.get("depTime", ""),
                "price": t.get("price", 0),
                "buyerName": t.get("buyerName", ""),
            }
            if body.get("debug"):
                # Expose the raw KORAIL seat payload so the client can
                # inspect why per-pax seats aren't being captured.
                entry["_rawSeatInfo"] = t.get("_rawSeatInfo")
            ticketed.append(entry)
    else:
        # No matchers → can't distinguish ticketed from cancelled. Be
        # conservative and report everything as cancelled (legacy behaviour).
        cancelled += list(disappeared)

    response: dict[str, Any] = {
        "ok": True,
        "active": active,
        "cancelled": cancelled,
        "ticketed": ticketed,
        "totalActive": total_active,
        "totalTickets": total_tickets,
    }
    if body.get("debug"):
        response["_debugSrt"] = srt_debug
        # Surface the matcher key vs. every fetched ticket so we can see
        # why nothing matched (leading zeros, time format mismatch, …).
        response["_debugMatchers"] = [
            {
                "rsvId": rid,
                "key": list(
                    _ticket_key(m.get("trainNo"), m.get("depDate"), m.get("depTime"))
                ),
            }
            for rid, m in matchers.items()
        ]
        response["_debugTickets"] = [
            {
                "trainNo": t.get("trainNo"),
                "depDate": t.get("depDate"),
                "depTime": t.get("depTime"),
                "key": list(
                    _ticket_key(t.get("trainNo"), t.get("depDate"), t.get("depTime"))
                ),
                "seats": t.get("seats"),
                "carNo": t.get("carNo"),
                "buyerName": t.get("buyerName"),
            }
            for t in (tickets_with_seats if disappeared and matchers else [])
        ]
    return response


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
