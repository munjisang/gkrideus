#!/usr/bin/env python3
"""
Korail helper for the PoC admin actions.

Reads a single JSON payload on stdin and dispatches by `action`:

  * action: "reserve" (default)
      1. Logs into Korail with KORAIL_ID / KORAIL_PASSWORD env.
      2. Calls Korail.search_train(dep, arr, date, time).
      3. Picks the train matching the payload's train_no.
      4. If KORAIL_RESERVE_LIVE=1 → korail.reserve(...). Otherwise dry-run.

  * action: "cancel"
      1. Logs in.
      2. Fetches reservations(), matches payload.rsv_id (or rsv_no).
      3. Calls korail.cancel(reservation).

Prints a single-line JSON result. Exits 0 on success, non-zero on failure.

Designed to be invoked from a Next.js API route via child_process.spawn so the
Korail credentials never reach the browser.
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from typing import Any


def _fail(stage: str, message: str, **extra: Any) -> None:
    payload = {"ok": False, "stage": stage, "error": message, **extra}
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(1)


def _read_payload() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        _fail("input", "empty stdin payload")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        _fail("input", f"invalid JSON: {e}")
    if not isinstance(data, dict):
        _fail("input", "payload must be a JSON object")
    return data


def _require_keys(p: dict[str, Any], keys: list[str]) -> None:
    missing = [k for k in keys if not p.get(k)]
    if missing:
        _fail("input", f"missing keys: {missing}")


def _seat_option(seat_type: str):
    from korail2 import ReserveOption  # type: ignore

    if seat_type == "first":
        return ReserveOption.SPECIAL_ONLY
    return ReserveOption.GENERAL_ONLY


def _passengers(count: int):
    from korail2 import AdultPassenger  # type: ignore

    return [AdultPassenger(count)]


def _train_to_dict(t: Any) -> dict[str, Any]:
    keys = (
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
    out: dict[str, Any] = {}
    for k in keys:
        if hasattr(t, k):
            v = getattr(t, k)
            try:
                json.dumps(v)
                out[k] = v
            except TypeError:
                out[k] = str(v)
    return out


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


def _login_or_die():
    korail_id = os.environ.get("KORAIL_ID")
    korail_pw = os.environ.get("KORAIL_PASSWORD")
    if not korail_id or not korail_pw:
        _fail("env", "KORAIL_ID / KORAIL_PASSWORD not set in server env")

    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from ktx_booking import PatchedKorail  # type: ignore
    except Exception as e:  # noqa: BLE001
        _fail(
            "import",
            f"PatchedKorail not importable: {e}",
            hint="ensure scripts/ktx_booking.py exists and `pip install korail2-ncard pycryptodome` is done",
        )

    try:
        korail = PatchedKorail(korail_id, korail_pw, auto_login=False)
    except Exception as e:  # noqa: BLE001
        _fail("init", f"PatchedKorail() init failed: {e}")

    server_reply: dict[str, Any] | None = None
    try:
        last = {"json": None}
        orig_post = korail._session.post

        def _capture_post(url, *args, **kwargs):
            r = orig_post(url, *args, **kwargs)
            if "Login" in url:
                try:
                    last["json"] = json.loads(r.text)
                except Exception:
                    last["json"] = {"raw": r.text[:400]}
            return r

        korail._session.post = _capture_post  # type: ignore[assignment]
        ok = korail.login()
        server_reply = last["json"]
    except Exception as e:  # noqa: BLE001
        _fail("login", f"login raised: {e}", trace=traceback.format_exc(limit=2), serverReply=server_reply)

    if not ok:
        msg = "login returned falsy"
        if server_reply and isinstance(server_reply, dict):
            cd = server_reply.get("h_msg_cd")
            txt = server_reply.get("h_msg_txt") or ""
            msg = f"login failed (h_msg_cd={cd}): {txt.splitlines()[0] if txt else ''}"
        _fail("login", msg, serverReply=server_reply)

    return korail


# ───────────────────────────────────────────────────── reserve action

def action_reserve(p: dict[str, Any]) -> None:
    _require_keys(p, ["dep_name", "arr_name", "date", "time", "train_no", "passengers", "seat_type"])

    live = os.environ.get("KORAIL_RESERVE_LIVE") == "1" and bool(p.get("live"))

    if not os.environ.get("KORAIL_ID") or not os.environ.get("KORAIL_PASSWORD"):
        if p.get("dryShapeCheck"):
            print(json.dumps({"ok": True, "stage": "shape", "payload": p}, ensure_ascii=False))
            return

    korail = _login_or_die()

    try:
        trains = korail.search_train(
            p["dep_name"],
            p["arr_name"],
            p["date"],
            p["time"],
            include_no_seats=True,
        )
    except Exception as e:  # noqa: BLE001
        _fail("search", f"search_train failed: {e}")

    target_no = str(p["train_no"]).lstrip("0") or "0"
    candidates = []
    for t in trains:
        tn = str(getattr(t, "train_no", "")).lstrip("0") or "0"
        if tn == target_no:
            candidates.append(t)
    if not candidates:
        _fail(
            "match",
            f"train {p['train_no']} not in {len(trains)} search results",
            candidates=[_train_to_dict(t) for t in trains[:5]],
        )

    train = candidates[0]
    train_dict = _train_to_dict(train)

    if not live:
        print(json.dumps({"ok": True, "stage": "dry-run", "mode": "dry", "train": train_dict}, ensure_ascii=False))
        return

    try:
        rsv = korail.reserve(
            train,
            passengers=_passengers(int(p["passengers"])),
            option=_seat_option(p["seat_type"]),
        )
    except Exception as e:  # noqa: BLE001
        _fail("reserve", f"reserve failed: {e}", train=train_dict, trace=traceback.format_exc(limit=2))

    print(
        json.dumps(
            {
                "ok": True,
                "stage": "reserved",
                "mode": "live",
                "train": train_dict,
                "reservation": _reservation_to_dict(rsv),
            },
            ensure_ascii=False,
        )
    )


# ───────────────────────────────────────────────────── cancel action

def action_cancel(p: dict[str, Any]) -> None:
    rsv_id = str(p.get("rsv_id") or p.get("rsv_no") or "").strip()
    if not rsv_id:
        _fail("input", "missing rsv_id (or rsv_no)")

    korail = _login_or_die()

    try:
        reservations = korail.reservations()
    except Exception as e:  # noqa: BLE001
        _fail("list", f"reservations() failed: {e}", trace=traceback.format_exc(limit=2))

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
        _fail(
            "match",
            f"reservation {rsv_id} not found in {len(reservations)} active reservations",
            candidates=candidates,
        )

    try:
        korail.cancel(target)
    except Exception as e:  # noqa: BLE001
        _fail("cancel", f"cancel failed: {e}", trace=traceback.format_exc(limit=2))

    print(
        json.dumps(
            {
                "ok": True,
                "stage": "cancelled",
                "rsv_id": rsv_id,
                "reservation": _reservation_to_dict(target),
            },
            ensure_ascii=False,
        )
    )


# ───────────────────────────────────────────────────── dispatch

def main() -> None:
    p = _read_payload()
    action = p.get("action", "reserve")
    if action == "reserve":
        action_reserve(p)
    elif action == "cancel":
        action_cancel(p)
    else:
        _fail("input", f"unknown action: {action}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        _fail("crash", str(e), trace=traceback.format_exc(limit=3))
