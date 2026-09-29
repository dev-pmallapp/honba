# Python SDK

Backend-agnostic strategy and research API. Strategies, orders, positions, fills and results
are SDK-owned types; the barter-rs engine (`honba._core`) is one pluggable backend. Install the
package with `pip install -e .` and build the engine once with `maturin develop` (config in
`[tool.maturin]`, module `honba._core`). See `feature-parity.md` for the feature matrix.

```python
import honba as hb          # Strategy, Param, Trail, backtest, sweep, ta, ...
```

Layers (import-linter contracts in `pyproject.toml`):

| Layer | Package | Knows |
|---|---|---|
| Strategy SDK | `honba.strategy` | neutral types only; imports no engine and no `honba.research` |
| Engine layer | `honba.research.engine` | `BacktestEngine` protocol, request / report types, registry |
| Engines | `honba.research._barter_adapter` (`BarterEngine`), `honba.research.simple_engine` (`SimpleEngine`) | the only modules that translate to a concrete engine; only the adapter imports `honba._core` |

## Strategies

One class per strategy, one instance per run, any number of symbols. Implement `on_bar`; the
other hooks are optional.

```python
import honba as hb

class Breakout(hb.Strategy):
    timeframe = "15m"                 # bar interval of the data
    extra_timeframes = ("1d",)        # resampled in Python: session-anchored, closed bars only
    product = hb.MIS                  # default product of orders
    requires = ("trail:atr",)         # optional: fail before the run if the engine lacks this

    lookback = hb.Param(20, low=10, high=60, step=5)
    risk_pct = hb.Param(0.01, low=0.0025, high=0.02)
    atr_mult = hb.Param(2.0, low=1.0, high=4.0)

    def on_bar(self, ctx: hb.BarContext) -> None:
        if ctx.session.minutes_to_close is not None and ctx.session.minutes_to_close < 30:
            return
        bars, daily = self.history(), self.history(tf="1d")          # closed bars only
        hi = bars.high[-self.lookback - 1 : -1].max()
        atr = hb.ta.atr(bars.high, bars.low, bars.close, 14)
        if self.position.is_flat and ctx.bar.close > hi and ctx.bar.close > hb.ta.sma(daily.close, 50):
            stop = ctx.bar.close - self.atr_mult * atr
            qty = self.size.by_risk(self.risk_pct, entry=ctx.bar.close, stop=stop)
            self.buy(qty, stop_loss=stop, take_profit=ctx.bar.close + 3 * atr,
                     trail=hb.Trail.atr(self.atr_mult), tag="breakout")

    def on_fill(self, fill: hb.Fill) -> None: ...        # any fill, incl. attached exits
    def on_exit(self, trade: hb.RoundTrip) -> None: ...  # position went flat
    def on_reject(self, reject) -> None: ...             # engine refused an order (reject.reason)
    def on_cancel(self, cancel) -> None: ...             # cancelled / expired (cancel.kind)
    def on_start(self) -> None: ...                      # once, before the first bar
```

`ctx` (`BarContext`): `time`, `time_ms`, `warmup`, `cash`, `equity`, `bars` (latest `Bar` per
symbol), `bar` (the only symbol's bar), `positions`, `open_orders`, `events`, `session`. On
`self`: `symbols`, `symbol` (single-symbol runs), `positions[sym]` / `position`, `orders(symbol,
role)`, `instrument(sym)`, `last_price(sym)`, `cash`, `equity`, `session`, `log(msg)`.
`position` is `Position(qty, avg_price, product, realised_pnl, unrealised_pnl, pnl)` with
`is_long / is_short / is_flat`. Bars during warm-up (`ctx.warmup`) feed history but orders are
ignored.

`Param(default, low=, high=, step=, choices=)`: typed and bounded; values passed to
`backtest(params=...)` / `sweep` are validated; `Param.grid()` and `Param.sample(rng)` feed
sweeps and optimisers; `Strategy.params()` lists them (for the trial counter and MCP).

### History and multi-timeframe

`self.history(symbol=None, tf=None) -> Bars` is a read-only zero-copy view (`.open .high .low
.close .volume .time_ms`, `bars[-1]`, `.last`, `.hlc3`, `.sessions`, `.to_frame()`). Higher
timeframes are resampled in Python, anchored to the session open (`TradingSession.open`, 09:15
IST), so `1h` gives 09:15, 10:15 ... 15:15 (a 15-minute stub) and `1d` is one exchange session.
A higher-timeframe bar is published only after its last base bar closed: no look-ahead. Bar
timestamps are open times (the engine convention). Weekly (`1w`) closes on the Friday session.

### Orders

```python
h = self.buy(10)                                     # market
self.buy(10, limit=812.35, tif="gtc")                # limit        (tif: day (default) | ioc | gtc)
self.sell(10, stop=790)                              # stop-market  (SL-M)
self.sell(10, stop=790, limit=788)                   # stop-limit   (SL)
self.buy(75, "NIFTYFUT", product=hb.NRML)
self.buy(10, stop_loss=790, take_profit=840)         # bracket (OCO exits, live once the entry fills)
self.buy(10, stop_loss=790, trail=hb.Trail.percent(1.5, activation=820, step=0.5))
self.buy(10, stop=815, trail=hb.Trail.amount(4))     # trailing stop entry (trails its own trigger)
h.modify(limit=813); h.cancel(); self.cancel_all(); self.cancel_all("SBIN")
self.modify(h.stop_order, stop=800)                  # tighten the live stop (id "<id>:sl")
self.target("SBIN", 20)                              # smart order: hold +20 (negative = short)
self.target("SBIN", pct=0.10)                        # 10% of equity, lot-rounded
self.close("SBIN"); self.close_all()
```

`buy/sell(qty, symbol=None, *, limit, stop, kind, tif, product, tag, stop_loss, take_profit,
trail, reduce_only, id)` return an `OrderHandle` (`id`, `status`, `order`, `modify`, `cancel`,
`stop_order`, `target_order`) or `None` when nothing was sent (warm-up, below one lot). The kind
follows the prices given. Prices are rounded to the tick and `qty` down to whole lots using the
configured `Instrument`.

`Trail` is engine-native (the engine ratchets the stop each bar; no per-bar Python round trip):
`Trail.percent(v)`, `Trail.amount(v)`, `Trail.atr(mult, period=14)`, each with `activation=`
(trailing starts when price trades through it) and `step=` (minimum improvement before the stop
moves). On an entry with `stop_loss` it trails that stop; on a `stop` order without `stop_loss`
it trails the order's own trigger. `TrailUpdate` events appear in `ctx.events`.

`target` cancels the symbol's resting entry orders, then sends only the delta to the current
position (netting orders queued earlier in the same bar), so repeated calls never double up.
Reducing orders keep the position's product. `close_all` cancels every order first.

### Sizing and instruments

`self.size` (`Sizer`) defaults to the run's equity, the latest close and the instrument's lot
size; results are rounded down to whole lots and may be `0`:

```python
self.size.by_risk(0.01, entry=100, stop=98)          # lose 1% of equity if the stop is hit
self.size.by_fraction(0.10)                          # 10% of equity
self.size.by_atr(0.01, atr=2.5, mult=2)              # stop = 2 ATR away
self.size.by_value(50_000); self.size.kelly(0.55, 1.5)   # quantity / fraction
# options: symbol=, price=, equity=, max_value=, cap_cash=True
```

Pure functions are in `honba.strategy.sizing` (`qty_by_risk`, `qty_by_fraction`, `qty_by_atr`,
`floor_to_lot`, `round_to_tick`, `kelly_fraction`). Exchange rules are configured per symbol:
`hb.Instrument("equity_futures", lot_size=75, tick_size=0.05, freeze_qty=1800,
default_product="NRML")` (segments: equity_cash, equity_futures, equity_options, commodity,
currency; unknown symbols are equity cash, lot 1, no tick rule).

### Indicators

`hb.ta` (= `honba.strategy.indicators`), vectorised numpy/pandas, latest value by default,
`sequential=True` for the series: `sma ema wilder stddev highest lowest roc rsi true_range atr
macd bollinger vwap crossed_above crossed_below crossed`. `vwap(..., sessions=bars.sessions)`
restarts every session.

## Running

```python
cfg = hb.BacktestConfig(
    capital=1_000_000,
    costs=hb.CostModel.india(),                   # or CostModel.flat(0.03)
    fill="next_open",                             # "close" (default) | "next_open"
    intrabar="stop_first",                        # or "target_first" when SL and TP both trigger
    session=hb.TradingSession(holidays=frozenset({date(2025, 10, 21)})),   # NSE hours + MIS square-off
    instruments={"NIFTYFUT": hb.Instrument("equity_futures", lot_size=75, tick_size=0.05)},
    warmup_bars=100,                              # or start="2024-06-03"
)
res = hb.backtest(Breakout, {"SBIN": df}, cfg, params={"lookback": 30})   # engine="barter" default
```

`data`: `{symbol: frame}`, a long frame with a `symbol` column, or one frame plus `symbols=`;
pandas or polars with `time|timestamp|datetime|date` (naive datetimes are IST, epoch s or ms
accepted; or a datetime index), `open high low close [volume]`. Candles are validated first
(`config.validation = "error" | "warn" | "off"`): NaN / inf, positive prices, OHLC sanity,
sorted and unique timestamps, and with a session: holidays / weekends, bars outside the hours,
and missing intraday bars (warning). `hb.validate_candles(...)` returns the findings;
`sort_candles=True` sorts instead of rejecting unsorted input; `liquidate_at_end=True` flattens
on the last bar.

`BacktestResult`:

| | |
|---|---|
| `res.summary` | engine summary dict: `net_pnl`, `total_return`, `cagr`, `max_drawdown`, `sharpe`, `sortino`, `calmar`, `win_rate`, `profit_factor`, fees and per-component `costs`, counts |
| `res.metrics` | `Metrics`: Jesse-style set computed from round trips + equity (250 sessions): expectancy, avg win/loss, ratio, streaks, holding periods, long/short split, largest win/loss, sharpe, sortino, calmar, omega, serenity, ulcer index, longest underwater period, trades per day, ... |
| `res.trades` | round trips (flat -> position -> flat, net of costs) as a DataFrame; `res.round_trips` are `RoundTrip` objects |
| `res.fills`, `res.orders`, `res.rejected` | DataFrames of executions (with cost components), every order with final status, rejections with reason |
| `res.equity_curve`, `res.equity` | DataFrame (`equity`, `drawdown`) / Series indexed by IST time |
| `res.positions`, `res.open_positions`, `res.instruments`, `res.logs` | final positions, per-symbol engine metrics, `Strategy.log` lines |
| `res.report`, `res.raw` | neutral `BacktestReport`; the engine's untouched report |

```python
grid = hb.sweep(Breakout, {"SBIN": df}, {"lookback": [20, 30, 40], "atr_mult": [1.5, 2.0]}, cfg,
                sort_by="net_pnl", jobs=1)
grid.attrs["n_trials"]; grid.attrs["results"]     # trial count for the DSR audit; full results
```

`grid` defaults to every declared `Param.grid()`; values are checked against the bounds before
anything runs. Strategy callbacks are Python and hold the GIL, so threads (and the Rust
`run_sweep`) do not help: `jobs > 1` runs combinations in separate spawn processes, which needs
a module-level strategy class and an engine given by name.

## Engines

`hb.backtest(..., engine="barter" | "simple" | <BacktestEngine>)`; `hb.available_engines()`.

| Engine | Orders | Extras |
|---|---|---|
| `barter` (default) | market, limit, stop, stop-limit; day / ioc / gtc; CNC / MIS / NRML / MTF | brackets, native trailing (percent / amount / atr), modify, sessions, MIS square-off, lot / tick / freeze rules, Indian costs, `next_open`, warm-up |
| `simple` | market, limit; day / ioc / gtc; CNC | pure-Python reference (flat costs, close fills, warm-up); no stops, brackets, trailing, sessions |

Features an engine lacks raise `hb.UnsupportedFeature` (with `.engine` and `.missing`): config
features (session, instruments, `cost:<model>`, `fill:<model>`, warm-up, multi-symbol) before the
run, everything a strategy declares in `requires` before the first bar, and any other order at
the moment it is placed.

### Adding an engine

An engine is any object with a `name`, `capabilities()` and `run()`:

```python
from honba.research.engine import (BacktestEngine, BacktestReport, BacktestRequest,
                                   ReportSummary, register_engine)
import honba as hb

class MyEngine:
    name = "my"

    def capabilities(self) -> hb.EngineCapabilities:
        return hb.EngineCapabilities(
            name="my",
            order_kinds=frozenset({"market", "limit"}),   # order:<kind>
            tifs=frozenset({"day"}), products=frozenset({"CNC"}),
            trail_modes=frozenset(),                      # trail:<mode>
            brackets=False, modify=False, sessions=False, instruments=False,
            cost_models=frozenset({"flat"}), fill_models=frozenset({"close"}), warmup=True,
        )

    def run(self, request: BacktestRequest, on_bar) -> BacktestReport:
        # request.config (BacktestConfig), request.candles ({symbol: Bars}), request.start_ms
        for t in timestamps:
            ctx = hb.BarContext(t, warmup, cash, equity, bars, positions, open_orders, events, session)
            for action in on_bar(ctx):        # PlaceOrder / ModifyOrder / CancelOrder / CancelAll
                ...                           # execute; report results as events on a later ctx
        return BacktestReport(ReportSummary(...), fills=[...], orders=[...], equity_curve=[(ms, eq)])

register_engine("my", MyEngine)               # then hb.backtest(S, data, engine="my")
```

Third-party packages register through the `honba.engines` entry-point group
(`[project.entry-points."honba.engines"]` `my = "my_pkg:MyEngine"`, value = zero-argument
factory). `honba.research.simple_engine` is a complete, small example; conformance rules:

- call `on_bar` once per distinct bar timestamp with a `BarContext` (latest bar per symbol,
  signed-qty `Position`s for every symbol, active `Order`s, the `Fill` / `Cancel` / `Reject` /
  `TrailUpdate` events since the previous call, in order); ignore orders in warm-up;
- honour the actions it declared support for and reject the rest with a `Reject` reason;
- `Fill.realised_pnl` is gross of costs, `costs.total` the fill's costs; fills are reported in
  execution order (the SDK rebuilds round trips and metrics from them);
- exceptions raised by `on_bar` (strategy errors, `UnsupportedFeature`) must propagate unchanged.

The barter engine speaks JSON (`_core.run_backtest(config_json, candles, on_bar) -> report_json`,
contract in `crates/honba-barter/src/lib.rs` and `report.rs`); `_barter_adapter.py` translates.

## Development

```bash
maturin develop --release --skip-install      # builds python/honba/_core*.so
pytest                                        # tests/test_sdk_barter.py runs on the real engine
cd python && lint-imports --config ../pyproject.toml
```
