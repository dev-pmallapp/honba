"""
NIFTY Alpha 50 Momentum Strategy with Indian Intraday Safeguards.
"""

from honba.strategy import Strategy


class NiftyAlphaMomentum(Strategy):
    timeframe = "1D"
    params = {
        "alpha_ranking_period": 252,
        "max_portfolio_constituents": 30,
        "single_stock_cap": 0.05,
    }

    def init(self):
        self.rebalance_due = False

    def should_long(self) -> bool:
        # Evaluated on quarterly rebalance schedule
        return self.rebalance_due

    def should_short(self) -> bool:
        return False

    def go_long(self):
        # Rebalance portfolio to top 30 alpha ranked stocks
        pass

    def go_short(self):
        pass

    def update_position(self):
        pass
