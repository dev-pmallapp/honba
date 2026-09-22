# Enhancing Jesse's ML Pipeline with LLM Reasoning

Jesse AI's native ML pipeline (`gather_ml_data() → train_model() → deploy`, catalogued in
`unique-jesse.md` §3-4) is genuinely strong: single-source-of-truth feature functions, automated
meta-labeling, five-method feature importance. But it is fundamentally a **tabular-features →
scikit-learn/PyTorch pipeline**. It has no concept of unstructured text, cross-source reasoning,
or natural language. Seven concrete gaps fall out of that constraint — understanding unstructured
data, reasoning across sources, generating novel hypotheses, explaining predictions in plain
language, detecting regime shifts adaptively, answering user queries, and multi-step
chain-of-thought reasoning. Colibri (`colibri-integration.md`) — a local, OpenAI-compatible LLM
inference engine — fills these gaps without requiring honba to abandon Jesse's proven pipeline.
This document describes five integration patterns, the latency architecture that keeps them safe
to run alongside Nautilus, and a recommended build order.

## Section 1: What Jesse's ML Pipeline Does (and Doesn't Do)

### Capabilities

| Capability | What it does |
|---|---|
| Feature recording | `ml_features()` as a single source of truth, called identically during `gather_ml_data()` and live `on_bar()` — structurally eliminates train/deploy feature skew |
| Three task types | Binary classification, multiclass classification, regression — covers direction, regime-class, and magnitude prediction |
| Meta-labeling | López de Prado style: a primary model calls direction, a secondary model scores confidence, confidence scales position size rather than gating the trade |
| Automated feature importance | Five methods computed for free on every `train_model()` call: RFE, F-values (ANOVA), correlations, cross-validation impact, consensus rank — plus drop-column `feature_impact` |
| Deployment | `ml_predict_proba()` inside a live strategy, using the exact same `ml_features()` function used at training time |

This is a well-designed, low-risk pipeline for anything expressible as numeric features over
price/volume/indicator history. honba's `Yosoku` component (component-naming.md) wraps this
pipeline and is also where Colibri integration lives.

### Seven Gaps

Jesse's pipeline **cannot**:

1. **Understand unstructured data** — news headlines, earnings call transcripts, SEBI circulars,
   annual reports are all text. `ml_features()` only accepts numeric/categorical columns.
2. **Reason across multiple data sources simultaneously** — a model trained on OHLCV + indicators
   can't natively weigh "ROCE improved 2pp AND CEO resigned AND FII flow turned negative" as one
   coherent judgment; it needs each fact pre-encoded as an independent numeric feature.
3. **Generate novel trading hypotheses** — `train_model()` fits a model to features a human
   already chose. It cannot propose "try conditioning entries on promoter-holding delta" on its
   own.
4. **Explain predictions in natural language** — feature importance gives you a ranked list of
   column names, not a sentence a human can act on ("this trade was flagged because guidance was
   cut and sector momentum turned").
5. **Detect market regime changes adaptively** — regime labels can be engineered as features, but
   the pipeline has no mechanism to reason about *why* a regime shifted from macro/qualitative
   inputs (VIX spike + FII outflow + global risk-off headline, taken together).
6. **Process natural language queries from users** — there's no path from "why is my NIFTY
   strategy underperforming this month?" typed into the UI to an answer grounded in the strategy's
   own trade log.
7. **Chain-of-thought reasoning** — genuinely multi-step conditional logic ("if A and B but not C,
   then D") is exactly what gradient-boosted trees and linear models are weak at expressing
   compared to what they're strong at (smooth numeric decision boundaries).

## Section 2: Five Integration Patterns

### Pattern A: Offline Feature Engineering (Pre-trade / Batch)

```
Moneycontrol headlines → Colibri Brio (sentiment classification) →
NLPSentimentEvent (CustomData) → Jesse record_features() as numeric feature
```

Colibri classifies each headline (bullish/bearish/neutral + confidence, per `colibri-integration.md`
§3B's Brio pattern) as a **batch job**, well before market open. The output is persisted as a
`NLPSentimentEvent` and consumed by `ml_features()` as one more numeric column — `impact_score`,
`confidence` — sitting alongside RSI, ADX, and volume features exactly like any other input Jesse
already understands. This is the lowest-risk pattern: it doesn't touch Jesse's model, decision
logic, or execution path at all. It just adds a richer feature.

### Pattern B: Hybrid Signal Fusion (Pre-trade, event-triggered only)

```
Jesse ML prediction (0.72 BUY) + Colibri reasoning ("CEO resigned → BEARISH, 0.8 confidence")
→ if LLM_confidence > threshold: override ML → else: blend
```

The LLM acts as a **veto gate**, not a co-equal signal. It only fires on "event days" — days where
a significant, structured event is detected (management change, regulatory action, large delivery
spike) — not on every bar. Threshold is tunable and should start conservative (e.g.,
`LLM_confidence > 0.85` to override; otherwise blend at a small weight). This is the riskiest
pattern in the set because it lets an LLM veto a validated model's call, and needs the most
backtesting scrutiny (see Section 6, priority 5).

### Pattern C: Hypothesis Generation (Offline Research)

```
Colibri: "Given {fundamentals} + {market_state}, suggest 3 strategies"
→ StrategyConfig pydantic → Sakata backtests → Human reviews → Deploy best
```

This is the **RD-Agent pattern**, already scoped in `colibri-integration.md` §12: propose →
implement → backtest → refine, run as an autonomous loop with a human reviewing before deployment.
Microsoft's RD-Agent (14.7k★) proves this workflow at scale for quantitative factor discovery.
honba's version routes proposals through `Sakata` (the strategy/backtest engine) instead of Qlib,
but the loop shape is identical. This pattern requires genuine reasoning capability — see Section
5 — and is the most powerful but also most compute-hungry application of Colibri in this document.

### Pattern D: Explanation & Monitoring (Post-trade)

```
Trade closes → Log: {features, prediction, outcome}
→ User clicks "Explain this trade" in Shibui UI
→ Colibri returns natural language explanation
```

Zero latency constraint — this runs entirely after the fact, triggered by a user action in the
UI. The prompt is a structured summarization task ("given these feature values and this outcome,
explain in plain English why the model likely made this call"), not open-ended reasoning, so it's
cheap to run even on OLMoE.

### Pattern E: Regime-Aware Strategy Switching (Pre-trade, daily)

```
Daily pre-market: NIFTY level, VIX, FII/DII net, USD/INR, global indices
→ Colibri Brio: ["risk_on", "risk_off", "neutral"] + confidence + entropy
→ Strategy selects regime-appropriate parameter set
```

One Brio call per trading day, run pre-market. Output feeds `Chuei` (the trend/regime detection
component already named in `component-naming.md`) and is consumed by strategies to pick between
regime-specific parameter sets (e.g., wider stops in `risk_off`, tighter trailing stops in
`risk_on`).

## Section 3: Latency Architecture — The Critical Rule

Nautilus Trader's event loop is not forgiving of blocking I/O. Four safeguards must be enforced
for every pattern above:

1. **Never call the LLM inside `on_bar()` or `on_quote_tick()`.** These are hot-path callbacks
   fired on every market data event. A blocking HTTP call to Colibri (which runs at 3-4 tok/s for
   OLMoE — see `colibri-integration.md` §4) stalls the entire event loop and can cause missed fills
   or backtest slowdowns measured in orders of magnitude. All LLM output must be pre-computed
   before the strategy ever touches it.

2. **Use the CustomData + ParquetDataCatalog pipeline.** LLM outputs are packaged as timestamped
   events (`NLPSentimentEvent`, regime events, etc.) exactly as described in
   `colibri-integration.md` §10, and persisted to Parquet/PostgreSQL. The strategy reads from this
   event stream via `on_data()`. It never calls Colibri directly, in backtest or live mode.

3. **Use Brio mode for every classification task.** Closed-set scoring (give it options, get back
   probabilities + entropy) completes in under a second per call, versus 12-17 seconds for
   free-form generation on OLMoE. Patterns A and E are pure classification tasks — always use Brio,
   never free-form chat completion, for these.

4. **Graceful degradation when LLM data is stale.** If Colibri fails to run overnight, or a
   symbol's most recent sentiment event is older than a defined freshness window, the strategy
   must fall back to a neutral value rather than raise or silently use garbage data:

```python
def on_data(self, data: CustomData) -> None:
    if isinstance(data, NLPSentimentEvent):
        self._latest_sentiment[data.symbol] = data

def _current_sentiment(self, symbol: str) -> float:
    event = self._latest_sentiment.get(symbol)
    if event is None or self.clock.timestamp_ns() - event.ts_event > 86_400_000_000_000:
        return 0.0  # neutral fallback: data too old
    return event.impact_score / 5.0
```

## Section 4: Classification — Where Does the LLM Sit?

| Pattern | When | Why |
|---|---|---|
| A: Feature Engineering | Pre-trade / Batch | Overnight batch. 100 headlines × 3-4 tok/s ≈ 30 sec total. Never enters the trading loop. |
| B: Signal Fusion | Pre-trade | Event-triggered only, on significant-news days. NOT evaluated on every bar. |
| C: Hypothesis Gen | Offline Research | Minutes per proposal, fully human-in-the-loop before any code reaches `Sakata`. |
| D: Explanation | Post-trade | User-triggered from the UI. Zero latency constraint. |
| E: Regime Detection | Pre-trade / Daily | One Brio call per trading day, under one second. |

## Section 5: Minimum Model Per Pattern

| Pattern | Minimum Model | Colibri RAM/Disk | Why |
|---|---|---|---|
| A: Feature Engineering | OLMoE 7B int8 | 8GB / 7GB | Closed-set Brio classification; OLMoE benchmarks around 0.882 F1 on financial sentiment tasks. |
| B: Signal Fusion | OLMoE 7B int8 | 8GB / 7GB | The veto gate only needs a confidence score — Brio's entropy output gives us exactly that. |
| C: Hypothesis Generation | Qwen3.6-35B-A3B int4 | 24GB / 20GB | OLMoE is insufficient for novel financial reasoning (see `colibri-integration.md` §12 — "cannot reliably propose novel financial hypotheses"). RD-Agent is proven on larger models. |
| D: Explanation | OLMoE 7B int8 | 8GB / 7GB | Structured-data summarization, not open-ended reasoning — well within OLMoE's capability. |
| E: Regime Detection | OLMoE 7B int8 | 8GB / 7GB | Brio mode over a closed set of 3-5 regimes. OLMoE handles this comfortably. |
| Chain-of-Thought | Qwen3.6-35B-A3B int4 | 24GB / 20GB | Genuine multi-step reasoning requires real capability; OLMoE's 1B active parameters are too small. |

## Section 6: Implementation Priority & Effort

| Priority | Pattern | Effort | Why First |
|---|---|---|---|
| **1** | A: Feature Engineering | ~1-2 weeks | Highest leverage. `NLPSentimentEvent` CustomData already designed (`colibri-integration.md` §10). Fits directly onto the existing `Kage` ingestion pipeline. Lowest risk — it's a pure feature addition, no decision logic changes. |
| **2** | E: Regime Detection | ~1 week | `Chuei` is already named and scoped for exactly this job. Brio mode makes the implementation almost trivial — one daily API call. Unlocks regime-aware strategy switching immediately. |
| **3** | C: Hypothesis Generation | ~2-3 weeks | Unlocks the RD-Agent workflow — arguably the most powerful LLM application in quant finance today, proven at scale by Microsoft. Requires Qwen3.6 (24GB+ RAM) or a cloud LLM fallback via the `NLP_BACKEND` switch. |
| 4 | D: Explanation | ~1 week | User-facing polish for `Shibui`. High perceived value, not on the critical path for MVP. |
| 5 | B: Signal Fusion | ~2 weeks | Highest risk of the five — an LLM can override a validated model's signal. Requires extensive backtesting (stationary bootstrap significance test + both Monte Carlo modes, per `unique-jesse.md` §1-2) before it touches live capital. |

## Section 7: Roadmap Impact

honba's current roadmap (`roadmap.md`) has 8 phases across 24 weeks and does not mention
LLM/Colibri integration anywhere. Recommended changes:

- **Phase 6 (Wk 17-18):** Add Pattern A (NLP enrichment) as an extension of the existing
  Moneycontrol news scraper work already scheduled in Phase 2 — bolt it onto the `Kage` ingestion
  pipeline rather than opening a new workstream.
- **Phase 7 (Wk 19-21):** Add Pattern E (regime detection via `Chuei`) and Pattern D (explanation
  layer surfaced in `Shibui`).
- **Post-MVP (Q3-Q4 2026):** A new phase — "LLM-Augmented Research" — for Pattern C (hypothesis
  generation + RD-Agent loop). This requires either Qwen3.6-class local hardware (24GB+ RAM) or
  the configurable `NLP_BACKEND=colibri|openai|...` cloud fallback already architected in
  `colibri-integration.md` §9. Pattern B (signal fusion) should also land in this phase given its
  risk profile and backtesting requirements.

## Section 8: Architecture Diagram

```
┌───────────────────────────────────────────────────────────────┐
│ OFFLINE RESEARCH (Pattern C)                                   │
│ Colibri/Qwen → strategy hypotheses → StrategyConfig → Sakata  │
│ RD-Agent loop: propose → implement → backtest → refine        │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────▼──────────────────────────────────┐
│ PRE-TRADE / BATCH (Patterns A, B, E)                          │
│ Colibri/OLMoE Brio:                                            │
│   ├─ News sentiment (Pattern A) → NLPSentimentEvent           │
│   ├─ Macro regime (Pattern E) → RegimeEvent                   │
│   └─ Cross-source veto (Pattern B) → OverrideEvent            │
│ Store to: PostgreSQL + ParquetDataCatalog                      │
└────────────────────────────┬──────────────────────────────────┘
                             │ CustomData events
┌────────────────────────────▼──────────────────────────────────┐
│ NAUTILUS TRADER (Real-time & Backtest)                         │
│ Strategy.on_bar() / on_data():                                 │
│   reads pre-computed LLM features from event stream            │
│   NEVER calls LLM directly — always pre-computed              │
│   Graceful fallback if data stale (>24h)                      │
└────────────────────────────┬──────────────────────────────────┘
                             │ fills, positions
┌────────────────────────────▼──────────────────────────────────┐
│ POST-TRADE (Pattern D)                                         │
│ User clicks → Colibri explains trade → Shibui UI              │
│ Audit: features + prediction + outcome per trade               │
└───────────────────────────────────────────────────────────────┘
```

**The critical rule enforced architecturally:** LLM calls NEVER occur in Nautilus's hot path. All
LLM features are pre-computed, persisted to Parquet/PostgreSQL, and consumed as CustomData events.
Strategy always degrades gracefully to neutral when data is stale.
</content>
