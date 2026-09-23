# Terminal Command-Line Interface (CLI)

## 1. Fast Headless Workflow

For developers and automated CI/CD validation pipelines, Honba provides an interactive CLI:

```bash
# Run backtest with rich ASCII summary
honba backtest --strategy NiftyBreakout --symbol NIFTY50 --start 2023-01-01 --end 2024-01-01

# Execute anti-overfitting audit (CPCV + PBO + DSR)
honba audit --strategy NiftyBreakout --symbol NIFTY50 --splits 16 --test-splits 4

# Launch local TradingView Web UI & MCP server
honba ui --port 8000 --mcp
```

---

## 2. Interactive Terminal UI
- Rendered using Python's `rich` and `typer` (or Rust `clap`).
- Real-time backtest progress bars, ASCII drawdown curves, and formatted Indian tax tables.
