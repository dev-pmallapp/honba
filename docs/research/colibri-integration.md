# Colibri Integration — Local LLM Inference for IndisNaut Market Researcher

## 0. What Colibri Is (and Isn't)

[**Colibri**](https://github.com/JustVugg/colibri) (36.9k★, Apache 2.0) is a **frontier
Mixture-of-Experts (MoE) LLM inference engine**, not a trading-specific ML framework. It is a
pure-C, zero-dependency engine that streams model weights across a VRAM → RAM → NVMe hierarchy,
letting models with 7B–2.8T parameters (OLMoE, Qwen3.6/3.8, DeepSeek V4 Flash, GLM-5.2, Kimi K3)
run on consumer laptops with no GPU required. It exposes an **OpenAI-compatible HTTP API**
(`/v1/chat/completions`, `/v1/messages`) plus a **Brio mode** for closed-set scoring (give it
options, get back probabilities + entropy).

For IndisNaut, Colibri is the **local NLP backend**: it turns unstructured Indian-market text
(news, concalls, annual reports, SEBI circulars) into structured signals without API costs or
data leaving the machine. It does **not** replace Nautilus Trader (backtesting/execution) or any
part of the quantitative pipeline — it's an enrichment service the ingestion pipeline and API
layer call into.

## 1. What Colibri Brings to IndisNaut

- **Zero marginal cost, zero data egress** — a frontier-class LLM running entirely on the
  research machine.
- **Earnings call transcript analysis** — summarize quarterly concalls, extract sentiment, flag
  risk factors.
- **News sentiment classification** — label Moneycontrol headlines bullish/bearish/neutral per
  symbol.
- **Financial report summarization** — condense 100-page annual reports into structured
  fundamental insights.
- **Market regime classification** — via Brio mode: feed NIFTY level/VIX/FII flow, get back a
  probability distribution over regimes.
- **Strategy idea generation** — turn a fundamentals snapshot (ROCE, D/E, PE) into candidate
  research hypotheses for backtesting.
- **Regulatory document parsing** — SEBI/NSE circulars → extract rule changes and compliance
  impact.

## 2. Architecture Integration

```
┌──────────────────────────────────────────────────────┐
│                 IndisNaut Platform                    │
├──────────────────────────────────────────────────────┤
│  Frontend (HTMX + Lightweight Charts)                │
│  FastAPI Backend                                     │
│    ├─ /api/nlp/summarize     ──→ Colibri API         │
│    ├─ /api/nlp/sentiment     ──→ Colibri API         │
│    ├─ /api/nlp/classify      ──→ Colibri Brio mode   │
│    ├─ /api/nlp/chat          ──→ Colibri Chat        │
│  Nautilus Trader Engine (backtesting)                │
│  Data Ingestion Pipeline                             │
│    └─ NLP enrichment stage ←→ Colibri API            │
├──────────────────────────────────────────────────────┤
│  Colibri (separate process, OpenAI-compatible API)   │
│    ├─ Model: GLM-5.2 int4 (744B) or OLMoE (7B)      │
│    ├─ Storage: ~372GB on NVMe or ~7GB for OLMoE     │
│    └─ API: localhost:8000/v1                         │
└──────────────────────────────────────────────────────┘
```

Colibri runs **out-of-process** as `coli serve`. IndisNaut never links against it or embeds it —
the FastAPI backend and the ingestion pipeline's NLP enrichment stage both talk to it purely over
HTTP. This keeps Colibri upgrades/model swaps independent of application deploys.

## 3. Practical Integration Pattern

### A. Installation & Setup

- Colibri runs as a standalone process bound to `localhost:8000`.
- IndisNaut talks to it via the `openai` Python client pointed at that base URL — no custom
  client needed.
- Model choice by hardware:
  - **OLMoE (7B, int8, ~7GB)** — fully RAM-resident, 3–4 tok/s on 16GB machines. **Default for
    IndisNaut.**
  - **Qwen3.6-35B-A3B (int4, ~20GB)** — needs 24GB+ RAM, 3–10 tok/s. Better drafting quality,
    overkill for routine classification.
  - **GLM-5.2 (744B, int4, ~372GB)** — frontier quality, 0.1–2 tok/s. Reserve for deep,
    non-interactive research reports only.

### B. Python Integration Code

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="local")

# Sentiment classification
response = client.chat.completions.create(
    model="olmoe",
    messages=[{
        "role": "user",
        "content": f"Classify this news headline as BULLISH, BEARISH, or NEUTRAL for "
                    f"{stock_symbol}. Reply with only one word.\n\nHeadline: {headline}",
    }],
    max_tokens=10,
    temperature=0,
)

# Structured classification via Brio mode
import httpx

result = httpx.post("http://localhost:8000/v1/brio", json={
    "model": "olmoe",
    "state": f"Market conditions: NIFTY at {nifty_level}, VIX at {vix}, "
             f"FII net {fii_flow} Cr\nHeadline: {headline}",
    "question": "What sentiment does this news convey?",
    "options": ["bullish", "bearish", "neutral"],
})
# {"answer": "bullish", "entropy": 0.12, "probabilities": {...}}
```

### C. Batch Processing for the Ingestion Pipeline

- Use async HTTP for batch NLP enrichment — don't block ingestion on a single slow request.
- OLMoE at ~3.7 tok/s handles roughly 10–20 classification calls/minute on a 16GB machine.
- Longer inputs (earnings transcripts) run at ~1–2 summaries/minute — expect this and plan
  accordingly.
- Pattern: a FastAPI endpoint enqueues an NLP job → a worker calls Colibri → result is persisted
  to PostgreSQL → downstream consumers (strategies, UI) read from the DB, never from Colibri
  directly.

## 4. Laptop-Friendly Model Recommendations

| Hardware | Recommended Model | Disk | RAM | Speed | Use Case |
|---|---|---|---|---|---|
| 16GB RAM, basic SSD | OLMoE int8 (7B) | 7 GB | 8 GB min | 3–4 tok/s | Sentiment, classification, short summaries |
| 24GB RAM, fast NVMe | Qwen3.6-35B-A3B int4 | 20 GB | 24 GB | 3–10 tok/s | Longer summaries, analyst report drafting |
| 32GB+ RAM, 1TB+ NVMe | GLM-5.2 int4 (744B) | 372 GB | 16 GB min | 0.5–2 tok/s | Deep analysis, complex strategy research |
| No local GPU | OLMoE (CPU-only) | 7 GB | 8 GB | 3–4 tok/s | Works on any laptop with 8GB+ RAM |

**For IndisNaut's MVP (16-week target): start with OLMoE.** 7GB download, runs on any developer
laptop, sufficient for sentiment/news/fundamental extraction. GLM-5.2 is aspirational, reserved
for research-report generation in Phase 6+.

## 5. NLP Use Cases for Indian Markets

**A. Screener.in annual report → structured JSON:**

```python
prompt = f"""Extract these metrics from the Screener.in data for {symbol}:
P&L: {quarterly_data}
Balance Sheet: {bs_data}
Output ONLY valid JSON with: {{"pe_ratio": float, "roce_pct": float, "debt_equity_ratio": float,
  "profit_growth_3yr": float, "promoter_holding": float, "key_risk": str}}"""
```

**B. Moneycontrol news → impact score:**

```python
prompt = (f"Rate the impact of this news on {symbol}'s stock price tomorrow: "
          f"-5 (very bearish) to +5 (very bullish). Headline: {headline}")
```

**C. Earnings call transcript → strategy input:**

```python
prompt = (f"Summarize this earnings call for {symbol}. Identify: 1) Revenue guidance, "
          f"2) Margin outlook, 3) Capex plans, 4) Risk factors, 5) Management tone "
          f"(confident/cautious/worried). Transcript: {transcript[:8000]}")
```

**D. Multi-factor research hypothesis generation:**

```python
prompt = f"""Based on these fundamental metrics for {symbol}:
ROCE: 18%, D/E: 0.3, PE: 24.5, Sales Growth 3Y: 15%, Promoter Holding: 51%
Suggest 3 quantitative research hypotheses (entry/exit rules) for backtesting."""
```

## 6. Resource Planning

- **Disk:** OLMoE 7 GB; GLM-5.2 372 GB (pre-converted int4 container).
- **RAM:** OLMoE 8 GB min (16 GB comfortable); GLM-5.2 16 GB min (24 GB+ recommended). Colibri
  auto-sizes its caches to available RAM.
- **GPU:** not required. CPU-only works; CUDA/Metal/Vulkan optionally speed things up.
- **Startup time:** OLMoE loads in <1s; GLM-5.2 takes ~30s to bring resident weights online.

**Installation:**

```bash
# Option A: prebuilt binary (recommended)
wget https://github.com/JustVugg/colibri/releases/latest/download/colibri-linux-x86_64.tar.gz
tar xzf colibri-*-linux-x86_64.tar.gz && cd colibri

# Option B: build from source
git clone https://github.com/JustVugg/colibri && cd colibri/c && ./setup.sh

# Download OLMoE (7GB), then:
COLI_MODEL=/path/to/olmoe ./coli serve --host 127.0.0.1 --port 8000
```

## 7. Docker Integration

```yaml
# docker-compose.yml
services:
  colibri:
    image: colibri:latest # or build from source
    volumes:
      - ./models/olmoe_i8:/models/olmoe:ro
      - ./colibri_kv:/kv
    environment:
      - COLI_MODEL=/models/olmoe
      - COLI_PORT=8000
    ports: ["8000:8000"]
    deploy:
      resources:
        reservations:
          memory: 12G

  indisnaut:
    build: .
    environment:
      - COLIBRI_BASE_URL=http://colibri:8000/v1
    ports: ["8080:8080"]
    depends_on: [colibri]
```

## 8. Limitations & Cautions

1. **Speed** — even OLMoE at 3–4 tok/s means a 100-token summary takes ~30s. Set user
   expectations; show progress indicators, don't block the request thread.
2. **Not a real-time tool** — Colibri is for batch NLP enrichment, not streaming/live trading
   decisions. Process news and reports offline, never in the hot path of a live strategy.
3. **Disk hunger at the top end** — GLM-5.2 needs 372GB. Start with OLMoE (7GB) and only
   provision more disk once a concrete need for frontier quality emerges.
4. **Quantization quality loss** — int4/int8 models trade some accuracy for footprint; OLMoE's
   quantization gap is measured around -8.2pp on benchmarks. Acceptable for
   classification/extraction, less so for nuanced report writing.
5. **No fine-tuning** — Colibri is inference-only. Adapting it to Indian financial data requires
   a separate training pipeline; Colibri cannot do this itself.
6. **Single request at a time** — `coli serve` processes one generation at a time by default. Use
   `--max-queue N` to allow concurrent requests from the ingestion pipeline.
7. **Slow prefill on CPU** — prompts over ~10k tokens can take minutes to prefill. Keep
   interactive prompts concise; truncate transcripts before sending.

## 9. Colibri vs. API-Based LLMs

| Aspect | Colibri (local OLMoE) | OpenAI API | Together AI / Groq |
|---|---|---|---|
| Cost | Free | $2–15/1M tokens | $0.50–2/1M tokens |
| Privacy | All data stays local | Data sent to OpenAI | Data sent to cloud |
| Speed | 3–4 tok/s | 50+ tok/s | 100+ tok/s |
| Internet needed | Only for model download | Always | Always |
| Setup complexity | One-time 7GB download + build | API key | API key |
| Model quality | Adequate for classification | Frontier (GPT-4o) | Frontier |
| Offline-capable | Yes | No | No |

**Recommendation:** use Colibri/OLMoE for standard NLP tasks (sentiment, classification,
extraction) where privacy matters and quality requirements are moderate. Fall back to an
API-based LLM for complex analysis reports where quality is paramount. Implement a configurable
NLP backend switch in IndisNaut (`NLP_BACKEND=colibri|openai|...`) so this trade-off is a config
choice, not a rewrite.

## 10. Integration with the Nautilus CustomData Pipeline

```python
# 1. Colibri processes news → returns sentiment
sentiment = colibri_sentiment("RELIANCE", "Reliance Q2 profit up 20%, beats estimates")

# 2. Package as a Nautilus CustomData payload
@dataclass
class NLPSentimentEvent:
    symbol: str
    source: str          # "moneycontrol_news"
    headline: str
    sentiment: str       # "bullish", "bearish", "neutral"
    confidence: float    # derived from Brio entropy
    impact_score: int    # -5 to +5
    ts_event: int         # unix nanos
    ts_init: int

event = NLPSentimentEvent(
    symbol="RELIANCE",
    source="moneycontrol_news",
    headline="Reliance Q2 profit up 20%",
    sentiment="bullish",
    confidence=0.92,
    impact_score=4,
    ts_event=time.time_ns(),
    ts_init=time.time_ns(),
)

# 3. Feed into Nautilus via on_data()
custom = CustomData(DataType("NLPSentimentEvent"), event)
engine.add_data([custom])
# Strategy receives: def on_data(self, data: CustomData) -> None: ...
```

This lets NLP-derived signals flow through the same event-driven bus as bars and ticks, so
strategies can condition on sentiment/regime events exactly like any other Nautilus data type —
no separate side-channel needed.

## 11. Quick-Start Guide for IndisNaut Developers

```bash
# 1. Install Colibri
git clone https://github.com/JustVugg/colibri
cd colibri/c && ./setup.sh

# 2. Download the OLMoE model (~7GB) from HuggingFace or convert from source

# 3. Start the Colibri server
COLI_MODEL=/models/olmoe ./coli serve --port 8000

# 4. Smoke-test from Python
python -c "
from openai import OpenAI
c = OpenAI(base_url='http://localhost:8000/v1', api_key='x')
r = c.chat.completions.create(model='olmoe',
    messages=[{'role':'user','content':'Classify: bullish, bearish, or neutral? Headline: NIFTY hits all-time high on FII buying'}],
    max_tokens=5, temperature=0)
print(r.choices[0].message.content)
"

# 5. Run IndisNaut with COLIBRI_BASE_URL=http://localhost:8000/v1
```
