# Build honba, or just extend Nautilus with Jesse features?

**Status:** Decision record · **Date:** 2026-09-22 · **Assumes:** NautilusTrader **v2.x**
**Supersedes parts of** `unique-jesse.md`, `unique-nautilus.md`, `roadmap.md`

---

## TL;DR

The question as posed is a false dichotomy. "Extending Nautilus with Jesse
functionality" is not an alternative to honba — Nautilus has **no plugin
system**, so an extension is just a pip package that imports `nautilus_trader`
and subclasses its public API. That is already what honba's research layer is.
There is no third architecture hiding behind the question.

Under a v2 assumption, the findings are:

1. **v1 is not a refuge.** `develop_v1` receives **critical security backports
   only, for ~3 months after the v2 cutover**, and no feature or parity work. A
   project starting today builds on v2 or builds on an EOL branch. This
   *inverts* the usual "wait for GA" instinct.
2. **But v2 has no GA date, and every rc lands 20–40 breaking changes.**
   Biweekly cadence, rc5 shipped 2026-09-15, rc6 pending. Maintainers
   explicitly advise against rc in production.
3. **Therefore the single highest-value architectural decision is surface-area
   minimisation**, not engine choice: *the research layer speaks DataFrames, not
   Nautilus objects, and imports `nautilus_trader` in exactly one file.* This is
   worth more than every other item in this document combined.
4. **The Jesse port is ~15% of scope and half of it already ships in v2**
   (`create_tearsheet()`, ~34 statistics, closes-only bar delivery). Three ❌
   marks in `unique-jesse.md` are factually wrong.
5. **The Indian moat is ~5% of scope, not 40%** — and one part of it (a live
   broker adapter) just became a **Rust** project, because v2 deleted the Python
   networking API.
6. **The load-bearing question is still not "honba vs. Nautilus." It is "do we
   need options?"** v2's option support got *better* (native
   `subscribe_option_chain()`, `OptionChainSlice`, `StrikeRange`,
   `GreeksCalculator`), and Jesse still has none. That decides the engine.
7. **This is currently a planning project, not a building project.** 4,455 lines
   of design docs, 830 lines of code, and the most finished artifact in the
   repository is the kanji taxonomy. See [§7](#7-repo-audit-the-finding-nobody-wanted).

**Verdict: keep honba, build on v2 rc (pinned exactly), do not split the repo,
invert the roadmap, stay research-only, and cut six features permanently.** Six
weeks to a first research finding, not twenty-four.

---

## 1. Why the question is malformed

"Extend Nautilus" and "build honba" are the same activity at two levels of
ambition. The options that actually differ:

| # | Option | What it means | Verdict under v2 |
|---|---|---|---|
| A | Scripts + notebooks against Nautilus | No framework. ~600 lines in one `research/` dir. | **70% right.** See §3. |
| B | Fork Jesse, add Indian data | Deletes 45% of scope; dashboard, MCP, Optuna, MC, ML all inherited free (MIT). | **Wins iff we drop F&O.** See §4. |
| C | Fork/modify Nautilus core | LGPL permits it (fork just stays LGPL). | **Emphatically no** — rebasing a fork against 20–40 breaking changes per fortnight. |
| D | honba as currently specced | 24 weeks; UI at week 13, research at week 17. | **No** — sequencing inverted, scope ~3x reality. |
| E | **honba, re-scoped** | Data moat first, research library second, UI last-or-never, one adapter file. | **Recommended.** See §10. |

Note C was previously rejected on licensing grounds. That reasoning was wrong —
LGPL permits forking, it only requires the fork stay LGPL, which a solo dev does
not care about. The correct reason is rebase burden, and under v2 that reason
became roughly ten times stronger.

---

## 2. Verified facts (v2)

Checked against the `develop` branch, `MIGRATION_V2.md`, `ROADMAP.md`,
`RELEASES.md`, and the rc3–rc6 release notes.

### Release & support posture

| Fact | Consequence |
|---|---|
| v2.0.0rc5 released 2026-09-15; rc6 written but untagged. Cadence ~13 days | Building on a moving target. |
| **No stated GA date.** README: "we plan to implement a formal deprecation process" *once* 2.x stabilises — i.e. no deprecation guarantees yet | Cannot plan around a GA milestone. |
| **v1 EOL:** `develop_v1` gets "critical security backports for approximately three months after the v2 cutover. It does not receive new feature or parity work." | **"Stay on v1" is not a strategy.** Inverts the usual wait-for-GA advice. |
| Maintainers: "We do not recommend using release candidates in production environments, such as live trading controlling real capital." | Backtesting on rc: acceptable. Live on rc: no. Aligns with research-only scope. |
| Every rc carries ~20–40 breaking changes (rc3 Cython removal; rc4 config renames + leverage defaults; rc5 `ForwardPrice` + `calculate_from_orders` removal; rc6 catalog API + `OrderBookDepth10`→`OrderBookDepth`) | Budget a migration tax **per rc**, not per major. |
| `MIGRATION_V2.md` exists and is thorough | The tax is payable, not open-ended. |

### Architecture

| Fact | Consequence |
|---|---|
| Cython fully removed (rc3). Core is Rust; Python layer is PyO3 bindings + thin wrappers | No more `.pyx`. Python↔Rust boundary is now the whole API. |
| **Still Python-subclassable:** `Strategy`, `DataActor`, `ExecutionAlgorithm`, `Indicator`, `PortfolioStatistic`, custom `FillModel`, custom `FeeModel` | The extension points honba needs survive. **Critically, the SEBI cost model as a Python `FeeModel` is still viable.** |
| **Now Rust-only:** custom `MarginModel`, custom `LatencyModel`. All `Importable*ModelConfig` factories removed | Don't plan Python margin/latency models. |
| Renames: `Actor`→`DataActor`, `ExecAlgorithm`→`ExecutionAlgorithm`, `LiveExecClientConfig`→`ExecutionClientConfig`, `Actor.id`→`DataActor.actor_id` | Mechanical; `MIGRATION_V2.md` covers it. |
| `StrategyConfig` is now a PyO3 type, not a msgspec `Struct` | Config plumbing differs from every v1 tutorial online. |

### What still ships (and deflates the Jesse port)

| Fact | Consequence |
|---|---|
| `create_tearsheet()` + `[visualization]` extra present in v2 | **`unique-jesse.md` row 12 is wrong.** "Research dashboard — must build" is ~85% shipped. |
| ~34 `PortfolioStatistic` classes; `Portfolio.register_statistic()` **re-added in rc5** | Works — but it was *absent in earlier rcs and re-added*, and `calculate_from_orders` was **removed** in rc5. Treat as volatile; prefer computing metrics from DataFrames. |
| Bar aggregators emit on close, delivered at `ts_event` | **`unique-jesse.md` row 9 is wrong.** MTF look-ahead is already handled. Cost is a *test*, not a feature. |
| `BacktestEngine`, `reset()`, `clear_data()`, streaming, `add_data_batch` (new rc5) all present | Optuna trial loops remain cheap. Candle-perturbation MC remains expensive (new data per path). |
| Report generators present, but **signature changed** — now called on `BacktestNode` with the run-config ID | One-line change, inside the adapter file. |

### Options — the decisive capability

| Fact | Consequence |
|---|---|
| `OptionContract`, `OptionSpread`, `StrikeRange` (atm_relative / atm_percent / fixed / delta), `OptionGreeks`, `GreeksCalculator` all present in v2 | F&O is viable. |
| **New in v2:** `subscribe_option_chain()` / `on_option_chain()` / `OptionChainSlice` / `OptionSeriesId` | Better than v1 for NIFTY/BANKNIFTY chain work. |
| Removed: `OptionChainManager` (rc3), public `ForwardPrice` API (rc5 — chains now fetch reference prices internally) | Deliberate simplification, not regression. |
| Option expiry bugs actively fixed (rc5 same-timestamp index updates; rc6 cross-venue underlyings) | Actively maintained. Also: expect to *find* option bugs on rc. |

### Licensing & scope

| Fact | Consequence |
|---|---|
| v2 **still LGPL-3.0**; subclassing = "Application" under §0 | A separate honba package may carry any license. |
| `ROADMAP.md`: **"NautilusTrader is an open-core project."** | Explicit now. Watch for a future commercial plugin/hosted tier. |
| ROADMAP still declares out of scope: **UI dashboards, distributed orchestration, integrated hyper-parameter optimization, built-in AI/ML tooling** | Unchanged from v1. Permanent policy, not a gap awaiting release. |
| Jesse is **MIT** — dashboard, MCP server, Rust indicators included | Jesse's algorithms are legally portable. Under-exploited asset. |
| Zero GitHub repos combine `nautilus_trader` + `optuna` | Weakest fact in the set. Equally consistent with "nobody wants this" and "it's a 40-line snippet." **Not** proof of a gap. |

---

## 3. Steelman: "abandon honba, write notebooks"

The strongest argument in the room. Internalise rather than rebut.

> A solo researcher's bottleneck is not tooling. It is ideas that survive
> contact with Indian microstructure. Nautilus v2 already ships the engine, 34
> statistics, tearsheets, reports, and native option chains. `arch` ships
> `StationaryBootstrap`. `optuna` ships the optimizer. `sklearn` ships feature
> importance. Total remaining code for every capability in `unique-jesse.md` is
> **under 600 lines**, achievable in three weeks.
>
> Frameworks are *extracted* from repeated practice, not *designed* in advance.
> Zero backtests have been run on Indian data. Every abstraction in those 4,455
> lines of docs is therefore a guess made before contact with the data — and
> under v2's rc churn, every wrong guess is a guess you re-migrate every
> fortnight.

**Where it fails:** the Indian data layer is not a script. Corporate-action
adjustment, point-in-time index membership, and an option-chain archive are a
*maintained dataset with a schema and tests*. That needs a repo.

**Honest synthesis:** honba is a **data project with a thin research library
attached**, not a platform. Far smaller and far more shippable than the README
describes.

---

## 4. Steelman: "fork Jesse" — and the fact that kills it

> 15 of 17 features already exist, tested, MIT-licensed. Forking Jesse deletes
> the 15% Jesse-port and the 30% generic infra outright — 45% of scope on day
> one. The Indian data layer is engine-agnostic and costs the same either way.
> 24 weeks becomes ~8. **And you escape the v2 rc treadmill entirely.**
>
> Honestly: for daily-bar Indian equity research, do we need tick fidelity, L2
> books, multi-venue routing, or fixed-point arithmetic? No. We are paying
> Nautilus's full complexity tax — *plus* a biweekly migration tax — to run
> daily bars.

Under v2 this argument got *stronger*, because the migration tax is real and
recurring. It still fails on one fact:

> **Jesse has no options support. Not weak support — none.**

Indian retail quant activity is overwhelmingly NIFTY/BANKNIFTY F&O. Adding an
options instrument model, chain handling, Greeks, expiry mechanics, and margin
to Jesse means rewriting Jesse's core, alone, against upstream — while Nautilus
v2 *hands you* `subscribe_option_chain()`, `OptionChainSlice`, `StrikeRange`,
and `GreeksCalculator`. Secondary failures: Jesse's candle model is
1-minute-UTC-aligned and 24/7-crypto-native (structurally wrong for NSE
sessions, muhurat, expiry-day mechanics); its route model is single-symbol
centric and won't scale to a 200-stock portfolio; no corporate actions.

### → The actual load-bearing decision

**"Do we need options?"** — not "honba vs. extending Nautilus."

- **Yes** → Nautilus v2 is correct, honba holds, §10 applies.
- **No** (equities-only, daily/intraday) → **Steelman B wins.** Fork Jesse,
  delete 45% of scope, exit the rc treadmill.

Answer this in writing before building anything else. Everything downstream
depends on it.

---

## 5. The Indian "moat" is ~5% of scope, not 40%

Most of the ingestion layer is commoditized or buyable:

- `jugaad-data`, `nsepython`, `openchart` already do bhavcopy / delivery /
  option-chain fetching, free.
- Kite Connect historical API ≈ ₹2,000/month — official, no anti-bot fight,
  covers NSE/BSE/MCX. Dhan and Upstox comparable or free.
- Screener.in data is *derived* from BSE/NSE XBRL filings — go to source.

Genuinely unavailable and genuinely valuable:

| # | Asset | Effort | Why nobody gives it away |
|---|---|---|---|
| 1 | Corporate-action-adjusted price history (NIFTY 500, 10y) | ~1 week | Bhavcopy is unadjusted; clean factors are real work |
| 2 | Point-in-time index membership | ~3 days | Survivorship-bias killer |
| 3 | SEBI cost model (STT delivery/intraday/options-sell, GST, state stamp duty, impact) | ~3 days | Fiddly; frequently wrong in public libs. **Still a Python `FeeModel` in v2.** |
| 4 | **Historical option-chain snapshots** | ongoing, starts today | See §6a |

**~3 weeks, not 10 months.** The moat is real but small and specific — buildable
before month two.

### Scrapers are a recurring obligation, not a one-time build

NSE sits behind Akamai Bot Manager; the cookie-priming trick every
`nsepython`-style library uses breaks every few months. Screener.in is behind
Cloudflare and its ToS prohibits scraping (the "use the export button"
mitigation requires a logged-in account — that's a ToS violation, not a
mitigation). Steady state: 2–6 hrs/month **per scraper**, spiking to a lost
weekend on breakage — and when it breaks, **research is blocked**, because the
pipeline *is* the data. Five scrapers is a part-time job competing directly with
the actual work.

**Missing mitigation:** buy a broker historical API; treat scraping as optional
enrichment.

---

## 6. Risks absent from the current risk table

### 6a. Option-chain history — the only irrecoverable delay

The NSE option chain API returns **snapshots, not history**. There is no cheap
historical Indian option chain. The most differentiated capability — F&O
backtesting, spreads, condors, short strangles — depends on data that must be
**collected starting today** and won't be sufficient for a year.

Every other decision here can wait a month at zero cost. **This one cannot.**

Note this is *engine-independent*: collect to your own Parquet schema with plain
`httpx` + `pyarrow`. Do not let it touch Nautilus at all (§6d).

### 6b. Three silent correctness bugs that would invalidate a year of results

1. **Unadjusted prices** — every bonus/split is a −50% single-day return.
   Momentum strategies will "discover" it.
2. **Survivorship** — backtesting today's NIFTY 500 against 2015 data inflates
   every result.
3. **Point-in-time fundamentals — potentially fatal to README "Why #2."**
   Screener.in shows *current, restated* financials; there is no as-reported
   history. Backtesting "quarterly profit up >20%" against it is **look-ahead
   biased by construction** — restated numbers stamped with the period-end date
   rather than the filing date. Fix: stamp every fundamental `CustomData` event
   with the **BSE/NSE filing timestamp**; source from XBRL. Same discipline for
   corporate actions (announcement vs. ex-date) and index changes.

Note the irony: `unique-jesse.md` devotes a section to look-ahead prevention
(#9) for the one case Nautilus already handles, and says nothing about the three
that will actually bite.

### 6c. The rc treadmill — a recurring tax, not a one-time migration

This replaces the old "v1→v2 migration" risk. Under a v2 assumption the cost
doesn't arrive once; it arrives **every fortnight**, and its size is set by how
much Nautilus surface you touch:

| What you wrap | Cost per rc bump |
|---|---|
| `BacktestEngine.run()` → `generate_positions_report()` → DataFrame | minutes, one file |
| `PortfolioStatistic` subclasses | hours — and rc5 *removed* `calculate_from_orders` |
| `ParquetDataCatalog` as your storage format | **days** — rc6 changed `data_type` to a `NautilusDataType` enum and shipped `nautilus catalog migrate-parquet` |
| `Strategy` + order factory + `StrategyConfig` (the DSL, #5/#16) | **days, every fortnight, forever** |
| `Actor`/`Cache`/`DataEngine` internals | open-ended |

Two direct consequences:

- **Pin exactly.** `nautilus-trader==2.0.0rc5`, not `>=`. Bump deliberately,
  read `MIGRATION_V2.md`, re-run the golden backtest (§10, week 3). Floating
  ranges against an rc series with 20–40 breaking changes per release is how you
  lose a weekend to someone else's rename.
- **The strategy DSL is now the single worst item on the roadmap.** It wraps
  precisely the churning surface, and it was already cut for four independent
  reasons (§8).

### 6d. ParquetDataCatalog churn hits the data moat directly

The catalog API changed materially in rc6. honba's *entire defensible asset*
(§5) is data that would otherwise live in it. Do not couple them.

**Own your schema.** Write adjusted bars, chain snapshots, membership tables,
and fundamentals to **plain Parquet via `pyarrow`/`polars`**, with a documented
schema and tests. Treat `ParquetDataCatalog` as an **import step inside the
adapter file** — something you generate *into* for a backtest run, not something
you store your only copy in. The moat then survives any catalog rename, and it
survives abandoning Nautilus entirely.

### 6e. v2 deleted the Python networking API — a live broker adapter is now Rust

`MIGRATION_V2.md`: the generic Python APIs under `nautilus_trader.network` —
`HttpClient`, `WebSocketClient`, `SocketClient`, `SocketConfig`, `Quota`,
`http_*` — have **no v2 public Python equivalent**. Options are the retained
adapter HTTP clients, the Rust client bridges, or the Rust `nautilus-network`
crate.

Consequence: a **Zerodha Kite / Dhan live adapter is no longer a weekend of
Python.** It is a Rust project or a bridge-pattern project.

Mitigations, in order of preference:

1. **Stay research-only.** `architecture.md` already declares live NSE/BSE order
   routing out of scope — *keep it there*, and this risk evaporates. Historical
   ingestion needs no adapter: fetch with `httpx`, write Parquet, load for
   backtest.
2. If live is ever needed, that is the moment the `rust/` crate earns its
   existence — see §7, where it currently cannot be built at all.

### 6f. Optuna harness gotchas

- **Seed determinism.** If the fill/slippage RNG isn't seeded per trial, Optuna
  optimizes noise and nobody finds out. Run identical params twice, assert
  identical PnL, before trusting a single result. (rc4 changed backtest leverage
  defaults — re-baseline after every bump.)
- **Indicator state.** `reset()` clears orders/positions only. Strategy
  indicator buffers are yours — a leaked buffer is a silent look-ahead leak
  *between trials*.
- **Parallelism.** The engine is single-threaded; parallel trials mean N copies
  of the data resident. ROADMAP explicitly disowns distributed orchestration.
  Skip Ray; use `multiprocessing` capped by RAM.

### 6g. Solo-dev attrition

A 24-week plan whose payoff (an actual research finding) lands at week 18+ has a
motivation curve that kills most side projects around week 9 — precisely the
four-week scraper phase, the least rewarding work in the plan. "Will I still
care in month 4" belongs in the risk table above "SEBI regulatory changes."

---

## 7. Repo audit: the finding nobody wanted

| Observation | Verified |
|---|---|
| `honba/yosoku/retraining/scheduler.py.py` and `triggers.py.py` — double extensions | ✅ `ls` |
| `build-backend = "hatchling"` but `rust/` is a PyO3 crate with `[package.metadata.maturin]`. **Hatchling will not build it.** The crate is unreachable from Python; nobody has run `pip install -e .` | ✅ `pyproject.toml` / `Cargo.toml` |
| `pyproject.toml` and `Cargo.toml` both declare **LGPL-3.0-only** — the license freedom noted in §2 was already given away, and LGPL suppresses exactly the adoption "ecosystem value" depends on | ✅ |
| `nautilus-trader>=1.210`, no upper bound — under v2 this is not merely loose, it points at a **v1 line that is security-backport-only** | ✅ |
| `ehlers_fisher()` **is not the Ehlers Fisher Transform.** A stateless min-max rescale plus a log — missing the recursive `value1` smoothing (`0.33*x + 0.67*value1_prev`) and the `0.5*fisher_prev` feedback, i.e. both defining features | ✅ `rust/src/indicators.rs:13-28` |
| Its three unit tests assert only degenerate flat-window cases (`[1,1,1,1] → 0`). **Any** implementation passes them, including a stub returning `0.0` | ✅ `indicators.rs:70-86` |
| 20 kanji-named packages, 16 of them empty `__init__.py`, plus a 224-line naming-rationale document | ✅ |

**Totals: 4,455 lines of design documentation. 830 lines of code, of which the
~200 Rust lines cannot be compiled by the declared build backend.**

The most polished, most complete, most internally consistent artifact in this
repository is the naming taxonomy. **That ratio is the finding** — and it is an
argument for treating this document as the last planning artifact before code.

There is now a *second* reason to resolve the Rust situation: under v2, Rust is
the only path to a live broker adapter (§6e). So the crate should either be
properly wired with `maturin` and aimed at something real, or deleted. Right now
it is neither built nor deleted, and its one non-trivial function is wrong.

A corollary on naming: keep the kanji for the *product*, drop it from *import
paths*. `honba.kage` vs `honba.scrapers` costs a mental lookup on every read,
including future-you at 11pm. Collapse 20 packages to 5: `data`, `research`,
`strategies`, `api`, `cli`.

---

## 8. Jesse's 17 features: effort tiers against Nautilus v2

**XS** ≤1 day · **S** 2–4 days · **M** 1–2 weeks · **L** 3–4 weeks · **XL** ≥6 weeks

### Already covered — build nothing

| # | Feature | Tier | Note |
|---|---|---|---|
| 12 | 40+ metrics / dashboard | XS | `create_tearsheet()` + ~34 statistics ship in v2. Compute any extras from the reports DataFrame rather than `register_statistic` (volatile: absent in early rcs, re-added rc5, `calculate_from_orders` removed rc5). |
| 9 | MTF look-ahead prevention | XS | Aggregators emit on close. **Cost is a test, not a feature.** |
| 10 | Session-aware gaps | S | Aggregation + NSE calendar. Config, not machinery. |
| 17 | DEX / perps | — | Drop. |

### Trivial and genuinely valuable — build first

| # | Feature | Tier | Note |
|---|---|---|---|
| 1 | Rule significance testing | **S** | Highest value-per-line in the catalog. `arch.bootstrap.StationaryBootstrap` does the hard part. **Never touches Nautilus** — vectorized pandas over bars + signal timestamps. Therefore immune to rc churn. |
| 15 | 6-column CSV import | XS | Validator + wrangler. |
| 14 | Progressive validation philosophy | XS | CLI verb ordering + docs. A discipline, not code. |
| 4 | Feature importance | S | sklearn glue. Build 3 methods, not 6 — drop-column is N retrains for little marginal insight over purged CV. |
| 11 | Docker compose | S | Chore tier. An afternoon, at the end. |

### Medium — real work, architecturally sound

| # | Feature | Tier | Note |
|---|---|---|---|
| 13 | Optuna optimization | **M** | Harness ~200 lines, behind the adapter file. Hard part is *validity*: purged/embargoed walk-forward, seed determinism, and resisting the fact that you've built a better curve-fitting machine. Budget 3x the engineering estimate for the statistics. |
| 6 | Declarative routes | M | YAML over `add_strategy`/`add_instrument`. Defer until >3 strategies. |
| 7 | MCP server | M | `fastmcp` + ~300 lines. High ROI — but only once something exists worth driving. Week 10, not week 3. |

### Hard — where estimates blow up

| # | Feature | Tier | Note |
|---|---|---|---|
| 2a | MC: trade shuffle | XS to build, **but broken for our use case** | Shuffling assumes trades are exchangeable and non-overlapping. Jesse gets away with it because it's single-symbol crypto. With 50 concurrent Indian positions, "reordering trades" is not well-defined and the rebuilt curve is near-meaningless. Build it, restrict to single-instrument, document loudly. |
| 3 | End-to-end ML pipeline | **L** | `ml_features()` as single source of truth is right; *proving* it is the work. Offline you write `df.rolling(20).mean()`; online you write an incremental EMA in `on_bar`; they diverge silently. Needs a replay-equivalence test asserting offline == online bar-for-bar. Meta-labeling additionally needs purged k-fold + embargo + sample-uniqueness weights — `mlfinlab` territory. |
| 8 | 300 Rust indicators | **XL — don't** | Our own `ehlers_fisher` is already wrong (§7). That is the problem in miniature: porting indicators is a **correctness-verification problem with no reference oracle**. 300 of them is a year. Use `ta-lib`/`polars-talib` off-engine, Nautilus indicators in-engine, hand-write the 3 Ehlers ones actually used against published reference values. |
| 5+16 | Strategy DSL + smart orders | **L — kill it; now the worst item on the list** | (a) Jesse's `should_long()` is a *pull* model over a candle array; Nautilus is a *push* model over events — faking pull means handing users an array, reintroducing the exact look-ahead bug #9 exists to prevent. (b) `self.buy = qty, price` must reconcile with async SUBMITTED→ACCEPTED→FILLED, rejects, partials — the DSL either lies about order state or leaks the state machine anyway. (c) Declarative TP/SL maps to bracket/OCO, and NSE broker APIs frequently lack native OCO, so it breaks at the live boundary. (d) **It wraps `Strategy` + order factory + `StrategyConfig` — the exact surface churning every fortnight** (§6c). "6 lines vs 30 lines" is a vanity metric. |
| 2b | MC: candle perturbation | **XL — most under-estimated item in the project** | (i) Every path is new data — `reset()` doesn't help; full re-ingest ×1,000. (ii) A 200-stock portfolio must be perturbed **jointly** to preserve the cross-sectional correlation the strategy trades; Jesse's single-symbol block bootstrap does not generalize, and joint resampling is a research project. (iii) OHLC coherence must survive perturbation **and** Indian circuit limits (2/5/10/20% bands) — a Gaussian path breaching the band is a market state that cannot physically occur. (iv) For F&O the underlying must be perturbed *and a consistent chain re-derived*, or the options MC is noise. (v) Corporate actions inside the window. **Single-instrument only, or skip.** |

**Summary:** #1, #2a, #4, #12, #14, #15 total ~2 weeks and deliver most of
Jesse's actual research value. #13 is 2 weeks. **#5, #8, #2b are 3+ months and
should all be cut.**

---

## 9. The seam that actually matters

Not in any current doc, and under v2 it outweighs everything else here:

> **The research layer speaks DataFrames, not Nautilus objects, and imports
> `nautilus_trader` in exactly one file.**

Significance testing, trade-shuffle MC, the ML pipeline, and feature importance
all take *bars in, trade list out*. None need an event-driven engine. The
correct seam is a **documented DataFrame schema**, with a single
`_nautilus_adapter.py` that builds the run, calls it, and returns reports.

Under v1 this was good hygiene. Under v2 it is the **rc-churn firewall**: it
holds the cost of each fortnightly bump at minutes-in-one-file instead of
days-across-the-codebase. Combined with §6d (own your Parquet schema), it also
means the two assets that matter — the Indian dataset and the research library —
both survive Nautilus renames, a v3, or abandoning Nautilus entirely.

Concretely, exactly three files may import `nautilus_trader`:

- `honba/research/_nautilus_adapter.py` — build engine, run, return DataFrames
- `honba/data/_catalog_export.py` — own-schema Parquet → `ParquetDataCatalog`
- `honba/strategies/*.py` — actual `Strategy` subclasses

Enforce it with an `import-linter` contract in CI. Everything else is pandas.

### On splitting the repo

**Don't — not yet.** At 830 LOC, one developer, zero users, a split buys two
CIs, two release cadences, two versioning schemes, cross-repo refactor friction,
and a public API stability obligation — against a dependency that breaks every
fortnight. Instead: `honba/research/` with the import contract above. That is
95% of the benefit at 5% of the cost, and `git filter-repo` extracts it in an
afternoon if anyone ever asks.

If it is ever split: **relicense to Apache-2.0.** LGPL suppresses exactly the
adoption the "ecosystem value" argument depends on.

---

## 10. Recommended sequencing — 6 weeks to first finding

### Today, before anything else

- [ ] **Ship the NSE option-chain + delivery snapshot collector.** Cron,
      `httpx`, append to own-schema Parquet. ~150 lines, no Nautilus, no
      abstraction. The only irrecoverable delay in the project (§6a).
- [ ] **Pin `nautilus-trader==2.0.0rc5`** — exact, not a range (§6c). Record a
      policy: bump deliberately, read `MIGRATION_V2.md`, re-run the golden
      backtest, never float.
- [ ] Either wire `rust/` with `maturin` and aim it at the live-adapter problem
      (§6e), or `rm -rf rust/`. It is currently neither built nor deleted, and
      its one real function is wrong.
- [ ] Rename the two `.py.py` files. Collapse 20 kanji packages to 5.
- [ ] Answer **"do we need options?"** in writing (§4). Everything downstream
      depends on it.
- [ ] Confirm **research-only scope** in `architecture.md` — no live order
      routing. This is what neutralises §6e.

### Weeks 1–2 — build the actual moat

Bhavcopy ingest, corporate-action adjustment, NSE calendar, SEBI cost model
(Python `FeeModel` — still supported in v2), point-in-time index membership.
**Deliverable:** clean adjusted daily Parquet, NIFTY 500, 10 years, own schema,
with a membership table and tests. This is the part nobody else has, and §6d
keeps it independent of catalog churn.

### Week 3 — prove the kernel, and build the firewall

One Nautilus v2 backtest, one dumb strategy, real costs, `create_tearsheet()`.
Write `_nautilus_adapter.py` and `_catalog_export.py`; add the `import-linter`
contract. Save the run as a **golden backtest** — the regression test you re-run
after every rc bump. Five days here will teach more about whether v2 fits than
another 4,455 lines of docs.

### Weeks 4–5 — `honba/research/`, DataFrame in, DataFrame out

Significance test (`arch`), trade-shuffle MC (single-instrument, caveated),
Optuna harness with seed determinism + purged walk-forward. ~600 lines, zero
Nautilus imports.

### Week 6 — use it

Run ten hypotheses against Indian data. Write down what broke. **Then, and only
then**, revisit the UI, MCP, ML, live trading, and the repo split — with
evidence instead of guesses.

### Cut now, explicitly, in writing

Strategy DSL (#5/#16) · 300-indicator port (#8) · portfolio candle-perturbation
MC (#2b) · the HTMX dashboard · Airflow · Celery · Ray · live order routing.

---

## 11. Corrections owed to existing docs

| Doc | Claim | Correction |
|---|---|---|
| `pyproject.toml` | `nautilus-trader>=1.210`, unbounded | `==2.0.0rc5`. v1 is security-backports-only for ~3 months post-cutover. |
| `unique-jesse.md` row 12 | "Research dashboard — Nautilus ❌ — **Must build**" | v2 ships `create_tearsheet()` + ~34 statistics. Downgrade to **XS**. |
| `unique-jesse.md` row 9 | "MTF look-ahead — Nautilus ❌ (manual)" | Aggregators emit on close. Already handled. Downgrade to a **test**. |
| `unique-jesse.md` row 8 | "Nautilus ~20 Python indicators" | Undercounts; and porting 300 is XL with no reference oracle. Cut. |
| `unique-nautilus.md` | Describes the v1 Cython-core architecture | v2 removed Cython entirely; core is Rust + PyO3. `Actor`→`DataActor`, `ExecAlgorithm`→`ExecutionAlgorithm`. Custom margin/latency models are now Rust-only. |
| `nautilus-mapping.md` | v1 option-chain patterns | v2 removed `OptionChainManager` and public `ForwardPrice`; use `subscribe_option_chain()` / `OptionChainSlice` / `OptionSeriesId`. |
| `roadmap.md` | UI Phase 5 (w13–16), research Phase 6 (w17–18), MC/WFO Phase 7 (w19–21) | **Inverted.** Research first, UI last-or-never. |
| `architecture.md` | Indian data layer framed as the bulk of the work | ~5% is defensible moat; ~35% is buyable for ₹2,000/mo. Also: keep live routing out of scope — under v2 a Python broker adapter is no longer possible (§6e). |
| `ingestion-pipeline.md` | `ParquetDataCatalog` as primary storage | Own your schema; treat the catalog as an export target (§6d). rc6 changed its API. |
| `pyproject.toml` / `Cargo.toml` | `LGPL-3.0-only` | Reconsider Apache-2.0 if ecosystem adoption is a goal. |

**Re-verify every ❌ in `unique-jesse.md` and every claim in `unique-nautilus.md`
against the live v2 API before budgeting a single week off them.** Those 4,455
lines were written against an imagined v1.
