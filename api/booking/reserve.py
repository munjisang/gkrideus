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


def _seat_option(seat_type: str):
    from korail2 import ReserveOption  # type: ignore

    if seat_type == "first":
        return ReserveOption.SPECIAL_ONLY
    return ReserveOption.GENERAL_ONLY


def _passengers(count: int, breakdown: dict[str, Any] | None):
    """Build a typed korail2 passenger list from the age breakdown.

    Falls back to a single AdultPassenger(count) when no breakdown is given.
    """
    from korail2 import AdultPassenger  # type: ignore

    if not breakdown:
        return [AdultPassenger(count)]

    adults = int(breakdown.get("adults") or 0)
    children = int(breakdown.get("children") or 0)
    toddlers = int(breakdown.get("toddlers") or 0)
    seniors = int(breakdown.get("seniors") or 0)

    ps: list[Any] = []
    if adults:
        ps.append(AdultPassenger(adults))
    if children:
        try:
            from korail2 import ChildPassenger  # type: ignore

            ps.append(ChildPassenger(children))
        except Exception:  # noqa: BLE001
            ps.append(AdultPassenger(children))
    if seniors:
        try:
            from korail2 import SeniorPassenger  # type: ignore

            ps.append(SeniorPassenger(seniors))
        except Exception:  # noqa: BLE001
            ps.append(AdultPassenger(seniors))
    if toddlers:
        try:
            from korail2 import ToddlerPassenger  # type: ignore

            ps.append(ToddlerPassenger(toddlers))
        except Exception:  # noqa: BLE001
            # Toddlers are typically free / no seat — skip if unsupported.
            pass

    if not ps:
        ps = [AdultPassenger(max(1, count))]
    return ps


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


# ─────────────────────────────────────────────── SRT support
#
# SRT runs on a separate operator (SR, etk.srail.kr) with its own
# `SRTrain` library. The API shape mirrors korail2 closely enough that
# we can branch inside _process and reuse the same retry loop.


def _srt_passengers(count: int, breakdown: dict[str, Any] | None):
    """Build an SRT passenger list. SRTrain has Adult / Child / Senior
    (no Toddler — under-6 ride free without a seat, so they're omitted)."""
    from SRT import Adult, Child, Senior  # type: ignore

    if not breakdown:
        return [Adult(max(1, count))]
    adults = int(breakdown.get("adults") or 0)
    children = int(breakdown.get("children") or 0)
    seniors = int(breakdown.get("seniors") or 0)
    ps: list[Any] = []
    if adults:
        ps.append(Adult(adults))
    if children:
        ps.append(Child(children))
    if seniors:
        ps.append(Senior(seniors))
    if not ps:
        ps = [Adult(max(1, count))]
    return ps


def _srt_seat_type(seat_type: str):
    from SRT import SeatType  # type: ignore

    # *_FIRST means "prefer that class, fall back if full".
    return SeatType.SPECIAL_FIRST if seat_type == "first" else SeatType.GENERAL_FIRST


def _srt_reservation_to_dict(rsv: Any) -> dict[str, Any]:
    """Map an SRTReservation onto the same reservation dict shape the
    front-end's buildReservation() already parses (rsv_id, buy_limit_*,
    price …) so the client needs no SRT-specific branch."""

    def _int(v: Any) -> int:
        try:
            return int(str(v).strip() or "0")
        except (TypeError, ValueError):
            return 0

    return {
        "rsv_id": str(getattr(rsv, "reservation_number", "") or ""),
        "buy_limit_date": str(getattr(rsv, "payment_date", "") or ""),
        "buy_limit_time": str(getattr(rsv, "payment_time", "") or ""),
        "price": _int(getattr(rsv, "total_cost", 0)),
        "seat_no_count": _int(getattr(rsv, "seat_count", 0)),
        "train_type_name": str(getattr(rsv, "train_name", "SRT") or "SRT"),
        "dep_name": str(getattr(rsv, "dep_station_name", "") or ""),
        "arr_name": str(getattr(rsv, "arr_station_name", "") or ""),
        "dep_date": str(getattr(rsv, "dep_date", "") or ""),
        "dep_time": str(getattr(rsv, "dep_time", "") or ""),
        "arr_time": str(getattr(rsv, "arr_time", "") or ""),
    }


def _attempt_with_account_srt(
    body: dict[str, Any],
    srt_id: str,
    srt_pw: str,
    live: bool,
    env_live: bool,
) -> dict[str, Any]:
    """One full SRT search + reserve flow with a single account.
    Returns the same response shape as the Korail attempt function."""
    try:
        from SRT import SRT  # type: ignore
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "stage": "import",
            "error": f"SRT library not importable: {e}",
            "hint": "ensure SRTrain is in requirements.txt",
        }
    try:
        srt = SRT(srt_id, srt_pw, auto_login=False)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "stage": "init", "error": str(e)}
    try:
        srt.login()
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "stage": "login",
            "error": f"SRT login failed: {e}",
            "trace": traceback.format_exc(limit=2),
        }

    try:
        trains = srt.search_train(
            body["depName"],
            body["arrName"],
            body["date"],
            _normalize_time(body["time"]),
            available_only=False,
        )
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "stage": "search", "error": f"SRT search_train failed: {e}"}

    target_no = str(body["trainNo"]).lstrip("0") or "0"
    candidates = [
        t
        for t in trains
        if (str(getattr(t, "train_number", "")).lstrip("0") or "0") == target_no
    ]
    if not candidates:
        return {
            "ok": False,
            "stage": "match",
            "error": f"SRT train {body['trainNo']} not in {len(trains)} search results",
        }
    train = candidates[0]
    train_dict = {
        "train_no": str(getattr(train, "train_number", "")),
        "train_type_name": str(getattr(train, "train_name", "SRT")),
        "dep_name": str(getattr(train, "dep_station_name", "")),
        "arr_name": str(getattr(train, "arr_station_name", "")),
        "dep_date": str(getattr(train, "dep_date", "")),
        "dep_time": str(getattr(train, "dep_time", "")),
        "arr_time": str(getattr(train, "arr_time", "")),
        "general_seat_state": str(getattr(train, "general_seat_state", "")),
        "special_seat_state": str(getattr(train, "special_seat_state", "")),
    }

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
        rsv = srt.reserve(
            train,
            passengers=_srt_passengers(int(body["passengers"]), body.get("paxBreakdown")),
            special_seat=_srt_seat_type(body["seatType"]),
        )
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "stage": "reserve",
            "error": f"SRT reserve failed: {e}",
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
        "reservation": _srt_reservation_to_dict(rsv),
    }


def _resolve_service(body: dict[str, Any]) -> str:
    """korail vs srt — explicit `service` wins, else inferred from the
    train grade name the front-end sends."""
    explicit = str(body.get("service") or "").lower()
    if explicit in ("korail", "srt"):
        return explicit
    grade = str(body.get("trainGradeName") or "").upper()
    return "srt" if grade.startswith("SRT") else "korail"


def _login_or_error(
    korail_id: str | None = None, korail_pw: str | None = None
) -> tuple[Any | None, dict[str, Any] | None]:
    # When explicit creds aren't passed, fall back to the legacy single-
    # account lookup (env / first-enabled DB row). The retry loop in
    # _process passes creds for each attempt explicitly.
    if not korail_id or not korail_pw:
        korail_id, korail_pw = load_korail_creds()
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

    try:
        from korail_tls import apply_legacy_tls  # type: ignore

        apply_legacy_tls(korail._session)
    except Exception:  # noqa: BLE001
        pass

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


"""Stages where retrying with another account can't possibly help —
   input errors are deterministic, match failures hit the same train
   list regardless of who's logged in, and the dry-run path doesn't
   even touch Korail credentials beyond login."""
_NON_RETRY_STAGES = {"input", "import", "match", "dry-run"}


def _attempt_with_account(
    body: dict[str, Any],
    korail_id: str,
    korail_pw: str,
    live: bool,
    env_live: bool,
) -> dict[str, Any]:
    """Run the full search + reserve flow with one specific account."""
    korail, err = _login_or_error(korail_id, korail_pw)
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
            passengers=_passengers(int(body["passengers"]), body.get("paxBreakdown")),
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


def _process(body: dict[str, Any]) -> dict[str, Any]:
    required = ["depName", "arrName", "date", "time", "trainNo", "passengers", "seatType"]
    missing = [k for k in required if not body.get(k)]
    if missing:
        return {"ok": False, "stage": "input", "error": f"missing keys: {missing}"}

    env_live = os.environ.get("KORAIL_RESERVE_LIVE") == "1"
    live = env_live and bool(body.get("live"))

    # Route to the right operator. SRT trains go through the SRTrain
    # library; everything else (KTX family) through korail2.
    service = _resolve_service(body)
    attempt_fn = (
        _attempt_with_account_srt if service == "srt" else _attempt_with_account
    )
    service_ko = "SRT" if service == "srt" else "코레일"

    accounts = load_service_creds_all(service)
    if not accounts:
        return {
            "ok": False,
            "stage": "env",
            "error": f"{service_ko} 계정이 설정되어 있지 않습니다.",
            "service": service,
        }

    attempts: list[dict[str, Any]] = []
    for idx, (aid, pw) in enumerate(accounts):
        result = attempt_fn(body, aid, pw, live, env_live)
        # Successful (live reservation or dry-run) → return immediately.
        if result.get("ok"):
            result["accountIndex"] = idx
            result["accountId"] = aid
            result["accountTried"] = idx + 1
            result["service"] = service
            if attempts:
                # Surface prior failures so the admin can see which
                # accounts were retried before success.
                result["priorAttempts"] = attempts
            return result
        # Track this failure.
        attempts.append({
            "accountIndex": idx,
            "accountId": aid,
            "stage": result.get("stage"),
            "error": result.get("error"),
        })
        # Deterministic failure → no point retrying with other accounts.
        if result.get("stage") in _NON_RETRY_STAGES:
            result["attempts"] = attempts
            result["accountId"] = aid
            return result

    # Every enabled account failed in a retry-able way.
    last = attempts[-1] if attempts else {"stage": "unknown", "error": "no attempts"}
    return {
        "ok": False,
        "stage": "all-accounts-failed",
        "error": f"등록된 {len(accounts)}개 계정 모두 예매 실패 — 마지막: {last.get('error')}",
        "lastStage": last.get("stage"),
        "lastError": last.get("error"),
        "attempts": attempts,
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
