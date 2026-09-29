"""``DhanLoader``: candles from the Dhan HQ v2 historical / intraday chart APIs.

Credentials never live in code: :meth:`DhanCredentials.resolve` reads ``DHAN_CLIENT_ID`` and
``DHAN_ACCESS_TOKEN`` from the environment, else the OS keyring entry written by ``honba-dhan``
(service ``honba-dhanhq``, user = client id). Tokens are never logged or put in error messages.
"""

from __future__ import annotations

import os
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any

import httpx
import pandas as pd

from honba.strategy.mtf import Timeframe

from ._frames import CANDLE_COLUMNS, TZ, normalise_frame

if TYPE_CHECKING:
    from .instruments import InstrumentMaster

__all__ = ["DhanCredentials", "DhanError", "DhanLoader", "DhanSecurity"]

BASE_URL = "https://api.dhan.co/v2"
KEYRING_SERVICE = "honba-dhanhq"
_INTRADAY_MINUTES = {1: "1", 5: "5", 15: "15", 25: "25", 60: "60"}
_INTRADAY_WINDOW = timedelta(days=90)  # Dhan's per-request limit for intraday history
_RETRY_STATUS = {429, 500, 502, 503, 504}
# Only these fields of a Dhan error body are ever echoed (each truncated); everything else, and
# every header, is dropped so a reflected token or request echo cannot leak into messages/logs.
_ERROR_FIELDS = ("errorType", "errorCode", "errorMessage", "status", "remarks")
_ERROR_FIELD_CHARS = 120


def _error_summary(body: Any, secrets: tuple[str, ...]) -> str:
    """A short, redacted description of a Dhan error body."""
    if isinstance(body, Mapping):
        parts = []
        for key in _ERROR_FIELDS:
            value = body.get(key)
            if isinstance(value, (Mapping, list)):
                value = type(value).__name__
            if value is not None:
                parts.append(f"{key}={str(value)[:_ERROR_FIELD_CHARS]}")
        text = ", ".join(parts) or "no error details"
    else:
        text = "non-JSON body" if body is None else f"{type(body).__name__} body"
    for secret in secrets:
        if secret:
            text = text.replace(secret, "***")
    return text


class DhanError(RuntimeError):
    """A Dhan API or configuration failure (never contains the access token)."""


@dataclass(frozen=True, slots=True, repr=False)
class DhanCredentials:
    """Dhan client id and access token."""

    client_id: str
    access_token: str

    def __repr__(self) -> str:
        return f"DhanCredentials(client_id={self.client_id!r}, access_token='***')"

    @classmethod
    def resolve(cls, client_id: str | None = None) -> DhanCredentials:
        """Environment first (``DHAN_CLIENT_ID`` / ``DHAN_ACCESS_TOKEN``), then the keyring."""
        client = client_id or os.environ.get("DHAN_CLIENT_ID")
        token = os.environ.get("DHAN_ACCESS_TOKEN")
        if client and token:
            return cls(client, token)
        if client:
            try:
                import keyring  # optional; lazily imported
            except ImportError:
                keyring = None
            if keyring is not None:
                token = keyring.get_password(KEYRING_SERVICE, client)
                if token:
                    return cls(client, token)
        raise DhanError(
            "no Dhan credentials: set DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN, or store the token in "
            f"the keyring (service {KEYRING_SERVICE!r}, user = client id)"
        )


@dataclass(frozen=True, slots=True)
class DhanSecurity:
    """How Dhan identifies an instrument (from the scrip master)."""

    security_id: str
    exchange_segment: str = "NSE_EQ"
    instrument: str = "EQUITY"
    expiry_code: int = 0


class DhanLoader:
    """Fetch candles from Dhan and return them in the SDK candle schema.

    ``securities`` maps symbols to :class:`DhanSecurity`; symbols not in it are resolved through
    ``master`` (an :class:`~honba.data.InstrumentMaster`). Requests are spaced by
    ``min_interval`` seconds (Dhan allows ~5 data requests per second) and 429 / 5xx responses
    are retried with exponential backoff (``Retry-After`` honoured). Intraday history is fetched
    in 90-day windows. ``client`` / ``sleep`` / ``clock`` are injectable for tests.
    """

    def __init__(
        self,
        credentials: DhanCredentials | None = None,
        *,
        securities: Mapping[str, DhanSecurity] | None = None,
        master: InstrumentMaster | None = None,
        base_url: str = BASE_URL,
        client: httpx.Client | None = None,
        min_interval: float = 0.25,
        max_retries: int = 4,
        backoff: float = 0.5,
        timeout: float = 30.0,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._credentials = credentials
        self.securities = dict(securities or {})
        self.master = master
        self.base_url = base_url.rstrip("/")
        self._client = client or httpx.Client(timeout=timeout)
        self.min_interval = min_interval
        self.max_retries = max_retries
        self.backoff = backoff
        self._sleep = sleep
        self._clock = clock
        self._last_request = -1e18

    # -- plumbing --------------------------------------------------------------------------
    @property
    def credentials(self) -> DhanCredentials:
        """Credentials, resolved (env / keyring) on first use."""
        if self._credentials is None:
            self._credentials = DhanCredentials.resolve()
        return self._credentials

    def security(self, symbol: str) -> DhanSecurity:
        """Resolve ``symbol`` to Dhan's ids."""
        if symbol in self.securities:
            return self.securities[symbol]
        if self.master is not None:
            ref = self.master.dhan_security(symbol)
            if ref is not None:
                return ref
        raise DhanError(f"unknown symbol {symbol!r}: pass securities= or an InstrumentMaster")

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        creds = self.credentials
        headers = {
            "access-token": creds.access_token,
            "client-id": creds.client_id,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        for attempt in range(self.max_retries + 1):
            wait = self.min_interval - (self._clock() - self._last_request)
            if wait > 0:
                self._sleep(wait)
            self._last_request = self._clock()
            try:
                resp = self._client.post(self.base_url + path, json=payload, headers=headers)
            except httpx.TransportError as exc:
                if attempt == self.max_retries:
                    raise DhanError(f"Dhan request failed: {type(exc).__name__}") from None
                self._sleep(self.backoff * 2**attempt)
                continue
            if resp.status_code in _RETRY_STATUS and attempt < self.max_retries:
                retry_after = resp.headers.get("Retry-After", "")
                delay = float(retry_after) if retry_after.replace(".", "", 1).isdigit() else 0.0
                self._sleep(max(delay, self.backoff * 2**attempt))
                continue
            secrets = (creds.access_token, creds.client_id)
            try:
                body: Any = resp.json()
            except ValueError:
                body = None
            if resp.status_code >= 400:
                detail = _error_summary(body, secrets)
                raise DhanError(f"Dhan {path} returned HTTP {resp.status_code}: {detail}")
            if isinstance(body, dict) and body.get("status") == "failure":
                raise DhanError(f"Dhan {path} failed: {_error_summary(body, secrets)}")
            if body is None:
                raise DhanError(f"Dhan {path} returned a non-JSON response")
            return body
        raise DhanError(f"Dhan {path}: retries exhausted")  # pragma: no cover

    # -- public ----------------------------------------------------------------------------
    def fetch(
        self,
        symbol: str,
        timeframe: str,
        start: date | datetime | str,
        end: date | datetime | str,
        *,
        security: DhanSecurity | None = None,
        oi: bool = False,
    ) -> pd.DataFrame:
        """Candles for ``[start, end]`` as ``time open high low close volume`` (IST times).

        ``timeframe`` is ``1d`` (historical API) or ``1m`` / ``5m`` / ``15m`` / ``25m`` / ``1h``
        (intraday API). Bars are trimmed to the requested range and de-duplicated.
        """
        tf = Timeframe.parse(timeframe)
        sec = security or self.security(symbol)
        lo = pd.Timestamp(start)
        hi = pd.Timestamp(end)
        lo = lo.tz_localize(TZ) if lo.tzinfo is None else lo.tz_convert(TZ)
        hi = hi.tz_localize(TZ) if hi.tzinfo is None else hi.tz_convert(TZ)
        if isinstance(end, (str, date)) and not isinstance(end, datetime):
            hi = hi + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
        if hi < lo:
            raise ValueError("end is before start")
        base = {
            "securityId": sec.security_id,
            "exchangeSegment": sec.exchange_segment,
            "instrument": sec.instrument,
            "oi": oi,
        }
        frames: list[pd.DataFrame] = []
        if tf.unit == "d" and tf.n == 1:
            body = self._post(
                "/charts/historical",
                {
                    **base,
                    "expiryCode": sec.expiry_code,
                    "fromDate": lo.strftime("%Y-%m-%d"),
                    # toDate is exclusive on Dhan's historical endpoint
                    "toDate": (hi + pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
                },
            )
            frames.append(_to_frame(body, daily=True))
        elif tf.is_intraday and tf.minutes in _INTRADAY_MINUTES:
            cursor = lo
            while cursor <= hi:
                stop = min(cursor + _INTRADAY_WINDOW, hi)
                body = self._post(
                    "/charts/intraday",
                    {
                        **base,
                        "interval": _INTRADAY_MINUTES[tf.minutes],
                        "fromDate": cursor.strftime("%Y-%m-%d %H:%M:%S"),
                        "toDate": stop.strftime("%Y-%m-%d %H:%M:%S"),
                    },
                )
                frames.append(_to_frame(body, daily=False))
                cursor = stop + pd.Timedelta(seconds=1)
        else:
            raise ValueError(f"Dhan serves 1d and 1m/5m/15m/25m/1h candles, not {timeframe!r}")
        frames = [f for f in frames if not f.empty]
        if not frames:
            return pd.DataFrame({c: pd.Series(dtype="float64") for c in CANDLE_COLUMNS}).assign(
                time=pd.Series(dtype=f"datetime64[ns, {TZ}]")
            )
        out = normalise_frame(pd.concat(frames, ignore_index=True))
        floor = lo.normalize() if tf.unit == "d" else lo
        return out[(out["time"] >= floor) & (out["time"] <= hi)].reset_index(drop=True)


def _to_frame(body: Mapping[str, Any], *, daily: bool) -> pd.DataFrame:
    stamps = body.get("timestamp") or body.get("start_Time") or []
    if not len(stamps):
        return pd.DataFrame()
    n = len(stamps)
    for key in ("open", "high", "low", "close"):
        if len(body.get(key, [])) != n:
            raise DhanError(f"malformed Dhan response: {key!r} length differs from timestamp")
    time_ix = pd.to_datetime(pd.Series(stamps, dtype="int64"), unit="s", utc=True)
    time_ix = time_ix.dt.tz_convert(TZ)
    if daily:
        time_ix = time_ix.dt.normalize()
    volume = body.get("volume") or [0.0] * n
    return pd.DataFrame(
        {
            "time": time_ix,
            "open": body["open"],
            "high": body["high"],
            "low": body["low"],
            "close": body["close"],
            "volume": volume,
        }
    )
