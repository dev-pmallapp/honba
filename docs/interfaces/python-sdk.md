# Python SDK

Backtest and research API on top of the barter-rs engine (`honba._core`, built
with `maturin develop`). Only `honba/research/_barter_adapter.py` imports the engine.

## Jesse-style strategies

```python
from honba.strategy import Strategy, indicators
from honba.research import backtest, sweep

class SmaCross(Strategy):
    params = {"fast": 10, "slow": 30, "qty": 10}
    def should_long(self): ...
    def go_long(self): self.buy = self.params["qty"]
    def update_position(self): ...   # runs while a position is open
```

Per-bar lifecycle: `before()`, then `update_position()` if a position is open, otherwise
`should_long()`/`go_long()` else `should_short()`/`go_short()`, then `after()`. `init()` runs once.
One instance per symbol.

Available on `self`: `candles` (numpy, columns `[ts_ms, open, close, high, low, volume]` like
Jesse), `open/high/low/close/volume/price`, `index`, `time_ms`, `position`
(`qty`, `entry_price`, `is_long`, `is_short`, `is_open`, `pnl`), `cash`/`balance`, `params`.
Orders: `self.buy = qty` / `self.sell = qty` (a Jesse `(qty, price)` tuple is accepted, price
ignored: market orders), `self.order(side, qty)`, `self.liquidate()`. While an order is unfilled
(up to 3 bars) the adapter does not run entry/`update_position` logic again.
Indicators in `honba.strategy.indicators`: `sma, ema, rsi, atr, stddev, crossed_above/below`.

## Running

```python
res = backtest(SmaCross, {"RELIANCE": df}, initial_capital=1_000_000,
               fees_percent=0.03, latency_ms=0, params={"fast": 5})
res.summary; res.trades; res.equity_curve; res.instruments; res.raw
grid = sweep(SmaCross, {"RELIANCE": df}, {"fast": [5, 10], "slow": [20, 50]}, sort_by="sharpe")
```

Data: pandas or polars frames with `time|timestamp|date` (datetime, epoch s or ms), `open`,
`high`, `low`, `close`, optional `volume`; a `{symbol: frame}` dict, a long frame with a `symbol`
column, or one frame plus `symbols="X"`.

## OpenAlgo-style callback

```python
def on_bar(ctx):
    if ctx.position("SBIN") == 0 and ctx.closes("SBIN")[-1] > 800:
        ctx.placeorder("SBIN", "BUY", 10)
    ctx.placesmartorder("SBIN", "BUY", 0, position_size=10)  # target position
backtest(on_bar, {"SBIN": df})
```

## Engine contract

`_core.run_backtest(config_json, candles, on_bar) -> report_json`; see
`honba/research/_barter_adapter.py`. Tests replace `honba._core` with a fake
(`tests/test_python_sdk.py`).
