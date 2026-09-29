//! Serializable backtest report.
//!
//! # JSON schema
//!
//! Every metric that is undefined (no trades, zero variance, ...) is `null`.
//!
//! ```text
//! {
//!   "contract_version": int,            // crate::CONTRACT_VERSION
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
//!     "sharpe": float|null,             // daily (exchange date) equity returns,
//!                                       // annualised x sqrt(trading_days_per_year)
//!     "sortino": float|null,            // as sharpe, downside deviation
//!     "calmar": float|null,             // cagr / max_drawdown
//!     "num_round_trips": int,
//!     "win_rate": float|null,           // round trips with net_pnl > 0 / round trips
//!     "profit_factor": float|null,      // sum of winning / losing round-trip net_pnl
//!     "unsettled_cash": float           // CNC sale proceeds not settled at the end (T+1)
//!   },
//!   "instruments": {                    // per symbol; metrics from barter's TearSheet (Annual(trading_days_per_year))
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
//!   "round_trips": [ { "symbol", "side": "long"|"short", "product", "entry_time_ms",
//!                      "exit_time_ms", "qty", "entry_price", "exit_price", "gross_pnl",
//!                      "costs", "net_pnl", "return_pct" } ],   // closed trips only
//!   "final_positions": { "<symbol>": float },
//!   "positions": { "<symbol>": Position }      // final position details (qty_settled =
//!                                              // holdings, see settlement)
//! }
//! Costs = {"brokerage","stt","exchange_fee","sebi_fee","stamp_duty","gst","dp","total"}: float
//! Fill  = {"time_ms","fill_id","order_id","symbol","side","qty","price","value",
//!          "fees" (== costs.total),"costs": Costs,"realised_pnl","product","tag","reason",
//!          "slice" (only for freeze_policy split: "<order_id>#<n>")}
//! Order / Position: see `OrderView` / `PositionView` in `honba_barter::model`.
//! ```

use crate::{
    book::Book,
    config::BacktestConfig,
    model::{ActionSide, CostBreakdown, FillReason, OrderView, PositionView, Product},
};
use barter::statistic::{summary::TradingSummary, time::TimeInterval};
use chrono::TimeDelta;
use rust_decimal::{prelude::ToPrimitive, Decimal};
use serde::{Deserialize, Serialize};
use smol_str::SmolStr;
use std::collections::BTreeMap;

/// Complete result of one backtest. See the [module docs](self) for the JSON schema.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BacktestReport {
    pub contract_version: u32,
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
    pub round_trips: Vec<RoundTrip>,
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
    pub num_round_trips: usize,
    pub win_rate: Option<f64>,
    pub profit_factor: Option<f64>,
    /// CNC sale proceeds still unsettled at the end (T+1; part of `final_cash`).
    #[serde(default)]
    pub unsettled_cash: f64,
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
    /// Freeze-quantity slice id (`<order_id>#<n>`), only for split orders.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slice: Option<String>,
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

/// barter summary interval of `days` trading days (`trading_days_per_year`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TradingYear(pub u32);

impl TimeInterval for TradingYear {
    fn name(&self) -> SmolStr {
        SmolStr::new(format!("Annual({})", self.0))
    }

    fn interval(&self) -> TimeDelta {
        TimeDelta::days(i64::from(self.0))
    }
}

/// A closed position cycle: from flat (or a flip) back to flat (or the next flip).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RoundTrip {
    pub symbol: String,
    /// `long` or `short`.
    pub side: String,
    pub product: Product,
    pub entry_time_ms: i64,
    pub exit_time_ms: i64,
    /// Total quantity opened (= closed).
    pub qty: f64,
    pub entry_price: f64,
    pub exit_price: f64,
    /// Realised PnL before costs.
    pub gross_pnl: f64,
    /// Costs of the trip's fills (a flipping fill's costs are split pro rata by quantity).
    pub costs: f64,
    pub net_pnl: f64,
    /// `net_pnl / (qty x entry_price)`.
    pub return_pct: f64,
}

#[derive(Debug, Clone)]
struct OpenTrip {
    trip: RoundTrip,
    entry_value: f64,
    exit_value: f64,
}

/// Pair fills into round trips per symbol (partial exits accumulate; flips close one trip and
/// open the next). Trips still open at the end are not included.
pub fn round_trips(fills: &[crate::model::FillEvent]) -> Vec<RoundTrip> {
    let mut position: std::collections::HashMap<&str, (f64, Option<OpenTrip>)> =
        std::collections::HashMap::new();
    let mut done = Vec::new();
    let open = |fill: &crate::model::FillEvent, qty: f64, costs: f64| OpenTrip {
        trip: RoundTrip {
            symbol: fill.symbol.clone(),
            side: if fill.side == ActionSide::Buy {
                "long"
            } else {
                "short"
            }
            .into(),
            product: fill.product,
            entry_time_ms: fill.time_ms,
            exit_time_ms: fill.time_ms,
            qty,
            entry_price: fill.price,
            exit_price: 0.0,
            gross_pnl: 0.0,
            costs,
            net_pnl: 0.0,
            return_pct: 0.0,
        },
        entry_value: qty * fill.price,
        exit_value: 0.0,
    };
    let finish = |mut open: OpenTrip, time_ms: i64| {
        let trip = &mut open.trip;
        trip.exit_time_ms = time_ms;
        trip.entry_price = open.entry_value / trip.qty;
        trip.exit_price = open.exit_value / trip.qty;
        trip.net_pnl = trip.gross_pnl - trip.costs;
        trip.return_pct = if open.entry_value > 0.0 {
            trip.net_pnl / open.entry_value
        } else {
            0.0
        };
        open.trip
    };

    for fill in fills {
        let (qty, trip) = position.entry(fill.symbol.as_str()).or_insert((0.0, None));
        let delta = fill.side.sign() * fill.qty;
        let flat = qty.abs() <= 1e-9;
        if flat || qty.signum() == delta.signum() {
            match trip {
                Some(open) if !flat => {
                    open.trip.qty += fill.qty;
                    open.entry_value += fill.qty * fill.price;
                    open.trip.costs += fill.costs.total;
                }
                _ => *trip = Some(open(fill, fill.qty, fill.costs.total)),
            }
            *qty += delta;
            continue;
        }

        let closing = fill.qty.min(qty.abs());
        let share = closing / fill.qty;
        if let Some(open) = trip.as_mut() {
            open.exit_value += closing * fill.price;
            open.trip.gross_pnl += fill.realised_pnl;
            open.trip.costs += fill.costs.total * share;
        }
        *qty += delta;
        if qty.abs() <= 1e-9 * fill.qty.max(1.0) {
            *qty = 0.0;
            done.extend(trip.take().map(|open| finish(open, fill.time_ms)));
        } else if qty.signum() == delta.signum() {
            // Flipped: close the old trip, open the remainder as a new one
            done.extend(trip.take().map(|open| finish(open, fill.time_ms)));
            *trip = Some(open(
                fill,
                fill.qty - closing,
                fill.costs.total * (1.0 - share),
            ));
        }
    }
    done.sort_by_key(|trip| trip.exit_time_ms);
    done
}

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
    trading_days: f64,
    utc_offset_ms: i64,
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
        // Exchange-local trading date
        let day = (time_ms + utc_offset_ms).div_euclid(MS_PER_DAY);
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

    let risk_free_daily = risk_free_return / trading_days;
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
        let annualise = trading_days.sqrt();
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
    pub trading_summary: &'a TradingSummary<TradingYear>,
    pub utc_offset_ms: i64,
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
        utc_offset_ms,
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
            slice: fill.slice.clone(),
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
        f64::from(config.trading_days_per_year),
        utc_offset_ms,
    );

    let closing = trades
        .iter()
        .map(|trade| trade.realised_pnl)
        .filter(|pnl| *pnl != 0.0)
        .collect::<Vec<_>>();
    // Win rate / profit factor over round trips, net of costs
    let round_trips = round_trips(&book.fills);
    let net = round_trips.iter().map(|t| t.net_pnl).collect::<Vec<_>>();
    let gross_profit = net.iter().filter(|pnl| **pnl > 0.0).sum::<f64>();
    let gross_loss = -net.iter().filter(|pnl| **pnl < 0.0).sum::<f64>();
    let wins = net.iter().filter(|pnl| **pnl > 0.0).count();

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
        num_round_trips: round_trips.len(),
        win_rate: (!net.is_empty()).then(|| wins as f64 / net.len() as f64),
        profit_factor: (gross_loss > 0.0).then(|| gross_profit / gross_loss),
        unsettled_cash: book.unsettled_cash(),
    };

    let start_ms = config
        .start_ms
        .and_then(|start| schedule.iter().map(|(t, _)| *t).find(|t| *t >= start))
        .or_else(|| schedule.first().map(|(t, _)| *t))
        .unwrap_or_default();

    BacktestReport {
        contract_version: crate::CONTRACT_VERSION,
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
        round_trips,
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
        let stats = equity_stats(&curve, 100.0, 0.0, 250.0, 0);
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
            250.0,
            0,
        );
        assert_eq!(stats.max_drawdown, 0.0);
        assert_eq!(stats.sharpe, None);
        assert_eq!(stats.sortino, None);
    }
}
