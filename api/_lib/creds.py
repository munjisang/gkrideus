"""
Korail credential loader used by every Python serverless endpoint.

Resolution order:
  1) public.korail_credentials row in Supabase (preferred — managed via admin UI)
  2) KORAIL_ID / KORAIL_PASSWORD env vars (fallback for bootstrap / local dev)

Reads use the Supabase service_role key (server-only env var). The
korail_credentials table has RLS that denies anon access, so the
service_role bypass is the only valid path.
"""
from __future__ import annotations

import json
import os
import urllib.request
import urllib.error
from typing import Tuple


def _supabase_lookup() -> Tuple[str | None, str | None]:
    base = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        return None, None
    url = (
        f"{base.rstrip('/')}/rest/v1/korail_credentials"
        "?select=korail_id,korail_password&limit=1"
    )
    req = urllib.request.Request(
        url,
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
        return None, None
    if not isinstance(data, list) or not data:
        return None, None
    row = data[0]
    kid = (row.get("korail_id") or "").strip()
    kpw = (row.get("korail_password") or "").strip()
    if not kid or not kpw:
        return None, None
    return kid, kpw


def load_korail_creds() -> Tuple[str | None, str | None]:
    """Return (id, password). Either side is None when nothing is configured."""
    kid, kpw = _supabase_lookup()
    if kid and kpw:
        return kid, kpw
    return (
        os.environ.get("KORAIL_ID") or None,
        os.environ.get("KORAIL_PASSWORD") or None,
    )
