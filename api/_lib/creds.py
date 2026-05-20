"""
Korail / SRT credential loader used by every Python serverless endpoint.

Resolution order (per service):
  1) public.service_accounts row where service=<s> and enabled=true
     (newest first by updated_at) — preferred, managed via admin UI.
  2) public.korail_credentials legacy row (only for service='korail').
  3) KORAIL_ID / KORAIL_PASSWORD env vars (bootstrap / local dev).

Reads use the Supabase service_role key (server-only env var). Both
credential tables have RLS denying anon access, so the service_role
bypass is the only valid path.
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
import urllib.error
from typing import Tuple


def _supabase_env() -> tuple[str | None, str | None]:
    base = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    return (base.rstrip("/") if base else None), key


def _supabase_get(path: str) -> list[dict] | None:
    base, key = _supabase_env()
    if not base or not key:
        return None
    req = urllib.request.Request(
        f"{base}{path}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, json.JSONDecodeError):
        return None
    return data if isinstance(data, list) else None


def _from_service_accounts(service: str) -> Tuple[str | None, str | None]:
    qs = urllib.parse.urlencode(
        {
            "service": f"eq.{service}",
            "enabled": "eq.true",
            "select": "account_id,account_password,updated_at",
            "order": "updated_at.desc",
            "limit": "1",
        }
    )
    rows = _supabase_get(f"/rest/v1/service_accounts?{qs}")
    if not rows:
        return None, None
    row = rows[0]
    aid = (row.get("account_id") or "").strip()
    apw = (row.get("account_password") or "").strip()
    return (aid or None), (apw or None)


def _from_legacy_korail_creds() -> Tuple[str | None, str | None]:
    rows = _supabase_get(
        "/rest/v1/korail_credentials?select=korail_id,korail_password&limit=1"
    )
    if not rows:
        return None, None
    row = rows[0]
    return (
        (row.get("korail_id") or "").strip() or None,
        (row.get("korail_password") or "").strip() or None,
    )


def load_service_creds(service: str) -> Tuple[str | None, str | None]:
    """Return (id, password) for the given service. Either side is None
    when nothing is configured. Caller decides what to do."""
    aid, apw = _from_service_accounts(service)
    if aid and apw:
        return aid, apw
    if service == "korail":
        aid, apw = _from_legacy_korail_creds()
        if aid and apw:
            return aid, apw
        return (
            os.environ.get("KORAIL_ID") or None,
            os.environ.get("KORAIL_PASSWORD") or None,
        )
    return None, None


def load_korail_creds() -> Tuple[str | None, str | None]:
    """Backwards-compatible alias for the Korail-specific call sites."""
    return load_service_creds("korail")
