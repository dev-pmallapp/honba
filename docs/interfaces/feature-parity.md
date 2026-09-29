# Feature Parity (Jesse, OpenAlgo) and SDK Redesign

Status: implemented (P0 done, statuses updated 2026-09-29); P1/P2 remain proposals. Scope: what honba must cover from Jesse and OpenAlgo, where
each capability lives (barter engine, PyO3 bridge, Python SDK), and the idiomatic SDK that
replaces the Jesse/OpenAlgo look-alike draft in `python/honba/strategy` and
`python/honba/research`.

Update: the P0 SDK below is implemented (`docs/interfaces/python-sdk.md`); the sketches in section 3 were adapted (`self.history(tf=)` instead of `self.bars(tf)`, `PortfolioStrategy` folded into the single multi-symbol `Strategy`, `trail_stop` replaced by engine-native `Trail`).

Update (P1 research depth): J16, J17, J21, J25, J30, J31, J32 and O4 are implemented in the SDK (`python-sdk.md`, Research depth); `PortfolioStrategy` returns as a `Strategy` subclass adding a universe, a rebalance schedule and `rebalance(weights)`.

Direction: the SDK does not copy Jesse's or OpenAlgo's API shape or naming. It must cover
their **features**. The existing `Strategy` (Jesse lifecycle) and `BarContext.placeorder`
(OpenAlgo names) drafts become thin compatibility shims at most (P2) or are dropped.

## 0. Baseline: what honba has today

| Area | State | Where |
|---|---|---|
| Engine | Bar-by-bar backtest on barter `Engine` + barter `MockExchange`, paced by a `BarGate`; decisions via a `Decider` trait; honba cash ledger (barter mock does not credit sale proceeds). | `crates/honba-barter` |
| Orders | *(historical, before P0)* **Market only.** `Action {symbol, side, qty}`; submitted as barter `OrderKind::Market` + `ImmediateOrCancel`, request price = latest close, so fills happen at the close of the decision bar. barter's `MockExchange::validate_order_kind_supported` rejects anything but `Market`. | `honba-barter/src/strategy.rs` |
| Pre-trade checks | `unknown_symbol`, `invalid_qty`, `no_price`, `insufficient_cash`, `insufficient_position` (unless `allow_short`). | same |
| Costs | *(historical)* Flat `fees_percent`. `IndianTaxCalculator` (brokerage, STT, exchange, SEBI, stamp, GST) exists in `honba-core/src/tax.rs` but is **not wired in**. | `honba-core` |
| Risk | *(historical; sessions, lot/tick/freeze, square-off now live in `honba-barter`)* `RiskGuard` trait + `RiskError::{DrawdownBreached, InsufficientMargin, MarketClosed}` only. **No circuit limits, no session, no lot/tick rules implemented.** | `honba-core/src/risk.rs` |
| Instruments | `Instrument` enum has `lot_size`/`tick_size` (Equity, Option), `ProductType {CNC, MIS, MTF, NRML}`, `OrderType {Market, Limit, StopLoss, StopLossLimit}`, `TimeFrame`. None of these reach the engine config. | `honba-core/src/types.rs` |
| Report | summary (net_pnl, cagr, max_drawdown, sharpe, sortino, calmar, win_rate, profit_factor, fees, counts), per-instrument metrics, fills (`trades`), `rejected`, equity curve, final positions. | `honba-barter/src/report.rs` |
| Sweeps | Rust `run_sweep` (N deciders, one runtime); Python `sweep()` grid, sequential. | both |
| PyO3 | `_core` exposes `run_backtest`, `calculate_dsr`, `calculate_pbo`. | `honba-pyo3` |
| Python SDK | **Done (P0)**: backend-agnostic `Strategy` / `Param` / order API, neutral types, engine protocol + registry (`barter`, `simple`), session-anchored multi-timeframe, sizing, 14 numpy indicators, `backtest` / `sweep`, net round-trip metrics, candle validation. Tested against the real `_core`. See `python-sdk.md`. | `python/honba` |
| Anti-overfit | DSR, PBO in Rust. | `honba-overfit` |
| Broker | Dhan client stub + keyring token storage. | `honba-dhan` |

Status legend used below: **none** (nothing), **draft** (exists but incomplete / untested
against the real engine / wrong semantics), **done** (usable as-is).
Placement: **Engine** = Rust in `honba-barter`/`honba-core` (anything that affects fills,
cash, positions or must be identical in live), **Bridge** = PyO3 `_core` contract/marshalling,
**SDK** = pure Python, **Out** = out of scope for now.

## 1. Feature matrix

### 1.1 Jesse

| # | Feature | Status | Belongs in | Pri | Notes (Indian market) |
|---|---|---|---|---|---|
| J1 | Event-driven candle backtest | done | Engine | P0 | Works (market orders, close fill). Needs next-bar-open fill option, session awareness. |
| J2 | Routes / multi-symbol | done | Engine + SDK | P0 | Engine is multi-symbol; SDK runs one instance per symbol. Needs a portfolio-level strategy (one instance sees all symbols) for pairs / cross-sectional. |
| J3 | Data routes / multi-timeframe (`get_candles(tf)`) | done | SDK (P0), Engine (P2) | P0 | Resample base bars in Python; a higher-TF bar becomes visible only after it closes. NSE session buckets must anchor at 09:15 IST, not UTC midnight (e.g. 1h bars: 09:15, 10:15 ... 15:15 partial). Daily bar = session, not calendar UTC day. |
| J4 | No look-ahead (strategy sees only closed candles) | done | Engine + SDK | P0 | Holds for base TF today; must hold for resampled TFs and for intrabar stop/limit triggers. |
| J5 | Warm-up candles | done | Engine (`start_ms`) + SDK | P0 | Indicators need history before the first tradable bar; metrics must start at `start_ms`. |
| J6 | Indicator library (~170, `sequential=`) | draft (14 numpy indicators) | SDK (wrap), Engine later | P1 | Wrap a vetted library (TA-Lib / polars-ta-extension) behind `honba.ta`; do not hand-roll 170. Rust `honba-indicators` for hot paths later. India extras: VWAP anchored to session, Supertrend, CPR/pivots, OI-based (P2). |
| J7 | Position sizing helpers (`risk_to_qty`, `size_to_qty`, `kelly_criterion`, `estimate_risk`) | done | SDK | P0 | Must round down to `lot_size` (F&O) and respect `freeze_qty`; equity cash lot = 1. |
| J8 | Stop-loss / take-profit on entry (`self.stop_loss = ...`) | done | Engine | P0 | Needs conditional orders evaluated intrabar against bar high/low; gap-through fills at open. Circuit lock can prevent exit fill. |
| J9 | Partial exits (list of TP/SL legs) | none (single-level bracket only) | Engine (orders) + SDK (sugar) | P1 | Legs must be multiples of lot size. |
| J10 | Trailing stop (`update_position` moves SL) | done (engine-native trail) | SDK (P0 via modify), Engine native trail (P1) | P0 | With modify/cancel in the contract, trailing is Python logic per bar; a native `trail` field avoids per-bar Python round trips. |
| J11 | Limit and stop entries (price vs current decides type) | done | Engine | P0 | barter `MockExchange` only accepts Market: honba must hold resting orders itself and submit a Market request at the computed fill price when triggered. Tick-size rounding (0.05, price-banded). |
| J12 | `should_cancel_entry`, order cancel | done | Engine (cancel op) + SDK | P0 | Default: cancel unfilled entry at next bar (Jesse) or DAY TIF expiry at session close (India). |
| J13 | Position lifecycle hooks (`on_open_position`, `on_close_position`, `on_increased/reduced_position`, `on_cancel`) | done | Bridge (fills in ctx) + SDK | P0 | Needs per-bar fill/cancel events in the bar context. Today SDK guesses entry price. |
| J14 | Position details (avg entry, pnl, `average_stop_loss`, `trades`, `orders`) | done | Engine (report in ctx) | P0 | Engine must send avg price, realised pnl, product per position and open orders. |
| J15 | Hyperparameters (typed, ranges) + DNA | done | SDK | P0 | Declared params with bounds/types feed sweep and optimizer. |
| J16 | Optimisation (Optuna + Ray, objective: sharpe/calmar/sortino/omega/serenity/smart ratios, train/test split) | done (`hb.optimize` Optuna TPE / random / grid, train/test split, `hb.walk_forward`, DSR + CSCV PBO on results; sequential, no Ray) | SDK | P1 | Optuna in Python; parallelism via processes (Python callbacks hold the GIL, so Rust `run_sweep` concurrency does not help for Python strategies). Must record trial count for DSR. |
| J17 | Monte Carlo on trades (shuffle / resample) | done (`result.monte_carlo`: shuffle / resample / block) | SDK | P1 | Pure post-processing of the trade list. |
| J18 | Monte Carlo on candles (block bootstrap, gaussian noise/resampler pipelines) | none | SDK | P2 | Python generates synthetic candles, reruns backtests. Respect circuit bands when perturbing. |
| J19 | Rule significance test (bootstrap) | none | SDK | P2 | Complements honba DSR/PBO. |
| J20 | Metrics (expectancy, avg win/loss, streaks, holding periods, long/short split, omega, serenity, largest win/loss, underwater period, trades/day) | done | SDK (from trades/equity) | P0 | Derive in Python from fills/round trips and equity; keep Rust report lean. Annualise with ~250 NSE sessions, not 365. |
| J21 | Charts / reports (equity, drawdown, monthly returns, benchmark, candle chart with trades, custom lines) | done (`result.tearsheet` HTML, Plotly or SVG; `result.to_json`; benchmark alpha / beta / IR; no candle chart with trades yet) | SDK | P1 | Benchmark default NIFTY 50 / NIFTY 500 TRI. Plotly/HTML tearsheet; web2 can reuse JSON. |
| J22 | Import candles (exchange drivers) + candle store | draft (frame ingest + validation, no loaders) | SDK + `honba-dhan` | P1 | Dhan historical API, CSV/Parquet catalog. Validate against session calendar (overnight/holiday gaps are not missing data). Corporate-action adjustment (splits/bonus) for equity. |
| J23 | Candle validation (contiguous, monotonic) | done | SDK | P0 | Session-aware gap check, duplicate timestamps, OHLC sanity (low <= open/close <= high). |
| J24 | Research API (`research.backtest` with in-memory candles) | done | SDK | P0 | Current `backtest()`; to be reshaped (section 3). |
| J25 | Filters (`filters()` gates entries) | done (`Strategy.filters()`) | SDK | P1 | Trivial in Python. |
| J26 | Trading hours / `is_trading_hours` | done | Engine | P0 | NSE 09:15-15:30 IST, pre-open 09:00-09:08, holiday calendar, muhurat session. Engine must know sessions for MIS square-off and DAY TIF. |
| J27 | Fees (maker/taker) | done | Engine | P0 | Wire `IndianTaxCalculator` per fill (see 1.3). |
| J28 | Leverage / futures margin / liquidation | partial (margin config: MIS leverage, NRML / short margin %, `insufficient_margin`; no SPAN, no liquidation engine) | Engine | P2 | India: MIS intraday leverage (broker-defined, ~5x equity), NRML SPAN+exposure. No liquidation engine; broker auto-square-off on margin shortfall. |
| J29 | Shorting | done | Engine | P0 | Equity cash shorts are intraday (MIS) only; must be squared off same day. Overnight shorts only via F&O (NRML). |
| J30 | Portfolio rebalance / universes | done (`PortfolioStrategy`: universe, schedule, `rebalance(weights)`; no point-in-time index membership) | SDK | P1 | Universe = index constituents (NIFTY 50/100/500) with point-in-time membership (P2). |
| J31 | Shared vars across routes | done (one instance per run; `PortfolioStrategy.state`) | SDK | P1 | Replaced by portfolio-level strategy. |
| J32 | Logging (`self.log`), debug mode | done (`Strategy.log`, `result.log_frame`, in JSON / tearsheet) | SDK | P1 | Log lines tagged with bar time into the result. |
| J33 | Live / paper trading parity (same strategy code) | none | Engine (barter live) + `honba-dhan` | P2 | Same `Strategy` class runs on a live runner: barter engine + Dhan execution client + Dhan websocket data. Daily token expiry / re-login. |
| J34 | Notifications (Telegram/Discord/Slack) | none | Out (P2) | P2 | Live only. |
| J35 | ML pipeline (`record_features`, `ml_predict`, export) | none | SDK | P2 | Feature/label recording hook in strategy; fits with `docs/research/llm-ml-enhancement.md`. |
| J36 | MCP server for AI agents | draft (stub) | SDK (`honba.mcp`) | P1 | Tools: import data, write/run strategy, report, optimise, overfit audit. |
| J37 | Web dashboard / CLI parity | draft (CLI stub) | Out for SDK | P2 | `honba.cli` wraps the SDK; web2 consumes report JSON. |

### 1.2 OpenAlgo

| # | Feature | Status | Belongs in | Pri | Notes (Indian market) |
|---|---|---|---|---|---|
| O1 | Order types MARKET / LIMIT / SL / SL-M | done | Engine | P0 | Same machinery as J8/J11. SL = stop-limit, SL-M = stop-market. Tick rounding. |
| O2 | Product types CNC / MIS / NRML (MTF) | done | Engine | P0 | Drives costs (STT differs MIS vs CNC), short rules, auto square-off, settlement. |
| O3 | Smart order (target position size) | done | SDK | P0 | Pure delta computation; must account for open orders to avoid double-sending. |
| O4 | Basket order (many orders at once) | done (`group=` / `with self.group(...)`, `result.groups`) | SDK | P1 | Actions are already a list per bar; add tag/group for reporting. |
| O5 | Split order (slice large qty) | none | SDK | P1 | Needed for F&O freeze quantity (exchange max qty per order); slices must be lot multiples. |
| O6 | Modify order / cancel order / cancel all | done | Engine | P0 | Contract ops `modify`, `cancel`, `cancel_all`. |
| O7 | Close position / close all | done | SDK | P0 | Smart order to 0; `close_all` iterates positions. |
| O8 | Options order by offset (ATM/ITMn/OTMn, expiry) | none | SDK (resolver) + data | P2 | Needs option chain history and instrument master (strikes, expiries, lot sizes). Weekly expiry rules changed (one weekly index expiry per exchange). |
| O9 | Multi-leg options orders (straddle, iron condor) | none | SDK (basket of legs) + Engine (margin) | P2 | Margin benefit of hedged legs matters for sizing; approximate first. |
| O10 | Option chain, Greeks, IV, OI, PCR, max pain | draft (Greeks in Rust) | SDK + `honba-indicators` | P2 | Black-Scholes exists in `honba-indicators`. |
| O11 | Quotes (LTP, bid/ask) | none | SDK (`honba-dhan`) | P2 | Live only; backtest uses bars. |
| O12 | Market depth (L5) | none | SDK (`honba-dhan`) | P2 | Live only; Dhan offers 20-level depth. |
| O13 | Historical data / intervals | none | SDK (`honba-dhan`) | P1 | Same loader as J22. |
| O14 | Symbol search / instrument master / expiry list | none | SDK | P1 | Instrument master supplies `lot_size`, `tick_size`, `freeze_qty`, segment to the engine config. |
| O15 | Account: funds, order book, trade book, position book, holdings | done (ctx) | Bridge (backtest ctx) / `honba-dhan` (live) | P0 (ctx) / P2 (live) | Backtest ctx must expose open orders, fills, positions with avg price, holdings (CNC) vs positions (MIS). |
| O16 | Margin calculator | partial (percent-based margin in the engine) | Engine | P2 | SPAN approximation for NRML; MIS leverage table. |
| O17 | Analyzer / sandbox (paper with live data, simulated margin, auto square-off) | none | Engine (barter mock + live feed) | P2 | Reuses backtest execution model on live Dhan data. |
| O18 | Auto square-off of intraday positions | done | Engine | P0 | MIS positions closed at a configurable time (brokers ~15:15-15:25) at that bar's price; exit reason `square_off`. Also valid in backtests. |
| O19 | Python strategy hosting + IST scheduler | none | Out | P2 | Later: `honba run` service. |
| O20 | Webhooks (TradingView, Amibroker, ChartInk, GoCharting) | none | Out (honba server) | P2 | Would map alerts to SDK orders on the live runner. |
| O21 | Action center (semi-auto, manual approval) | none | Out | P2 | Live runner hook `approve(order)`. |
| O22 | Telegram bot / alerts | none | Out | P2 | Same as J34. |
| O23 | Flow visual builder | none | Out | - | Not planned. |
| O24 | PnL tracker, latency monitor, traffic logs | none | Out | P2 | web2 can show backtest/live PnL from report JSON. |
| O25 | WebSocket streaming proxy | none | Out (live) | P2 | barter-data style stream from Dhan feed. |
| O26 | Indian costs breakdown (STT, GST, stamp, exchange, SEBI) | done | Engine | P0 | See 1.3. |
| O27 | Broker abstraction (36 brokers) | none | Out | - | honba targets Dhan first; the execution-client boundary is barter's `ExecutionClient`. |
| O28 | Secure credential storage (OS keyring), daily session expiry | draft | `honba-dhan` | P2 | Keyring storage exists; add expiry/re-login. |
| O29 | MCP server / AI agent | draft (stub) | SDK | P1 | Same as J36. |

### 1.3 Indian-market mechanics that cut across rows

| # | Mechanic | Status | Belongs in | Pri | Notes |
|---|---|---|---|---|---|
| I1 | Per-fill statutory costs | done | Engine | P0 | Wire `IndianTaxCalculator` into the ledger. Fix before wiring: it takes `MarketSegment` only, so `EquityCash` is always treated as delivery (STT on both sides, zero brokerage). Needs `ProductType`: intraday equity STT is sell-side only at a lower rate and stamp duty differs; options exchange charge is on premium at a different rate than futures/cash; brokerage should be a pluggable plan (flat per order, % capped). DP charge per scrip on delivery sells is missing. Rates change with budgets: keep them in a versioned, dated table. Report must carry the cost breakdown per fill. |
| I2 | T+1 settlement / holdings vs positions | none | Engine | P1 | CNC buys become holdings next session. Config for how much sale credit is usable the same day (broker-dependent) and T+1 for withdrawal. BTST (sell before delivery) allowed. |
| I3 | Lot size | done | Engine (validate) + SDK (round) | P0 | F&O qty must be a multiple of `lot_size`; reject otherwise (`invalid_lot`). Lot sizes change over time: point-in-time table (P2). |
| I4 | Tick size | done | Engine (validate) + SDK (round) | P0 | Limit/trigger prices rounded to `tick_size`. |
| I5 | Freeze quantity | none | Engine (validate) + SDK (split) | P1 | Reject single orders above freeze qty; SDK auto-splits. |
| I6 | Circuit limits / price bands | none | Engine | P1 | Not in `risk.rs` today. Per-symbol band (2/5/10/20% of previous close; F&O stocks have dynamic bands). Reject orders priced outside the band; a bar locked at a band (high == low == band) fills no market orders on the blocked side. Index-wide market circuit halts trading. |
| I7 | Sessions / holidays / pre-open | done | Engine | P0 | Calendar in config; DAY TIF expiry at session close; no trading outside session. |
| I8 | Short-selling restriction | done | Engine | P0 | Cash equity shorts MIS-only (I7/O18 square-off); no overnight cash shorts. |
| I9 | Slippage / impact cost | none | Engine | P1 | `slippage_bps` (fixed) first; volume-participation cap later. Important for small/mid caps. |
| I10 | Corporate actions (split, bonus, dividend) | none | SDK (data) | P1 | Adjust history; dividends credited to cash for CNC holdings (P2). |

## 2. Engine vs pure Python

### 2.1 Pure Python (no contract change)

Multi-timeframe resampling (J3, session-anchored), sizing helpers (J7), hyperparameter
declaration + grid/Optuna optimisation (J15, J16), Monte Carlo and significance tests
(J17-J19), derived metrics / round-trip trades / charts (J20, J21), candle import and
validation (J22, J23), filters, logging, universes, rebalance helpers (J25, J30-J32),
smart / basket / split orders and close-all (O3-O5, O7), option offset resolution and chain
analytics (O8, O10), instrument master lookup (O14).

Pure Python, but only correct once the engine sends more state: trailing stops via modify
(J10), lifecycle hooks (J13), smart orders that net out open orders (O3).

### 2.2 Needs Rust engine / bridge work

Everything that changes **when, at what price, or whether** a fill happens, or what cash and
positions look like: J1, J4 (intrabar), J5, J8, J9, J11, J12, J14, J26-J29, O1, O2, O6, O15
(ctx), O18, I1-I9.

barter constraint: `MockExchange` accepts only `OrderKind::Market`. Keep barter's mock as
the fill executor and add a **honba conditional-order book** in `DeciderStrategy`: resting
limit/stop/SL/TP orders live in honba state; on each bar, before the decider runs, honba
checks them against that bar's OHLC and, when triggered, submits a barter Market/IOC request
whose `price` is the computed fill price (the mock fills at the request price, which is how
close fills already work). The same book is reused unchanged by the live paper runner.

### 2.3 Concrete additions to `_core.run_backtest(config_json, candles, on_bar) -> report_json`

All additions are optional keys with defaults that reproduce today's behaviour.

**Config (new keys)**

```jsonc
{
  "start_ms": 1704067200000,          // J5: bars before this are warm-up: on_bar runs, orders are rejected ("warmup"), metrics/equity start here
  "fill_model": "close",              // "close" (today) | "next_open": market orders fill at the next bar's open
  "slippage_bps": 0.0,                // I9: adverse price offset on market and stop-market fills
  "intrabar_priority": "stop_first",  // J8: when SL and TP both trigger in one bar: "stop_first" | "target_first"
  "costs": {                          // I1: replaces fees_percent when present
    "model": "india",                 // "flat" (uses fees_percent) | "india" (IndianTaxCalculator)
    "brokerage": {"per_order": 20.0, "pct": 0.03, "cnc_free": true},
    "table": "2024-10-01"             // dated statutory rate table
  },
  "instruments": {                    // I3-I6, O2: per-symbol metadata; unknown symbol -> equity cash defaults
    "NIFTY25OCTFUT": {"segment": "equity_futures", "lot_size": 75, "tick_size": 0.1,
                      "freeze_qty": 1800, "default_product": "NRML"},
    "SBIN": {"segment": "equity_cash", "lot_size": 1, "tick_size": 0.05,
             "price_band_pct": 20.0, "default_product": "CNC"}
  },
  "session": {                        // I7, O18, J26
    "tz": "Asia/Kolkata", "open": "09:15", "close": "15:30",
    "mis_square_off": "15:20",        // MIS positions closed at the first bar at/after this time
    "holidays": ["2025-10-21"]        // dates without sessions (validation + DAY expiry)
  },
  "settlement": {"cnc": "T+1", "same_day_sell_credit": 1.0},   // I2 (P1)
  "margin": {"mis_leverage": 5.0}     // J28/O16 (P2): intraday buying power multiplier
}
```

**Action (extend the per-bar list returned by `on_bar`)**

```jsonc
// place (today's {symbol, side, qty} stays valid: kind=market, product=default_product)
{"op": "place", "id": "c-17", "symbol": "SBIN", "side": "buy", "qty": 10,
 "kind": "market" | "limit" | "stop" | "stop_limit",   // O1: stop = SL-M, stop_limit = SL
 "price": 812.35,                  // limit price (limit, stop_limit)
 "trigger": 815.0,                 // trigger price (stop, stop_limit)
 "tif": "day" | "ioc" | "gtc",     // day expires at session close
 "product": "CNC" | "MIS" | "NRML",
 "reduce_only": false,
 "tag": "breakout",                // echoed in fills/report
 "stop_loss": 790.0,               // J8: attached exit, activated when the entry fills (OCO with take_profit)
 "take_profit": [[0.5, 840.0], [0.5, 860.0]],   // J9: [fraction, price] legs (or a single price)
 "trail": {"type": "pct" | "abs", "value": 1.5}  // J10 (P1): native trailing on the attached stop
}
{"op": "modify", "id": "c-17", "price": 813.0, "trigger": 816.0, "qty": 10}   // O6
{"op": "cancel", "id": "c-17"}                                                 // O6, J12
{"op": "cancel_all", "symbol": "SBIN"}                                          // symbol optional
```

Engine rejections (existing list plus): `invalid_lot`, `invalid_tick`, `above_freeze_qty`,
`outside_price_band`, `market_closed`, `warmup`, `short_not_allowed` (CNC short),
`unknown_order` (modify/cancel), `insufficient_margin`.

**Bar context passed to `on_bar` (additions)**

```jsonc
{
  "time_ms": ..., "candles": {...}, "cash": ..., "equity": ...,   // equity exists in Rust ctx; pass it through
  "positions": {"SBIN": {"qty": 10, "avg_price": 812.1, "product": "CNC",
                         "realised_pnl": 0.0, "unrealised_pnl": 35.0}},   // today: bare qty
  "open_orders": [{"id": "c-18", "symbol": "SBIN", "side": "sell", "kind": "stop",
                   "qty": 10, "filled_qty": 0, "trigger": 790.0, "parent": "c-17", "role": "stop_loss"}],
  "events": [                                   // since the previous on_bar, in order (J13)
    {"type": "fill", "id": "c-17", "symbol": "SBIN", "side": "buy", "qty": 10,
     "price": 812.35, "costs": {"brokerage": 0, "stt": 8.1, "...": 0}, "reason": "entry"},
    {"type": "cancel" | "expire" | "reject", "id": "...", "reason": "..."}
  ],
  "session": {"is_open": true, "minutes_to_close": 125, "date": "2025-10-01"}
}
```

Fill `reason` values: `signal`, `limit`, `stop`, `stop_loss`, `take_profit`, `trail`,
`square_off`, `liquidate_end` (end-of-test flatten, if enabled).

**Report (additions)**

- `trades[]` (fills): `order_id`, `tag`, `product`, `reason`, per-fill cost breakdown
  (brokerage, stt, exchange_fee, sebi_fee, stamp_duty, gst, dp).
- `orders[]`: every order with final status (filled / partially / cancelled / expired /
  rejected), timestamps, prices.
- `summary.costs`: totals per cost component (STT is often the largest line in India).
- `warmup_bars`, `start_ms` echoed; equity curve starts at `start_ms`.
- Round-trip trades, extended metrics, daily/monthly returns: computed in Python from
  `trades` + `equity_curve` (no Rust change).

**Bridge**

- `_core.run_backtest` as above; errors raised as a Python exception with the decider
  traceback preserved.
- Pass candles as numpy arrays (or Arrow) rather than lists of tuples when the data is large
  (P1, performance only).
- `_core.version()` / `_core.contract_version()` so the SDK can detect mismatches.

**Not needed in the engine (P0):** multi-timeframe bars. The engine ticks at the base
timeframe; the SDK resamples and exposes a higher-TF bar only after it closes. A native
multi-TF stream (`candles` keyed `{symbol: {tf: bar}}`) is P2 for performance.

## 3. SDK redesign

### 3.1 Principles

- One strategy model: a class with a single `on_bar` plus optional event hooks. No
  `should_long`/`go_long` split, no OpenAlgo string verbs. Jesse-style lifecycle can be a
  small subclass in `honba.compat` later if anyone wants it.
- Orders are method calls returning an `Order` handle (id, status); prices and quantities are
  validated and rounded to tick/lot on the Python side before the engine rejects them.
- Parameters are declared, typed and bounded, so the optimiser, the DSR trial counter and the
  MCP server can discover them.
- The same strategy object runs in backtest, paper and live; the runner differs.
- `import honba as hb` exposes everything a strategy file needs.

### 3.2 Strategy

```python
import honba as hb
from honba import ta

class Breakout(hb.Strategy):
    timeframe = "15m"                  # base bars fed by the engine
    extra_timeframes = ("1d",)         # resampled in Python, session-anchored, closed bars only
    product = hb.MIS                   # default product for orders

    lookback = hb.Param(20, low=10, high=60)
    risk_pct = hb.Param(0.01, low=0.0025, high=0.02)
    atr_mult = hb.Param(2.0, low=1.0, high=4.0)

    def on_bar(self, bar: hb.Bar) -> None:
        if not self.session.is_open or self.session.minutes_to_close < 30:
            return
        daily = self.bars("1d")                      # hb.Bars: .close, .high ... numpy views
        hi = self.bars().high[-self.lookback - 1:-1].max()
        atr = ta.atr(self.bars(), 14)[-1]

        if self.position.is_flat and bar.close > hi and daily.close[-1] > ta.sma(daily.close, 50)[-1]:
            stop = bar.close - self.atr_mult * atr
            qty = self.size.by_risk(self.risk_pct, entry=bar.close, stop=stop)   # lot/tick aware
            self.buy(qty, stop_loss=stop, take_profit=bar.close + 3 * atr, tag="breakout")

        elif self.position.is_long:
            self.trail_stop(to=bar.close - self.atr_mult * atr)                 # only ever tightens

    def on_fill(self, fill: hb.Fill) -> None:          # optional hooks
        self.log(f"{fill.reason} {fill.qty}@{fill.price} costs={fill.costs.total:.2f}")

    def on_exit(self, trade: hb.RoundTrip) -> None: ...
```

Single-symbol strategies get one instance per symbol (`self.symbol`, `self.position`,
`self.bars()`). Portfolio strategies see the whole universe:

```python
class Momentum(hb.PortfolioStrategy):
    timeframe = "1d"
    top_n = hb.Param(10, low=5, high=30)

    def on_bar(self, bars: hb.BarSet) -> None:
        if not self.calendar.is_month_end(bars.time):
            return
        ret = {s: b.close[-1] / b.close[-126] - 1 for s, b in self.universe_bars(126).items()}
        winners = sorted(ret, key=ret.get, reverse=True)[: self.top_n]
        self.rebalance({s: 1 / self.top_n for s in winners}, product=hb.CNC)   # weights -> target qty, lot-rounded
```

### 3.3 Orders

```python
o = self.buy(10)                                    # market
self.buy(10, limit=812.35, tif="day")               # limit
self.sell(10, stop=790)                             # SL-M
self.sell(10, stop=790, limit=788)                  # SL (stop-limit)
self.buy(75, symbol="NIFTY25OCTFUT", product=hb.NRML)
self.buy(10, stop_loss=790, take_profit=[(0.5, 840), (0.5, 860)])   # bracket, partial exits
o.modify(limit=813); o.cancel(); self.cancel_all()
self.target(20)                                     # smart order: trade the delta, nets open orders
self.close() ; self.close_all()
self.basket([hb.leg("NIFTY", "CE", strike="ATM+1", qty=75, side="sell"),
             hb.leg("NIFTY", "PE", strike="ATM-1", qty=75, side="sell")])     # P2
self.buy(3600, split=True)                          # auto-slice at freeze_qty, lot multiples
```

### 3.4 Running and research

```python
data = hb.data.load("SBIN", "15m", start="2022-01-01", end="2025-09-30", source="dhan")  # or frames
hb.data.validate(data)                              # session-aware gap / OHLC checks

cfg = hb.BacktestConfig(capital=10_00_000, costs=hb.costs.india(broker="discount"),
                        fill="next_open", slippage_bps=5, warmup="30d")
res = hb.backtest(Breakout, data, cfg, params={"lookback": 30})

res.metrics            # dataclass: cagr, sharpe, sortino, calmar, omega, expectancy, streaks, ...
res.trades             # round trips (DataFrame); res.fills; res.orders; res.costs (by component)
res.equity; res.drawdown; res.monthly_returns
res.plot(benchmark="NIFTY 50"); res.to_html("report.html"); res.to_json()

study = hb.optimize(Breakout, data, cfg, objective="sharpe", trials=200,
                    split=hb.split.walk_forward(train="2y", test="6m"), jobs=8)
study.best_params; study.trials                     # trial count feeds the audit
hb.audit(study)                                     # DSR, PBO, CPCV from honba-overfit
hb.robustness.shuffle_trades(res, n=1000)           # Monte Carlo on trades
hb.robustness.bootstrap_bars(Breakout, data, cfg, n=200, block="5d")      # P2
```

Live/paper (P2) reuses the class: `hb.paper(Breakout, symbols=["SBIN"], broker=hb.dhan())`,
`hb.live(...)`.

### 3.5 Package layout

```
honba/
  __init__.py        # Strategy, PortfolioStrategy, Param, Bar, Fill, backtest, optimize, CNC/MIS/NRML
  strategy/          # Strategy base, orders, position, sizing, param declarations, MTF resampler
  engine/            # contract types, config/action/context (de)serialisation, _core import (only place)
  ta/                # indicator wrappers
  data/              # loaders (dhan, csv, parquet), validation, calendar, instrument master, corporate actions
  costs/             # cost model configs (mirrors the Rust tables; no computation)
  research/          # backtest, optimize, splits, robustness, metrics, result, plots
  audit/             # DSR/PBO/CPCV wrappers over _core
  compat/            # optional Jesse/OpenAlgo-shaped shims (P2)
```

## 4. Phased implementation

### P0: correct Indian backtests with a real order model

Engine / bridge (tell the Rust agent):
1. `_core.run_backtest` exposed; context passes `equity`, positions with `avg_price`,
   `product`, pnl.
2. Action `id`, `kind` (market/limit/stop/stop_limit), `price`, `trigger`, `tif`, `product`,
   `tag`; ops `modify`, `cancel`, `cancel_all`; honba conditional-order book on top of
   barter's market-only mock (intrabar trigger on high/low, gap fill at open, tick rounding).
3. Attached `stop_loss` / `take_profit` (single level) with OCO; `intrabar_priority`.
4. `open_orders` and `events` (fills with reason and costs, cancels, expiries, rejects) in the
   context; `orders[]` and cost breakdown in the report.
5. `costs.model = "india"`: `IndianTaxCalculator` made product-aware and wired per fill.
6. `instruments` metadata: lot and tick validation (`invalid_lot`, `invalid_tick`).
7. `session`: IST sessions and holidays, DAY expiry, MIS square-off, MIS-only cash shorts.
8. `start_ms` warm-up and `fill_model = "next_open"`.

Python SDK:
9. New `Strategy` / `PortfolioStrategy` with `on_bar`, `on_fill`, `on_exit`; order methods;
   `target`, `close`, `close_all`; `Param` declarations.
10. Session-anchored multi-timeframe resampler (closed bars only).
11. Sizing helpers (`by_risk`, `by_value`, `by_pct_equity`, Kelly) with lot/tick rounding.
12. Python-side trailing stop (`trail_stop` via modify).
13. Metrics from fills/equity (Jesse metric set, 250-day annualisation), round-trip trades.
14. Candle validation; `backtest()` + `BacktestConfig` + result object; grid `sweep` over
    `Param`s kept.
15. Tests against the real `_core` plus the existing fake for fast unit tests.

### P1: research depth

Partial TP legs and native `trail`; freeze qty + auto split; basket tags; circuit bands;
slippage; T+1 settlement/holdings; `honba.ta` wrapper (full indicator set); Optuna optimiser
with walk-forward splits and process parallelism; DSR/PBO/CPCV audit wired to studies;
trade Monte Carlo; charts/HTML tearsheet with NIFTY benchmark; Dhan historical loader +
instrument master + corporate-action adjustment; filters, logging, universes/rebalance; MCP
tools; Arrow/numpy candle transfer.

### P2: live and derivatives

Paper (analyzer) and live runners on barter + Dhan (data, execution, token expiry); quotes,
depth, streaming; options instruments, offset resolver, multi-leg baskets, option chain/Greeks
analytics, margin (SPAN approximation, MIS leverage); candle Monte Carlo and rule significance;
ML feature recording; notifications, webhooks, strategy hosting, approval workflow; compat
shims; native multi-timeframe stream in the engine; point-in-time lot sizes and index
membership.
