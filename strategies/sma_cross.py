"""SMA crossover: long when the fast SMA crosses above the slow SMA, exit on cross below."""

from honba.strategy import Strategy, indicators


class SmaCross(Strategy):
    timeframe = "1D"
    params = {"fast": 10, "slow": 30, "qty": 10}  # noqa: RUF012

    def _smas(self):
        closes = self.candles[:, 2]
        fast = indicators.sma(closes, self.params["fast"], sequential=True)
        slow = indicators.sma(closes, self.params["slow"], sequential=True)
        return fast, slow

    def should_long(self) -> bool:
        if len(self.candles) < self.params["slow"] + 1:
            return False
        fast, slow = self._smas()
        return indicators.crossed_above(fast, slow)

    def go_long(self):
        self.buy = self.params["qty"]

    def update_position(self):
        fast, slow = self._smas()
        if self.position.is_long and indicators.crossed_below(fast, slow):
            self.liquidate()
