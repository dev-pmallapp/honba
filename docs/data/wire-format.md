# Shared Wire Format (Rust · Python · TypeScript)

One schema, three generated bindings. `schema/honba.wire.schema.json` (JSON Schema 2020-12) is the
only hand-edited definition; `tools/wiregen.py` emits:

| Language | Output | Mechanism |
|---|---|---|
| Rust | `crates/honba-core/src/wire.rs` | serde structs/enums, `rust_decimal` for decimals |
| Python | `python/honba/wire.py` | pydantic v2 models, `StrEnum`, discriminated union |
| TypeScript | `web2/src/core/wire.ts` | interfaces, `as const` enum arrays, string decimals |

```
edit schema/honba.wire.schema.json  →  make wire  →  make wire-check   (CI: fails on stale output)
```

`schema/fixtures/*.json` are golden documents. Rust (`tests/wire_roundtrip.rs`), Python
(`tests/test_wire.py`) and TS (`web2/src/core/wire.check.ts`, type-level) all load the same files, so
the three bindings cannot drift apart silently.

## Conventions

- **Field names** `snake_case` everywhere (no per-language renaming).
- **Time** is epoch **milliseconds UTC** in `*_ms` integers. Nanoseconds don't fit a JS `number`
  (> 2^53); Nautilus `ts_event` ns values are divided down at the adapter boundary. This matches the
  Python SDK's `Bar.time_ms` (bar *open* time). Dates are `YYYYMMDD` integers (`trading_date`).
- **Numbers**: market data, sizing and analytics are JSON `number` (f64, like WonderTrader's
  `double`). **Ledger money** (`Costs`, `Fill`, `Position`, `Account`, initial capital) is `decimal`,
  a JSON *string*, so no binary-float drift and no JS precision loss. Adapters convert at the edge.
- **Optionals**: absent = unknown / not applicable. No `null`. Rust `skip_serializing_if`, Python
  `dumps()` uses `exclude_none`, TS `?:`.
- **Enums** are lowercase snake_case strings (`partially_filled`), except `Product`
  (`CNC/MIS/NRML/MTF`, Indian broker codes) and `Timeframe` (`1m`, `1d`, `1M`).
  Never serialise WonderTrader's char codes (`'B'`, `'0'`) or integer enums.
- **Unions** carry a `kind` tag (`MarketEvent`: `{"kind":"tick","tick":{…}}`).
- **Instrument ids** are `{CODE}.{VENUE}` (`RELIANCE.NSE`), the same string as Nautilus `InstrumentId`.
- **Evolution**: additive only within a major version (new optional fields / enum values). Readers
  ignore unknown fields (Python `extra="ignore"`; serde default). Bump `x-version` for breaking edits.

## Where each type comes from

| Wire type | WonderTrader (`src/Includes`) | QuantDinger (`migrations/init.sql`) | honba today |
|---|---|---|---|
| `Instrument`, `FeeSpec` | `WTSContractInfo`, `WTSCommodityInfo` (tick/lot/multiplier/margin/fees, session) | `market_symbols_master` | `Instrument` enum, `Instrument.price_band_pct` |
| `Bar` | `WTSBarStruct` (`hold`→`open_interest`, `money`→`turnover`) | K-line dict | `strategy.types.Bar` |
| `Tick`, `DepthLevel` | `WTSTickStruct` (10-level arrays → lists) | – | `MarketEvent::Tick` |
| `OrderRequest`, `Order` | `WTSEntrust`, `WTSOrderInfo` | `pending_orders`, `qd_strategy_virtual_orders` | `OrderEvent`, `strategy.types.Order` |
| `Fill`, `Costs` | `WTSTradeInfo` | `qd_strategy_trades` | `FillEvent`, `TradeCosts` |
| `Position` | `WTSPositionItem` (prev/avail qty, direction) | `qd_strategy_positions` | `Position` |
| `Account` | `WTSAccountInfo`, `WTSFundStruct` | `qd_strategy_virtual_accounts` | `PortfolioState` |
| `StrategyConfig`, `Signal` | CTA/SEL/HFT strategy defs | `qd_strategies_trading`, `qd_indicator_signal_alerts` | `Signal` |
| `BacktestRun`, `RoundTrip`, `Metrics`, `EquityPoint` | `WtBtCore` fund/trade logs | `qd_backtest_runs/_trades/_equity_points` | `research.result` |

Deliberately **not** adopted: WonderTrader's packed C structs (`#pragma pack`, fixed `char[]`
buffers, `WTSBarStructOld` compatibility shims) — great for shared-memory ticks, wrong for a
JSON/HTTP/Arrow boundary; and QuantDinger's user/billing/OAuth/exchange-credential tables, which
are product plumbing rather than market vocabulary.

## Not in scope / next steps

- Bulk columnar transport (Arrow/Parquet) for bar history: same field names, generated from the same
  schema later; JSON stays the interactive/API format.
- Wire types are **additive**: existing `honba_core::{event,position,types}` and
  `honba.strategy.types` are untouched. Migrate adapters (`From<wire::Fill> for FillEvent`,
  `to_wire()` on the SDK dataclasses, `web2/src/core/market-data.ts` consumers) incrementally.
- Naming differs slightly from Rust core (`qty` vs `quantity`); the adapters absorb that.
