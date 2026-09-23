# Data Sources Reference — Indian Financial Data

This document is the comprehensive reference for every external Indian financial data source the
honba Data Ingestion Layer interfaces with: what data each source exposes, how to access it,
known constraints, and how to reconcile identifiers across sources. All adapters built against
this reference must live behind the isolation boundary described in
`01-architecture-overview.md` §7.

## 1. Screener.in

**Data available:** Quarterly Results (Sales, Expenses, Operating Profit, OPM%, Interest,
Depreciation, PBT, Tax%, Net Profit, EPS — ~13 trailing quarters), Annual P&L (10+ years), Balance
Sheet, Cash Flow, Ratios (Debtor Days, ROCE%, Working Capital Days), Shareholding Pattern, Key
Metrics (Market Cap, PE, Book Value, Dividend Yield), Peer Comparison, CAGR metrics (sales/profit
growth over 3/5/10-year windows).

**URL patterns:**
- Standalone: `/company/{SYMBOL}/`
- Consolidated: `/company/{SYMBOL}/consolidated/`
- Custom screens: `/screens/`

**Access method:** HTML scraping only — no official API. Pages are server-rendered HTML tables
(no heavy client-side JS required for data extraction). An "Export to Excel" button exists on
company pages and can be used as a fallback/validation path.

**Known scrapers:** `screener-scraper-pro` (NPM), `binary-ibex/screener-scraper` (Python).

**Expected JSON shape after scraping:**
```json
{
  "analysis": { "pros": [...], "cons": [...] },
  "quarters": { "timestamps": [...], "data": { "Sales": [...], "OPM %": [...], ... } },
  "profitLoss": { ... },
  "balanceSheet": { ... },
  "cashFlow": { ... },
  "ratios": { ... },
  "shareholding": { ... },
  "CAGRs": { "sales_3yr": ..., "profit_5yr": ..., ... }
}
```

**Rate limiting:** No formally documented limits. Treat as a shared-resource site — respectful
scraping (throttled, low-concurrency) is required to avoid IP blocks.

**Legal:** Underlying data sourced from C-MOTS Internet Technologies; site content is
© Mittal Analytics Private Ltd, 2009–2026. Scraping for internal research is common practice, but
redistribution or commercial resale of scraped data requires review.

## 2. Moneycontrol.com

**Data available:** Real-time quotes (BSE + NSE), News (All/Business/Earnings/Interviews/Research
Reports), Corporate Actions (Dividends, Bonus, Splits, Rights, Board Meetings, AGM/EGM),
Financials (Balance Sheet, P&L, Quarterly, Cash Flow, Ratios), Annual Reports, Broker Research
notes, Sector Classification, FII/DII Activity, F&O Data.

**URL patterns:**
- Stock page: `/india/stockpricequote/{sector}/{company}/{sc_id}`
- News: `/stocks/company_info/stock_news.php?sc_id={SC_ID}`
- Financials: `/financials/{company}/balance-sheetVI/{SC_ID}`
- Corporate actions: `/company-facts/{company}/dividends/{SC_ID}`

**Access method:** HTML scraping — no official public API. Pages carry heavy ad presence and
inline scripts, so parsers must be resilient to markup drift. A "PRO" paid subscription tier
exists for premium research reports and ad-free access.

**Sector classification:** Embedded directly in the URL path (e.g., `computerssoftware`), which
makes Moneycontrol the most convenient source for deriving a sector taxonomy without a separate
lookup call.

## 3. NSE India

**Bhavcopy (daily EOD price-volume):**
- Endpoint family: `/api/corporate-announcements?index=equities` and companion bhavcopy archive
  downloads.
- Columns: `SYMBOL, SERIES, OPEN, HIGH, LOW, CLOSE, LAST, PREVCLOSE, TOTTRDQTY, TOTTRDVAL,
  TIMESTAMP, TOTALTRADES, ISIN`
- Availability: historical archives from ~2010 onward.

**Option Chain API:**
- Index options: `/api/option-chain-indices?symbol=NIFTY`
- Stock options: `/api/option-chain-equities?symbol=TCS`
- Returns JSON with per-strike Open Interest, change in OI, volume, Implied Volatility, and LTP.
  Real-time during market hours.

**Delivery Data:** `/api/delivery-report?symbol={SYMBOL}&from={YYYY-MM-DD}&to={YYYY-MM-DD}` — JSON
response of delivered-vs-traded quantity.

**Other datasets:** Historical Index Data, India VIX History, FII/FPI/DII Activity, Corporate
Actions, Shareholding Pattern, 52-Week High/Low, Most Active Securities, Market Capitalization.

**Technical requirements:** A session cookie (`nseappid`) must be established (typically by first
hitting the site's homepage) before calling `/api/*` endpoints — direct API calls without this
cookie and proper `User-Agent`, `Accept`, and `Referer` headers return HTTP 403.

**Legal:** Bhavcopy/EOD archives are free for general use. Real-time/streaming data requires a
paid **NSE Data & Analytics** subscription. Rate limiting is actively enforced on `/api/*`
endpoints.

**Known Python libraries:** `nsetools`, `nsepy` (both community-maintained, subject to breakage
when NSE changes its API surface).

## 4. BSE India

**Bhavcopy:** ZIP download at `/download/BhavCopy/Equity/EQ{DDMMMYYYY}_CSV.ZIP`.
- Columns: `SC_CODE, SC_NAME, SC_GROUP, SC_TYPE, OPEN, HIGH, LOW, CLOSE, LAST, PREVCLOSE,
  NO_TRADES, NO_OF_SHRS, NET_TURNOV, TDCLOINDI`

**Key difference from NSE:** BSE identifies securities by a numeric 6-digit `SC_CODE` (e.g.,
`532540` for TCS) rather than NSE's alphabetic trading symbol. Any cross-exchange join must
translate between the two (see §6).

**Other data:** Corporate Actions, Delivery Data, 52-Week High/Low, Market Cap, Annual Reports
(PDF at `/bseplus/AnnualReport/{SC_CODE}/{SC_CODE}{MMYY}.pdf`).

**Anti-scraping posture:** Generally less aggressive than NSE — fewer cookie/header requirements
for bulk downloads, though the same respectful-scraping discipline still applies.

**Known library:** `bsepy`.

## 5. Data Source Selection Matrix

| Data Need | Best Source | Access Method | Frequency |
|---|---|---|---|
| Fundamentals (P&L, BS, CF, Ratios) | Screener.in | HTML scrape | Quarterly |
| EOD Price-Volume | NSE Bhavcopy | CSV download | Daily |
| Option Chain | NSE API | JSON (cookie auth) | Real-time/EOD |
| Corporate Actions | Moneycontrol / NSE | HTML scrape | As announced |
| Delivery Data | NSE API | JSON | Daily |
| News & Sentiment | Moneycontrol | HTML scrape | Continuous |
| Annual Reports | BSE (via Screener links) | PDF | Annual |
| Historical Indices | NSE Archives | CSV | Daily |
| FII/DII Activity | NSE Reports | CSV | Daily |
| Sector Classification | Moneycontrol | HTML scrape | Static |

## 6. Cross-Reference Strategy

Every instrument in honba's data model must be resolvable across three identifier spaces:

- **NSE Symbol** (alphabetic, e.g., `TCS`)
- **BSE Scrip Code** (numeric, e.g., `532540`)
- **ISIN** (e.g., `INE467B01029`) — the **universal key**, since it is issuer-assigned and
  exchange-agnostic.

**Resolution approach:**
1. Treat ISIN as the primary join key in the instrument master table.
2. Populate NSE Symbol ↔ ISIN and BSE Scrip Code ↔ ISIN mappings from each exchange's official
   **"Securities Available for Trading"** master file, published daily by both NSE and BSE. These
   files are the authoritative source for symbol/code changes, new listings, and delistings — do
   not derive mappings solely from bhavcopy files, which only list actively traded securities on a
   given day.
3. Refresh the instrument master daily (or on detection of a bhavcopy row with an unrecognized
   symbol/code) so corporate actions like symbol renames don't silently break joins.
4. Screener.in and Moneycontrol identifiers (URL-embedded `SYMBOL`/`sc_id`) are treated as
   secondary, source-specific aliases attached to the same ISIN-keyed instrument record.

## 7. Legal & Ethical Scraping Guidelines

- **Rate limiting:** Use exponential backoff on errors/429s and inject randomized jitter between
  requests (avoid fixed-interval polling patterns that look like abuse). Cap concurrency per host
  to a small, conservative number of in-flight requests.
- **User-Agent:** Identify with a realistic, stable browser-like `User-Agent` string; do not
  rotate identities to evade blocks — the goal is politeness, not circumvention.
- **Data freshness vs. server load:** For fundamentals (Screener.in), quarterly refresh is
  sufficient — do not poll more frequently than the underlying data changes. For EOD price data,
  a single post-market fetch per day is sufficient; intraday polling should be reserved for the
  NSE option chain/delivery APIs where real-time data is the explicit purpose.
- **Licensing:** Bhavcopy and archival NSE/BSE data are free for general/internal research use.
  **Commercial or production deployment**, real-time redistribution, or any use that competes with
  NSE Data & Analytics or Moneycontrol PRO offerings requires securing the appropriate **data
  license** from the respective exchange or vendor before going live.
</content>
