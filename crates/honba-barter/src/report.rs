//! Serializable backtest report.
//!
//! # JSON schema
//!
//! Every metric that is undefined (no trades, zero variance, ...) is `null`.
//!
//! ```text
//! {
//!   "id": str,                          // backtest id ("backtest" or the sweep id)
//!   "config": { ...BacktestConfig },    // echo of the effective config
//!   "time_start_ms": int,               // first bar timestamp (including warm-up)
//!   "time_end_ms": int,                 // last bar timestamp
//!   "start_ms": int,                    // first non-warm-up bar timestamp
//!   "num_bars": int,                    // distinct bar timestamps replayed
//!   "warmup_bars": int,                 // of which warm-up (time_ms < config.start_ms)
//!   "bars_decided": int,                // timestamps the decider was called for
//!   "summary": {                        // portfolio level, computed by honba from the equity curve
//!     "initial_cash": float,
//!     "final_cash": float,
//!     "final_equity": float,
//!     "net_pnl": float,                 // final_equity - initial_cash (after costs)
//!     "total_return": float,            // net_pnl / initial_cash
//!     "cagr": float|null,               // annualised on a 365.25 day year
//!     "realised_pnl": float,            // sum of closed-quantity PnL, gross of costs
//!     "total_fees": float,              // == costs.total
//!     "costs": Costs,                   // totals per cost component
//!     "num_trades": int,                // fills
//!     "num_closing_trades": int,        // fills that closed (part of) a position
//!     "num_orders": int,
//!     "num_rejected": int,
//!     "max_drawdown": float,            // peak-to-trough fraction of equity, >= 0
//!     "sharpe": float|null,             // daily equity returns, annualised x sqrt(252)
//!     "sortino": float|null,            // as sharpe, downside deviation
//!     "calmar": float|null,             // cagr / max_drawdown
//!     "win_rate": float|null,           // winning / closing fills (realised_pnl > 0)
//!     "profit_factor": float|null       // gross realised profit / gross realised loss
//!   },
//!   "instruments": {                    // per symbol; metrics from barter's TearSheet (Annual(252))
//!     "<symbol>": {
//!       "pnl": float,                   // barter realised PnL of closed positions
//!       "pnl_return": float|null, "sharpe": float|null, "sortino": float|null,
//!       "calmar": float|null, "max_drawdown": float|null, "mean_drawdown": float|null,
//!       "win_rate": float|null, "profit_factor": float|null,
//!       "num_trades": int,
//!       "final_position": float
//!     }
//!   },
//!   "trades": [Fill],                   // every fill, in execution order
//!   "orders": [Order],                  // every accepted order with its final state
//!   "rejected": [ { "time_ms": int, "id": str|null, "symbol": str, "side": "buy"|"sell"|null,
//!                   "qty": float, "reason": str } ],
//!   "equity_curve": [[time_ms, equity], ...],  // one point per bar timestamp >= start_ms
//!   "final_positions": { "<symbol>": float },
//!   "positions": { "<symbol>": Position }      // final position details
//! }
//! Costs = {"brokerage","stt","exchange_fee","sebi_fee","stamp_duty","gst","dp","total"}: float
//! Fill  = {"time_ms","fill_id","order_id","symbol","side","qty","price","value",
//!          "fees" (== costs.total),"costs": Costs,"realised_pnl","product","tag","reason"}
//! Order / Position: see `OrderView` / `PositionView` in `honba_barter::model`.
//! ```

use crate::{
    book::Book,
    config::BacktestConfig,
    model::{ActionSide, CostBreakdown, FillReason, OrderView, PositionView, Product},
};
use barter::statistic::{summary::TradingSummary, time::Annual252};
use rust_decimal::{prelude::ToPrimitive, Decimal};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Complete result of one backtest. See the [module docs](self) for the JSON schema.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BacktestReport {
    pub id: String,
    pub config: BacktestConfig,
    pub time_start_ms: i64,
    pub time_end_ms: i64,
    pub start_ms: i64,
    pub num_bars: usize,
    pub warmup_bars: usize,
    pub bars_decided: usize,
    pub summary: SummaryMetrics,
    pub instruments: BTreeMap<String, InstrumentMetrics>,
    pub trades: Vec<TradeRecord>,
    pub orders: Vec<OrderView>,
    pub rejected: Vec<RejectedRecord>,
    pub equity_curve: Vec<(i64, f64)>,
    pub final_positions: BTreeMap<String, f64>,
    pub positions: BTreeMap<String, PositionView>,
}

impl BacktestReport {
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SummaryMetrics {
    pub initial_cash: f64,
    pub final_cash: f64,
    pub final_equity: f64,
    pub net_pnl: f64,
    pub total_return: f64,
    pub cagr: Option<f64>,
    pub realised_pnl: f64,
    pub total_fees: f64,
    pub costs: CostBreakdown,
    pub num_trades: usize,
    pub num_closing_trades: usize,
    pub num_orders: usize,
    pub num_rejected: usize,
    pub max_drawdown: f64,
    pub sharpe: Option<f64>,
    pub sortino: Option<f64>,
    pub calmar: Option<f64>,
    pub win_rate: Option<f64>,
    pub profit_factor: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InstrumentMetrics {
    pub pnl: f64,
    pub pnl_return: Option<f64>,
    pub sharpe: Option<f64>,
    pub sortino: Option<f64>,
    pub calmar: Option<f64>,
    pub max_drawdown: Option<f64>,
    pub mean_drawdown: Option<f64>,
    pub win_rate: Option<f64>,
    pub profit_factor: Option<f64>,
    pub num_trades: usize,
    pub final_position: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TradeRecord {
    pub time_ms: i64,
    pub fill_id: String,
    pub order_id: String,
    pub symbol: String,
    pub side: ActionSide,
    pub qty: f64,
    pub price: f64,
    pub value: f64,
    pub fees: f64,
    pub costs: CostBreakdown,
    pub realised_pnl: f64,
    pub product: Product,
    pub tag: Option<String>,
    pub reason: FillReason,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RejectedRecord {
    pub time_ms: i64,
    pub id: Option<String>,
    pub symbol: String,
    pub side: Option<ActionSide>,
    pub qty: f64,
    pub reason: String,
}

/// Convert a barter metric, mapping barter's `Decimal::MAX`/`MIN` "infinite" sentinels (and
/// non-finite values) to `None`.
fn metric(value: Decimal) -> Option<f64> {
    if value == Decimal::MAX || value == Decimal::MIN {
        return None;
    }
    value.to_f64().filter(|value| value.is_finite())
}

fn finite(value: f64) -> Option<f64> {
    value.is_finite().then_some(value)
}

fn f64_of(value: Decimal) -> f64 {
    value.to_f64().unwrap_or(f64::NAN)
}

const MS_PER_DAY: i64 = 86_400_000;
const TRADING_DAYS: f64 = 252.0;

/// Portfolio statistics derived from an equity curve.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct EquityStats {
    pub max_drawdown: f64,
    pub sharpe: Option<f64>,
    pub sortino: Option<f64>,
    pub cagr: Option<f64>,
}

pub(crate) fn equity_stats(
    curve: &[(i64, f64)],
    initial_cash: f64,
    risk_free_return: f64,
) -> EquityStats {
    // Max drawdown over every point, starting from the initial cash
    let mut peak = initial_cash;
    let mut max_drawdown: f64 = 0.0;
    for &(_, equity) in curve {
        peak = peak.max(equity);
        if peak > 0.0 {
            max_drawdown = max_drawdown.max((peak - equity) / peak);
        }
    }

    // Daily returns from the last equity point of each UTC day
    let mut daily: Vec<f64> = Vec::new();
    let mut last_day = None;
    for &(time_ms, equity) in curve {
        let day = time_ms.div_euclid(MS_PER_DAY);
        if last_day == Some(day) {
            *daily.last_mut().expect("non-empty when last_day is set") = equity;
        } else {
            daily.push(equity);
            last_day = Some(day);
        }
    }
    let returns = daily
        .windows(2)
        .filter(|pair| pair[0] != 0.0)
        .map(|pair| pair[1] / pair[0] - 1.0)
        .collect::<Vec<_>>();

    let risk_free_daily = risk_free_return / TRADING_DAYS;
    let (sharpe, sortino) = if returns.len() >= 2 {
        let n = returns.len() as f64;
        let mean = returns.iter().sum::<f64>() / n;
        let variance = returns.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (n - 1.0);
        let downside = (returns
            .iter()
            .map(|r| (r - risk_free_daily).min(0.0).powi(2))
            .sum::<f64>()
            / n)
            .sqrt();
        let excess = mean - risk_free_daily;
        let annualise = TRADING_DAYS.sqrt();
        (
            (variance > 0.0).then(|| excess / variance.sqrt() * annualise),
            (downside > 0.0).then(|| excess / downside * annualise),
        )
    } else {
        (None, None)
    };

    let cagr = match (curve.first(), curve.last()) {
        (Some(&(start, _)), Some(&(end, final_equity)))
            if end > start && initial_cash > 0.0 && final_equity > 0.0 =>
        {
            let years = (end - start) as f64 / (MS_PER_DAY as f64 * 365.25);
            finite((final_equity / initial_cash).powf(1.0 / years) - 1.0)
        }
        _ => None,
    };

    EquityStats {
        max_drawdown,
        sharpe: sharpe.and_then(finite),
        sortino: sortino.and_then(finite),
        cagr,
    }
}

/// Inputs needed to assemble a [`BacktestReport`].
pub(crate) struct ReportInputs<'a> {
    pub id: String,
    pub config: &'a BacktestConfig,
    /// barter `InstrumentNameInternal` of each instrument (same order as the book symbols).
    pub names_internal: &'a [String],
    pub schedule: &'a [(i64, usize)],
    pub book: &'a Book,
    pub bars_decided: usize,
    pub trading_summary: &'a TradingSummary<Annual252>,
}

pub(crate) fn build_report(inputs: ReportInputs<'_>) -> BacktestReport {
    let ReportInputs {
        id,
        config,
        names_internal,
        schedule,
        book,
        bars_decided,
        trading_summary,
    } = inputs;
    let symbols = &book.config().symbols;

    let trades = book
        .fills
        .iter()
        .map(|fill| TradeRecord {
            time_ms: fill.time_ms,
            fill_id: fill.fill_id.clone(),
            order_id: fill.id.clone(),
            symbol: fill.symbol.clone(),
            side: fill.side,
            qty: fill.qty,
            price: fill.price,
            value: fill.value,
            fees: fill.costs.total,
            costs: fill.costs,
            realised_pnl: fill.realised_pnl,
            product: fill.product,
            tag: fill.tag.clone(),
            reason: fill.reason,
        })
        .collect::<Vec<_>>();

    let rejected = book
        .rejections
        .iter()
        .map(|rejection| RejectedRecord {
            time_ms: rejection.time_ms,
            id: rejection.id.clone(),
            symbol: rejection.symbol.clone(),
            side: rejection.side,
            qty: rejection.qty,
            reason: rejection.reason.clone(),
        })
        .collect::<Vec<_>>();

    let positions = symbols
        .iter()
        .enumerate()
        .map(|(index, symbol)| (symbol.clone(), book.position_view(index)))
        .collect::<BTreeMap<_, _>>();
    let final_positions = positions
        .iter()
        .map(|(symbol, position)| (symbol.clone(), position.qty))
        .collect::<BTreeMap<_, _>>();

    let instruments = symbols
        .iter()
        .zip(names_internal)
        .map(|(symbol, name_internal)| {
            let tear_sheet = trading_summary
                .instruments
                .iter()
                .find(|(name, _)| name.name().as_str() == name_internal)
                .map(|(_, tear_sheet)| tear_sheet);

            let metrics = InstrumentMetrics {
                pnl: tear_sheet.map(|t| f64_of(t.pnl)).unwrap_or_default(),
                pnl_return: tear_sheet.and_then(|t| metric(t.pnl_return.value)),
                sharpe: tear_sheet.and_then(|t| metric(t.sharpe_ratio.value)),
                sortino: tear_sheet.and_then(|t| metric(t.sortino_ratio.value)),
                calmar: tear_sheet.and_then(|t| metric(t.calmar_ratio.value)),
                max_drawdown: tear_sheet
                    .and_then(|t| t.pnl_drawdown_max.as_ref())
                    .and_then(|max| metric(max.0.value)),
                mean_drawdown: tear_sheet
                    .and_then(|t| t.pnl_drawdown_mean.as_ref())
                    .and_then(|mean| metric(mean.mean_drawdown)),
                win_rate: tear_sheet
                    .and_then(|t| t.win_rate.as_ref())
                    .and_then(|win_rate| metric(win_rate.value)),
                profit_factor: tear_sheet
                    .and_then(|t| t.profit_factor.as_ref())
                    .and_then(|profit_factor| metric(profit_factor.value)),
                num_trades: trades.iter().filter(|t| &t.symbol == symbol).count(),
                final_position: final_positions.get(symbol).copied().unwrap_or_default(),
            };
            (symbol.clone(), metrics)
        })
        .collect();

    // Portfolio summary
    let final_equity = book
        .equity_curve
        .last()
        .map(|(_, equity)| *equity)
        .unwrap_or(config.initial_cash);
    let net_pnl = final_equity - config.initial_cash;
    let stats = equity_stats(
        &book.equity_curve,
        config.initial_cash,
        config.risk_free_return,
    );

    let closing = trades
        .iter()
        .map(|trade| trade.realised_pnl)
        .filter(|pnl| *pnl != 0.0)
        .collect::<Vec<_>>();
    let gross_profit = closing.iter().filter(|pnl| **pnl > 0.0).sum::<f64>();
    let gross_loss = -closing.iter().filter(|pnl| **pnl < 0.0).sum::<f64>();
    let wins = closing.iter().filter(|pnl| **pnl > 0.0).count();

    let summary = SummaryMetrics {
        initial_cash: config.initial_cash,
        final_cash: book.cash,
        final_equity,
        net_pnl,
        total_return: if config.initial_cash != 0.0 {
            net_pnl / config.initial_cash
        } else {
            0.0
        },
        cagr: stats.cagr,
        realised_pnl: closing.iter().sum(),
        total_fees: book.costs.total,
        costs: book.costs,
        num_trades: trades.len(),
        num_closing_trades: closing.len(),
        num_orders: book.orders.len(),
        num_rejected: rejected.len(),
        max_drawdown: stats.max_drawdown,
        sharpe: stats.sharpe,
        sortino: stats.sortino,
        calmar: stats
            .cagr
            .filter(|_| stats.max_drawdown > 0.0)
            .map(|cagr| cagr / stats.max_drawdown),
        win_rate: (!closing.is_empty()).then(|| wins as f64 / closing.len() as f64),
        profit_factor: (gross_loss > 0.0).then(|| gross_profit / gross_loss),
    };

    let start_ms = config
        .start_ms
        .and_then(|start| schedule.iter().map(|(t, _)| *t).find(|t| *t >= start))
        .or_else(|| schedule.first().map(|(t, _)| *t))
        .unwrap_or_default();

    BacktestReport {
        id,
        config: config.clone(),
        time_start_ms: schedule.first().map(|(t, _)| *t).unwrap_or_default(),
        time_end_ms: schedule.last().map(|(t, _)| *t).unwrap_or_default(),
        start_ms,
        num_bars: schedule.len(),
        warmup_bars: schedule.iter().filter(|(t, _)| *t < start_ms).count(),
        bars_decided,
        summary,
        instruments,
        trades,
        orders: book.orders.iter().map(|order| order.view()).collect(),
        rejected,
        equity_curve: book.equity_curve.clone(),
        final_positions,
        positions,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equity_stats_drawdown_and_ratios() {
        let day = MS_PER_DAY;
        let curve = [(0, 100.0), (day, 110.0), (2 * day, 99.0), (3 * day, 120.0)];
        let stats = equity_stats(&curve, 100.0, 0.0);
        assert!((stats.max_drawdown - 0.1).abs() < 1e-12);
        assert!(stats.sharpe.is_some());
        assert!(stats.sortino.is_some());
        assert!(stats.cagr.unwrap() > 0.0);
    }

    #[test]
    fn equity_stats_flat_curve_has_no_ratios() {
        let stats = equity_stats(
            &[(0, 100.0), (MS_PER_DAY, 100.0), (2 * MS_PER_DAY, 100.0)],
            100.0,
            0.0,
        );
        assert_eq!(stats.max_drawdown, 0.0);
        assert_eq!(stats.sharpe, None);
        assert_eq!(stats.sortino, None);
    }
}
