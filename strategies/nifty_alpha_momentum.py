"""Cross-sectional momentum on a NIFTY universe: hold the strongest names, rebalance quarterly.

Multi-symbol example: one strategy instance sees every symbol of the run. Each rebalance ranks
the universe by ``ranking_period``-bar return, holds the ``top_n`` best equal-weighted (capped at
``single_stock_cap`` of equity per name) in CNC, and exits everything else.
"""

import honba as hb


class NiftyAlphaMomentum(hb.Strategy):
    """Quarterly-rebalanced momentum portfolio (daily bars, delivery / CNC)."""

    timeframe = "1d"
    product = hb.CNC

    ranking_period = hb.Param(252, low=20, high=504)
    top_n = hb.Param(30, low=5, high=50)
    single_stock_cap = hb.Param(0.05, low=0.01, high=0.2)

    def on_start(self):
        """Reset the rebalance clock."""
        self._last_rebalance = None

    def _due(self, ctx):
        key = (ctx.time.year, (ctx.time.month - 1) // 3)
        if key == self._last_rebalance:
            return False
        self._last_rebalance = key
        return True

    def on_bar(self, ctx):
        """Rebalance on the first bar of each quarter."""
        if not self._due(ctx):
            return
        momentum = {}
        for symbol in self.symbols:
            close = self.history(symbol).close
            if len(close) > self.ranking_period:
                momentum[symbol] = close[-1] / close[-1 - self.ranking_period] - 1.0
        winners = sorted(momentum, key=momentum.get, reverse=True)[: self.top_n]
        weight = min(1.0 / max(len(winners), 1), self.single_stock_cap)
        for symbol in self.symbols:
            if symbol in winners:
                self.target(symbol, pct=weight, tag="rebalance")
            elif self.positions[symbol].is_open:
                self.close(symbol, tag="rebalance_out")
