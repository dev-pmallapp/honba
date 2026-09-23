import unittest
from honba.strategy import Strategy


class SampleStrategy(Strategy):
    def should_long(self) -> bool:
        return True

    def should_short(self) -> bool:
        return False

    def go_long(self):
        self.position_qty += 10

    def go_short(self):
        pass


class TestStrategyLifecycle(unittest.TestCase):
    def test_sample_strategy_lifecycle(self):
        strat = SampleStrategy(symbol="NIFTY 50", initial_capital=500_000.0)
        strat.init()
        self.assertEqual(strat.symbol, "NIFTY 50")
        self.assertTrue(strat.should_long())
        self.assertFalse(strat.should_short())
        strat.go_long()
        self.assertEqual(strat.position_qty, 10)


if __name__ == "__main__":
    unittest.main()
