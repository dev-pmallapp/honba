# Data Schema Reference

Copy-paste-ready reference for every data schema used across IndisNaut: native
Nautilus Trader types, custom `CustomData` classes for Indian fundamentals/news/
corporate-actions, option chain parsing, backtest config/result models, and the
PostgreSQL + Parquet storage schemas. All timestamps are UNIX nanoseconds UTC
(`ts_event` = source/venue time, `ts_init` = ingestion time), per Nautilus
convention (see `02-nautilus-core-mapping.md` §6).

## 1. Nautilus-Native Types (Quick Reference)

| Type | Key fields |
|---|---|
| `InstrumentId` | `"{SYMBOL}.{VENUE}"` — e.g. `RELIANCE.NSE`, `TCS.BSE`, `NIFTY24DECFUT.NSE`, `NIFTY2422618500CE.NSE` |
| `BarType` | `"{instrument_id}-{step}-{aggregation}-{price_type}-{source}"` — e.g. `RELIANCE.NSE-1-DAY-LAST-EXTERNAL` |
| `Bar` | `bar_type, open, high, low, close (Price), volume (Quantity), ts_event, ts_init` |
| `QuoteTick` | `instrument_id, bid_price, ask_price, bid_size, ask_size, ts_event, ts_init` |
| `TradeTick` | `instrument_id, price, size, aggressor_side, trade_id, ts_event, ts_init` |
| `Equity` | `instrument_id, raw_symbol, currency, price_precision, price_increment, lot_size, isin` |
| `FuturesContract` | `instrument_id, raw_symbol, underlying, activation_ns, expiration_ns, multiplier, lot_size` |
| `OptionContract` | `instrument_id, raw_symbol, strike_price, option_kind, expiration_ns, underlying, multiplier, lot_size` |

Full construction examples are in `02-nautilus-core-mapping.md` §2.

## 2. Custom Data Types — Indian Market Research

All custom types are plain `@dataclass`es wrapped in Nautilus `CustomData` and
registered via `register_custom_data_class` so they flow through the cache,
message bus, and `ParquetDataCatalog` like native market data.

```python
from nautilus_trader.model.data import register_custom_data_class

register_custom_data_class(ScreenerQuarterlyFundamentals)
register_custom_data_class(ScreenerAnnualFundamentals)
register_custom_data_class(MoneycontrolNewsItem)
register_custom_data_class(CorporateAction)
register_custom_data_class(DeliveryData)
register_custom_data_class(FIIDIIData)
```

| Type | Fields |
|---|---|
| **`ScreenerQuarterlyFundamentals`** | `symbol, period_end` ("2024-03-31")`, is_consolidated: bool`; P&L: `sales, expenses, operating_profit, opm_percent, other_income, interest, depreciation, profit_before_tax, tax_percent, net_profit, eps: float` (INR Cr); ratios: `roce_percent, debt_to_equity, debtor_days, working_capital_days: float \| None`; `ts_event, ts_init: int` |
| **`ScreenerAnnualFundamentals`** | `symbol, year_ending` ("2024-03")`, is_consolidated: bool`; P&L: `sales, net_profit, eps, dividend_payout_percent: float`; balance sheet: `equity_capital, reserves, total_borrowings, total_assets, fixed_assets: float`; cash flow: `cash_from_operations, cash_from_investing, cash_from_financing: float`; ratios: `roce_percent, roe_percent, pe_ratio, book_value: float \| None`; shareholding: `promoter_holding_percent, fii_holding_percent, dii_holding_percent, public_holding_percent: float \| None`; `ts_event, ts_init: int` |
| **`MoneycontrolNewsItem`** | `symbol: str` ("" = market-wide), `headline, url, timestamp` (ISO 8601), `category` (Earnings\|Management\|Results\|Market\|IPO), `source` (Moneycontrol\|PTI\|Reuters), `ts_event, ts_init: int` |
| **`CorporateAction`** | `symbol: str`, `action_type` (DIVIDEND\|BONUS\|SPLIT\|RIGHTS\|BUYBACK), `ex_date: str`, `record_date: str \| None`, `details: str` ("Bonus 1:1"), `ts_event, ts_init: int` |
| **`DeliveryData`** | `symbol, trade_date: str`, `traded_quantity, deliverable_quantity: int`, `delivery_percent: float`, `ts_event, ts_init: int` |
| **`FIIDIIData`** | `trade_date: str`, `fii_net_buy_sell, dii_net_buy_sell: float` (INR Cr, +ve = net buy), `category` (EQUITY\|DEBT\|HYBRID), `ts_event, ts_init: int` |

Subscribe/publish pattern (identical for all six types):

```python
data_type = DataType(ScreenerQuarterlyFundamentals, metadata={"symbol": "RELIANCE"})
self.subscribe_data(data_type)

def on_data(self, data: CustomData) -> None:
    if data.data_type.type is ScreenerQuarterlyFundamentals:
        fundamentals: ScreenerQuarterlyFundamentals = data.data
```

## 3. Option Chain Data

NSE's option-chain JSON is parsed per-strike into `OptionStrikeData`, then
split into two Nautilus `QuoteTick`s (CALL leg, PUT leg) plus an optional
`OptionGreeks` custom object when IV is present.

```python
@dataclass
class OptionStrikeData:
    underlying: str         # NIFTY | BANKNIFTY | TCS
    expiry_date: str         # "2024-12-26"
    strike_price: float
    call_oi: int; call_change_oi: int; call_volume: int
    call_iv: float; call_ltp: float; call_bid: float; call_ask: float
    put_oi: int; put_change_oi: int; put_volume: int
    put_iv: float; put_ltp: float; put_bid: float; put_ask: float
    ts_event: int

def to_quote_ticks(s: OptionStrikeData) -> tuple[QuoteTick, QuoteTick]:
    call_id = build_option_instrument_id(s.underlying, s.expiry_date, s.strike_price, "CE")
    put_id = build_option_instrument_id(s.underlying, s.expiry_date, s.strike_price, "PE")
    call_tick = QuoteTick(call_id, s.call_bid, s.call_ask, size, size, s.ts_event, ts_init)
    put_tick = QuoteTick(put_id, s.put_bid, s.put_ask, size, size, s.ts_event, ts_init)
    return call_tick, put_tick
```

## 4. Backtesting Config & Result Schemas

```python
class ResearchStrategyConfig(StrategyConfig):
    strategy_id: StrategyId
    instrument_ids: list[InstrumentId]
    bar_type: BarType
    capital_allocation_pct: float          # 0.0–1.0
    min_roce: float = 0.0
    min_quarterly_profit_growth: float = 0.0
    max_debt_to_equity: float = float("inf")
    stop_loss_pct: float = 0.05
    target_pct: float = 0.15
    max_holding_days: int = 90
    stt_bps: float = 10.0                   # transaction costs, bps
    brokerage_bps: float = 3.0
    exchange_fee_bps: float = 0.345
    stamp_duty_bps: float = 1.5
    gst_on_brokerage_pct: float = 18.0
```

`BacktestResult` fields: `strategy_id, start_date, end_date, total_return_pct,
cagr_pct, sharpe_ratio, sortino_ratio, max_drawdown_pct, max_drawdown_days,
win_rate, profit_factor, total_trades, avg_win_pct, avg_loss_pct, expectancy,
calmar_ratio, benchmark_return_pct` (vs NIFTY 50), `alpha_pct, beta,
monthly_returns: dict[str, float]` (`"2024-01": 3.2`), `equity_curve:
list[{date, equity}]`, `trades: list[{entry_date, exit_date, return_pct,
symbol}]`.

## 5. PostgreSQL — Instrument Master

```sql
CREATE TABLE instruments (
    isin VARCHAR(12) PRIMARY KEY,
    nse_symbol VARCHAR(15),
    bse_code VARCHAR(6),
    company_name VARCHAR(200) NOT NULL,
    sector VARCHAR(100),
    industry VARCHAR(100),
    listing_date DATE,
    face_value DECIMAL(10,2),
    is_fno BOOLEAN DEFAULT FALSE,
    nse_series VARCHAR(2),           -- EQ, BE, etc.
    bse_group VARCHAR(2),            -- A, B, M, T, Z
    market_cap_category VARCHAR(10), -- LARGE, MID, SMALL
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## 6. PostgreSQL — Research Data Tables

| Table | Contents |
|---|---|
| `fundamentals_screener` | Quarterly + annual fundamentals rows |
| `corporate_actions` | Dividends, bonuses, splits, rights, buybacks |
| `delivery_data` | Daily NSE delivery quantity/percentage per symbol |
| `fii_dii_activity` | Daily FII/DII net buy/sell by category |
| `news_items` | Moneycontrol news/sentiment articles |
| `bhavcopy_daily` | EOD OHLCV for all symbols (mirrored into Parquet) |

## 7. Parquet Catalog Layout

```
data/catalog/
├── instruments/
│   └── instruments.parquet
├── data/
│   ├── bars/
│   │   └── NSE/RELIANCE.NSE-1-DAY-LAST-EXTERNAL/year=2023/month=01/data.parquet
│   ├── quote_ticks/
│   │   └── NSE/NIFTY2422618500CE.NSE/...
│   └── custom/
│       ├── ScreenerQuarterlyFundamentals/
│       ├── MoneycontrolNewsItem/
│       └── DeliveryData/
```

Bars and quote ticks are partitioned by `venue/instrument_id/year/month`;
custom data is partitioned by type name, then by `symbol`/date as needed. This
mirrors Nautilus's `ParquetDataCatalog` expectations so backtests can load
price and alternative data together without a database round-trip.
