"""
Legacy-TLS adapter for talking to Korail's mobile endpoint.

Korail (`smart.letskorail.com`) runs an old TLS stack that:
  * only offers cipher suites OpenSSL 3.x disables at the default SECLEVEL 2
  * doesn't support RFC 5746 secure renegotiation

Modern Python runtimes (e.g. Vercel's Linux build) therefore fail the TLS
handshake with `SSLV3_ALERT_HANDSHAKE_FAILURE`. Mounting this adapter on the
requests session lowers the security level and re-enables legacy connect so
the handshake completes — same effect the user's local LibreSSL had.
"""
from __future__ import annotations

import ssl

from requests.adapters import HTTPAdapter

try:  # urllib3 v2 and v1 expose PoolManager at the same path
    from urllib3.poolmanager import PoolManager
except Exception:  # noqa: BLE001
    PoolManager = None  # type: ignore

# OpenSSL flag: allow connecting to servers without RFC 5746 renegotiation.
_OP_LEGACY_SERVER_CONNECT = 0x4


def _legacy_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    # Korail presents a cert chain we don't need to validate for this PoC,
    # and hostname/cert checks can themselves trip on the legacy stack.
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        ctx.set_ciphers("DEFAULT@SECLEVEL=1")
    except ssl.SSLError:
        try:
            ctx.set_ciphers("ALL:@SECLEVEL=1")
        except ssl.SSLError:
            pass
    try:
        ctx.options |= _OP_LEGACY_SERVER_CONNECT
    except Exception:  # noqa: BLE001
        pass
    return ctx


class LegacyTLSAdapter(HTTPAdapter):
    def init_poolmanager(self, connections, maxsize, block=False, **kwargs):  # type: ignore[override]
        kwargs["ssl_context"] = _legacy_context()
        if PoolManager is not None:
            self.poolmanager = PoolManager(
                num_pools=connections,
                maxsize=maxsize,
                block=block,
                **kwargs,
            )
            return
        return super().init_poolmanager(connections, maxsize, block=block, **kwargs)


def apply_legacy_tls(session) -> None:
    """Mount the legacy adapter on an existing requests.Session for https://."""
    try:
        session.mount("https://", LegacyTLSAdapter())
    except Exception:  # noqa: BLE001
        # Never let TLS tweaking crash the request path.
        pass
