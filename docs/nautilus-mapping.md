# Nautilus Trader Core Mapping for Indian Securities

This document is the technical reference for how NSE/BSE/MCX instruments, bars,
fundamental data, and option chains map onto Nautilus Trader's core object
model. It assumes familiarity with Nautilus's event-driven architecture
(message bus, cache, data/execution/risk engines) and its convention of
representing all timestamps as UNIX nanoseconds (`ts_event` = venue-reported
time, `ts_init` = time the object was created inside Nautilus).

## 1. Symbol + Venue Convention

Nautilus identifies every instrument with an `InstrumentId`, composed of a
`Symbol` and a `Venue`: `InstrumentId(Symbol, Venue)` renders as
`"SYMBOL.VENUE"`. For Indian markets we fix one venue code per exchange and
build symbols from each product's natural identifier.

| Exchange | Venue code | Example instrument | Rendered `InstrumentId` |
|---|---|---|---|
| NSE Cash | `NSE` | Reliance Industries equity | `RELIANCE.NSE` |
| BSE Cash | `BSE` | TCS equity | `TCS.BSE` |
| NSE F&O (index future) | `NSE` | NIFTY Dec-2024 future | `NIFTY24DECFUT.NSE` |
| NSE F&O (option) | `NSE` | NIFTY 24-Dec-2024, 18500 CE | `NIFTY2422618500CE.NSE` |
| MCX Commodity | `MCX` | Gold spot/futures reference | `GOLD.MCX` |
| Index (synthetic) | `NSE_IDX` | NIFTY 50 spot index | `NIFTY50.NSE_IDX` |

Symbol construction rules used throughout this project:

- **Equities**: NSE/BSE trading symbol as-is (`RELIANCE`, `TCS`, `INFY`).
- **Futures**: `{UNDERLYING}{YY}{MMM}FUT`, e.g. `NIFTY24DECFUT` for the
  December 2024 NIFTY future. Stock futures follow the same pattern:
  `RELIANCE24DECFUT`.
- **Options**: `{UNDERLYING}{YY}{DDD}{STRIKE}{CE|PE}` using NSE's contract
  identifier day-of-year encoding, e.g. `NIFTY2422618500CE` = NIFTY, 2024,
  expiry day-code `226`, strike `18500`, Call European. In practice we derive
  this string from the expiry date and strike rather than hand-encode it (see
  §5).
- **Indices**: Indices are not tradable instruments on NSE cash/F&O order
  books, so they get a distinct pseudo-venue `NSE_IDX` to avoid colliding with
  any real tradable symbol namespace.

```python
from nautilus_trader.model.identifiers import InstrumentId, Symbol, Venue

NSE = Venue("NSE")
BSE = Venue("BSE")
MCX = Venue("MCX")
NSE_IDX = Venue("NSE_IDX")

reliance = InstrumentId(Symbol("RELIANCE"), NSE)          # RELIANCE.NSE
tcs_bse = InstrumentId(Symbol("TCS"), BSE)                # TCS.BSE
nifty_fut = InstrumentId(Symbol("NIFTY24DECFUT"), NSE)    # NIFTY24DECFUT.NSE
nifty_opt = InstrumentId(Symbol("NIFTY2422618500CE"), NSE)  # NIFTY2422618500CE.NSE
nifty_idx = InstrumentId(Symbol("NIFTY50"), NSE_IDX)      # NIFTY50.NSE_IDX
```

## 2. Instrument Creation Tables

Each Indian asset class maps onto one of Nautilus's built-in instrument
classes. Prices are represented internally as fixed-precision integers
(`price_precision` decimal places), so `tick_size` must be expressed as a
`Price` at that precision.

### 2.1 NSE/BSE Equity → `Equity`

| Field | Value for RELIANCE.NSE | Notes |
|---|---|---|
| `instrument_id` | `RELIANCE.NSE` | Symbol + Venue |
| `raw_symbol` | `Symbol("RELIANCE")` | Exchange-native symbol |
| `currency` | `INR` | All NSE/BSE cash trades settle in INR |
| `price_precision` | `2` | Paise-level precision |
| `price_increment` | `Price(0.05, precision=2)` | NSE tick size for most liquid equities |
| `isin` | `"INE002A01018"` | ISIN, stored as `Equity.isin` |
| `lot_size` | `Quantity(1, precision=0)` | Cash equities trade in single-share lots |
| `maker_fee` / `taker_fee` | brokerage/exchange-specific | Set per broker config, not exchange-fixed |

```python
from nautilus_trader.model.instruments import Equity
from nautilus_trader.model.objects import Price, Quantity
from nautilus_trader.model.currencies import INR
from nautilus_trader.model.identifiers import InstrumentId, Symbol, Venue

reliance_equity = Equity(
    instrument_id=InstrumentId(Symbol("RELIANCE"), Venue("NSE")),
    raw_symbol=Symbol("RELIANCE"),
    currency=INR,
    price_precision=2,
    price_increment=Price.from_str("0.05"),
    lot_size=Quantity.from_int(1),
    isin="INE002A01018",
    ts_event=0,
    ts_init=0,
)
```

### 2.2 NIFTY / BANKNIFTY / Stock Futures → `FuturesContract`

| Field | NIFTY Dec-2024 future | Notes |
|---|---|---|
| `underlying` | `"NIFTY"` | Underlying index/stock symbol |
| `multiplier` | `Quantity(25)` (post-2021 rebase) or `Quantity(50)` (pre-2021) | Contract multiplier changed with NSE lot-size revisions |
| `lot_size` | `Quantity(25)` | Equal to multiplier for index futures |
| `activation_ns` | ts of contract listing | Typically listed ~3 months before expiry |
| `expiration_ns` | last Thursday of contract month, 15:30 IST, in ns | Computed via IST→UTC conversion, see §6 |
| `currency` | `INR` | |
| `price_precision` | `2` | |

```python
from nautilus_trader.model.instruments import FuturesContract
from nautilus_trader.model.enums import AssetClass

nifty_dec_fut = FuturesContract(
    instrument_id=InstrumentId(Symbol("NIFTY24DECFUT"), Venue("NSE")),
    raw_symbol=Symbol("NIFTY24DECFUT"),
    asset_class=AssetClass.INDEX,
    currency=INR,
    price_precision=2,
    price_increment=Price.from_str("0.05"),
    multiplier=Quantity.from_int(25),
    lot_size=Quantity.from_int(25),
    underlying="NIFTY",
    activation_ns=activation_ts_ns,
    expiration_ns=last_thursday_ist_to_utc_ns(2024, 12),
    ts_event=0,
    ts_init=0,
)
```

### 2.3 NIFTY / BANKNIFTY / Stock Options → `OptionContract`

| Field | NIFTY 18500 CE, Dec-2024 | Notes |
|---|---|---|
| `strike_price` | `Price(18500, precision=2)` | |
| `option_kind` | `OptionKind.CALL` (`CE`) or `OptionKind.PUT` (`PE`) | |
| `underlying` | `"NIFTY"` | |
| `multiplier` | `Quantity(25)` | Matches current NIFTY lot size |
| `expiration_ns` | Thursday 15:30 IST expiry in ns | Weekly (NIFTY) or monthly (stocks) |
| `currency` | `INR` | |

```python
from nautilus_trader.model.instruments import OptionContract
from nautilus_trader.model.enums import OptionKind

nifty_18500_ce = OptionContract(
    instrument_id=InstrumentId(Symbol("NIFTY2422618500CE"), Venue("NSE")),
    raw_symbol=Symbol("NIFTY2422618500CE"),
    asset_class=AssetClass.INDEX,
    currency=INR,
    price_precision=2,
    price_increment=Price.from_str("0.05"),
    strike_price=Price.from_str("18500.00"),
    option_kind=OptionKind.CALL,
    underlying="NIFTY",
    multiplier=Quantity.from_int(25),
    expiration_ns=thursday_ist_to_utc_ns(2024, 12, 26),
    ts_event=0,
    ts_init=0,
)
```

### 2.4 MCX Commodities → `Commodity` (spot reference)

| Field | MCX Gold | Notes |
|---|---|---|
| `lot_size` | `Quantity(1)` | 1 trading unit per lot |
| `trading_unit` | `"1 KG"` | MCX-defined contract unit, stored as a tag/metadata field |
| `price_precision` | `0` | MCX Gold quotes in whole rupees per 10g/kg depending on contract |
| `price_increment` | `Price(1, precision=0)` | Tick size of ₹1 |
| `currency` | `INR` | |

```python
from nautilus_trader.model.instruments import Commodity

mcx_gold = Commodity(
    instrument_id=InstrumentId(Symbol("GOLD"), Venue("MCX")),
    raw_symbol=Symbol("GOLD"),
    currency=INR,
    price_precision=0,
    price_increment=Price.from_str("1"),
    lot_size=Quantity.from_int(1),
    ts_event=0,
    ts_init=0,
)
```

### 2.5 Indices → `IndexInstrument`

| Field | NIFTY 50 | Notes |
|---|---|---|
| `instrument_id` | `NIFTY50.NSE_IDX` | Non-tradable pseudo-venue |
| `price_precision` | `2` | Index points to 2 decimals |
| `lot_size` | `Quantity(1)` | Indices are not traded directly; used for reference/spot pricing |

```python
from nautilus_trader.model.instruments import IndexInstrument

nifty50_index = IndexInstrument(
    instrument_id=InstrumentId(Symbol("NIFTY50"), Venue("NSE_IDX")),
    raw_symbol=Symbol("NIFTY50"),
    currency=INR,
    price_precision=2,
    price_increment=Price.from_str("0.05"),
    lot_size=Quantity.from_int(1),
    ts_event=0,
    ts_init=0,
)
```

## 3. BarType Specification for Indian Markets

A Nautilus `BarType` combines `InstrumentId + BarSpecification + AggregationSource`,
where `BarSpecification` is `step + BarAggregation + PriceType`. The
`AggregationSource` distinguishes bars aggregated internally by Nautilus
(`INTERNAL`) from bars received pre-aggregated from a venue/data vendor
(`EXTERNAL`).

| Timeframe | String form | Aggregation |
|---|---|---|
| 1-minute | `RELIANCE.NSE-1-MINUTE-LAST-INTERNAL` | `BarAggregation.MINUTE` |
| 5-minute | `RELIANCE.NSE-5-MINUTE-LAST-INTERNAL` | `BarAggregation.MINUTE` |
| 15-minute | `RELIANCE.NSE-15-MINUTE-LAST-INTERNAL` | `BarAggregation.MINUTE` |
| 1-hour | `RELIANCE.NSE-1-HOUR-LAST-INTERNAL` | `BarAggregation.HOUR` |
| 1-day | `RELIANCE.NSE-1-DAY-LAST-INTERNAL` | `BarAggregation.DAY` |

```python
from nautilus_trader.model.data import BarType

bar_1m = BarType.from_str("RELIANCE.NSE-1-MINUTE-LAST-INTERNAL")
bar_5m = BarType.from_str("RELIANCE.NSE-5-MINUTE-LAST-INTERNAL")
bar_15m = BarType.from_str("RELIANCE.NSE-15-MINUTE-LAST-INTERNAL")
bar_1h = BarType.from_str("RELIANCE.NSE-1-HOUR-LAST-INTERNAL")
bar_1d = BarType.from_str("RELIANCE.NSE-1-DAY-LAST-INTERNAL")
```

Use `EXTERNAL` instead of `INTERNAL` when subscribing to pre-built candles
from a data vendor (e.g. a broker's 1-minute candle feed), so Nautilus does
not re-aggregate them from ticks.

Non-time bars are useful for volume-driven Indian intraday strategies (NIFTY
futures, high-volume equities like RELIANCE/HDFCBANK):

```python
# Volume bars — one bar per 100,000 shares/contracts traded
volume_bar = BarType.from_str("RELIANCE.NSE-100000-VOLUME-LAST-INTERNAL")

# Dollar/value bars — one bar per ₹5 crore of notional turnover
value_bar = BarType.from_str("RELIANCE.NSE-50000000-VALUE-LAST-INTERNAL")
```

`PriceType` can be `LAST`, `BID`, `ASK`, or `MID`; Indian F&O order-book
strategies typically use `LAST` for trade-based bars and `MID` for
quote-based microstructure bars derived from L1 top-of-book data.

## 4. CustomData for Fundamental Metrics

Screener.in fundamentals, Moneycontrol news/corporate actions, and NSE
delivery data are not native Nautilus data types (`QuoteTick`, `TradeTick`,
`Bar`, `OrderBookDelta`). They are modeled as `CustomData` wrapping a
user-defined class registered via `DataType`, and delivered through the same
`ts_event`/`ts_init` timestamped, cacheable, subscribable pipeline as market
data.

```python
from nautilus_trader.core.data import Data
from nautilus_trader.model.data import DataType, CustomData

class ScreenerFundamental(Data):
    def __init__(self, instrument_id, revenue, net_profit, eps,
                 pe_ratio, roce, ts_event, ts_init):
        self.instrument_id = instrument_id
        self.revenue = revenue
        self.net_profit = net_profit
        self.eps = eps
        self.pe_ratio = pe_ratio
        self.roce = roce
        self._ts_event = ts_event
        self._ts_init = ts_init

    @property
    def ts_event(self) -> int:
        return self._ts_event

    @property
    def ts_init(self) -> int:
        return self._ts_init

fundamental_type = DataType(
    ScreenerFundamental,
    metadata={"instrument_id": "RELIANCE.NSE", "period": "Q2FY25"},
)

# Publish onto the message bus for subscribers/strategies to consume
custom_data = CustomData(data_type=fundamental_type, data=fundamental_instance)
self.msgbus.publish(topic=f"data.custom.{fundamental_type}", msg=custom_data)

# Subscribe from a Strategy
self.subscribe_data(fundamental_type)

def on_data(self, data: CustomData) -> None:
    if data.data_type.type is ScreenerFundamental:
        fundamental: ScreenerFundamental = data.data
        ...
```

The same pattern applies to `MoneycontrolNewsItem` (headline, sentiment,
corporate-action type: dividend/bonus/split) and `NSEDeliveryData` (delivery
quantity, delivery %, traded quantity), each as its own `Data` subclass keyed
by `instrument_id` in `DataType.metadata` so the cache and backtest data
loaders can filter/replay them alongside price data in timestamp order.

## 5. Option Chain Integration

Indian index options (NIFTY, BANKNIFTY, FINNIFTY) trade dozens of live
strikes across weekly/monthly expiries. Rather than hardcoding every
`OptionContract`, we group them under an `OptionSeriesId`
(`underlying + expiry`) and select strikes with a `StrikeRange` at
subscribe/backtest time.

```python
from dataclasses import dataclass
from enum import Enum

@dataclass(frozen=True)
class OptionSeriesId:
    underlying: str   # "NIFTY"
    expiry_ns: int     # Thursday 15:30 IST expiry, in UTC ns

class StrikeRangeMode(Enum):
    ATM_RELATIVE = "atm_relative"   # +/- N strikes around ATM
    ATM_PERCENT = "atm_percent"     # +/- X% of spot around ATM
    FIXED = "fixed"                 # explicit [min_strike, max_strike]

@dataclass(frozen=True)
class StrikeRange:
    mode: StrikeRangeMode
    atm_relative_count: int | None = None   # e.g. 10 -> ATM +/- 10 strikes
    atm_percent: float | None = None        # e.g. 0.05 -> ATM +/- 5%
    fixed_min: float | None = None
    fixed_max: float | None = None
```

```python
series = OptionSeriesId(underlying="NIFTY", expiry_ns=thursday_ist_to_utc_ns(2024, 12, 26))
strike_range = StrikeRange(mode=StrikeRangeMode.ATM_RELATIVE, atm_relative_count=10)

instrument_ids = resolve_option_chain(series, strike_range, spot_price=21500)
for instrument_id in instrument_ids:
    self.subscribe_quote_ticks(instrument_id)
    self.subscribe_trade_ticks(instrument_id)
```

For backtests requiring Greeks, compute and publish `OptionGreeks` as
`CustomData` per instrument/timestamp (delta, gamma, theta, vega, IV), driven
off the underlying's spot bar/tick stream and each option's own quote data,
so strategies can subscribe to `DataType(OptionGreeks, metadata={...})`
alongside the raw option quotes without modifying Nautilus's core pricing
engine.

## 6. Timezone Alignment

Nautilus stores all timestamps as UNIX nanoseconds in UTC. NSE/BSE session
times are defined in IST (`UTC+5:30`, no DST — India has observed a single
fixed offset year-round since 1945), so every venue-side timestamp must be
converted to UTC before entering the engine, and every UTC timestamp must be
converted back to IST for display/reporting.

| NSE session event | IST time | UTC time |
|---|---|---|
| Pre-open start | 09:00:00 | 03:30:00 |
| Pre-open end / order matching | 09:08:00 | 03:38:00 |
| Normal market open | 09:15:00 | 03:45:00 |
| Normal market close | 15:30:00 | 10:00:00 |

```python
from datetime import datetime
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

def ist_to_utc_ns(year, month, day, hour, minute, second=0) -> int:
    dt_ist = datetime(year, month, day, hour, minute, second, tzinfo=IST)
    return int(dt_ist.timestamp() * 1_000_000_000)

market_open_ns = ist_to_utc_ns(2024, 12, 26, 9, 15)   # 03:45:00 UTC
market_close_ns = ist_to_utc_ns(2024, 12, 26, 15, 30)  # 10:00:00 UTC
```

Because IST has no DST transitions, `Asia/Kolkata` conversions are
deterministic and cacheable across the full backtest date range — unlike
US/EU venues, no seasonal offset table is required.

For bar aggregation, Nautilus's internal aggregator buckets by wall-clock UTC
boundaries; to align 1-minute/5-minute/1-hour internal bars to NSE's
09:15 IST open rather than the UTC hour boundary, configure the aggregator's
time origin offset so bucket boundaries fall on `09:15:00 + n * interval`
IST:

```python
from nautilus_trader.config import DataEngineConfig

data_engine_config = DataEngineConfig(
    time_bars_origin_offset={
        "MINUTE": "3:45:00",  # aligns minute bars to 09:15 IST open
        "HOUR": "3:45:00",
    },
)
```

## 7. BacktestVenueConfig for Indian Markets

For NSE/BSE cash equity backtests, orders net against a single position per
instrument (no separate long/short buckets) and trades are cash-settled
(full premium debited/credited, no margin financing), so `OmsType.NETTING`
with `AccountType.CASH` is the correct combination. Order book depth is
typically only available at top-of-book (L1) resolution for retail-grade
historical data, so `BookType.L1_MBP` is the default.

```python
from nautilus_trader.config import BacktestVenueConfig
from nautilus_trader.model.enums import OmsType, AccountType, BookType
from nautilus_trader.model.objects import Money
from nautilus_trader.model.currencies import INR

nse_venue_config = BacktestVenueConfig(
    name="NSE",
    oms_type=OmsType.NETTING,
    account_type=AccountType.CASH,
    base_currency="INR",
    starting_balances=[Money(10_000_000, INR)],   # e.g. ₹1 crore starting capital
    book_type=BookType.L1_MBP,
)

bse_venue_config = BacktestVenueConfig(
    name="BSE",
    oms_type=OmsType.NETTING,
    account_type=AccountType.CASH,
    base_currency="INR",
    starting_balances=[Money(10_000_000, INR)],
    book_type=BookType.L1_MBP,
)
```

For NSE F&O (futures/options), use `AccountType.MARGIN` instead, since
positions require SPAN + exposure margin rather than full cash settlement:

```python
nse_fo_venue_config = BacktestVenueConfig(
    name="NSE",
    oms_type=OmsType.NETTING,
    account_type=AccountType.MARGIN,
    base_currency="INR",
    starting_balances=[Money(50_000_000, INR)],
    book_type=BookType.L1_MBP,
)
```

Multiple venue configs (`NSE`, `BSE`, `MCX`) can be attached to the same
`BacktestEngine`/`BacktestRunConfig`, allowing strategies to trade across
exchanges within a single backtest while each venue independently enforces
its own OMS/account/book semantics.
