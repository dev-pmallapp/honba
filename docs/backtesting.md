# Backtesting & Research Flow — IndisNaut Market Researcher

## 1. The IndisNaut Research Philosophy

IndisNaut adapts **Jesse AI's progressive validation chain** — the discipline of gating an idea
through cheap statistical filters before ever paying for a full backtest, and gating a backtest
through robustness checks before risking real capital. Jesse's original chain:

```
Idea → Rule Significance Test → Quick Backtest → Optimization → Monte Carlo
     → Full Backtest → Paper Trade → Live
```

is preserved almost verbatim, but re-targeted at Indian equities/F&O, where the dominant sources
of edge (and the dominant sources of false edge) look different from crypto or US equities:

- **Quarterly earnings impact** — Indian fundamentals arrive in lumpy quarterly bursts
  (Screener.in), not continuously, so any factor built on ROCE/profit-growth must be tested for
  *forward* return association, not contemporaneous correlation.
- **Budget day effects** — the Union Budget (usually Feb 1) produces outsized, sector-specific
  moves that can dominate a backtest if not treated as a distinct regime.
- **Muhurat trading anomaly** — the single-hour Diwali session has its own liquidity and
  volatility profile; naive strategies often show spurious edge concentrated on this one day/year.
- **FII/DII flow impact** — net institutional flow (published daily by NSE/SEBI) is a strong
  short-horizon driver that most backtests ignore entirely.

Each research stage below is a **filter**: expensive computation (multi-stock backtests, Monte
Carlo, walk-forward optimization) is only spent on ideas that have already survived the cheap
statistical screen in Stage 2. This is the core Jesse AI insight — most bad ideas can be rejected
with a bootstrap test in milliseconds, long before a single `BacktestEngine.run()` call.

## 2. The Research Pipeline (Indian Markets Adaptation)

```
Stage 1: HYPOTHESIS FORMATION
  - Source: Screener.in fundamental data, Moneycontrol sentiment, or chart pattern
  - Example: "Stocks with ROCE > 15% and quarterly profit growth > 20% outperform NIFTY"
  - Output: testable hypothesis with explicit entry/exit rules

Stage 2: STATISTICAL SCREENING (cheap — no backtest yet!)
  - Bootstrap significance test on the factor alone
  - 5 years of quarterly fundamentals + 5 years of daily price data
  - Question: "Is ROCE > 15% significantly associated with forward returns?"
  - Gate: p-value < 0.05 → advance; p-value > 0.10 → discard

Stage 3: QUICK SINGLE-STOCK BACKTEST
  - One representative stock (e.g. top-5 by market cap in the target sector)
  - Nautilus BacktestEngine, 1-day bars, no slippage model, fixed position size
  - Output: equity curve, Sharpe, max drawdown, win rate
  - Gate: positive Sharpe, max DD < 30% → advance

Stage 4: MULTI-STOCK PORTFOLIO BACKTEST
  - Expand to every stock passing the Stage 2 screener criteria
  - Equal-weight or risk-parity portfolio allocation
  - Full SEBI transaction-cost stack + slippage/impact-cost model
  - Output: portfolio equity curve, sector exposure, turnover, risk metrics
  - Gate: outperforms NIFTY 50 TR after costs

Stage 5: WALK-FORWARD OPTIMIZATION
  - 5-year in-sample / 2-year out-of-sample, rolling windows
  - Optimize parameters on in-sample only, evaluate on out-of-sample
  - Gate: OOS Sharpe within 50% of IS Sharpe → acceptable stability

Stage 6: MONTE CARLO ANALYSIS
  - Trade-order shuffling: randomize trade sequence 1,000x
  - Synthetic price paths: generate 500 alternative histories, same statistical properties
  - Output: confidence intervals on Sharpe, max DD, final equity
  - Gate: 5th-percentile Sharpe still positive → robust

Stage 7: PAPER TRADING
  - Live NSE data (15-minute delayed feed acceptable), simulated fills
  - Minimum 1 month, ideally 3 months
  - Gate: live Sharpe within 25% of backtest Sharpe → clear to go live

Stage 8: LIVE ALLOCATION
  - Start at 10-20% of target capital
  - Scale up after 3 months of live performance matching expectations
  - Continuous monitoring: alert if drawdown exceeds 2x expected
```

Each gate is intentionally asymmetric — it is far cheaper to discard a bad idea at Stage 2 (a
bootstrap on a pandas DataFrame) than at Stage 6 (500 synthetic-path backtests). The pipeline is
therefore an explicit **compute budget allocator**: milliseconds at Stage 2, seconds at Stage 3,
minutes at Stage 4-5, hours at Stage 6.

## 3. Rule Significance Testing (Stage 2)

Before any backtest runs, IndisNaut bootstraps the factor's return association directly, following
Jesse's "test before you backtest" principle:

```python
import numpy as np

def rule_significance_test(
    factor_returns: np.ndarray,   # forward returns for stocks passing the rule
    universe_returns: np.ndarray, # forward returns for the full comparable universe
    n_bootstrap: int = 10_000,
) -> float:
    """Bootstrap p-value: is factor_returns' mean significantly > universe's?"""
    observed_diff = factor_returns.mean() - universe_returns.mean()
    pooled = np.concatenate([factor_returns, universe_returns])
    n_factor = len(factor_returns)

    diffs = np.empty(n_bootstrap)
    for i in range(n_bootstrap):
        resampled = np.random.choice(pooled, size=len(pooled), replace=True)
        diffs[i] = resampled[:n_factor].mean() - resampled[n_factor:].mean()

    p_value = (diffs >= observed_diff).mean()
    return p_value
```

Gate: `p_value < 0.05` → advance to Stage 3. `p_value > 0.10` → discard the hypothesis outright,
no backtest is ever run. Between 0.05 and 0.10, flag for manual review rather than auto-discard —
Indian fundamental datasets are noisier (restatements, smaller float-adjusted universes) than the
crypto data Jesse was originally built for.

## 4. Nautilus Implementation Per Stage

### Stage 3 — Quick Single-Stock Backtest

```python
from nautilus_trader.backtest.engine import BacktestEngine
from nautilus_trader.backtest.config import BacktestEngineConfig, BacktestVenueConfig
from nautilus_trader.model.enums import OmsType, AccountType
from nautilus_trader.model.identifiers import Venue

engine = BacktestEngine(BacktestEngineConfig())
engine.add_venue(BacktestVenueConfig(
    name="NSE", oms_type=OmsType.NETTING,
    account_type=AccountType.CASH,
    starting_balances=["10_000_000 INR"],
))

catalog = ParquetDataCatalog(path="./data/catalog")
daily_bars = catalog.bars(instrument_ids=["RELIANCE.NSE"], bar_types=["1-DAY-LAST-EXTERNAL"])
engine.add_instrument(catalog.instruments(instrument_ids=["RELIANCE.NSE"])[0])
engine.add_data(daily_bars)

engine.add_strategy(RoceMomentumStrategy(config=roce_strategy_config))
engine.run()

report = engine.trader.generate_account_report(Venue("NSE"))
```

Deliberately minimal: no slippage, no impact cost, single instrument. The only question at this
stage is "does the raw rule produce a positive edge at all?"

### Stage 4 — CustomData-Driven Fundamental Triggers

Fundamental events arrive as `CustomData` and are delivered to the strategy's `on_data()` callback
alongside price bars, letting entries fire on quarterly results rather than only on price action:

```python
class RoceMomentumStrategy(Strategy):
    def on_data(self, data: Data) -> None:
        if isinstance(data, ScreenerQuarterlyFundamentals):
            if data.roce > 15.0 and self._profit_growth_pct(data) > 20.0:
                self._eligible.add(data.symbol)
            else:
                self._eligible.discard(data.symbol)

    def on_bar(self, bar: Bar) -> None:
        symbol = bar.bar_type.instrument_id.symbol.value
        if symbol in self._eligible and not self.portfolio.is_net_long(bar.bar_type.instrument_id):
            self.buy(bar.bar_type.instrument_id, quantity=self._position_size(bar))
```

Because fundamentals and bars share the same event stream, ordering is handled by Nautilus's
timestamp-sorted engine — no manual "as-of join" logic is needed to avoid look-ahead bias.

### Stage 6 — Monte Carlo Wrapper

Both Jesse-style Monte Carlo modes are implemented as a loop around the same `BacktestEngine`,
never inside the strategy itself:

```python
def monte_carlo_trade_shuffle(fills: list[OrderFilled], n_runs: int = 1000) -> dict:
    """Mode 1: break serial correlation by reordering trade PnLs."""
    pnls = np.array([f.pnl for f in fills])
    sharpes = np.empty(n_runs)
    for i in range(n_runs):
        shuffled = np.random.permutation(pnls)
        equity_curve = np.cumsum(shuffled)
        sharpes[i] = _sharpe(shuffled)
    return {
        "sharpe_p05": np.percentile(sharpes, 5),
        "sharpe_p50": np.percentile(sharpes, 50),
        "sharpe_p95": np.percentile(sharpes, 95),
    }

def monte_carlo_synthetic_paths(bars: list[Bar], strategy_cls, n_paths: int = 500) -> dict:
    """Mode 2: generate synthetic OHLCV paths preserving mean/vol/autocorr, rerun full backtest."""
    results = []
    for _ in range(n_paths):
        synthetic_bars = _bootstrap_returns_to_bars(bars)
        engine = BacktestEngine(BacktestEngineConfig())
        engine.add_data(synthetic_bars)
        engine.add_strategy(strategy_cls())
        engine.run()
        results.append(_sharpe_from_engine(engine))
    return {"sharpe_p05": np.percentile(results, 5), "sharpe_p50": np.percentile(results, 50)}
```

Gate for Stage 6: `sharpe_p05 > 0` on **both** modes. Trade-shuffling alone is not sufficient in
Indian markets because it doesn't capture regime effects like Budget day or Muhurat sessions —
the synthetic-path mode, seeded from the strategy's actual traded history, is what stress-tests
against those.

## 5. Indian Market-Specific Cost & Calendar Modeling

### Transaction Cost Model

| Component | Rate | Notes |
|---|---|---|
| STT — delivery equity | 0.1% | charged on both buy and sell |
| STT — intraday/futures | 0.025% | sell side only |
| STT — options | 0.125% | sell side, on premium |
| GST | 18% | on brokerage amount only |
| Stamp duty | 0.015% (Maharashtra, delivery) | state-dependent, buy side only |
| SEBI turnover fee | 0.0002% | on turnover |
| Exchange transaction charge | ~0.00345% | NSE equity |
| Brokerage | 0.03% or flat ₹20/trade | whichever is lower, per broker convention |
| Impact cost | 0.01–0.05% (large-cap) / 0.1–0.5% (small-cap) | sourced from NSE's published impact-cost series |

```python
class IndianEquityFeeModel(FeeModel):
    def calculate_fee(self, fill: OrderFilled, instrument: Instrument) -> Money:
        turnover = fill.last_px * fill.last_qty
        stt = turnover * (Decimal("0.001") if self._is_delivery(fill) else Decimal("0.00025"))
        brokerage = min(turnover * Decimal("0.0003"), Decimal("20"))
        gst = brokerage * Decimal("0.18")
        stamp = turnover * Decimal("0.00015") if fill.side == OrderSide.BUY else Decimal(0)
        exch_txn = turnover * Decimal("0.0000345")
        sebi_fee = turnover * Decimal("0.000002")
        impact = turnover * self._impact_cost_bps(instrument) / Decimal(10_000)
        return Money(stt + brokerage + gst + stamp + exch_txn + sebi_fee + impact, Currency.from_str("INR"))
```

Only Stage 4 onward applies this full fee model — Stage 3's quick single-stock pass is
intentionally frictionless so that a rule which fails there is known to fail on raw signal alone,
not on cost drag.

### Trading Calendar

The engine must load the **actual NSE/BSE trading calendar**, not a generic 252-day calendar:

```python
nse_calendar = NseTradingCalendar(
    holidays=load_nse_holiday_list(years=range(2015, 2026)),  # ~15 holidays/year + weekends
    special_sessions={"muhurat": load_muhurat_session_dates()},  # short session, still a trading day
)
engine.add_venue(BacktestVenueConfig(..., trading_calendar=nse_calendar))
```

Muhurat trading is flagged, not excluded — Jesse's synthetic-path Monte Carlo (Stage 6) should
include it in every generated path since it's a recurring, dependable feature of the Indian
calendar, not an anomaly to be filtered out.

### Corporate Actions Adjustment

All historical bars are back-adjusted before entering the catalog:

```python
def apply_corporate_actions(bars: list[Bar], actions: list[CorporateAction]) -> list[Bar]:
    adjusted = list(bars)
    for action in sorted(actions, key=lambda a: a.ex_date, reverse=True):
        factor = _split_bonus_factor(action) if action.action_type in ("SPLIT", "BONUS") else 1.0
        dividend = action.details_amount if action.action_type == "DIVIDEND" else 0.0
        for bar in adjusted:
            if bar.ts_event_date < action.ex_date:
                bar = bar.adjust(price_factor=factor, price_offset=-dividend)
    return adjusted
```

Split/bonus adjustments scale price and volume; dividend adjustments shift price down by the
dividend amount on the ex-date so that return series don't show a fake gap-down.

## 6. Performance Metrics Dashboard

Every stage from 3 onward produces the same standard metrics set (mirroring Jesse's report):

- **Return metrics** — total return, CAGR, expectancy, R-multiple distribution
- **Risk-adjusted metrics** — Sharpe ratio (0% risk-free rate for INR-denominated strategies),
  Sortino ratio, Calmar ratio, Omega ratio
- **Drawdown metrics** — max drawdown, max drawdown duration
- **Trade-level metrics** — win rate, profit factor, average win/loss ratio
- **Time-series views** — monthly returns heatmap, rolling 12-month Sharpe
- **Benchmark comparison** — vs NIFTY 50 TR (total-return index, so dividends are captured
  correctly) and vs the relevant sector index (e.g. NIFTY BANK for financials)

```python
@dataclass
class PerformanceReport:
    total_return: float
    cagr: float
    sharpe: float
    sortino: float
    calmar: float
    omega: float
    max_drawdown: float
    max_dd_duration_days: int
    win_rate: float
    profit_factor: float
    expectancy: float
    monthly_returns: pd.DataFrame     # index=year, columns=month
    rolling_sharpe_12m: pd.Series
    benchmark_alpha: float            # vs NIFTY 50 TR
    benchmark_beta: float
```

## 7. Strategy Configuration Schema

A single Pydantic model captures everything Stage 1 needs to specify before the pipeline runs,
so every downstream stage consumes the same declarative config rather than re-deriving intent:

```python
from pydantic import BaseModel, Field
from enum import Enum

class UniverseMode(str, Enum):
    SCREENER_QUERY = "screener_query"
    EXPLICIT_LIST = "explicit_list"

class PositionSizingMode(str, Enum):
    FIXED_RUPEE = "fixed_rupee"
    PERCENT_OF_CAPITAL = "percent_of_capital"
    KELLY = "kelly"
    RISK_PARITY = "risk_parity"

class EntryRules(BaseModel):
    fundamental_filters: dict[str, float] = Field(
        default_factory=dict, description='e.g. {"roce_min": 15.0, "profit_growth_min_pct": 20.0}'
    )
    technical_trigger: str | None = Field(None, description="e.g. 'close > sma_50'")

class ExitRules(BaseModel):
    stop_loss_pct: float | None = None
    target_pct: float | None = None
    max_holding_days: int | None = None

class DataRequirements(BaseModel):
    bar_type: str = "1-DAY-LAST-EXTERNAL"
    fundamental_fields: list[str] = Field(default_factory=lambda: ["roce", "net_profit", "eps"])

class StrategyConfig(BaseModel):
    strategy_id: str
    universe_mode: UniverseMode
    screener_query: str | None = None
    explicit_symbols: list[str] | None = None
    entry_rules: EntryRules
    exit_rules: ExitRules
    position_sizing_mode: PositionSizingMode
    position_sizing_param: float  # ₹ amount, %, Kelly fraction, or risk budget depending on mode
    data_requirements: DataRequirements
```

This config is versioned alongside each research run's outputs (p-value, backtest metrics, Monte
Carlo bounds) so that a strategy which reaches Stage 8 has a complete, reproducible audit trail
back to its Stage 1 hypothesis.
</content>
