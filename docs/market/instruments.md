# Multi-Asset Instrument Modeling

## 1. Equities (Cash Segment)
- **Product Types**:
  - **CNC (Cash and Carry)**: Delivery-based equity trading. Requires 100% upfront capital.
  - **MIS (Margin Intraday Square-off)**: Intraday positions with leverage, auto-liquidated before 15:25 IST.
- **Tick Size**: Standard ₹0.05 (₹0.01 for sub-₹250 securities on select venues).

---

## 2. Factor & Smart Beta Indices

### 2.1 NIFTY Alpha 50
- **Universe**: Top 300 companies by free-float market capitalization.
- **Selection**: 50 stocks with the highest 1-year Jensen's Alpha ($\alpha$) relative to NIFTY 50.
- **Weighting**: Alpha-score weighted, single-stock cap of 5%.
- **Rebalancing**: Quarterly (February, May, August, November).

### 2.2 NIFTY 200 Alpha 30
- **Universe**: NIFTY 200 universe.
- **Selection**: Top 30 stocks ranked by normalized 1-year alpha.
- **Rebalancing**: Semi-annual / quarterly rebalancing.

### 2.3 Factor Engine Requirements
1. **Survivorship-Bias-Free Historical Database**: Tracking historical additions and deletions.
2. **Rebalancing Friction & Turnover Cost Modeling**: Quantifying market impact and tax drag during quarterly rebalancing days.

---

## 3. Exchange Traded Funds (ETFs)
- **Target Assets**: NIFTYBEES, BANKBEES, GOLDBEES, SILVERBEES, and LIQUIDBEES.
- **LIQUIDBEES Modeling**: Daily fractional dividend reinvestment automatically credited to account balance.
- **Tracking Error & iNAV**: Modeling indicative NAV (iNAV) premiums and discounts against market price.

---

## 4. Mutual Funds
- **AMFI Integration**: Daily NAV tracking from the Association of Mutual Funds in India (AMFI).
- **Execution Rules**: Same-day NAV cut-off at 15:00 IST.
- **Friction Drag**: Total Expense Ratio ($TER$) and tiered exit-load schedules (e.g. 1% if redeemed within 1 year).

---

## 5. Corporate Bonds & Debt Securities
- **Analytics Engine**:
  - **Yield to Maturity (YTM)**: Computed via Newton-Raphson iterative solver.
  - **Duration & Convexity**: Macaulay duration, Modified duration, and price convexity.
  - **Clean vs. Dirty Price**: Modeling accrued interest under $30/360$ and $\text{Actual}/\text{Actual}$ conventions.
  - **Credit Rating Migration**: Historical tracking of AAA, AA, A, and default transitions.

---

## 6. Derivatives (F&O Segment)
- **Index Options**: European style (`CE` / `PE`) on NIFTY, BANKNIFTY, FINNIFTY with weekly/monthly expirations.
- **Stock Derivatives**: Stock options and futures with **mandatory physical delivery** at contract expiry for In-The-Money (ITM) positions.
- **Analytics**: Black-Scholes / Bjerksund-Stensland pricing, Option Greeks ($\Delta, \Gamma, \Theta, \mathcal{V}, \rho$), and Implied Volatility (IV) surface fitting.
