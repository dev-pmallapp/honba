"""SMA crossover: long when the fast SMA crosses above the slow SMA, exit on the cross below."""

import honba as hb


class SmaCross(hb.Strategy):
    """Single-symbol trend follower on daily bars (one symbol per run)."""

    timeframe = "1d"

    fast = hb.Param(10, low=2, high=50)
    slow = hb.Param(30, low=5, high=200)
    qty = hb.Param(10, low=1, high=100_000)

    def on_bar(self, ctx):
        """Buy on a golden cross, close on a death cross."""
        close = self.history().close
        if len(close) < self.slow + 1:
            return
        fast = hb.ta.sma(close, self.fast, sequential=True)
        slow = hb.ta.sma(close, self.slow, sequential=True)
        if self.position.is_flat and hb.ta.crossed_above(fast, slow):
            self.buy(self.qty, tag="cross_up")
        elif self.position.is_long and hb.ta.crossed_below(fast, slow):
            self.close(tag="cross_down")
