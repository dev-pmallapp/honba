"""Candle loaders, the Parquet store and the Dhan loader (no network: httpx MockTransport)."""
# ruff: noqa: D103

from __future__ import annotations

import json
from datetime import date

import httpx
import pandas as pd
import pytest
from sdk_helpers import daily, intraday

import honba as hb
from honba.data import (
    CandleStore,
    DhanCredentials,
    DhanError,
    DhanLoader,
    DhanSecurity,
    load_csv,
    load_parquet,
)


def _df(n=10, start="2024-01-01"):
    return daily([(100 + i, 101 + i, 99 + i, 100.5 + i) for i in range(n)], start)


def test_load_csv_normalises_headers_and_time(tmp_path):
    path = tmp_path / "x.csv"
    path.write_text(
        "Date,Open,High,Low,Close,Volume\n"
        "2024-01-02,10,11,9,10.5,100\n2024-01-01,9,10,8,9.5,50\n2024-01-01,9,10,8,9.6,55\n"
    )
    df = load_csv(path)
    assert list(df.columns) == ["time", "open", "high", "low", "close", "volume"]
    assert str(df["time"].dt.tz) == "Asia/Kolkata"
    assert len(df) == 2 and df["close"].tolist() == [9.6, 10.5]  # sorted, last duplicate wins


def test_load_parquet_roundtrip_and_epoch_seconds(tmp_path):
    raw = pd.DataFrame(
        {"timestamp": [1704067200, 1704153600], "open": 1, "high": 2, "low": 1, "close": 2}
    )
    raw.to_parquet(tmp_path / "e.parquet")
    df = load_parquet(tmp_path / "e.parquet")
    assert df["time"].iloc[0].isoformat().startswith("2024-01-01T05:30:00")
    assert (df["volume"] == 0).all()


def test_store_append_dedupe_and_incremental(tmp_path):
    store = CandleStore(tmp_path)
    first = store.append("SBIN", "1d", _df(5))
    assert (first.added, first.replaced, first.total) == (5, 0, 5)
    revised = _df(7)
    revised.loc[4, "close"] = 100.5 + 4  # unchanged
    second = store.append("SBIN", "1d", revised)
    assert (second.added, second.replaced, second.total) == (2, 5, 7)
    assert store.symbols() == ["SBIN"] and store.timeframes("SBIN") == ["1d"]
    assert store.last_time("SBIN", "1d") == pd.Timestamp("2024-01-09", tz="Asia/Kolkata")
    assert store.coverage("SBIN", "1d")["rows"] == 7


def test_store_year_partitions_and_range_read(tmp_path):
    store = CandleStore(tmp_path)
    store.append("X", "1d", _df(5, "2023-12-27"))
    store.append("X", "1d", _df(3, "2024-01-01"))
    folder = tmp_path / "symbol=X" / "timeframe=1d"
    assert sorted(p.name for p in folder.iterdir()) == ["year=2023.parquet", "year=2024.parquet"]
    got = store.read("X", "1d", "2023-12-28", "2024-01-01")
    assert len(got) == 3
    assert got["time"].min() == pd.Timestamp("2023-12-28", tz="Asia/Kolkata")
    frames = store.load(["X"], "1d")
    res = hb.backtest(_Noop, frames)
    assert res.summary["net_pnl"] == 0


class _Noop(hb.Strategy):
    timeframe = "1d"

    def on_bar(self, bar):
        pass


def test_store_rejects_bad_candles_and_writes_nothing(tmp_path):
    store = CandleStore(tmp_path)
    bad = _df(3)
    bad.loc[1, "high"] = 1.0
    with pytest.raises(hb.CandleValidationError):
        store.append("BAD", "1d", bad)
    assert store.symbols() == []
    store.append("BAD", "1d", bad, validate=False)
    assert store.symbols() == ["BAD"]


def test_store_session_aware_validation_and_missing_sessions(tmp_path):
    session = hb.TradingSession(holidays=frozenset({date(2024, 1, 5)}))
    store = CandleStore(tmp_path, session=session)
    data = intraday(days=3, minutes=5)  # Mon-Wed, overnight gaps are fine
    res = store.append("I", "5m", data)
    assert res.issues == []
    # Jan 5 is a holiday in the calendar: it is not "missing"; Jan 4 has no bars
    missing = store.missing_sessions("I", "5m", "2024-01-01", "2024-01-05")
    assert missing == [date(2024, 1, 4)]
    # a bar on the holiday is an error
    late = intraday(days=1, start="2024-01-05")
    with pytest.raises(hb.CandleValidationError):
        store.append("I", "5m", late)


def test_store_paths_cannot_escape(tmp_path):
    store = CandleStore(tmp_path / "s")
    store.append("../../evil", "1d", _df(2))
    assert store.symbols() == ["../../evil"]
    assert not (tmp_path / "evil").exists()
    with pytest.raises(ValueError):
        store.append("..", "1d", _df(2))


class _FakeLoader:
    def __init__(self):
        self.calls = []

    def fetch(self, symbol, timeframe, start, end, **kw):
        self.calls.append((symbol, timeframe, pd.Timestamp(start)))
        return _df(8, "2024-01-01").iloc[len(self.calls) * 3 :]


def test_store_update_resumes_from_last_bar(tmp_path):
    store = CandleStore(tmp_path)
    loader = _FakeLoader()
    with pytest.raises(ValueError):
        store.update(loader, "S", "1d")
    store.update(loader, "S", "1d", start="2024-01-01")
    store.update(loader, "S", "1d")
    assert loader.calls[1][2] == store.last_time("S", "1d") or loader.calls[1][2] > pd.Timestamp(
        "2024-01-01", tz="Asia/Kolkata"
    )


# -- Dhan ---------------------------------------------------------------------------------
def _resp(n=3, t0=1704133800):  # 2024-01-01 18:30 UTC == 2024-01-02 00:00 IST
    return {
        "open": [10.0] * n,
        "high": [11.0] * n,
        "low": [9.0] * n,
        "close": [10.5] * n,
        "volume": [100] * n,
        "timestamp": [t0 + 86400 * i for i in range(n)],
    }


def _loader(handler, **kw):
    sleeps = []
    client = httpx.Client(transport=httpx.MockTransport(handler))
    ld = DhanLoader(
        DhanCredentials("1000", "SECRET-TOKEN"),
        securities={"SBIN": DhanSecurity("3045")},
        client=client,
        sleep=sleeps.append,
        **kw,
    )
    return ld, sleeps


def test_dhan_daily_request_shape_and_frame():
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json=_resp(3))

    ld, _ = _loader(handler)
    df = ld.fetch("SBIN", "1d", "2024-01-02", "2024-01-04")
    req = seen[0]
    assert req.url.path == "/v2/charts/historical"
    assert req.headers["access-token"] == "SECRET-TOKEN"
    body = json.loads(req.content)
    assert body["securityId"] == "3045" and body["fromDate"] == "2024-01-02"
    assert body["toDate"] == "2024-01-05"
    assert df["time"].iloc[0] == pd.Timestamp("2024-01-02", tz="Asia/Kolkata")
    assert len(df) == 3 and list(df.columns) == ["time", "open", "high", "low", "close", "volume"]
    assert hb.backtest(_Noop, {"SBIN": df}).summary["net_pnl"] == 0


def test_dhan_intraday_windows_and_trim():
    bodies = []

    def handler(req):
        assert req.url.path == "/v2/charts/intraday"
        bodies.append(json.loads(req.content))
        return httpx.Response(200, json=_resp(2, 1704085500))  # 09:15 IST

    ld, _ = _loader(handler)
    df = ld.fetch("SBIN", "5m", "2024-01-01", "2024-06-01")
    assert len(bodies) == 2 and bodies[0]["interval"] == "5"
    assert bodies[0]["fromDate"] == "2024-01-01 00:00:00"
    assert df["time"].is_monotonic_increasing and df["time"].is_unique
    with pytest.raises(ValueError):
        ld.fetch("SBIN", "3m", "2024-01-01", "2024-01-02")


def test_dhan_retries_with_backoff_then_gives_up():
    calls = []

    def handler(req):
        calls.append(1)
        if len(calls) < 3:
            return httpx.Response(429, headers={"Retry-After": "2"})
        return httpx.Response(200, json=_resp(1))

    ld, sleeps = _loader(handler, min_interval=0)
    assert len(ld.fetch("SBIN", "1d", "2024-01-02", "2024-01-02")) == 1
    assert len(calls) == 3 and max(sleeps) >= 2

    ld2, _ = _loader(lambda r: httpx.Response(503), max_retries=1, min_interval=0)
    with pytest.raises(DhanError) as err:
        ld2.fetch("SBIN", "1d", "2024-01-02", "2024-01-02")
    assert "SECRET" not in str(err.value)


def test_dhan_errors_are_redacted_and_bounded():
    def echo(status, body):
        def handler(req):
            # a hostile / misconfigured endpoint reflecting the request headers back
            echoed = {**body, "headers": dict(req.headers), "blob": "x" * 5000}
            return httpx.Response(status, json=echoed, headers={"X-Token": "SECRET-TOKEN"})

        return handler

    ld, _ = _loader(
        echo(400, {"errorCode": "DH-905", "errorMessage": "bad SECRET-TOKEN " + "y" * 500}),
        min_interval=0,
    )
    with pytest.raises(DhanError) as err:
        ld.fetch("SBIN", "1d", "2024-01-02", "2024-01-02")
    msg = str(err.value)
    assert "HTTP 400" in msg and "DH-905" in msg
    assert "SECRET" not in msg and "access-token" not in msg and "xxxx" not in msg
    assert len(msg) < 400

    ld, _ = _loader(echo(200, {"status": "failure", "remarks": "nope"}), min_interval=0)
    with pytest.raises(DhanError) as err:
        ld.fetch("SBIN", "1d", "2024-01-02", "2024-01-02")
    assert "nope" in str(err.value) and "SECRET" not in str(err.value)
    assert "1000" not in str(err.value)  # the client id is not echoed either

    ld, _ = _loader(lambda r: httpx.Response(502, text="SECRET-TOKEN " * 50), max_retries=0)
    with pytest.raises(DhanError) as err:
        ld.fetch("SBIN", "1d", "2024-01-02", "2024-01-02")
    assert "SECRET" not in str(err.value) and "non-JSON" in str(err.value)


def test_dhan_rate_limit_spaces_requests():
    ld, sleeps = _loader(lambda r: httpx.Response(200, json=_resp(1)), min_interval=1.0)
    ld.fetch("SBIN", "1d", "2024-01-02", "2024-01-02")
    ld.fetch("SBIN", "1d", "2024-01-02", "2024-01-02")
    assert sleeps and sleeps[-1] > 0


def test_dhan_credentials_from_env_and_no_secret_in_repr(monkeypatch):
    monkeypatch.setenv("DHAN_CLIENT_ID", "42")
    monkeypatch.setenv("DHAN_ACCESS_TOKEN", "s3cr3t")
    creds = DhanCredentials.resolve()
    assert creds.client_id == "42" and "s3cr3t" not in repr(creds)
    monkeypatch.delenv("DHAN_ACCESS_TOKEN")
    monkeypatch.delenv("DHAN_CLIENT_ID")
    with pytest.raises(DhanError):
        DhanCredentials.resolve()


def test_dhan_unknown_symbol():
    ld, _ = _loader(lambda r: httpx.Response(200, json=_resp(1)))
    with pytest.raises(DhanError):
        ld.fetch("NOPE", "1d", "2024-01-02", "2024-01-02")
