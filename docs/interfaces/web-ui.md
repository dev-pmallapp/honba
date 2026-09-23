# Web UI: TradingView Look & Feel Specification

## 1. Aesthetic Design System & Dark Palette

Honba's Web UI is built to mirror **TradingView's visual identity, typography, and interactive ergonomics**:

```
+---------------------------------------------------------------------------------------------------------+
| [Honba Logo] | [Symbol: NIFTY ALPHA 50 v] | [1m 5m 15m 1h 1D] | [Indicators] | [Run Backtest] | [AI Agent] |
+---+-------------------------------------------------------------------------------+---------------------+
| T |                                                                               |  WATCHLIST          |
| O |   +---------------------------------------------------------------------+     |  NIFTY 50    24,850 |
| O |   | TRADINGVIEW LIGHTWEIGHT CHARTS CANVAS                               |     |  NIFTY ALPHA  8,120 |
| L |   |                                                                     |     |  NIFTY200 A30 4,920 |
| B |   |   [Candlestick Series with EMA 9/21, Buy/Sell Signals]              |     |  NIFTYBEES     274  |
| A |   |                                                                     |     +---------------------+
| R |   +---------------------------------------------------------------------+     |  DHAN ORDER TICKET  |
|   |   | Volume Histogram / Drawdown Sub-pane                                |     |  [BUY]      [SELL]  |
|   |   +---------------------------------------------------------------------+     |  Qty: 25  Price: MKT|
+---+-------------------------------------------------------------------------------+---------------------+
| [Strategy Tester] | [Anti-Overfitting Audit] | [Trade Ledger] | [Strategy Code Editor] | [Engine Logs]  |
|---------------------------------------------------------------------------------------------------------|
| Net PnL: +₹3,42,500 (+28.4%) | Sharpe: 2.14 | DSR: 0.97 (PASS) | PBO: 0.11 (PASS) | Max DD: -7.2%       |
+---------------------------------------------------------------------------------------------------------+
```

### Color Tokens
```css
:root {
  --tv-bg-primary: #131722;          /* Main chart canvas background */
  --tv-bg-secondary: #1e222d;        /* Panels, sidebars, header, bottom tray */
  --tv-bg-tertiary: #2a2e39;         /* Dropdowns, cards, hovered states */
  --tv-bg-elevated: #363a45;         /* Active tab, button hover, modal surface */
  --tv-border-color: #2a2e39;        /* Gridlines, panel dividers */
  --tv-text-primary: #d1d4dc;        /* Main headings, candle values, prices */
  --tv-text-secondary: #787b86;      /* Axis labels, timestamps, metadata */
  --tv-accent-blue: #2962ff;         /* Primary buttons, links, selected items */
  --tv-bullish: #089981;             /* Up candles, positive PnL, buy signals */
  --tv-bearish: #f23645;             /* Down candles, negative PnL, sell signals */
}
```

---

## 2. Canvas Charting (TradingView Lightweight Charts)
- Renders 500,000+ ticks smoothly via HTML5 Canvas.
- Overlays: EMA curves, SuperTrend bands, Buy/Sell execution arrows (`▲`, `▼`), and position bracket stop-loss/take-profit zones.
- Bottom Strategy Tester & Anti-Overfitting Matrix with interactive CPCV fan charts and PBO risk gauges.
