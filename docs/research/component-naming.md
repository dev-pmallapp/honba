# Component Naming Schema — honba Platform

## Section 1: Philosophy

honba itself is already the project name — it needs no translation, no reinterpretation. But the internal components that make up the platform deserve names that carry the weight of the tradition they serve.

Every internal component in honba draws its name from Japanese candlestick and market tradition first, with secondary Chinese and Korean terms admitted where they fit better than any Japanese alternative. This is not decoration. Naming a component `Sakata` after the birthplace of candlestick charting, or `Kumo` after the Ichimoku cloud, gives every engineer who touches the code a mental anchor rooted three centuries deep in market history — the same history that produced the tools we still trade with today.

Each candidate name must pass three tests before it earns a place in the codebase:

1. **Authentic origin** — the term must have real standing in East Asian trading, charting, or market tradition. No invented compounds, no folklore borrowed for flavor.
2. **Semantic fit** — the meaning of the term must map cleanly onto what the component actually does. A name that requires a paragraph of justification has failed this test.
3. **Concise and pronounceable** — the term must be usable by English-speaking developers in daily conversation and code review, typically 2–3 syllables, without requiring special characters in identifiers.

What follows is the definitive map.

---

## Section 2: The Component Map

### Core Infrastructure

**Soba** (JP: 相場) — "the market"
  → Market data hub. Central price feed, instrument registry, market session calendar. The single source of truth for all market data in honba.
  → Most authentic Japanese term for "the market." Honma Munehisa used it in his book title. Any Japanese trader would recognize it instantly.

**Nagare** (JP: 流れ) — "flow"
  → Streaming data pipeline. Real-time WebSocket ingestion, tick-to-bar aggregation, live option chain updates.
  → Captures the essence of streaming/flowing data. Used in Japanese trading for order flow.

**Dojima** (JP: 堂島) — the world's first futures exchange (Osaka, 1697)
  → Order management & execution layer. Routes orders, manages positions, tracks fills. The derivatives/F&O subsystem lives here.
  → Direct homage to where futures trading began. Perfect for the order execution component of a platform that handles NSE F&O.

**Kaze** (JP: 風) — "wind"
  → Real-time WebSocket/gRPC streaming layer. Ephemeral, fast, carries data like the wind. Push notifications, live tick stream.
  → Evocative of fast, ephemeral data. Short and punchy.

**Tsuchi** (JP: 土) — "earth"
  → Persistent storage. PostgreSQL database, Parquet catalog, historical data archives. The stable ground everything builds on.
  → Earth = stability, permanence, foundation. Good contrast with Kaze (wind).

### Data & Analysis

**Renko** (JP: 練行足) — "brick chart" — noise-filtered price
  → Data cleaning & normalization pipeline. Bhavcopy parsing, corporate action adjustment, outlier detection. Turns raw exchange data into clean, usable bars.
  → Renko charts filter noise — exactly what a data cleaning pipeline does. Globally recognized term.

**Bunseki** (JP: 分析) — "analysis"
  → Research & analytics engine. Factor computation, statistical tests, performance metrics, Monte Carlo simulation.
  → Direct and appropriate. Clean mapping to function.

**Kehai** (JP: 気配) — "market indication / hint / sign"
  → Signal discovery engine. Scans for emerging patterns, anomalous volume, unusual option activity, FII/DII flow shifts. Early warning system.
  → Japanese traders use kehai for "market feel" — the subtle signs before a move. Perfect fit.

### Strategy & Backtesting

**Sakata** (JP: 酒田) — Honma Munehisa's hometown, origin of candlestick analysis
  → Strategy engine & backtesting framework. The heart of honba's research layer. Wraps Nautilus Trader's BacktestEngine. Houses all strategy definitions, parameter optimization, walk-forward testing.
  → A direct homage to the birthplace of technical analysis. Strong narrative resonance.

**Tenkan** (JP: 転換) — "conversion / turning" (from Ichimoku: Tenkan-sen, the conversion line)
  → Signal generation & trigger engine. Takes research output (signals, predictions, factor scores) and converts them into actionable trade triggers.
  → The Tenkan-sen in Ichimoku signals the short-term turning point. Perfect for a signal-to-action converter.

**Kijun** (JP: 基準) — "base / standard" (from Ichimoku: Kijun-sen, the baseline)
  → Benchmark & reference data. NIFTY 50 total return index, sector benchmarks, risk-free rate curves. The measuring stick for all strategy performance.
  → The Kijun-sen is the reference line everything is measured against. Natural fit.

**Chikou** (JP: 遅行) — "lagging" (from Ichimoku: Chikou Span, the lagging line)
  → Backtest validation & confirmation layer. Runs AFTER primary backtests to confirm results. Checks for look-ahead bias, survivorship bias, data snooping. The "did we cheat?" checker.
  → The lagging span confirms what the faster lines suggested. Same function: validate after the fact.

**Yosoku** (JP: 予測) — "prediction"
  → ML prediction engine. Model training, inference serving, feature store. XGBoost/LightGBM models, Colibri LLM integration, sentiment scoring.
  → Direct meaning: prediction. Clean fit.

### Risk & Monitoring

**Kumo** (JP: 雲) — "cloud" (from Ichimoku: Kumo, the cloud)
  → Risk management layer. Position limits, exposure monitoring, VaR calculations, circuit breakers, margin checks. The protective "cloud" over trading activity.
  → The Ichimoku cloud acts as support/resistance — a protective boundary. Every trader knows this term.

**Hikkake** (JP: 引っ掛け) — "trap / trick" — false breakout pattern
  → Anomaly detection & false signal filter. Detects market traps, fake breakouts, data anomalies, potential data feed errors.
  → A pattern whose name literally means "to trick." Perfect for a component that catches market tricks.

**Kanshi** (JP: 監視) — "monitoring / surveillance"
  → Live monitoring dashboard backend. System health, queue depths, latency metrics, disk usage alerts. The ops/sre monitoring plane.
  → Direct mapping. Official Japanese term for surveillance/monitoring.

### UI Layer

**Ma** (JP: 間) — "negative space / interval / pause"
  → UI layout system. Spacing, responsive breakpoints, panel management, chart canvas sizing. The design system's foundation.
  → A Zen aesthetic concept about the power of negative space. Perfect for a UI system that values data density WITH breathing room.

**Shibui** (JP: 渋い) — "understated elegance / quiet refinement"
  → Design system & component library. CSS tokens, color palette, typography, component primitives. The visual language of honba.
  → The aesthetic philosophy of understated, refined simplicity. Maps to honba's "no gaudy components" design constraint.

### Ingestion / Web Mining

**Kage** (JP: 陰/影) — "shadow" — the Japanese term for candlestick wicks
  → Web scraper & data extractor. Screener.in parser, Moneycontrol news scraper, NSE/BSE bhavcopy downloader. Extracts the "hidden" data from web sources.
  → Shadows/wicks are the thin lines that reveal what happened beyond the obvious. Scrapers extract hidden data. Clever fit.

**Chuei** (KR: 추세) — "trend"
  → Trend detection & regime classification. Bull/bear/sideways state machine. Uses HMM, moving average crossovers, ADX. Korean traders recognize 추세 immediately.
  → The universal concept in trading. Korean term for trend. Adds a Korean dimension to the naming palette.

---

## Section 3: Naming Theme Rationale

The Ichimoku Kinko Hyo (一目均衡表) system provides the richest single source for component naming, because its five lines were designed by Goichi Hosoda in the 1930s to describe a *complete trading pipeline* — not just a chart overlay. That structure maps almost perfectly onto how honba's research layer is organized:

- **Tenkan-sen** (conversion) → signal generation
- **Kijun-sen** (baseline) → benchmark/reference
- **Senkou Span A/B** → forward-looking projection → prediction engine
- **Chikou Span** (lagging) → validation/confirmation
- **Kumo** (cloud) → risk boundary

This is not just aesthetic coincidence — it gives developers a memorable mental model of how components relate to one another. When an engineer sees `Tenkan` feeding into `Sakata` and validated by `Chikou`, with `Kumo` wrapping the whole thing in risk limits, the Ichimoku analogy tells them exactly where a new feature belongs without needing to read the architecture docs.

---

## Section 4: Quick Reference Table

| Component | Name | Origin | Function |
|---|---|---|---|
| Market Data Hub | Soba | JP: 相場 | Central price feed, instruments, calendar |
| Data Pipeline | Nagare | JP: 流れ | Streaming ingestion, real-time updates |
| Order Execution | Dojima | JP: 堂島 | Order routing, F&O, position management |
| WebSocket/Stream | Kaze | JP: 風 | Real-time push, notifications |
| Storage/Database | Tsuchi | JP: 土 | PostgreSQL, Parquet, archives |
| Data Cleaning | Renko | JP: 練行足 | Normalization, adjustment, validation |
| Analytics Engine | Bunseki | JP: 分析 | Factor computation, statistics, metrics |
| Signal Discovery | Kehai | JP: 気配 | Early warning, pattern scanning |
| Strategy Engine | Sakata | JP: 酒田 | Backtesting, optimization, strategy DSL |
| Signal Triggers | Tenkan | JP: 転換 | Signal-to-trade conversion |
| Benchmark Data | Kijun | JP: 基準 | Index data, reference curves |
| Backtest Validation | Chikou | JP: 遅行 | Bias detection, result confirmation |
| ML Prediction | Yosoku | JP: 予測 | ML models, Colibri, sentiment |
| Risk Management | Kumo | JP: 雲 | Exposure, VaR, circuit breakers |
| Anomaly Detection | Hikkake | JP: 引っ掛け | False signals, data quality |
| System Monitoring | Kanshi | JP: 監視 | Health, metrics, alerts |
| UI Layout System | Ma | JP: 間 | Spacing, panels, responsive |
| Design System | Shibui | JP: 渋い | Colors, typography, components |
| Web Scrapers | Kage | JP: 陰/影 | Screener.in, Moneycontrol, NSE/BSE |
| Trend Detection | Chuei | KR: 추세 | Regime classification, market state |

---

## Section 5: Terms Considered But Rejected

- **Aishi** (愛市) — not a real Japanese compound, sounds artificial.
- **Kappa / Tanuki / Baku** — folkloric creatures with zero market association.
- **Wu Xing / 五行** — too esoteric, cryptic to non-Chinese speakers.
- **Qi / 气** — too abstract, hard to map to a concrete component.
- **Sanmi / Sanpo / Sanku** — generic counting words, not trading terms.
- **Shizukesa** — general "calmness," no trading connotation.
- **Marubozu / Harami** — too specifically candle-pattern, better as feature names than component names.

---

## Section 6: Usage in Code

```python
# Python package structure
honba/
├── soba/              # Market data hub
│   ├── instruments.py
│   ├── calendars.py
│   └── feeds.py
├── nagare/            # Streaming pipeline
│   ├── websocket.py
│   └── aggregation.py
├── sakata/            # Strategy engine
│   ├── backtest.py
│   ├── strategy.py
│   └── optimizer.py
├── kumo/              # Risk management
│   └── limits.py
├── kage/              # Web scrapers
│   ├── screener.py
│   ├── moneycontrol.py
│   └── nse.py
├── shibui/            # Design system
│   ├── tokens.css
│   └── components/
└── yosoku/            # ML prediction
    ├── models.py
    └── colibri_client.py
```

```toml
# Configuration referencing components
# honba.toml
[soba]
nse_session_start = "09:15"
bse_session_start = "09:15"

[sakata]
backtest_engine = "nautilus"
default_benchmark = "NIFTY50_TR"

[kumo]
max_position_pct = 0.10
var_confidence = 0.99
```

---

## Section 7: Naming Conventions for Future Components

1. Prefer Japanese trading/candlestick terms over generic vocabulary.
2. Check against official glossaries (Ichimoku, candlestick patterns, Japanese exchange terms).
3. Must be 2–3 syllables maximum for pronounceability.
4. Must be Googleable by developers (no obscure kanji-only terms).
5. Chinese terms acceptable for specific components (e.g., ML, prediction).
6. Korean terms acceptable if uniquely fitting (e.g., Chuei for trend).
7. No made-up compounds. Every name must have authentic origin.
