# Nautilus Trader — Unique Feature Catalog

This document catalogs features found **only** in Nautilus Trader — not in
Jesse AI, Backtrader, Zipline, QuantConnect/LEAN, or any other widely used
open-source or commercial trading framework. Each entry below was verified
against the competing frameworks' documented capabilities; where a competitor
has a partial or superficially similar feature, that is noted explicitly
rather than glossed over. Taken together, these are the reasons to choose
Nautilus as the core engine for IndisNaut rather than build on, or migrate
away from, a simpler Python-only backtester.

---

## 1. Rust Core with Python Bindings (Hybrid Architecture)

The matching engine, message bus, cache, data engine, and order book are all
implemented in Rust and exposed to Python via PyO3 bindings. Strategy code is
written in Python (or Rust), but the hot path — tick ingestion, order
matching, book updates — never touches the Python interpreter or its GIL.

- **Performance**: benchmarked at 10x+ faster than pure-Python backtesters
  for tick-level simulation, because book updates and fills happen in native
  code with zero per-tick Python object allocation.
- Strategies can also be written **entirely in Rust** for latency-critical
  live deployments — no other framework offers a Rust strategy API.
- Jesse AI uses Python throughout, with a small number of Rust-accelerated
  indicators (not the core engine). Backtracker, Zipline, and QuantConnect's
  Python API are pure Python/CLR; only LEAN's C# engine is compiled, and it
  has no Python-native hot path at all.

```python
from nautilus_trader.trading.strategy import Strategy
from nautilus_trader.model.data import Bar

class MyStrategy(Strategy):
    def on_bar(self, bar: Bar) -> None:
        # This callback is Python, but bar aggregation, order matching,
        # and book maintenance already happened in the Rust core before
        # this event ever crossed into the Python interpreter.
        if bar.close > bar.open:
            self.submit_order(self.order_factory.market(
                instrument_id=bar.bar_type.instrument_id,
                order_side=OrderSide.BUY,
                quantity=self.instrument.make_qty(1),
            ))
```

---

## 2. Crash-Only Design

Nautilus is built on the "crash-only software" principle: the system has no
concept of a clean shutdown path distinct from a crash. Every stop — whether
triggered by an operator, an exception, or a power loss — is treated
identically, and every start is a **recovery** from the last persisted state,
never a "fresh boot."

- Combined with the event-sourcing subsystem (see §10), this means state is
  never held only in memory long enough to be lost.
- Implication for users: a backtest interrupted mid-run, or a live node that
  loses power, resumes from exactly where it left off with no special-cased
  recovery code path to trust or distrust — because there is only one path.
- No other retail/OSS trading framework documents or implements this
  pattern. Jesse, Backtrader, and Zipline all have an implicit "clean exit"
  code path that is untested under crash conditions.

---

## 3. Domain-Driven Design (DDD) + Hexagonal Architecture

Nautilus's internals are organized as explicit bounded contexts —
instruments, orders, positions, accounts, data, execution, risk — connected
through a ports-and-adapters (hexagonal) boundary. Every venue integration is
an **adapter** plugged into the core via a stable port interface; venues
never leak venue-specific types into the domain model.

- **19 instrument types** ship built-in: `Equity`, `FuturesContract`,
  `FuturesSpread`, `OptionContract`, `OptionSpread`, `CryptoPerpetual`,
  `CryptoFuture`, `CryptoOption`, `CryptoOptionSpread`, `CurrencyPair`, `Cfd`,
  `Commodity`, `Index`, `BettingInstrument`, `BinaryOption`,
  `SyntheticInstrument`, and more — the most comprehensive instrument
  taxonomy of any framework.
- Jesse has effectively one instrument shape (perpetual futures candles);
  Backtrader and Zipline model "assets" generically with no domain
  separation between instrument classes, order lifecycle, and account
  state.

---

## 4. 20+ Bar Aggregation Types

Nautilus's `BarAggregation` enum and `BarType` system go far beyond fixed
wall-clock bars:

| Category | Aggregations |
|---|---|
| Time | `MILLISECOND`, `SECOND`, `MINUTE`, `HOUR`, `DAY`, `WEEK`, `MONTH` |
| Threshold | `TICK`, `VOLUME`, `VALUE` (dollar bars) |
| Information-driven | `TICK_IMBALANCE`, `TICK_RUNS`, `VOLUME_IMBALANCE`, `VOLUME_RUNS`, `VALUE_IMBALANCE`, `VALUE_RUNS` |
| Price-driven | `RENKO` |

`BarType` further distinguishes **aggregation source** (`INTERNAL` — built by
Nautilus from trades/quotes, vs. `EXTERNAL` — provided pre-aggregated by the
venue) and supports **composite bars** built from other bars (bar-to-bar
aggregation, e.g. 5-MINUTE bars built from 1-MINUTE bars without re-touching
raw ticks).

```
AAPL.NASDAQ-1-MINUTE-LAST-INTERNAL
AAPL.NASDAQ-1000-VOLUME-LAST-INTERNAL
AAPL.NASDAQ-500-TICK_IMBALANCE-LAST-INTERNAL
AAPL.NASDAQ-10000-VALUE-LAST-EXTERNAL
AAPL.NASDAQ-5-MINUTE-LAST-INTERNAL@1-MINUTE-INTERNAL   # composite
```

Jesse ships roughly 6 standard time-based candle sizes derived by simple
resampling; it has no information-driven or threshold bar concept at all.

---

## 5. Apache Parquet Data Catalog (`ParquetDataCatalog`)

All market data — quotes, trades, bars, order book deltas, custom data — is
persisted in **Apache Parquet**, a columnar, compressed, schema-typed format
with Arrow schemas built in for every native data type.

- Backend-agnostic: local filesystem, S3, GCS, and Azure Blob (via `fsspec`)
  are all supported without changing catalog code.
- Columnar storage means a strategy that only needs `close` and `volume` for
  a 5-year backtest reads only those columns, not entire rows — dramatically
  faster than row-oriented formats for research workloads.
- Compression ratios of 5–10x vs. CSV are typical, which matters at
  tick-level granularity across thousands of instruments.
- Jesse uses SQLite; Backtrader typically reads CSV directly; Zipline uses
  HDF5/bcolz bundles. None of these are columnar, cloud-native, or
  Arrow-interoperable with the rest of the modern Python data stack
  (Polars, DuckDB, pandas 2.x).

---

## 6. Full Option Chain + Greeks Engine

Nautilus is the only framework in this comparison with first-class,
native support for options:

- Instrument types: `OptionContract`, `OptionSpread`, `CryptoOption`,
  `CryptoOptionSpread`, `BinaryOption`.
- `OptionSeriesId` + `StrikeRange` (modes: `atm_relative`, `atm_percent`,
  `fixed`, `delta`) allow subscribing to a whole option chain slice — e.g.
  "all strikes within ±5% of ATM" — without enumerating instrument IDs by
  hand.
- `OptionGreeks` data type carries `delta`, `gamma`, `vega`, `theta`, `rho`,
  `mark_iv`, `bid_iv`, `ask_iv` per contract per timestamp.
- A local Black-Scholes Greeks calculator ships as a fallback for venues
  that don't publish Greeks natively.
- Continuous futures support with roll-adjustment for building continuous
  price series across expiries.

Jesse AI has **zero** option support of any kind. This is directly critical
to IndisNaut, since NIFTY/BANKNIFTY weekly and monthly option chains are a
core data source and trading surface for the project.

---

## 7. Multi-Venue Architecture as a First-Class Concept

A Nautilus backtest or live node can run **multiple venues simultaneously**,
each with its own instruments, account, order book, and matching/settlement
rules:

- `OmsType`: `HEDGING` (positions per order, MT4/5-style) vs. `NETTING`
  (single net position per instrument).
- `AccountType`: `CASH`, `MARGIN`, `SPOT`, `BETTING`.
- `BookType`: `L1_MBP` (top of book), `L2_MBP` (market by price), `L3_MBP`
  (market by order).
- 18+ shipped venue adapters, including **Betfair** (betting exchange) and
  **Polymarket** (prediction market) — asset classes no other backtesting
  framework touches at all.

Jesse and Backtrader assume a single account/single exchange context per
run; multi-venue arbitrage or cross-listed-instrument strategies require
manual workarounds.

---

## 8. Same Code for Backtest AND Live (Zero Changes)

`BacktestEngine` and `LiveNode` are both thin wrappers around the same
`NautilusKernel`. Strategy classes are identical across all three supported
environments — **Backtest**, **Sandbox**, and **Live** — with no
environment-detection branching required in user code. Differences between
environments (data latency simulation, fill assumptions, clock source) are
documented, not hidden, but they live entirely in configuration, not
strategy code.

Jesse requires strategies to explicitly branch on `self.is_backtesting` /
`self.is_livetrading` in user code — meaning a bug can exist in the live
branch that is invisible to backtests.

---

## 9. Deterministic Simulation Testing (DST)

Nautilus documents and supports **bit-identical replay** of a backtest run
across different machines and runs:

- All randomness (fill probability draws, latency jitter) is
  seed-controlled.
- A `madsim`-based simulation runtime controls scheduling, time advancement,
  and randomness injection so that concurrency-related nondeterminism is
  eliminated from the replay.
- This makes it possible to prove that two runs with the same seed and
  inputs produced exactly the same fills, PnL, and order events — a
  correctness property most frameworks cannot make any claim about.

No other trading framework in this comparison documents a deterministic
simulation testing capability at all.

---

## 10. Event Sourcing Subsystem

Every state-affecting message in Nautilus (order events, fills, account
updates, position changes) is captured at the message bus boundary and
persisted, giving full durability and auditability:

- Backed by `redb`, an embedded pure-Rust key-value store, one instance per
  run.
- Snapshot-anchored recovery: the system can replay from the nearest
  snapshot plus subsequent events rather than replaying an entire run from
  scratch.
- Cryptographic hashing of event chains for tamper-evidence/verification.
- Explicit run-lifecycle states: `Ended`, `CrashedRecovered`, `Quarantined`
  — a crashed run that cannot be safely resumed is quarantined rather than
  silently continued.

This directly complements the crash-only design (§2) and has no analogue in
Jesse, Backtrader, Zipline, or QuantConnect.

---

## 11. `CustomData` with Arrow C FFI Bridge

Users can register **any** data type — fundamentals, alternative data,
sentiment scores, on-chain metrics — with an Arrow schema, and it flows
through exactly the same pipeline as built-in bars/quotes/trades: routing,
persistence to the Parquet catalog, and strategy subscription.

- The Arrow C Data Interface lets custom data defined in pure Python cross
  the Python/Rust boundary as zero-copy Arrow record batches — no JSON
  serialization, no schema drift between the Python side and the Rust core.
- Jesse forces all data into its OHLCV candle shape; anything else (e.g. an
  earnings calendar, an FII/DII flow number) has to be smuggled in as a fake
  candle field or handled entirely outside the framework.

---

## 12. 12+ Fill Models with Probabilistic Slippage

Nautilus ships an unusually large library of fill/execution simulation
models:

`Default`, `BestPrice`, `OneTickSlippage`, `Probabilistic`, `TwoTier`,
`ThreeTier`, `LimitOrderPartial`, `SizeAware`, `CompetitionAware`,
`VolumeSensitive`, `MarketHours`, and more.

- The `Probabilistic` model exposes tunable parameters: `prob_fill_on_limit`,
  `prob_slippage`, `random_seed`, `liquidity_consumption` — allowing
  realistic partial fills and adverse selection to be modeled rather than
  assumed away.
- Jesse's fill logic is a basic "did price touch this OHLC range" check with
  no probabilistic or liquidity-aware component.

---

## 13. Fixed-Point Price/Quantity/Money Types

Nautilus never represents money or price as an IEEE-754 float internally:

- `Price` and `Quantity` are backed by 64-bit or 128-bit fixed-point
  integers with a configurable precision (decimal places).
- `Quantity` is **unsigned** — a negative quantity is a type-level
  impossibility, not just a runtime check.
- `Money` always carries an explicit `Currency`, preventing silent
  cross-currency arithmetic errors.
- Dual precision modes (standard 64-bit and high-precision 128-bit builds)
  let users trade off memory/speed against precision for high-notional or
  high-decimal-count instruments.

No other framework in this comparison has an unsigned quantity type or a
dual fixed-point precision mode; most represent price/quantity as Python
`float` or `Decimal`.

---

## 14. Risk Engine as a Standalone Component

`RiskEngine` sits between the strategy and the execution engine as its own
addressable component (not a helper function strategies may or may not
call), with pluggable pre-trade controls:

- Price and quantity precision validation against instrument specs.
- Account balance sufficiency checks.
- Max order quantity / max notional limits.
- Order rate limiting.
- Trading-state validation (halted/reduce-only/closing-only).

Jesse, Backtrader, and Zipline leave risk checks entirely to user-written
strategy code with no dedicated, independently testable component.

---

## 15. Order Type Catalog (Most Comprehensive)

| Category | Nautilus supports |
|---|---|
| Order types (11) | `Market`, `Limit`, `StopMarket`, `StopLimit`, `TrailingStopMarket`, `TrailingStopLimit`, `MarketToLimit`, `MarketIfTouched`, `LimitIfTouched` |
| Contingencies (3) | `OCO`, `OUO`, `OTO` |
| Time-in-force (7) | `IOC`, `FOK`, `GTC`, `GTD`, `DAY`, `AT_THE_OPEN`, `AT_THE_CLOSE` |
| Emulation / algos | Order emulation (client-side conditional orders), built-in `TWAP` and `VWAP` execution algorithms |

This is the most comprehensive order taxonomy of any framework surveyed;
Jesse supports market/limit/stop orders with no contingency relationships
and no execution algorithms.

---

## 16. Synthetic Instruments

`SyntheticInstrument` lets a user define an instrument whose price is a
**formula derived from other instruments** — potentially across different
venues — supporting spreads, baskets, and ratios that don't correspond to
any single tradable exchange listing.

No other framework surveyed has first-class synthetic instrument support;
spread/basket logic must be hand-rolled in strategy code elsewhere.

---

## 17. Queue Pressure & Socket Transport Monitoring (Live)

Nautilus's live node monitors its own operational health as a first-class
concern:

- Queue depth and dispatch latency are tracked against configurable
  thresholds, publishing `QueueStateChanged` events when backpressure
  builds.
- WebSocket/TCP transport health — heartbeat timeout, feed idle timeout,
  dead-peer detection — is tracked per connection, publishing
  `SocketStateChanged` events.

No other framework surveyed exposes this level of network/queue health
observability as structured events a strategy or ops layer can subscribe to.

---

## 18. AI/ML Training Design

Nautilus is explicitly engineered to be fast enough to serve as the
environment for reinforcement-learning and evolutionary-strategy agent
training loops (which require millions of episode steps), not just
human-paced backtests:

- Documented MCP (Model Context Protocol) integration.
- `AI_POLICY.md`, `CLAUDE.md`, and `AGENTS.md` ship in the repository,
  signaling the project treats AI-agent-driven development and AI-agent
  strategy authorship as a supported use case, not an afterthought.

No other framework surveyed is openly designed around AI agent training or
AI-agent-assisted development.

---

## Summary Table

| # | Feature | Jesse AI | Backtrader | Zipline | QuantConnect (LEAN) |
|---|---|---|---|---|---|
| 1 | Rust core + Python bindings | ✗ (Rust indicators only) | ✗ | ✗ | ✗ (C# engine, no Python hot path) |
| 2 | Crash-only design | ✗ | ✗ | ✗ | ✗ |
| 3 | DDD + hexagonal architecture, 19 instrument types | ✗ (~1 type) | ✗ | ✗ | Partial (asset classes, no hexagonal ports) |
| 4 | 20+ bar aggregation types | ✗ (~6 time bars) | ✗ (time/tick resampling only) | ✗ (time bars only) | Partial (time + some tick/renko via community libs) |
| 5 | Parquet data catalog, cloud-native | ✗ (SQLite) | ✗ (CSV) | ✗ (HDF5/bcolz) | ✗ (proprietary/CSV) |
| 6 | Full option chain + Greeks engine | ✗ | ✗ | ✗ | Partial (US equity options only, no chain subscription API) |
| 7 | Multi-venue first-class, betting/prediction markets | ✗ | ✗ | ✗ | Partial (multi-brokerage, no betting/prediction markets) |
| 8 | Identical code backtest/live | ✗ (explicit flags) | Partial | ✗ | Partial |
| 9 | Deterministic simulation testing | ✗ | ✗ | ✗ | ✗ |
| 10 | Event sourcing subsystem | ✗ | ✗ | ✗ | ✗ |
| 11 | CustomData + Arrow FFI | ✗ (OHLCV only) | ✗ | ✗ | Partial (custom data, no Arrow FFI) |
| 12 | 12+ fill models, probabilistic slippage | ✗ (basic OHLC match) | Partial (basic slippage models) | ✗ | Partial |
| 13 | Fixed-point, unsigned Quantity type | ✗ (float) | ✗ (float) | ✗ (float) | Partial (decimal, no unsigned type) |
| 14 | Standalone risk engine | ✗ | ✗ | ✗ | Partial (risk management module, not a core engine) |
| 15 | 11 order types, 3 contingencies, 7 TIF | ✗ (basic set) | Partial | ✗ | Partial |
| 16 | Synthetic instruments | ✗ | ✗ | ✗ | ✗ |
| 17 | Queue/socket health monitoring events | ✗ | ✗ | ✗ | ✗ |
| 18 | AI/ML training design, MCP integration | ✗ | ✗ | ✗ | ✗ |

---

## Relevance to IndisNaut

These features map directly onto IndisNaut's requirements as an Indian
markets research and trading platform:

- **Rust performance** is necessary to process and backtest across
  5,000+ NSE/BSE-listed stocks without the per-tick Python overhead that
  would make universe-wide research impractical.
- **Full option chain + Greeks engine** (§6) is the single most important
  feature for IndisNaut, since NIFTY and BANKNIFTY weekly/monthly option
  chains are a core trading surface — a capability Jesse and Backtrader
  simply do not have.
- **Multi-venue architecture** (§7) maps naturally onto NSE (cash + F&O),
  BSE, and MCX running as distinct venues within a single backtest or live
  session, without hacking around a single-exchange assumption.
- **CustomData with Arrow FFI** (§11) is the mechanism for pulling
  Screener.in fundamentals, corporate actions, and other non-price data
  into the same pipeline as bars/quotes, instead of maintaining a parallel
  ad hoc data path.
- **Event sourcing** (§10) gives IndisNaut research reproducibility:
  any backtest result can be traced back to the exact sequence of events
  that produced it, which matters when validating strategies before risking
  real capital.
- **Fixed-point Price/Quantity/Money types** (§13) avoid floating-point
  rounding errors in INR PnL calculations — important given India's fine
  tick sizes (paise-level) and high-notional F&O contracts (NIFTY lot
  values in the lakhs).
</content>
