# AI Quant Agent: Model Context Protocol (MCP) Server

## 1. Native AI Agent Integration

Honba embeds a high-performance JSON-RPC Model Context Protocol (MCP) server, allowing AI coding assistants (such as Antigravity, Claude, or Cursor) to act as autonomous quantitative researchers.

---

## 2. Exposed MCP Tool Specifications

1. **`honba_fetch_data`**:
   - Downloads historical or intraday candles/ticks for NSE/BSE/MCX instruments via Dhan HQ.
2. **`honba_list_strategies`**:
   - Inspects existing strategy implementations, hyperparameters, and universes.
3. **`honba_run_backtest`**:
   - Executes backtests and returns Net PnL, Sharpe, Calmar, Max Drawdown, and Indian tax breakdown.
4. **`honba_audit_overfitting`**:
   - Runs the full anti-overfitting suite: CPCV, PBO, Deflated Sharpe Ratio (DSR), and Walk-Forward Efficiency.
5. **`honba_optimize_hyperparameters`**:
   - Performs Bayesian or Genetic hyperparameter search across designated ranges.
6. **`honba_generate_report`**:
   - Outputs interactive HTML/PDF tearsheets with equity curves and risk diagnostics.
