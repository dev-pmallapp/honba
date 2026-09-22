# Jesse AI — Unique Feature Catalog

This document catalogs every feature found in **Jesse AI** (jesse.trade) that
has **no equivalent** in Nautilus Trader, Backtrader, Zipline, or QuantConnect.
Jesse is a smaller, retail-focused crypto backtesting framework, but it has
made several product decisions — mostly around statistical rigor, ML
integration, and developer ergonomics — that the bigger institutional
frameworks never built. IndisNaut is standardizing on Nautilus Trader as its
core execution/backtest engine, but the research layer sitting on top of
Nautilus should borrow deliberately from Jesse's playbook. This document
exists to make that borrowing explicit: what's unique, why it matters, and how
IndisNaut should build it on top of (not instead of) Nautilus.

---

## Feature Catalog

### 1. Rule Significance Testing (Bootstrap Hypothesis Test)

Before a user writes a full strategy, Jesse lets them test an **entry rule in
isolation** — no exits, no stops, no position sizing — against a statistical
null hypothesis: *"the entry rule's expected next-bar detrended return is not
positive."* It resamples historical returns using a **stationary bootstrap**
(Politis & Romano, 1994), which does block resampling to preserve
autocorrelation structure instead of naively shuffling independent returns.

- p ≤ 0.001 → highly significant
- p ≤ 0.05 → significant
- p > 0.10 → not significant

The critical insight Jesse surfaces explicitly: **a strategy can fail this
test and still be profitable**, because the edge may live entirely in the
exit/stop structure rather than the entry timing. Example from Jesse's own
docs: a SOL 15m strategy scored p = 0.39 (not significant) on its entry rule
alone, yet the full strategy returned +82.6%. This reframes significance
testing as a diagnostic, not a gate.

No other framework — Nautilus, Backtrader, Zipline, QuantConnect — has this
built in at all.

### 2. Two-Mode Monte Carlo Analysis

Jesse ships two structurally different Monte Carlo modes that answer two
different questions:

- **Trade-order shuffling** — randomly reorders the sequence of completed
  trades 1,000 times and rebuilds the equity curve each time. Answers: *does
  the timing/sequence of trades drive the results, or would any ordering have
  worked?*
- **Candle-based synthetic paths** — perturbs the underlying OHLCV data itself
  and reruns the full backtest on each synthetic path. Answers: *is the
  strategy robust to different plausible market paths, or is it curve-fit to
  this exact price history?* Two candle-perturbation methods are provided:
  Moving Block Bootstrap (default, automatic block sizing) and Gaussian Noise
  (configurable sigma per OHLC component).

Each mode targets a distinct failure mode — "got lucky on trade timing" vs.
"overfit to one specific price path" — and neither subsumes the other.
Nautilus has zero built-in Monte Carlo tooling of any kind.

### 3. End-to-End Machine Learning Pipeline

`gather_ml_data()` → `train_model()` → deploy inside a live strategy, as one
integrated flow supporting binary classification, multiclass classification,
and regression tasks.

The key design choice is `ml_features()` as a **single source of truth**:
the same feature-generation function is called in both data-gathering mode and
live-deployment mode, which structurally eliminates train/deploy feature skew
— a common and hard-to-detect bug class in ML trading systems.

Jesse also has first-class support for **meta-labeling** (López de Prado): a
primary model decides direction, and a secondary "meta" model estimates
confidence in that call, which is used to scale position size rather than
gate the trade binary. Training automatically persists `model.pkl`,
`scaler.pkl`, and `feature_importance.pkl`, and returns a full report
(accuracy, ROC AUC, MCC, calibration curve, precision/threshold sweep,
confusion matrix). Nautilus has no ML infrastructure — users wire up
scikit-learn/PyTorch entirely by hand.

### 4. Automated Feature Importance (5 Methods)

`train_model()` output includes feature rankings from **five independent
methods** computed automatically, with zero extra code from the user:

1. RFE (recursive feature elimination) ranks
2. F-values (ANOVA)
3. Correlations
4. Cross-validation impact
5. Consensus rank across the above four

Plus a sixth artifact, `feature_impact`: true drop-column importance, which
retrains the model N times (once per excluded feature) to measure the actual
marginal contribution. Nautilus provides nothing analogous — this is entirely
a Jesse invention layered onto its ML pipeline.

### 5. Minimal Strategy DSL (~6 Lines)

Jesse strategies are written as pure boolean signal generators plus
declarative order intents:

```python
class SmaCrossover(Strategy):
    def should_long(self):
        return ta.sma(self.candles, 10) > ta.sma(self.candles, 50)

    def should_short(self):
        return ta.sma(self.candles, 10) < ta.sma(self.candles, 50)

    def go_long(self):
        self.buy = self.position_size, self.price

    def go_short(self):
        self.sell = self.position_size, self.price
```

Order type (MARKET / LIMIT / STOP) is **auto-selected** by comparing the
declared price to the current price — the user never instantiates an order
object. Partial fills are just a list of `(qty, price)` tuples. `take_profit`
and `stop_loss` are declarative properties, not manually submitted orders.
This is dramatically more concise than the Nautilus equivalent, which requires
explicit strategy lifecycle methods, order factories, and event handlers —
commonly 30+ lines for the same crossover logic.

### 6. Portfolio vs. Route Separation

`routes.py` declaratively assigns strategies to (exchange, symbol,
timeframe) tuples, separate from strategy logic entirely. Related constructs:

- `data_routes` — subscribe to candles purely for higher-timeframe indicator
  context, without ever trading that route.
- `shared_vars` — a dict shared across *all* routes, for multi-strategy /
  multi-symbol coordination (e.g. a portfolio-level risk switch).
- `vars` — a per-route scratchpad dict.
- `all_positions` — a dict exposing every open position across every route.

Nautilus has a comparable concept (strategies subscribed to multiple
instruments, shared cache) but it's assembled programmatically per-strategy,
not expressed as one declarative routing table.

### 7. MCP Server (Model Context Protocol) — First in the Industry

Jesse ships a built-in local MCP server (default port 9002) that lets AI
coding assistants (Claude Code, Cursor, VS Code Copilot, Codex, Zed) directly
drive a running Jesse instance: read/write/modify strategy files, run
backtests, run significance tests, run Monte Carlo, run optimization, and
manage candle data — all through tool calls rather than manual copy/paste. An
`AGENTS.md` file in the project root documents which tools are exposed. This
is the first trading framework with native MCP support; Nautilus has no
AI-assistant integration layer of any kind.

### 8. 300+ Rust-Powered Indicators (3.4x Faster)

`import jesse.indicators as ta` exposes 300+ indicators implemented in Rust
via PyO3 bindings, measured at 3.4x faster than Jesse's own prior pure-Python
implementation. The API is purely functional — `ta.sma(candles, 20)` — with no
stateful object lifecycle to manage. Categories span Trend, Momentum,
Volatility, Volume, Cycle, Filter, and Exit indicators, including 40 moving
average variants selectable via a single `matype` parameter (SMA, EMA, WMA,
HMA, KAMA, ALMA, JMA, FWMA, etc.) and a set of Ehlers cycle indicators (Fisher
Transform, Bandpass, Decycler, SuperSmoother, Reflex, TrendFlex) rarely found
elsewhere. Nautilus ships roughly 20 Python-native indicators.

### 9. Automatic Multi-Timeframe Look-Ahead Bias Prevention

When a strategy declares `data_routes` for a higher timeframe (e.g. trading on
4h while referencing 1D context), Jesse automatically withholds the current,
still-forming 1D candle from the 4h decision loop until that 1D bar has
actually closed. This is a notoriously easy bug to introduce by hand (using
"today's daily bar" mid-day) and Jesse solves it at the framework level rather
than leaving it to strategy authors. Nautilus, Backtrader, and Zipline all
leave this entirely to the user.

### 10. Gapped Data Handling (Session-Aware)

Jesse never invents candles to paper over data gaps — it only stores bars the
data provider actually observed, and constructs larger timeframes purely from
observed minutes aligned to wall-clock buckets. Practical consequence: a 1h
candle on US equities at 09:00 contains only the minutes 09:30–09:59 (market
open), and empty buckets simply don't exist (no synthetic 03:00 candle, no
phantom Saturday candle). Order-fill logic explicitly documents gap
resolution: an order that a price gap "jumped over" fills at the open price
of the resuming session (realistic slippage), and when multiple orders are
crossed by a single gap, the one closest to the previous close fills first.
Nautilus can also work with gapped/session data, but Jesse's construction
rules are more explicit, more opinionated, and more thoroughly documented.

### 11. Docker-First Deployment with Full Dashboard

`docker compose up -d` brings up the entire system — web dashboard,
PostgreSQL, and MCP server — in one command. Dashboard defaults to
`localhost:9000`, MCP to `localhost:9002`, both configurable via `.env`. A
community-maintained Kubernetes chart also exists. The onboarding experience
is materially more polished and documented than Nautilus's, which expects
users to assemble their own persistence/dashboard stack.

### 12. Research Dashboard (Visual Analytics)

Every backtest run produces 40+ metrics automatically: total trades, net
profit, max drawdown, underwater period, CAGR, expectancy, win rate, Sharpe,
Calmar, Sortino, Omega, win/loss streaks, average holding time, total fees
paid. The dashboard renders synchronized interactive charts — candlesticks,
strategy indicator overlays, submitted orders, and completed trades all on one
timeline. A benchmark mode runs batches of backtests across
strategy/symbol/timeframe combinations into one sortable comparison table.
Results export to CSV (per-trade) or JSON. Nautilus has no GUI dashboard at
all — all analysis is programmatic or delegated to external BI tools.

### 13. Built-in Parameter Optimization (Optuna + Ray + DNA)

Strategies declare a `hyperparameters()` search space (name, type, min, max,
default), and Jesse optimizes it using **Optuna** (efficient sampling, not
brute-force grid/random search) parallelized across cores with **Ray**. A
"DNA" feature lets successful parameter sets from one optimization run be
bred into the next run's search space, genetic-algorithm-style. Optimization
runs support separate train/test date ranges for out-of-sample validation.
Nautilus has zero built-in optimization — users must wire up their own
Optuna/Ray harness around `BacktestEngine` from scratch.

### 14. "Before You Backtest" Progressive Validation Philosophy

This is a workflow philosophy expressed through feature design rather than
enforced gates: Rule Significance → Backtest → Monte Carlo (both modes) →
Optimization → Paper Trade → Live. Each stage is meant to eliminate bad ideas
as cheaply as possible before the next, more expensive stage. Jesse's MCP
server can even be instructed to run this entire pipeline end-to-end
autonomously. No other framework documents or tools for an analogous
opinionated research pipeline — Nautilus treats backtesting as one tool among
many with no prescribed order of operations.

### 15. Simple 6-Column CSV Data Import

Required schema: `timestamp, open, close, high, low, volume`. Import enforces
strict validation — 1-minute UTC-aligned boundaries, strictly ascending
timestamps, coherent OHLC price relationships, positive volume — and supports
automatic column-name remapping for differently-labeled source CSVs. The MCP
server can be asked to clean a messy CSV (sort, dedupe, drop malformed rows)
before import. This is far simpler and more opinionated than Nautilus's
generic data-loading/wrangling path.

### 16. Smart Order Auto-Selection

Jesse infers order type from the relationship between the declared price and
the current market price, with no explicit order-type object required:

- `self.buy = qty, self.price` → MARKET
- `self.buy = qty, self.price - 10` (below market, long) → LIMIT
- Price set beyond current in the adverse direction → STOP

Nautilus requires constructing explicit `MarketOrder` / `LimitOrder` /
`StopOrder` objects through its order factory.

### 17. DEX Support & Futures-First Properties

Native support for decentralized exchanges (self-custody trading), plus
first-class strategy properties for perpetual futures mechanics:
`is_spot_trading`, `is_futures_trading`, `leverage`, `liquidation_price`,
`funding_rate`, `next_funding_timestamp`, `mark_price`. Also notable:
**JesseGPT**, a hosted GPT assistant trained specifically on Jesse's
documentation/codebase (commercial feature), and reinforcement-learning
workflows on the public roadmap.

---

## Summary Table

| # | Feature | Nautilus Trader | Backtrader | Zipline | QuantConnect |
|---|---|---|---|---|---|
| 1 | Rule significance testing (bootstrap) | ❌ | ❌ | ❌ | ❌ |
| 2 | Two-mode Monte Carlo | ❌ | ❌ | ❌ | ❌ |
| 3 | End-to-end ML pipeline | ❌ | ❌ | ❌ | Partial (Research env only) |
| 4 | Automated 5-method feature importance | ❌ | ❌ | ❌ | ❌ |
| 5 | ~6-line strategy DSL | ❌ (verbose) | Partial (verbose) | Partial (verbose) | Partial (verbose) |
| 6 | Declarative route/portfolio separation | Partial (programmatic) | ❌ | ❌ | Partial |
| 7 | MCP server for AI assistants | ❌ | ❌ | ❌ | ❌ |
| 8 | 300+ Rust indicators | ❌ (~20 Python) | ❌ (TA-Lib wrap) | ❌ | Partial (via QC libs) |
| 9 | Automatic MTF look-ahead prevention | ❌ (manual) | ❌ (manual) | ❌ (manual) | ❌ (manual) |
| 10 | Session-aware gapped data | Partial (different model) | ❌ | ❌ | Partial |
| 11 | Docker-first full-stack deploy | Partial (no dashboard) | ❌ | ❌ | N/A (cloud SaaS) |
| 12 | Visual research dashboard | ❌ | ❌ (external plotting) | ❌ | Partial (cloud UI) |
| 13 | Built-in optimization (Optuna+Ray+DNA) | ❌ | Partial (basic) | ❌ | Partial (cloud) |
| 14 | "Before you backtest" pipeline philosophy | ❌ | ❌ | ❌ | ❌ |
| 15 | Simple 6-column CSV import | ❌ (generic loaders) | ❌ | ❌ | Partial |
| 16 | Smart order type auto-selection | ❌ (explicit objects) | ❌ | ❌ | ❌ |
| 17 | DEX + futures-first properties | Partial (futures yes, no DEX) | ❌ | ❌ | Partial |

---

## Which Features Should IndisNaut Emulate?

| Feature | Priority | Notes |
|---|---|---|
| Rule Significance Testing | **Must build** | High-value, cheap to implement: stationary bootstrap over per-signal forward returns, independent of Nautilus's execution engine. |
| Two-Mode Monte Carlo | **Must build** | Mode 1 (trade shuffle) needs only the closed-trade report from a Nautilus backtest. Mode 2 (synthetic candles) needs a candle-perturbation module feeding `BacktestEngine` repeatedly. |
| Research Dashboard (40+ metrics + synced charts) | **Must build** | IndisNaut's frontend/backtesting stack (see `frontend.md`, `backtesting.md`) already targets this; align metric set with Jesse's list. |
| Minimal Strategy DSL ergonomics | **Must build** | Not literal Jesse DSL, but a thin Python wrapper around Nautilus `Strategy` for common patterns (SMA/EMA crossovers, signal+order helpers) to cut boilerplate for research users. |
| Automated Feature Importance (5-method) | **Must build** | Needed once ML strategies exist; straightforward to bolt onto any scikit-learn training step regardless of execution engine. |
| End-to-End ML Pipeline w/ single-source features | **Must build** | Core to avoiding train/deploy skew; design `features()` as one function called from both offline training and live Nautilus strategy `on_bar`. |
| Built-in Optimization (Optuna + Ray) | **Must build** | Wrap Nautilus `BacktestEngine` in a Python objective function, drive with Optuna; Ray for parallel trials across cores. Nautilus provides no equivalent, so this is pure greenfield work on top of it. |
| Automatic MTF Look-Ahead Prevention | **Must build** | Needs explicit design work in the research layer: gate higher-timeframe bar visibility until `ts_event` confirms close, mirroring Jesse's rule at the Nautilus data-subscription boundary. |
| "Before You Backtest" Pipeline Philosophy | **Must build** | This is a workflow/UX decision, not code — bake the staged pipeline (significance → backtest → Monte Carlo → optimize → paper → live) into IndisNaut's CLI/dashboard flow. |
| Portfolio vs. Route Separation | **Nice to have** | Nautilus already supports multi-instrument strategies programmatically; a declarative routing config on top improves UX but isn't blocking. |
| MCP Server | **Nice to have** | High leverage for AI-assisted research workflows given IndisNaut's own AI-forward direction; can be added once core research layer is stable. |
| Docker-First Full Dashboard | **Nice to have** | Valuable for onboarding/demo; sequence after core research features exist. |
| Simple 6-Column CSV Import | **Nice to have** | Useful for ad-hoc data ingestion, but IndisNaut's primary data path is broker/vendor APIs (see `data-sources.md`), not manual CSV. |
| Smart Order Auto-Selection | **Nice to have** | Ergonomic sugar over Nautilus's explicit order factory for the strategy-DSL wrapper; not a research-critical feature. |
| 300+ Rust Indicators | **Already covered by Nautilus** | Nautilus's indicator set is smaller but extensible, and IndisNaut can add missing indicators (e.g., Ehlers family) as a thin library rather than reinventing Jesse's Rust core. |
| Gapped/Session-Aware Data Handling | **Already covered by Nautilus** | Nautilus's bar aggregation already respects data availability; Indian market sessions (NSE 09:15–15:30 IST) need config, not a new engine. |
| DEX Support & Futures-First Properties | **Already covered by Nautilus** | Nautilus has mature futures/derivatives instrument support; DEX connectivity is out of scope for an Indian-equities-focused platform. |

**Bottom line:** the highest-leverage Jesse ideas for IndisNaut are the
statistical validation stack (significance testing, dual-mode Monte Carlo),
the research dashboard, and the ML pipeline discipline (single-source
features, automated importance) — none of which Nautilus provides natively,
and all of which can be implemented as a research layer wrapping Nautilus's
`BacktestEngine` rather than modifying Nautilus itself.
