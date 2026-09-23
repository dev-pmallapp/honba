from abc import ABC, abstractmethod
from typing import Any, Dict


class Strategy(ABC):
    """
    Base Strategy class inspired by Jesse's lifecycle model.
    """

    timeframe: str = "5m"
    params: Dict[str, Any] = {}

    def __init__(self, symbol: str, initial_capital: float = 100_000.0):
        self.symbol = symbol
        self.initial_capital = initial_capital
        self.cash = initial_capital
        self.position_qty = 0
        self.candles: list = []

    def init(self):
        """Lifecycle hook called before simulation commences."""
        pass

    @abstractmethod
    def should_long(self) -> bool:
        """Evaluates entry condition for going long."""
        return False

    @abstractmethod
    def should_short(self) -> bool:
        """Evaluates entry condition for going short."""
        return False

    @abstractmethod
    def go_long(self):
        """Executes long entry order."""
        pass

    @abstractmethod
    def go_short(self):
        """Executes short entry order."""
        pass

    def update_position(self):
        """Lifecycle hook evaluated on each bar or position change."""
        pass
