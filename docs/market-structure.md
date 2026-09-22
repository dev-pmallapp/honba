# Indian Market Structure

This document defines the canonical market structure reference for the IndisNaut platform. It covers exchange session timings, asset class specifications, instrument identifiers, the trading calendar, and the regulatory framework that governs system behavior. All timestamps are **IST (UTC+5:30)** unless otherwise noted.

---

## 1. NSE Market Sessions

NSE trading occurs in five distinct sessions per day, plus a special annual session (Muhurat Trading). The engine must model each session as a distinct `MarketSession` state with its own order-acceptance and matching rules.

| Session | Time (IST) | Duration | Purpose | Order Behavior |
|---|---|---|---|---|
| **Block Deal Window** | 8:45 AM – 9:00 AM | 15 min | Large negotiated deals (min ₹10 crore or 5 lakh shares) at a single price | Orders matched at agreed price within ±1% of reference price |
| **Pre-Open: Order Entry** | 9:00 AM – 9:08 AM | 8 min | Order collection for price discovery | Orders can be entered, modified, cancelled; no matching |
| **Pre-Open: Order Matching** | 9:08 AM – 9:12 AM | 4 min | Equilibrium price computation & matching | No new orders, modifications, or cancellations allowed |
| **Pre-Open: Buffer** | 9:12 AM – 9:15 AM | 3 min | Transition buffer to regular session | No activity; system reconciliation |
| **Regular Trading (Normal Market)** | 9:15 AM – 3:30 PM | 6h 15min | Continuous double-auction trading | Full order book matching (limit, market, SL, SL-M) |
| **Post-Closing Session** | 3:30 PM – 4:00 PM | 30 min | Trade at closing price for late participants | Orders matched at the day's closing price (VWAP of last 30 min) |
| **Auction Session** | 3:35 PM – 4:30 PM | ~55 min | Settlement of shortfalls (circuit-breaker/undelivered auctions) | Special auction-only order book, exchange-initiated |

### Muhurat Trading (Special Session)

A symbolic ~1-hour evening session held on **Diwali (Laxmi Puja)**, considered auspicious for initiating new positions. Dates are announced annually by NSE/BSE (typically late Oct/early-mid Nov).

| Attribute | Detail |
|---|---|
| Timing | ~6:00 PM – 7:15 PM IST (exact window varies by year, published ~2 weeks ahead) |
| Segments active | Equity Cash, F&O, Currency, Commodity (all segments simultaneously) |
| Settlement | Normal T+1 settlement applies; trades count as regular trading day |
| System handling | Model as a one-off `TradingCalendar` override entry with custom session times, not a recurring weekly session |

---

## 2. BSE Market Sessions

Per **SEBI's uniform market timing mandate**, BSE session structure and timings are **identical to NSE** — this uniformity exists specifically to prevent arbitrage windows between exchanges and to simplify cross-exchange order routing.

| Session | BSE Time (IST) | Matches NSE? |
|---|---|---|
| Block Deal Window | 8:45 AM – 9:00 AM | ✅ Identical |
| Pre-Open (Entry/Match/Buffer) | 9:00 AM – 9:15 AM | ✅ Identical |
| Regular Trading | 9:15 AM – 3:30 PM | ✅ Identical |
| Post-Closing | 3:30 PM – 4:00 PM | ✅ Identical |
| Auction Session | 3:35 PM – 4:30 PM | ✅ Identical |
| Muhurat Trading | Same evening window as NSE | ✅ Identical, coordinated jointly |

**Implementation note:** A single `IndiaEquitySessionCalendar` config can serve both venues. Differences between NSE and BSE are at the *instrument* level (listing status, liquidity, scrip codes) rather than the *session* level. Do not hardcode duplicate session logic per venue — parameterize venue only where symbology or settlement cycles diverge.

---

## 3. Asset Classes

### 3.1 Equities (Cash Segment)

| Attribute | NSE | BSE |
|---|---|---|
| Listed companies | ~2,671 | ~5,647 |
| Settlement cycle | T+1 (rolling) | T+1 (rolling) |
| Primary index | NIFTY 50 | SENSEX |
| Price bands (circuit filters) | 2% / 5% / 10% / 20% (stock-dependent, no band for indices in F&O-eligible large caps under dynamic price band regime) | Same tiered structure |

**Price band tiers** — applied per-stock based on category (liquid vs. illiquid, derivative-eligible vs. not):

| Band | Typical Applicability |
|---|---|
| 2% | Highly liquid, index-heavyweight stocks under enhanced surveillance |
| 5% | Most mid/small-cap stocks without derivatives |
| 10% | Stocks with moderate volatility history |
| 20% | Derivative-eligible large-caps and newly listed stocks (no tighter band applicable) |

**Order types supported:**

| Order Type | Description | Session Availability |
|---|---|---|
| **Limit** | Execute at specified price or better | Pre-open, Regular |
| **Market** | Execute immediately at best available price | Regular only (not allowed in pre-open matching) |
| **Stop-Loss (SL)** | Limit order triggered when trigger price is hit | Regular |
| **Stop-Loss Market (SL-M)** | Market order triggered when trigger price is hit | Regular |
| **AMO (After Market Order)** | Placed after 3:30 PM (or before 9:00 AM), queued for next pre-open/regular session | Post-close window / overnight |

### 3.2 Futures & Options (F&O)

> **SEBI 2024 Reform (effective Nov 2024):** Exchanges may offer only **ONE weekly expiry per exchange**, on an index of their choosing. NSE retained **Thursday** as its weekly expiry day. As a direct consequence, **BANKNIFTY weekly expiry was discontinued** — BANKNIFTY now trades **monthly contracts only**. This is a critical rule change for any historical backtest spanning pre/post Nov-2024; expiry calendars must be versioned by date.

#### Index Derivatives

| Index | Lot Size | Strike Interval | Expiry Cycle | Expiry Day |
|---|---|---|---|---|
| **NIFTY 50** | 25 | 50 pts (near-the-money), 100 pts (far strikes) | Weekly + Monthly | Thursday |
| **BANK NIFTY** | 15 | 100 pts | Monthly only (weekly discontinued Nov 2024) | Last Tuesday |
| **FINNIFTY** | 40 | 50 pts | Monthly only | Last Wednesday |
| **MIDCPNIFTY** | 50 | 100 pts | Monthly only | Last Monday |

- **Option style:** European (cash-settled, exercisable only at expiry) for all index options.
- **Expiry-day-falls-on-holiday rule:** expiry shifts to the **previous trading day**.

#### Stock Derivatives

| Attribute | Detail |
|---|---|
| Universe size | ~200+ stocks (SEBI-eligible list, revised quarterly based on liquidity/market-cap criteria) |
| Lot size sizing rule | Set so contract value ≈ ₹5–10 lakh per lot (revised periodically by exchange) |
| Strike intervals | Tiered by underlying price: 2.5 / 5 / 10 / 20 / 50 / 100 depending on stock price band |
| Option style | **American** (exercisable any time before expiry) — physically settled |
| Expiry cycle | Monthly only (last Thursday of the month, or previous trading day if holiday) |
| Settlement | Physical delivery of underlying shares on exercise/assignment (unlike cash-settled index options) |

**Data model implication:** Because stock options are American + physically settled while index options are European + cash-settled, the `OptionsInstrument` schema must carry an `exercise_style` and `settlement_type` field that drives different expiry-day P&L and margin logic in the backtester.

### 3.3 Commodities (MCX)

| Attribute | Detail |
|---|---|
| Trading Session 1 | 9:00 AM – 5:00 PM |
| Trading Session 2 | 5:00 PM – 11:30 PM (11:55 PM during US daylight saving time, to align with international markets) |

**Key contract specifications:**

| Commodity | Contract Size (Lot) | Tick Size / Price Quote | Notes |
|---|---|---|---|
| **Gold** | 1 kg | ₹1 per 10g | Also has Gold Mini (100g) and Gold Guinea (8g) variants |
| **Silver** | 30 kg | ₹1 per kg | Silver Mini (5kg) and Silver Micro (1kg) also traded |
| **Crude Oil** | 100 barrels | ₹1 per barrel | Cash-settled, tracks WTI-linked international benchmark |
| **Natural Gas** | 1,250 mmBtu | ₹0.10 per mmBtu | Cash-settled, high volatility around US EIA inventory reports |
| **Copper** | 1 MT (metric ton) | ₹0.05 per kg | Physically deliverable |
| **Zinc / Lead / Aluminium** | 5 MT (base metals, varies) | Exchange-specified | Physically deliverable |

**Indices:** MCX publishes **iCOMDEX** (composite and sector sub-indices: Bullion, Energy, Base Metal, Composite) as benchmark trackers — useful for constructing synthetic commodity-basket strategies.

### 3.4 Currency Derivatives

| Pair | Lot Size | Expiry |
|---|---|---|
| **USD/INR** | $1,000 | Last working day of the month |
| **EUR/INR** | €1,000 | Last working day of the month |
| **GBP/INR** | £1,000 | Last working day of the month |
| **JPY/INR** | ¥100,000 | Last working day of the month |

- Cash-settled in INR based on RBI reference rate.
- Available on both NSE and BSE (near-identical contract specs, standardized by SEBI/RBI).
- Weekly expiries exist for USD/INR on some exchanges — verify against current circular before hardcoding.

---

## 4. Key Market Identifiers

Robust cross-referencing between NSE, BSE, and global identifier systems is essential since the same underlying company trades under different symbols/codes on each venue.

### 4.1 ISIN (International Securities Identification Number)

**Format:** 12 characters total — `IN` + 9 alphanumeric characters + 1 check digit.

```
IN  E  002A01018
│   │  └────────── 9-character security identifier (company + issue code)
│   └───────────── Security type character
└───────────────── Country code (India)
```

| Security Type Char | Meaning |
|---|---|
| `E` | Equity |
| `9` | Debt / bonds (varies by issuer type) |
| `D` | Debt instrument (some classifications) |
| `Z` | Government securities |
| `Y` | Mutual fund units |

The final digit is a computed check digit (Luhn-style algorithm per ISO 6166) — use it to validate ISIN integrity on ingestion.

### 4.2 NSE Symbol

- Uppercase alphabetic ticker, no numeric suffixes for equity series (series like `EQ`, `BE` appended separately in market data feeds).
- Examples: `RELIANCE`, `TCS`, `HDFCBANK`, `INFY`, `ICICIBANK`, `SBIN`.

### 4.3 BSE Scrip Code

- 6-digit purely numeric code, stable for the life of the listing.
- Examples: `500325` (Reliance), `532540` (TCS).

### 4.4 Cross-Reference Mapping Table

**ISIN is the universal key** — it is the only identifier guaranteed unique and stable across both exchanges, corporate actions, and depositories (NSDL/CDSL). All internal instrument records should be keyed by ISIN, with NSE symbol and BSE code stored as venue-specific aliases.

| Company | NSE Symbol | BSE Code | ISIN |
|---|---|---|---|
| Reliance Industries | `RELIANCE` | 500325 | `INE002A01018` |
| Tata Consultancy Services | `TCS` | 532540 | `INE467B01029` |
| HDFC Bank | `HDFCBANK` | 500180 | `INE040A01034` |
| Infosys | `INFY` | 500209 | `INE009A01021` |
| ICICI Bank | `ICICIBANK` | 532174 | `INE090A01021` |
| State Bank of India | `SBIN` | 500112 | `INE062A01020` |

**Cross-referencing strategy for the ingestion pipeline:**
1. On symbol/scrip ingestion from any source (bhavcopy, screener.in, moneycontrol), resolve to ISIN first via a maintained `instrument_master` lookup table.
2. Use ISIN as the primary key (`instrument_id`) in the Nautilus `Instrument` model; store `nse_symbol` and `bse_code` as searchable secondary fields.
3. Refresh the instrument master periodically (weekly) since ISINs can be reissued on corporate actions (mergers, name changes) — NSE/BSE both publish daily "new listings/delisting" bulletins.

---

## 5. Trading Calendar

### 5.1 Weekly Off-Days

Markets are closed **Saturday and Sunday** across all segments (equity, F&O, commodity, currency).

### 5.2 Annual Trading Holidays (~15/year)

Exact dates are published annually by NSE/BSE (some are fixed-date, some lunar/festival-based and vary year to year). The engine's `TradingCalendar` must be loaded from an updatable holiday list, not hardcoded per year.

| Holiday | Type | Typical Date |
|---|---|---|
| Republic Day | Fixed | Jan 26 |
| Mahashivratri | Lunar (variable) | Feb/Mar |
| Holi | Lunar (variable) | Mar |
| Good Friday | Variable (Christian calendar) | Mar/Apr |
| Id-Ul-Fitr (Ramzan Id) | Lunar (variable) | Varies |
| Ram Navami | Lunar (variable) | Mar/Apr |
| Mahavir Jayanti | Lunar (variable) | Apr |
| Dr. Ambedkar Jayanti | Fixed | Apr 14 |
| Independence Day | Fixed | Aug 15 |
| Ganesh Chaturthi | Lunar (variable) | Aug/Sep |
| Muharram | Lunar (variable) | Varies |
| Gandhi Jayanti | Fixed | Oct 2 |
| Dussehra (Vijaya Dashami) | Lunar (variable) | Sep/Oct |
| Diwali (Laxmi Puja) | Lunar (variable) — **Muhurat Trading held this evening** | Oct/Nov |
| Diwali Balipratipada | Lunar (variable) | Day after Diwali |
| Guru Nanak Jayanti | Lunar (variable) | Nov |
| Christmas | Fixed | Dec 25 |

**Notes:**
- Not all holidays above apply every year (typically ~14-16 are gazetted annually; the exact list is published in a December circular for the following calendar year).
- Commodity (MCX) and currency segments sometimes have **different holiday calendars** than equity/F&O — MCX may remain open on some equity holidays for evening session trading. Model each segment's calendar independently.
- **Muhurat Trading is not a holiday** — it's an additional special session layered onto the Diwali holiday evening (see Section 1).

### 5.3 Calendar Implementation Guidance

```
TradingCalendar
├── segment: EQUITY | FNO | COMMODITY | CURRENCY
├── year: int
├── holidays: List[date]
├── special_sessions: List[SpecialSession]  # e.g., Muhurat Trading
└── session_overrides: Dict[date, MarketSession]  # muhurat timing override
```

Fetch/refresh this from NSE's published holiday circular (JSON/CSV) at the start of each calendar year; do not assume prior-year dates repeat.

---

## 6. Regulatory Framework

### 6.1 SEBI — Securities and Exchange Board of India

SEBI is the statutory regulator (established 1988, statutory powers via SEBI Act 1992) governing all Indian securities markets. Its mandate rests on **three pillars**:

| Pillar | Function |
|---|---|
| **Protect** | Safeguard interests of investors in securities |
| **Develop** | Promote development of the securities market |
| **Regulate** | Regulate the securities market and its intermediaries |

### 6.2 Algorithmic Trading Regulations

| Rule | Requirement |
|---|---|
| **Algo approval** | All algorithmic strategies must be registered/approved by the exchange (and broker) before deployment; each algo gets a unique ID tagged on every order |
| **Order-to-Trade Ratio (OTR)** | Maximum **50:1** ratio (orders placed : orders executed) for algo/co-lo order flow; breaching tiers triggers penalties and eventually trading suspension for the day |
| **Co-location (co-lo) rules** | Equal, latency-fair access to exchange co-location facilities; tick-by-tick data feeds must be offered on non-discriminatory terms to all co-lo subscribers |
| **Risk controls** | Mandatory pre-trade risk checks: price bands, quantity limits, self-trade prevention, kill-switch capability at broker/exchange level |
| **Tagging** | Every algo order must carry an exchange-assigned algo ID for audit trail purposes |

**System implication:** IndisNaut's execution/backtest layer should simulate OTR throttling and price-band rejections as first-class constraints, not just an afterthought — a strategy that would breach 50:1 in production should be flagged in backtest reports.

### 6.3 Data Usage Regulations

| Data Type | License Requirement | Cost |
|---|---|---|
| **Bhavcopy** (daily EOD price/volume file) | Free, publicly downloadable from NSE/BSE websites | Free |
| **Historical data (bulk, extended)** | May require data vendor subscription or exchange archives request | Varies |
| **Real-time market data (tick-by-tick, streaming)** | Requires a formal **Market Data License Agreement** with the exchange (or via an authorized data vendor/broker API) | Paid, tiered by usage (redistribution vs. internal use) |
| **Level 2/3 order book depth** | Enhanced data license, typically restricted to registered market participants | Paid, premium tier |

**Compliance implication for IndisNaut:** The scraping/ingestion pipeline (per README Step 2) should default to **bhavcopy + EOD sources** for historical backtesting (free, compliant) and clearly gate any **real-time streaming** feature behind a documented, licensed data provider integration (e.g., broker API with market data add-on) rather than direct exchange website scraping — real-time scraping of NSE/BSE live quotes outside a licensed API violates their terms of data usage.

### 6.4 Market Conduct Regulations

| Regulation | Scope | Key Provisions |
|---|---|---|
| **PIT** (Prohibition of Insider Trading) Regulations, 2015 | Trading based on unpublished price-sensitive information (UPSI) | Trading window closures around results/corporate actions; designated persons' disclosure obligations; structured digital database (SDD) for UPSI access logs |
| **PFUTP** (Prohibition of Fraudulent and Unfair Trade Practices) Regulations, 2003 | Market manipulation, fraud | Prohibits pump-and-dump, circular trading, spoofing/layering, front-running |
| **KYC / AML** | Client onboarding | Know-Your-Customer verification (PAN, Aadhaar-linked), Anti-Money-Laundering transaction monitoring per PMLA (Prevention of Money Laundering Act) |

**System implication:** Any research/alerting feature that flags "unusual volume/price activity ahead of corporate announcements" should be framed strictly as a **research/backtest signal**, not a live trading trigger, to stay clear of PFUTP/PIT surveillance-pattern overlap — document this boundary clearly in any user-facing feature built on top of this data.

---

## Summary Reference: Session Timing Quick-Lookup

| Time (IST) | NSE/BSE Equity | F&O | Commodity (MCX) | Currency |
|---|---|---|---|---|
| 8:45 – 9:00 | Block Deal Window | — | — | — |
| 9:00 – 9:15 | Pre-Open (entry/match/buffer) | — | — | — |
| 9:00 – 9:15 | — | Pre-open (index F&O only) | — | 9:00 start |
| 9:15 – 3:30 | Regular Trading | Regular Trading | 9:00 – 5:00 (Session 1) | Regular Trading |
| 3:30 – 4:00 | Post-Closing | — | — | — |
| 3:35 – 4:30 | Auction | — | — | — |
| 5:00 – 11:30/11:55 | — | — | Session 2 (Energy/global-linked) | — |

This table, along with Sections 1–2, should back the `MarketCalendar` and `SessionScheduler` components that drive when the backtesting/live engine accepts, matches, or rejects orders per venue and segment.
