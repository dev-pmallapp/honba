# Trading ML/AI Frameworks — Comprehensive Survey

## Introduction

This document surveys the significant machine learning and AI frameworks in the trading ecosystem that could be integrated into or inspire IndisNaut's AI pipeline. IndisNaut Market Researcher is built on [Nautilus Trader](https://github.com/nautechsystems/nautilus_trader) (36.9k stars, 2,438 commits, Apache 2.0) as its event-driven execution and backtesting core, targeting Indian equities on NSE/BSE. Because Nautilus itself does not ship an opinionated ML/AI layer, this survey evaluates the broader landscape of trading-specific ML frameworks, general-purpose ML libraries, commercial platforms, and LLM/transformer tooling — with a consistent eye toward two questions: **(1) how well does this framework fit Indian markets**, and **(2) how cleanly can it be layered on top of or alongside Nautilus Trader** without fighting its event-driven architecture.

The goal is not to pick a single "winner" but to establish a layered reference architecture — research, signal fusion, execution, and broker integration — where each framework is used for what it does best, feeding into Nautilus as the system of record for order management, risk, and live/backtest parity.

---

## Executive Summary Table

Priority-ranked by expected value to IndisNaut, with the recommended way to layer each framework onto Nautilus Trader.

| Priority | Framework | Best Use | Nautilus Layering Strategy |
|---|---|---|---|
| 1 | Qlib (Microsoft) | Research-grade factor discovery & model zoo | Feed Qlib's alpha factors as Nautilus Signal events |
| 2 | FreqAI | Online ML model training (GBDT, PyTorch) | Adapt IFreqaiModel as Nautilus TradingStrategy plugin |
| 3 | FinRL | DRL strategy optimization | Train policies → export → run as Nautilus Strategy |
| 4 | Lumibot | LLM-agent & multi-agent trading | AI agent decision layer → Nautilus execution via bridge |
| 5 | PyPortfolioOpt / Riskfolio-Lib | Portfolio construction from signals | Post-trade optimizer → Nautilus order management |
| 6 | FinGPT | Sentiment / fundamental NLP | Microservice → sentiment as Nautilus AlternativeData |
| 7 | XGBoost / LightGBM | Gradient-boosted price prediction | Direct integration — no adapter needed |
| 8 | QuantConnect LEAN | Benchmark / alternative backtesting | Cross-validate strategies across engines |
| 9 | TensorTrade | RL trading agent prototyping | Educational only; FinRL is more maintained |
| 10 | Blankly | Rapid prototyping / backtesting | Simpler alternative for quick iteration |

---

## Section A: Trading-Specific ML Frameworks (Built FOR Trading)

### A1. Qlib (Microsoft)

- **Description:** An AI-oriented quantitative investment platform from Microsoft Research covering the full research pipeline — data, feature/alpha mining, model training, backtesting, and portfolio construction.
- **ML Approach:** Broad model zoo — gradient boosting (LightGBM, XGBoost), deep learning (LSTM, GRU, Transformer, ALSTM, TFT), reinforcement learning, and graph neural networks; also includes automated factor mining (formulaic alphas).
- **Assets Supported:** Primarily equities (China A-shares, US equities out of the box); extensible data layer supports arbitrary instrument universes with custom providers.
- **Deployment Style:** Research/offline-first; supports "online serving" mode for periodic model retraining and rolling inference, not true tick-level live trading.
- **License:** MIT.
- **Maturity:** 48.7k stars — most starred framework in this survey; very active, backed by Microsoft Research; large model zoo and academic citation base.
- **Key Differentiator:** The single most comprehensive model zoo and factor-research toolkit available in open source; includes reproducible implementations of dozens of published quant/RL papers.
- **Data Ingestion:** Custom binary data format (`.qlib` bin data) with providers for daily/minute bars; requires an ETL step to convert external data sources into Qlib's format.
- **Strategy API Pattern:** Config-driven (YAML) pipelines — `DataHandler → Model → Strategy → Executor`; supports both declarative and Python API workflows.
- **Indian Equities Fit:** ⚠️ No built-in NSE/BSE data provider; the data layer is generic enough to support a custom Indian equities provider, but this must be built from scratch.
- **Nautilus Layering:** Best used purely as an **offline research and factor-generation engine**. Qlib's computed alpha factors/predictions can be emitted as Nautilus `Signal` (or custom `Data`) events consumed by a Nautilus `Strategy`, keeping Qlib entirely out of the live execution path.
- **Key Limitations:** Steep learning curve; China/US-centric defaults and documentation; not designed for live/streaming execution; requires custom Indian data adapter work.

### A2. FreqAI (Freqtrade)

- **Description:** An adaptive machine-learning module built into the Freqtrade crypto trading bot, enabling online/rolling model training directly inside a live trading strategy.
- **ML Approach:** Gradient-boosted decision trees (LightGBM, CatBoost, XGBoost) and PyTorch neural networks (including reinforcement learning via stable-baselines3), with automatic feature engineering and outlier detection (Dissimilarity Index, SVM, DBSCAN).
- **Assets Supported:** Cryptocurrency spot and futures (via exchange APIs like Binance, Bybit, OKX); not equities-native.
- **Deployment Style:** Live, self-hosted bot with continuous background retraining ("online learning") on a rolling window of historical data.
- **License:** GPL-3.0.
- **Maturity:** 54.6k stars (counting the parent Freqtrade project) — extremely active community, frequent releases.
- **Key Differentiator:** Genuine **online/adaptive retraining** in a live trading loop — the model retrains itself on a schedule as new candles arrive, rather than being trained once offline.
- **Data Ingestion:** Exchange REST/WebSocket APIs via `ccxt`; stores OHLCV data locally for feature computation.
- **Strategy API Pattern:** Python `IStrategy` subclass with an `IFreqaiModel` interface defining `fit`, `predict`, and feature-engineering hooks; strategy logic reads model predictions from a dataframe column.
- **Indian Equities Fit:** ❌ Crypto-only architecture (exchange assumptions, funding rates, 24/7 markets); would require substantial rework for NSE/BSE session-based trading.
- **Nautilus Layering:** The `IFreqaiModel` interface (fit/predict/retrain lifecycle) is a good **conceptual template** to adapt as a Nautilus `TradingStrategy` plugin/mixin that performs periodic retraining using Nautilus's own data cache, decoupled from Freqtrade's crypto-specific bot loop.
- **Key Limitations:** Tightly coupled to Freqtrade's crypto-centric bot architecture; GPL-3.0 licensing requires care in derivative works; no native equities/F&O support.

### A3. FinRL (AI4Finance Foundation)

- **Description:** An open-source deep reinforcement learning framework purpose-built for automated trading, providing standardized Gym-style environments for stocks, crypto, and portfolio allocation.
- **ML Approach:** Deep reinforcement learning — DQN, PPO, A2C, DDPG, SAC, TD3, and ensemble strategies via Stable-Baselines3 and ElegantRL backends.
- **Assets Supported:** US equities (via Yahoo Finance/Alpaca), cryptocurrency, and a general portfolio-allocation environment; some community extensions for other markets.
- **Deployment Style:** Primarily research/backtesting; has example live-trading integrations with Alpaca, but production live deployment requires custom engineering.
- **License:** MIT.
- **Maturity:** 16.4k stars; active AI4Finance Foundation community, strong academic presence (multiple NeurIPS/ICAIF papers and challenges).
- **Key Differentiator:** The most established, benchmarked **DRL-for-trading** framework, with standardized environments enabling reproducible RL research and multiple published trading competitions built on it.
- **Data Ingestion:** Pluggable data processors (Yahoo Finance, Alpaca, WRDS, CCXT); produces a standardized `DataFrame` consumed by the Gym environment.
- **Strategy API Pattern:** OpenAI Gym-style `env.reset()/env.step()` environments wrapping trading logic; trained agent policies output discrete/continuous position-sizing actions.
- **Indian Equities Fit:** ⚠️ No first-party NSE/BSE data processor, but the modular data-processor interface makes adding one feasible without touching the RL core.
- **Nautilus Layering:** Recommended pattern: **train DRL policies offline in FinRL's Gym environment**, export the trained policy (e.g., as a saved Stable-Baselines3 model), then wrap policy inference inside a Nautilus `Strategy.on_bar()`/`on_quote_tick()` handler for live/backtest execution — keeping training and execution cleanly separated.
- **Key Limitations:** RL strategies are notoriously sensitive to reward shaping and can overfit to backtest regimes; US-market defaults; live trading examples are minimal/reference-only, not production-grade.

### A4. FinGPT (AI4Finance Foundation)

- **Description:** An open-source financial large language model framework providing instruction-tuned LLMs and pipelines for financial sentiment analysis, robo-advising, and low-code LLM adaptation to finance tasks.
- **ML Approach:** LLM fine-tuning (LoRA/parameter-efficient tuning) on base models (e.g., Llama, ChatGLM), reinforcement learning from market feedback (RLMF), and retrieval-augmented generation for financial text.
- **Assets Supported:** Asset-agnostic — operates on financial *text* (news, filings, social media) rather than price data directly; downstream signals can be applied to any asset class.
- **Deployment Style:** Model weights and fine-tuning pipelines distributed for self-hosting; some hosted demo endpoints; no built-in live trading loop.
- **License:** MIT.
- **Maturity:** 21.3k stars; active AI4Finance community, rapid iteration alongside the broader open LLM ecosystem.
- **Key Differentiator:** Purpose-built, **low-cost fine-tuning recipes** (LoRA) specifically for financial NLP tasks, making it far cheaper to adapt than training a financial LLM from scratch (positioned as an open alternative to BloombergGPT).
- **Data Ingestion:** Scrapers/connectors for financial news, SEC filings, and social media (e.g., Twitter/Reddit sentiment datasets); text-based, not tick/bar data.
- **Strategy API Pattern:** Not a trading strategy API per se — outputs sentiment scores or structured predictions consumed by a downstream strategy layer.
- **Indian Equities Fit:** ⚠️ No Indian-language or Indian-source fine-tuning data out of the box; underlying LLM techniques are language/market-agnostic and could be fine-tuned on Indian financial news/filings.
- **Nautilus Layering:** Best deployed as an **independent sentiment microservice** — run FinGPT inference out-of-process, publish scores to a message bus, and ingest them into Nautilus as custom `AlternativeData`/`Data` objects alongside price data.
- **Key Limitations:** LLM inference cost/latency unsuitable for tick-level decisioning; requires GPU infrastructure for self-hosting; no Indian-market fine-tuned checkpoints available today.

### A5. TensorTrade

- **Description:** A modular Python framework for building, training, and evaluating reinforcement-learning trading agents using a composable "exchange/action/reward" component model.
- **ML Approach:** Reinforcement learning (via integration with RL libraries such as Stable-Baselines3, Ray RLlib); component-based reward/action schemes.
- **Assets Supported:** Simulated exchanges configurable for equities or crypto; no native broker integrations for live trading.
- **Deployment Style:** Research/simulation only — designed for building custom Gym-style trading environments, not for production deployment.
- **License:** Apache 2.0.
- **Maturity:** 7.1k stars; **development activity has slowed significantly** in recent years compared to FinRL.
- **Key Differentiator:** Highly composable architecture (pluggable `ActionScheme`, `RewardScheme`, `ExchangeScheme`) that made it popular for RL experimentation and education.
- **Data Ingestion:** Pandas DataFrame-based feeds; supports custom data streams via its `DataFeed` abstraction.
- **Strategy API Pattern:** Gym-compatible environment composition; agents implemented against standard RL library interfaces.
- **Indian Equities Fit:** ❌ No specific market data adapters; would require full custom integration and is not the actively maintained choice for this purpose.
- **Nautilus Layering:** **Educational reference only** — FinRL (A3) is the better-maintained, more actively supported choice for production RL work; TensorTrade's ideas (composable reward/action schemes) are worth studying but not worth adopting as a dependency.
- **Key Limitations:** Slowing maintenance cadence; smaller community than FinRL; no live-trading path; documentation has lagged behind API changes.

### A6. Lumibot (Lumiwealth)

- **Description:** A Python backtesting and live-trading framework emphasizing rapid strategy development, with growing support for AI-agent-driven and multi-agent ("agent team") trading workflows.
- **ML Approach:** Framework-agnostic — designed to host LLM-based decision agents (single or multi-agent "crews") that call out to any ML/LLM backend for signal generation; not itself a model-training library.
- **Assets Supported:** Equities, options, crypto, and futures via multiple broker integrations (Alpaca, Interactive Brokers, Tradier, and others).
- **Deployment Style:** Same codebase for backtest and live trading ("write once, run anywhere" strategy pattern), self-hosted.
- **License:** GPL-3.0.
- **Maturity:** 2.1k stars; smaller but growing community, active development focused on AI-agent trading patterns.
- **Key Differentiator:** Native support for **LLM-agent and multi-agent trading crews** — i.e., structuring a strategy as a team of cooperating AI agents (research agent, risk agent, execution agent) rather than a single model.
- **Data Ingestion:** Broker-provided market data feeds (via its broker adapter layer) plus custom data source plug-ins.
- **Strategy API Pattern:** `Strategy` base class with `on_trading_iteration()` lifecycle hooks; agent logic is invoked from within these hooks.
- **Indian Equities Fit:** ❌ No NSE/BSE broker adapters; broker integrations are US/global-broker focused (Alpaca, IBKR, Tradier).
- **Nautilus Layering:** Use Lumibot's **agent-orchestration patterns** (not its execution layer) as the design template for an "AI decision layer" — LLM/multi-agent reasoning produces trade intents, which are then bridged into Nautilus for actual order routing and risk management, rather than letting Lumibot execute directly.
- **Key Limitations:** GPL-3.0 licensing; no Indian broker support; smaller community means fewer battle-tested patterns than Nautilus itself for execution.

### A7. Blankly

- **Description:** A backtesting and live-trading framework advertised around "one-line" switching between paper trading, backtesting, and live trading across multiple exchanges.
- **ML Approach:** Not an ML framework itself — provides the trading/execution scaffolding into which any Python ML model can be plugged for signal generation.
- **Assets Supported:** Crypto (Coinbase, Binance, Alpaca crypto) and US equities (Alpaca); no Indian market support.
- **Deployment Style:** Self-hosted; emphasizes minimal-code switching between backtest/paper/live modes using the same strategy code.
- **License:** LGPL-3.0.
- **Maturity:** 2.5k stars; **project activity appears stale** — infrequent recent commits/releases compared to its earlier growth period.
- **Key Differentiator:** Simplicity of its backtest→paper→live switching model, intended to minimize the friction of moving a prototype strategy toward production.
- **Data Ingestion:** Exchange/broker APIs (Alpaca, Coinbase, Binance) via unified interface classes.
- **Strategy API Pattern:** `Strategy` class with event-handler decorators (e.g., `@strategy.add_price_event`) for bar/tick callbacks.
- **Indian Equities Fit:** ❌ No NSE/BSE integration, and given the project's stale status, unlikely to receive one.
- **Nautilus Layering:** Only relevant as a **lightweight alternative for quick prototyping** of an idea before porting it to Nautilus; not recommended as a dependency given its low maintenance activity — Nautilus already provides superior backtest/live parity.
- **Key Limitations:** Low recent development activity; limited broker/exchange coverage; smaller community; superseded in practice by more actively maintained alternatives (including Nautilus itself).

### A8. Zipline-Reloaded + Alphalens + Pyfolio

- **Description:** The community-maintained continuation of Quantopian's open-source stack — Zipline (event-driven backtester), Alphalens (factor/alpha analysis), and Pyfolio (portfolio/risk tearsheet analytics) — widely regarded as the gold standard for factor research workflows.
- **ML Approach:** Framework-agnostic; provides the backtesting and factor-evaluation harness into which any ML-generated signal/alpha can be tested (IC analysis, quantile returns, turnover, tearsheets).
- **Assets Supported:** US equities primarily (via bundle-based historical data ingestion, e.g., Quandl-based bundles); extensible to other markets through custom data bundles.
- **Deployment Style:** Offline/research-only — no live trading support; purely a research and factor-validation toolchain.
- **License:** Apache 2.0 (community-maintained forks of the original Quantopian projects).
- **Maturity:** Community-maintained since Quantopian's shutdown; stable but slower-moving than newer frameworks; still the reference implementation many quant researchers compare against.
- **Key Differentiator:** **Alphalens' factor-analysis methodology** (information coefficient, quantile spread returns, factor turnover/decay) remains the de facto standard vocabulary for evaluating whether an alpha signal is actually predictive, independent of any specific backtester.
- **Data Ingestion:** Zipline's `bundle` system (structured HDF5/bcolz-based storage) requires pre-ingested, pre-adjusted historical data bundles.
- **Strategy API Pattern:** `initialize()`/`handle_data()` callback style (predates the more modern event-driven engines like Nautilus).
- **Indian Equities Fit:** ⚠️ No official NSE/BSE bundle exists; a **custom data bundle** would need to be written to ingest Indian equities into Zipline's format (see Section H).
- **Nautilus Layering:** Not intended to replace Nautilus for execution — instead, **Alphalens and Pyfolio's analysis methodology should be reused/reimplemented** against Nautilus's own backtest output (fills, positions, returns) to get standardized factor and tearsheet analytics without adopting Zipline's older engine.
- **Key Limitations:** Zipline's engine itself is dated relative to Nautilus; community maintenance pace is slower than corporate-backed frameworks; US-market-centric data bundle ecosystem.

---

## Section B: General ML Libraries Commonly Used for Trading

| Library | ML Approach | Stars | License | Key Use in Trading | Indian Equities Fit |
|---|---|---|---|---|---|
| **XGBoost** | Gradient-boosted decision trees | ~26k | Apache 2.0 | Price/return prediction, feature-based signal models, ranking factors | ✅ Asset-agnostic — works directly on any feature set |
| **LightGBM** | Gradient-boosted decision trees (histogram-based, faster) | ~17k | MIT | Same as XGBoost, preferred for speed on large tabular feature sets | ✅ Asset-agnostic |
| **CatBoost** | Gradient-boosted decision trees (native categorical handling) | ~8k | Apache 2.0 | Signal models where categorical features (sector, exchange, F&O series) matter | ✅ Asset-agnostic |
| **scikit-learn** | Classical ML (regression, classification, clustering, PCA) | ~61k | BSD-3 | Feature engineering, baseline models, clustering regimes, PCA on factor sets | ✅ Asset-agnostic |
| **PyTorch** | Deep learning (general-purpose tensor/autograd framework) | ~90k | BSD-3 | LSTM/Transformer price models, custom RL policy networks | ✅ Asset-agnostic |
| **TensorFlow / Keras** | Deep learning | ~190k / ~62k | Apache 2.0 | Deep learning price/volatility models, alternative to PyTorch | ✅ Asset-agnostic |
| **Prophet (Meta)** | Additive time-series decomposition (trend/seasonality/holidays) | ~19k | MIT | Longer-horizon trend/seasonality forecasting, macro series | ✅ Supports custom holiday calendars — usable with NSE holiday list |
| **statsmodels** | Classical statistics (ARIMA, GARCH, cointegration, hypothesis tests) | ~10k | BSD-3 | Pairs-trading cointegration tests, volatility modeling (GARCH), statistical arbitrage | ✅ Asset-agnostic |
| **hmmlearn** | Hidden Markov Models | ~3.2k | BSD-3 | Regime detection (bull/bear/chop states) from price/volatility series | ✅ Asset-agnostic |
| **TA-Lib** | Technical indicator library (150+ indicators) | ~11k | BSD-3 | Feature engineering input for ML models (RSI, MACD, Bollinger Bands, etc.) | ✅ Asset-agnostic — pure price/volume math |
| **Optuna / Hyperopt** | Hyperparameter optimization (Bayesian/TPE search) | ~11k / ~7.3k | MIT / BSD-3 | Tuning ML model and strategy hyperparameters, walk-forward optimization | ✅ Asset-agnostic |

---

## Section C: Commercial/SaaS Trading ML Platforms

- **QuantConnect / LEAN Engine** — Open-source (21.7k stars, Apache 2.0) event-driven backtesting/live-trading engine underlying the QuantConnect cloud platform. Supports equities, options, futures, forex, and crypto across many geographies, with built-in ML library support (scikit-learn, TensorFlow, PyTorch pre-installed in its cloud research environment). Relevant to IndisNaut primarily as an **independent benchmark engine** — strategies can be cross-validated by running equivalent logic on both LEAN and Nautilus to sanity-check backtest results, though LEAN has no native NSE/BSE data feed either.
- **Numerai** — A crowdsourced hedge fund/data-science competition platform where participants submit ML models against obfuscated (anonymized) global equity features in exchange for staked-token rewards. Not directly integrable (data is deliberately obfuscated and US/global-market-centric), but its **meta-model ensembling methodology** (combining many independently trained models via a weighted meta-model) is a useful architectural pattern to study for combining multiple IndisNaut signal sources.
- **Alpaca Markets** — A commission-free brokerage with a developer-first API, widely used as the default broker integration in FinRL, Lumibot, and Blankly examples above. US-equities/crypto only, with no relevance to NSE/BSE execution, but its API design (simple REST/WebSocket, paper-trading sandbox) is a useful reference for what a clean Indian-broker adapter (e.g., Zerodha Kite) should feel like.
- **Quantopian (defunct)** — No longer operating, but its legacy lives on directly through the community-maintained Zipline-Reloaded, Alphalens, and Pyfolio projects (Section A8), which remain the most-cited open-source factor research toolchain despite the platform's shutdown.

---

## Section D: LLM/Transformer-Based Trading Tools

- **FinBERT / FinBERT-tone** — BERT-family models fine-tuned on financial text corpora for sentiment classification (positive/negative/neutral) of news headlines, earnings calls, and analyst reports. Open weights available; lightweight enough for CPU/small-GPU inference, making them a practical near-term option for sentiment scoring of Indian financial news (subject to fine-tuning on Indian-market text for best accuracy).
- **BloombergGPT** — A 50B-parameter LLM trained by Bloomberg on a mixed corpus of proprietary financial data and general text; **proprietary and not publicly released** — relevant only as a benchmark/inspiration for what a large-scale financial LLM can achieve, not as something IndisNaut can directly use.
- **Instruct-FinGPT** — An instruction-tuned variant within the FinGPT family (Section A4), fine-tuned specifically for financial sentiment/instruction-following tasks using LoRA, demonstrating the low-cost fine-tuning recipe pattern that could be replicated for Indian-market-specific instruction tuning.
- **Local Deployment Options (Ollama, llama-cpp)** — For self-hosted, low-latency, and data-privacy-preserving LLM inference (important given Indian financial data residency considerations), **Ollama** and **llama-cpp** provide quantized local inference of open-weight models (Llama, Mistral, etc.) without external API calls. This is directly relevant to **IndisNaut's Colibri integration** — Colibri can route sentiment/reasoning tasks to a locally hosted quantized model via Ollama/llama-cpp instead of a cloud LLM API, keeping inference in-house and reducing per-call cost/latency for high-frequency sentiment scoring.

---

## Section E: Specialized Libraries

- **PyPortfolioOpt** (4.5k stars, MIT) — A portfolio optimization library implementing mean-variance optimization (Markowitz), Black-Litterman, Hierarchical Risk Parity (HRP), and Critical Line Algorithm (CLA). Well-documented, actively maintained, and the most approachable starting point for converting raw ML signals into position-sized portfolios.
- **Riskfolio-Lib** (3k stars, MIT) — A more advanced portfolio optimization library covering a broader set of risk measures (CVaR, CDaR, EVaR, worst-case optimization) and risk-parity/risk-budgeting approaches beyond what PyPortfolioOpt offers; suited for more sophisticated risk-aware allocation once basic mean-variance approaches are outgrown.
- **CVXPY** (5k stars, Apache 2.0) — A general-purpose convex optimization modeling language in Python; underlies many portfolio optimizers (including parts of PyPortfolioOpt/Riskfolio-Lib) and can be used directly to formulate custom constrained optimization problems (e.g., sector/exposure-constrained portfolio construction for NSE/BSE universes).
- **vectorbt** (4.5k stars) — A high-performance vectorized backtesting and technical-analysis library (NumPy/Numba-accelerated), popular for rapid parameter-sweep backtesting and signal research at scale before committing a strategy to a full event-driven engine like Nautilus.
- **MPLFinance** — A matplotlib extension for financial chart plotting (candlesticks, OHLC, volume panels); useful for visualization/diagnostics of Nautilus backtest output and ML model feature/prediction inspection, though not itself an ML or execution library.

---

## Section F: Relevance Matrix for Indian Equities

Ratings: ✅ Good/Native, ⚠️ Partial/Requires Custom Work, ❌ Poor/Not Supported. Maturity is a qualitative activity rating (High/Medium/Low) based on stars and recent commit cadence.

| Framework | Indian Equities Support | NSE F&O Support | Fundamental Data Support | Nautilus Layering Ease | Maturity |
|---|---|---|---|---|---|
| Qlib | ⚠️ Custom provider needed | ❌ | ⚠️ Custom handler needed | ✅ Easy (research-only layer) | High |
| FreqAI | ❌ Crypto-only | ❌ | ❌ | ⚠️ Concept-only reuse | High |
| FinRL | ⚠️ Custom data processor needed | ❌ | ❌ | ✅ Easy (train offline, deploy policy) | High |
| FinGPT | ⚠️ Needs Indian-text fine-tuning | N/A | ⚠️ Needs Indian filings/news corpus | ✅ Easy (microservice pattern) | High |
| TensorTrade | ❌ | ❌ | ❌ | ⚠️ Reference only | Low |
| Lumibot | ❌ No NSE/BSE broker | ❌ | ❌ | ⚠️ Pattern reuse only | Medium |
| Blankly | ❌ | ❌ | ❌ | ❌ Not recommended | Low |
| Zipline + Alphalens + Pyfolio | ⚠️ Custom bundle needed | ❌ | ⚠️ Custom | ⚠️ Reuse analytics only | Medium |
| XGBoost / LightGBM / CatBoost | ✅ Asset-agnostic | ✅ Feature-based | ✅ Feature-based | ✅ Direct integration | High |
| PyPortfolioOpt / Riskfolio-Lib | ✅ Asset-agnostic | ⚠️ Underlying-only, no derivatives modeling | N/A | ✅ Easy (post-signal layer) | High |
| QuantConnect / LEAN | ❌ No NSE/BSE feed | ❌ | ❌ | ⚠️ Benchmark-only | High |

---

## Section G: Recommended Architecture for IndisNaut

```
┌───────────────────────────────────────────────────────────────────┐
│ RESEARCH LAYER                                                     │
│   Qlib (factor discovery) + FinGPT (sentiment) +                   │
│   XGBoost/LightGBM + statsmodels + hmmlearn                        │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│ SIGNAL FUSION LAYER                                                  │
│   PyPortfolioOpt / Riskfolio-Lib (portfolio optimization)            │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│ EXECUTION LAYER (Nautilus Trader)                                   │
│   NSE/BSE instruments, event-driven backtesting,                    │
│   live trading, risk management                                     │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│ BROKER INTEGRATION LAYER                                             │
│   NSE/BSE via IBKR / Zerodha Kite / custom adapter                  │
└───────────────────────────────────────────────────────────────────┘
```

Each layer above is deliberately decoupled: the **research layer** produces signals/factors offline or as periodic batch jobs; the **signal fusion layer** turns raw model outputs into portfolio-level target weights/positions; the **execution layer** (Nautilus Trader) owns all order lifecycle, risk, and backtest/live parity concerns; and the **broker integration layer** is the only place that talks to actual NSE/BSE market access. No single external ML framework spans more than the top two layers — Nautilus remains the sole system of record for execution.

---

## Section H: What's Missing / Must Build for IndisNaut

None of the frameworks surveyed above provide native Indian-market support. The following components have no existing open-source equivalent and must be built in-house for IndisNaut:

1. **NSE/BSE data ingestion pipeline** — bhavcopy (daily EOD), tick-level data, and corporate actions (splits/bonuses/dividends) ingestion, normalized into a form consumable by both the research layer and Nautilus.
2. **Indian instrument mapping** — ISIN → Nautilus `Instrument` type mapping (equities, indices, F&O contracts) with correct tick sizes, lot sizes, and expiry conventions.
3. **Indian market calendar** — trading sessions, holidays, and special sessions (e.g., Muhurat trading) modeled as a Nautilus-compatible market calendar.
4. **Fundamental data integration** — connectors for Screener.in/Moneycontrol-style fundamental data (financial statements, ratios) feeding both the research layer's factor models and FinGPT-style NLP pipelines.
5. **Indian F&O option chain models** — option chain data structures and pricing/greeks conventions specific to NSE derivatives (weekly/monthly expiries, lot-size-based contracts).
6. **Custom Qlib data handler for Indian equities** — a `DataHandler`/data provider implementation so Qlib's factor-mining and model zoo can operate on NSE/BSE data.
7. **Custom data bundle for Indian markets** — a Zipline-style (or equivalent) data bundle enabling reuse of the Alphalens/Pyfolio factor-analysis methodology against Indian equities history.
