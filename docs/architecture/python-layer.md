# Python Strategy DSL & PyO3 Foreign Function Interface

## 1. Ergonomic Strategy Authoring

Honba provides an expressive, Jesse-inspired Python Strategy DSL:

```python
from honba.strategy import Strategy, OrderType, TimeFrame
from honba.indicators import EMA, ATR
from honba.instruments import InstrumentType

class NiftyBreakout(Strategy):
    timeframe = TimeFrame.MINUTE_5
    instrument_type = InstrumentType.EQUITY_MIS

    # Hyperparameter declaration for automated optimization & CPCV
    params = {
        "fast_period": (9, 5, 20),
        "slow_period": (21, 15, 50),
        "atr_multiplier": (2.0, 1.0, 3.5),
    }

    def init(self):
        self.fast_ema = EMA(self.candles, period=self.params["fast_period"])
        self.slow_ema = EMA(self.candles, period=self.params["slow_period"])
        self.atr = ATR(self.candles, period=14)

    def should_long(self) -> bool:
        # Intraday entry cut-off at 14:45 IST
        if self.current_time.hour >= 14 and self.current_time.minute >= 45:
            return False
        return self.fast_ema[-1] > self.slow_ema[-1] and self.fast_ema[-2] <= self.slow_ema[-2]

    def go_long(self):
        entry_price = self.price
        stop_loss = entry_price - (self.atr[-1] * self.params["atr_multiplier"])
        take_profit = entry_price + (self.atr[-1] * self.params["atr_multiplier"] * 2)
        
        qty = self.calculate_position_size(risk_pct=0.01, stop_distance=entry_price - stop_loss)
        self.buy(qty=qty, order_type=OrderType.MARKET, stop_loss=stop_loss, take_profit=take_profit)

    def update_position(self):
        # Mandatory intraday square-off at 15:15 IST
        if self.current_time.hour == 15 and self.current_time.minute >= 15:
            self.liquidate("Intraday square-off window")
```

---

## 2. Zero-Copy FFI Bridge via PyO3

Using **PyO3** and **Maturin**, the Python layer binds directly to compiled Rust abstractions:
- Historical candle and tick data pass from Rust to Python as Apache Arrow / Polars memory buffers with zero copy.
- Strategy methods (`should_long`, `go_long`) are invoked directly through high-speed C-ABI function pointers, avoiding interpreter context switching overhead in bulk backtests.
