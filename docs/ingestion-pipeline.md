# Data Ingestion Pipeline — IndisNaut Market Researcher

## 1. Pipeline Architecture Overview

The ingestion layer is a **five-stage pipeline** that converts messy, source-specific payloads
(HTML tables, CSV bhavcopies, JSON option-chain snapshots) into strongly-typed Nautilus objects
persisted to durable storage:

```
Raw Scrape → Parse & Validate → Normalize → Nautilus Model → Parquet/Postgres Catalog
   (httpx)      (schema check)    (dedupe,      (Bar/Tick/         (ParquetDataCatalog +
                                    unit fix)     CustomData)        relational tables)
```

The pipeline is **async-first**: every source engine is built on `asyncio` + `httpx.AsyncClient`,
allowing dozens of symbol-level fetches (fundamentals, news, option chains) to run concurrently
under a single event loop rather than spawning threads/processes. Each engine owns its own
`asyncio.Semaphore` to bound concurrency per host, and a shared **token-bucket rate limiter**
throttles outbound requests to stay under each source's tolerance threshold.

```python
class RateLimiter:
    def __init__(self, rate_per_sec: float, burst: int = 5):
        self._tokens = burst
        self._max = burst
        self._rate = rate_per_sec
        self._lock = asyncio.Lock()
        self._last = time.monotonic()

    async def acquire(self):
        async with self._lock:
            now = time.monotonic()
            self._tokens = min(self._max, self._tokens + (now - self._last) * self._rate)
            self._last = now
            if self._tokens < 1:
                await asyncio.sleep((1 - self._tokens) / self._rate)
            self._tokens -= 1
```

Every engine wraps its HTTP calls in a **circuit breaker** (see §7) so a single misbehaving source
cannot starve the shared event loop or trigger IP bans across the whole pipeline.

## 2. Micro-Engine Design

Each data source gets a dedicated, independently schedulable **micro-engine** — a small async
class exposing `fetch()` → `parse()` → `to_nautilus()`. This isolates source-specific HTML/JSON
quirks and lets engines be added, disabled, or rate-tuned without touching the orchestrator.

### 2.1 Screener.in Engine

- **Target:** `https://www.screener.in/company/{SYMBOL}/consolidated/`
- Parses the page's HTML tables (`quarters`, `profit-loss`, `balance-sheet`, `cash-flow`,
  `ratios`, `shareholding`) via `lxml`/`BeautifulSoup` into structured JSON, then maps rows onto a
  Nautilus `CustomData` type.

```python
@customdataclass
class ScreenerQuarterlyFundamentals:
    symbol: str
    period_end: pd.Timestamp
    sales: float
    net_profit: float
    eps: float
    roce: float
    debt_to_equity: float
    ts_event: int
    ts_init: int

class ScreenerEngine:
    BASE = "https://www.screener.in/company/{symbol}/consolidated/"

    async def fetch(self, symbol: str) -> str:
        async with self._breaker:
            resp = await self._client.get(self.BASE.format(symbol=symbol))
            resp.raise_for_status()
            return resp.text

    def parse(self, html: str) -> dict:
        soup = BeautifulSoup(html, "lxml")
        return {
            "quarters": self._parse_table(soup, "quarters"),
            "profit_loss": self._parse_table(soup, "profit-loss"),
            "balance_sheet": self._parse_table(soup, "balance-sheet"),
            "cash_flow": self._parse_table(soup, "cash-flow"),
            "ratios": self._parse_table(soup, "ratios"),
            "shareholding": self._parse_table(soup, "shareholding"),
        }
```

- **Schedule:** every 12 hours — fundamentals change quarterly, but polling twice daily catches
  same-day corrections/restatements without wasting scrape budget.

### 2.2 Moneycontrol Engine

- **Targets:** news RSS/HTML feed + corporate-actions page per symbol.
- News items are parsed into `title`, `url`, `timestamp`, `category`, `summary`; corporate actions
  into `action_type` (dividend/bonus/split), `ex_date`, `record_date`, `details`.

```python
@customdataclass
class MoneycontrolNewsItem:
    symbol: str
    title: str
    url: str
    category: str
    summary: str
    ts_event: int
    ts_init: int

@customdataclass
class CorporateAction:
    isin: str
    action_type: str          # DIVIDEND | BONUS | SPLIT
    ex_date: pd.Timestamp
    record_date: pd.Timestamp
    details: str
    ts_event: int
    ts_init: int
```

- **Schedule:** news polled every 15–30 minutes (freshness matters for event-driven strategies);
  corporate actions polled once daily (low change frequency, high downstream impact on Bar
  adjustment).

### 2.3 NSE Bhavcopy Engine

- Downloads the daily CSV bhavcopy, parses `SYMBOL, OPEN, HIGH, LOW, CLOSE, LAST, PREVCLOSE,
  TOTTRDQTY, TOTTRDVAL, TOTALTRADES, ISIN`, and maps each row to a Nautilus `Bar`.

```python
class BhavcopyEngine:
    async def fetch(self, trade_date: date) -> bytes:
        url = f"{self.BASE}/cm{trade_date:%d%b%Y}bhav.csv.zip".upper()
        async with self._breaker:
            resp = await self._client.get(url)
            resp.raise_for_status()
            return resp.content

    def to_bars(self, df: pd.DataFrame) -> list[Bar]:
        bars = []
        for row in df.itertuples():
            bar_type = BarType.from_str(f"{row.SYMBOL}.NSE-1-DAY-LAST-EXTERNAL")
            bars.append(Bar(
                bar_type=bar_type,
                open=Price.from_str(str(row.OPEN)),
                high=Price.from_str(str(row.HIGH)),
                low=Price.from_str(str(row.LOW)),
                close=Price.from_str(str(row.CLOSE)),
                volume=Quantity.from_int(row.TOTTRDQTY),
                ts_event=dt_to_unix_nanos(trade_date),
                ts_init=time.time_ns(),
            ))
        return bars
```

- **Schedule:** daily, after **6:00 PM IST** (NSE publishes final bhavcopy post-settlement).

### 2.4 NSE Option Chain Engine

- **Endpoints:** `/api/option-chain-indices?symbol=NIFTY`, `/api/option-chain-equities?symbol={SYMBOL}`.
- NSE's API requires a valid `nseappid` session cookie obtained by first hitting the homepage;
  the engine implements a **cookie-refresh guard** that re-primes the session on 401/403.

```python
class NseOptionChainEngine:
    async def _ensure_session(self):
        if self._cookie_expired():
            await self._client.get("https://www.nseindia.com/")  # primes cookies
            self._cookie_ts = time.monotonic()

    async def fetch(self, symbol: str, is_index: bool) -> dict:
        await self._ensure_session()
        path = "option-chain-indices" if is_index else "option-chain-equities"
        async with self._breaker:
            resp = await self._client.get(f"{self.BASE}/api/{path}", params={"symbol": symbol})
            if resp.status_code in (401, 403):
                self._cookie_ts = 0  # force refresh next call
                resp.raise_for_status()
            return resp.json()

    def to_nautilus(self, payload: dict, expiry: str) -> list[tuple[QuoteTick, OptionGreeks]]:
        out = []
        for row in payload["records"]["data"]:
            if row.get("expiryDate") != expiry:
                continue
            for side in ("CE", "PE"):
                leg = row.get(side)
                if not leg:
                    continue
                quote = QuoteTick(
                    instrument_id=self._instrument_id(row["strikePrice"], side, expiry),
                    bid_price=Price.from_str(str(leg["bidprice"])),
                    ask_price=Price.from_str(str(leg["askPrice"])),
                    bid_size=Quantity.from_int(leg["bidQty"]),
                    ask_size=Quantity.from_int(leg["askQty"]),
                    ts_event=time.time_ns(),
                    ts_init=time.time_ns(),
                )
                greeks = OptionGreeks(
                    instrument_id=quote.instrument_id,
                    iv=leg["impliedVolatility"],
                    open_interest=leg["openInterest"],
                    oi_change=leg["changeinOpenInterest"],
                    volume=leg["totalTradedVolume"],
                    ts_event=quote.ts_event,
                )
                out.append((quote, greeks))
        return out
```

- **Schedule:** snapshot every **60 seconds** during market hours (09:15–15:30 IST), driven by an
  `asyncio.create_task` loop rather than a cron job, since intraday polling needs sub-minute
  precision.

### 2.5 NSE Delivery Data Engine

- **Endpoint:** `/api/delivery-report`; parses per-symbol delivery quantity and delivery
  percentage, mapping to a `DeliveryData` `CustomData` type.

```python
@customdataclass
class DeliveryData:
    symbol: str
    isin: str
    traded_qty: int
    delivery_qty: int
    delivery_pct: float
    ts_event: int
    ts_init: int
```

- **Schedule:** daily, after market close (delivery data is a T+0 end-of-day figure).

## 3. Data Normalization Layer

A single **Normalizer** orchestrator receives raw parsed payloads from every engine over an
internal `asyncio.Queue`, so source-specific parsing stays decoupled from validation/storage.

```python
class Normalizer:
    async def run(self):
        while True:
            raw_item = await self._queue.get()
            try:
                self._validate_schema(raw_item)
                if self._is_duplicate(raw_item.ts_event, raw_item.key):
                    continue
                model_obj = self._transform(raw_item)
                await self._batch.add(model_obj)
            except ValidationError as e:
                await self._dead_letter.write(raw_item, error=e)
            if self._batch.full():
                await self._flush()
```

Responsibilities:

1. **Schema validation** — every raw payload is checked against a `pydantic` schema before it is
   allowed to become a Nautilus object; malformed rows are rejected, not silently coerced.
2. **Deduplication** — an in-memory (or Redis-backed) set keyed on `(instrument_id, ts_event)`
   prevents re-processing bhavcopy rows or option-chain snapshots already ingested.
3. **Transform** — raw dict → concrete Nautilus model (`Bar`, `QuoteTick`, `TradeTick`, or
   `CustomData` subclass).
4. **Batch write** — accumulated objects are flushed to the `ParquetDataCatalog` in batches (e.g.
   every 500 objects or 5 seconds, whichever first) to amortize Parquet write overhead.

## 4. Nautilus Model Mapping

| Source | Raw Shape | Nautilus Type | Notes |
|---|---|---|---|
| NSE Bhavcopy | CSV row (OHLCV) | `Bar` | `BarType`: `"RELIANCE.NSE-1-DAY-LAST-EXTERNAL"` |
| NSE Option Chain | JSON per strike | `QuoteTick` + `OptionGreeks` | one pair per strike/side (CE/PE) |
| Screener.in | HTML tables | `CustomData` (`ScreenerQuarterlyFundamentals`) | registered via `register_custom_data_class` |
| Moneycontrol News | JSON/HTML feed item | `CustomData` (`MoneycontrolNewsItem`) | timestamped event injected into backtest stream |
| Moneycontrol Corp Actions | HTML table row | `CustomData` (`CorporateAction`) | drives Bar price adjustments |
| NSE Delivery Data | JSON row | `CustomData` (`DeliveryData`) | joined to Bar via `(symbol, ts_event)` |

Custom types must be registered once at startup so Nautilus's serialization layer (Arrow/Parquet)
knows how to (de)serialize them:

```python
register_custom_data_class(ScreenerQuarterlyFundamentals)
register_custom_data_class(MoneycontrolNewsItem)
register_custom_data_class(CorporateAction)
register_custom_data_class(DeliveryData)
```

## 5. Storage Strategy

- **ParquetDataCatalog** (Nautilus-native) stores all `Bar`, `QuoteTick`, and `TradeTick` objects,
  partitioned by `instrument_id / year / month` for efficient range-scanning during backtests:

```python
catalog = ParquetDataCatalog(path="./data/catalog")
catalog.write_data(bars, basename_template="{instrument_id}/{year}/{month:02d}")
```

- **PostgreSQL** holds relational/reference data that doesn't fit the columnar tick model:
  `instrument_master` (symbol, ISIN, exchange, lot size), `corporate_actions`, `news`, and
  `fundamentals` tables. **ISIN is the universal join key** across all four tables, since it is
  the only identifier stable across NSE/BSE symbol renames and corporate restructurings.

## 6. Scheduling & Orchestration

For production, **Apache Airflow** or **Prefect** provides DAG-based scheduling with built-in
retry/alerting; for the initial MVP, plain **cron** driving async CLI entrypoints is sufficient.

```
daily_bhavcopy_pipeline:   download → parse → validate → store        (18:15 IST cron)
hourly_news_pipeline:      fetch → parse → dedupe → store             (*/20 * * * * cron)
```

Real-time option-chain streaming does **not** fit a DAG model well — it runs as a long-lived
`asyncio` task supervised by a process manager (e.g. `supervisord` or a systemd unit), looping on
a 60-second timer only while the market clock is within session hours.

## 7. Error Handling & Resilience

- **Circuit breaker** — after N consecutive `403/429/5xx` responses, the engine trips open and
  stops issuing requests to that source for a cooldown window, preventing IP bans:

```python
class CircuitBreaker:
    def __init__(self, fail_threshold=5, cooldown=300):
        self._fail_threshold = fail_threshold
        self._cooldown = cooldown
        self._fail_count = 0
        self._open_until = 0

    async def __aenter__(self):
        if time.monotonic() < self._open_until:
            raise CircuitOpenError("breaker tripped, cooling down")
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if exc_type in (httpx.HTTPStatusError, httpx.ConnectTimeout):
            self._fail_count += 1
            if self._fail_count >= self._fail_threshold:
                self._open_until = time.monotonic() + self._cooldown
        else:
            self._fail_count = 0
```

- **Retry with exponential backoff** — transient failures (timeouts, 5xx) are retried with
  `1s → 2s → 4s → 8s`, capped at **60s**, before the circuit breaker's failure counter is
  incremented.
- **Dead letter queue** — records that fail schema validation or repeated retries are written to
  a local file/DB table (`dead_letter_records`) with the raw payload and error reason for manual
  review, rather than being silently dropped.
