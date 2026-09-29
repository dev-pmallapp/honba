//! Bar-driven strategy adapter: turns a [`Decider`] into a barter strategy.

use crate::{
    data::{Bar, BarGate, CandleData},
    ledger::{Ledger, LedgerOrderFailure, LedgerTrade},
};
use barter::{
    engine::{
        state::{
            instrument::{data::InstrumentDataState, filter::InstrumentFilter},
            EngineState,
        },
        Engine,
    },
    strategy::{
        algo::AlgoStrategy,
        close_positions::{close_open_positions_with_market_orders, ClosePositionsStrategy},
        on_disconnect::OnDisconnectStrategy,
        on_trading_disabled::OnTradingDisabled,
    },
};
use barter_execution::order::{
    id::{ClientOrderId, StrategyId},
    request::{OrderRequestCancel, OrderRequestOpen, RequestOpen},
    OrderKey, OrderKind, TimeInForce,
};
use barter_instrument::{
    asset::AssetIndex,
    exchange::{ExchangeId, ExchangeIndex},
    instrument::InstrumentIndex,
};
use rust_decimal::{
    prelude::{FromPrimitive, ToPrimitive},
    Decimal,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap},
    fmt,
    sync::{Arc, Mutex, MutexGuard},
};

/// barter `EngineState` used by honba backtests.
pub type HonbaEngineState = EngineState<Ledger, CandleData>;

/// Order direction requested by a [`Decider`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActionSide {
    Buy,
    Sell,
}

impl From<ActionSide> for barter_instrument::Side {
    fn from(value: ActionSide) -> Self {
        match value {
            ActionSide::Buy => Self::Buy,
            ActionSide::Sell => Self::Sell,
        }
    }
}

/// Order type requested by an [`Action`].
///
/// Only `Market` is executed today (barter's mock exchange only fills market orders); other
/// kinds are accepted by the schema and rejected with reason `unsupported_order_kind`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrderType {
    #[default]
    Market,
    Limit,
    Stop,
    StopLimit,
}

/// An order request produced by a [`Decider`]: trade `qty` units of `symbol`.
///
/// Only `symbol`, `side` and `qty` are required; the optional fields keep the schema open for
/// limit/stop orders and brackets. Actions using features the engine doesn't execute yet are
/// rejected (never silently traded as market orders).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Action {
    pub symbol: String,
    pub side: ActionSide,
    pub qty: f64,
    #[serde(default)]
    pub kind: OrderType,
    /// Limit / stop price (unused for market orders).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub price: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_loss: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub take_profit: Option<f64>,
}

impl Action {
    /// Market order.
    pub fn new(symbol: impl Into<String>, side: ActionSide, qty: f64) -> Self {
        Self {
            symbol: symbol.into(),
            side,
            qty,
            kind: OrderType::Market,
            price: None,
            stop_loss: None,
            take_profit: None,
        }
    }

    pub fn buy(symbol: impl Into<String>, qty: f64) -> Self {
        Self::new(symbol, ActionSide::Buy, qty)
    }

    pub fn sell(symbol: impl Into<String>, qty: f64) -> Self {
        Self::new(symbol, ActionSide::Sell, qty)
    }
}

/// Snapshot handed to a [`Decider`] once every bar with timestamp `time_ms` has been processed.
#[derive(Debug, Clone)]
pub struct BarContext<'a> {
    /// Bar timestamp (epoch ms).
    pub time_ms: i64,
    /// Latest bar of every symbol that has received at least one bar (may be older than
    /// `time_ms` if a symbol has no bar at this timestamp).
    pub candles: BTreeMap<String, Bar>,
    /// Full bar history per symbol, oldest first, up to and including `time_ms`.
    pub history: BTreeMap<String, &'a [Bar]>,
    /// Signed position quantity per symbol (every configured symbol is present).
    pub positions: BTreeMap<String, f64>,
    /// Available cash in the quote currency.
    pub cash: f64,
    /// Cash plus positions marked at their latest close.
    pub equity: f64,
}

/// Error raised by a [`Decider`]; aborts the backtest.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
#[error("{0}")]
pub struct DeciderError(pub String);

/// Bar-by-bar trading logic.
///
/// Called once per distinct bar timestamp, after all bars at that timestamp have been
/// processed and all orders from the previous bar have been filled or rejected.
pub trait Decider: Send + Sync {
    fn on_bar(&self, ctx: &BarContext<'_>) -> Result<Vec<Action>, DeciderError>;
}

impl<F> Decider for F
where
    F: Fn(&BarContext<'_>) -> Result<Vec<Action>, DeciderError> + Send + Sync,
{
    fn on_bar(&self, ctx: &BarContext<'_>) -> Result<Vec<Action>, DeciderError> {
        self(ctx)
    }
}

/// An action that honba refused before it reached the exchange.
#[derive(Debug, Clone, PartialEq)]
pub struct Rejection {
    pub time_ms: i64,
    pub action: Action,
    pub reason: String,
}

/// Results of a run, synchronised out of the engine as it progresses (barter's
/// `backtest` only hands back the `TradingSummary`).
#[derive(Debug, Clone, Default)]
pub struct RunRecord {
    pub bars_decided: usize,
    pub trades: Vec<LedgerTrade>,
    pub order_failures: Vec<LedgerOrderFailure>,
    pub rejections: Vec<Rejection>,
    pub equity_curve: Vec<(i64, f64)>,
    pub cash: f64,
    pub fees_paid: f64,
    pub positions: HashMap<InstrumentIndex, f64>,
    pub error: Option<DeciderError>,
}

/// Static inputs a [`DeciderStrategy`] needs.
#[derive(Debug, Clone)]
pub struct DeciderStrategyConfig {
    /// Symbol of each instrument, indexed by `InstrumentIndex`.
    pub symbols: Vec<String>,
    /// `(timestamp ms, number of bars)` for every replayed time step.
    pub schedule: Vec<(i64, usize)>,
    /// Fee as a fraction of traded value (eg/ 0.0003 for 0.03%).
    pub fee_rate: f64,
    pub allow_short: bool,
}

#[derive(Debug, Default)]
struct Progress {
    next_bar: usize,
    awaiting_fills: bool,
    orders_sent: usize,
    order_sequence: u64,
    done: bool,
}

/// barter strategy delegating decisions to a [`Decider`] and sending them as market orders
/// priced at the latest close.
pub struct DeciderStrategy {
    pub id: StrategyId,
    decider: Arc<dyn Decider>,
    config: Arc<DeciderStrategyConfig>,
    symbol_index: HashMap<String, InstrumentIndex>,
    gate: Arc<BarGate>,
    progress: Mutex<Progress>,
    record: Arc<Mutex<RunRecord>>,
}

impl fmt::Debug for DeciderStrategy {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DeciderStrategy")
            .field("id", &self.id)
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl DeciderStrategy {
    pub fn new(
        decider: Arc<dyn Decider>,
        config: Arc<DeciderStrategyConfig>,
        gate: Arc<BarGate>,
    ) -> Self {
        let symbol_index = config
            .symbols
            .iter()
            .enumerate()
            .map(|(index, symbol)| (symbol.clone(), InstrumentIndex(index)))
            .collect();

        Self {
            id: StrategyId::new("honba"),
            decider,
            config,
            symbol_index,
            gate,
            progress: Mutex::new(Progress::default()),
            record: Arc::new(Mutex::new(RunRecord::default())),
        }
    }

    /// Shared handle to the results recorded during the run.
    pub fn record(&self) -> Arc<Mutex<RunRecord>> {
        Arc::clone(&self.record)
    }

    fn bar_complete(&self, state: &HonbaEngineState, bar: usize) -> bool {
        let Some(&(time_ms, expected)) = self.config.schedule.get(bar) else {
            return false;
        };
        let received = state
            .instruments
            .instruments(&InstrumentFilter::None)
            .filter(|instrument| instrument.data.last().is_some_and(|b| b.time_ms == time_ms))
            .count();
        received >= expected
    }

    fn context<'a>(&self, state: &'a HonbaEngineState, time_ms: i64) -> BarContext<'a> {
        let mut candles = BTreeMap::new();
        let mut history = BTreeMap::new();
        for instrument in state.instruments.instruments(&InstrumentFilter::None) {
            let symbol = &self.config.symbols[instrument.key.index()];
            if let Some(bar) = instrument.data.last() {
                candles.insert(symbol.clone(), *bar);
                history.insert(symbol.clone(), instrument.data.history.as_slice());
            }
        }

        let positions = self
            .config
            .symbols
            .iter()
            .enumerate()
            .map(|(index, symbol)| {
                let quantity = state.global.position(&InstrumentIndex(index));
                (symbol.clone(), quantity.to_f64().unwrap_or_default())
            })
            .collect();

        BarContext {
            time_ms,
            candles,
            history,
            positions,
            cash: state.global.cash.to_f64().unwrap_or_default(),
            equity: state.global.equity().to_f64().unwrap_or_default(),
        }
    }

    /// Validate the decider's actions against cash / position limits and build orders.
    fn build_orders(
        &self,
        state: &HonbaEngineState,
        time_ms: i64,
        ctx: &BarContext<'_>,
        actions: Vec<Action>,
        progress: &mut Progress,
        rejections: &mut Vec<Rejection>,
    ) -> Vec<OrderRequestOpen<ExchangeIndex, InstrumentIndex>> {
        let mut cash = ctx.cash;
        let mut positions = ctx.positions.clone();
        let mut orders = Vec::with_capacity(actions.len());

        for action in actions {
            let reject = |reason: &str| Rejection {
                time_ms,
                action: action.clone(),
                reason: reason.to_string(),
            };

            let Some(&instrument) = self.symbol_index.get(&action.symbol) else {
                rejections.push(reject("unknown_symbol"));
                continue;
            };
            if !action.qty.is_finite() || action.qty <= 0.0 {
                rejections.push(reject("invalid_qty"));
                continue;
            }
            if action.kind != OrderType::Market {
                rejections.push(reject("unsupported_order_kind"));
                continue;
            }
            if action.stop_loss.is_some() || action.take_profit.is_some() {
                rejections.push(reject("unsupported_bracket"));
                continue;
            }
            let instrument_state = state.instruments.instrument_index(&instrument);
            let (Some(price), Some(quantity)) = (
                instrument_state.data.price(),
                Decimal::from_f64(action.qty).map(|qty| qty.normalize()),
            ) else {
                rejections.push(reject("no_price"));
                continue;
            };
            let price_f64 = price.to_f64().unwrap_or_default();
            let value = price_f64 * action.qty;
            let position = positions.entry(action.symbol.clone()).or_default();

            match action.side {
                ActionSide::Buy => {
                    let required = value * (1.0 + self.config.fee_rate);
                    if required > cash * (1.0 + 1e-12) {
                        rejections.push(reject("insufficient_cash"));
                        continue;
                    }
                    cash -= required;
                    *position += action.qty;
                }
                ActionSide::Sell => {
                    if !self.config.allow_short && action.qty > *position * (1.0 + 1e-12) {
                        rejections.push(reject("insufficient_position"));
                        continue;
                    }
                    cash += value * (1.0 - self.config.fee_rate);
                    *position -= action.qty;
                }
            }

            progress.order_sequence += 1;
            orders.push(OrderRequestOpen {
                key: OrderKey {
                    exchange: instrument_state.instrument.exchange,
                    instrument,
                    strategy: self.id.clone(),
                    cid: ClientOrderId::new(progress.order_sequence.to_string()),
                },
                state: RequestOpen {
                    side: action.side.into(),
                    price,
                    quantity,
                    kind: OrderKind::Market,
                    time_in_force: TimeInForce::ImmediateOrCancel,
                },
            });
        }

        orders
    }

    fn sync_record(&self, state: &HonbaEngineState, record: &mut RunRecord) {
        let ledger = &state.global;
        record
            .trades
            .extend_from_slice(&ledger.trades[record.trades.len().min(ledger.trades.len())..]);
        record.order_failures.extend_from_slice(
            &ledger.order_failures[record.order_failures.len().min(ledger.order_failures.len())..],
        );

        // The last equity point may have been revised (fills at the same bar), so re-copy it
        let keep = record
            .equity_curve
            .len()
            .min(ledger.equity_curve.len())
            .saturating_sub(1);
        record.equity_curve.truncate(keep);
        record
            .equity_curve
            .extend_from_slice(&ledger.equity_curve[keep..]);

        record.cash = ledger.cash.to_f64().unwrap_or_default();
        record.fees_paid = ledger.fees_paid.to_f64().unwrap_or_default();
        record.positions = ledger
            .positions
            .iter()
            .map(|(instrument, position)| {
                (*instrument, position.quantity.to_f64().unwrap_or_default())
            })
            .collect();
    }
}

impl AlgoStrategy for DeciderStrategy {
    type State = HonbaEngineState;

    fn generate_algo_orders(
        &self,
        state: &Self::State,
    ) -> (
        impl IntoIterator<Item = OrderRequestCancel<ExchangeIndex, InstrumentIndex>>,
        impl IntoIterator<Item = OrderRequestOpen<ExchangeIndex, InstrumentIndex>>,
    ) {
        let mut progress = lock(&self.progress);
        let mut record = lock(&self.record);
        let mut orders = Vec::new();

        while !progress.done {
            if progress.awaiting_fills {
                // Settled once every order is resolved. Should the replay move on regardless
                // (gate timeout), don't wedge: the next bar arriving also settles this one.
                let settled = state.global.orders_resolved >= progress.orders_sent
                    || self.bar_complete(state, progress.next_bar + 1);
                if !settled {
                    break;
                }
                progress.awaiting_fills = false;
                progress.next_bar += 1;
                self.gate.settle(progress.next_bar);
            }

            if !self.bar_complete(state, progress.next_bar) {
                break;
            }

            let time_ms = self.config.schedule[progress.next_bar].0;
            let ctx = self.context(state, time_ms);
            match self.decider.on_bar(&ctx) {
                Ok(actions) => {
                    let bar_orders = self.build_orders(
                        state,
                        time_ms,
                        &ctx,
                        actions,
                        &mut progress,
                        &mut record.rejections,
                    );
                    progress.orders_sent += bar_orders.len();
                    progress.awaiting_fills = true;
                    record.bars_decided += 1;
                    orders.extend(bar_orders);
                }
                Err(error) => {
                    record.error = Some(error);
                    progress.done = true;
                    self.gate.abort();
                }
            }
        }

        self.sync_record(state, &mut record);

        (std::iter::empty(), orders)
    }
}

impl ClosePositionsStrategy for DeciderStrategy {
    type State = HonbaEngineState;

    fn close_positions_requests<'a>(
        &'a self,
        state: &'a Self::State,
        filter: &'a InstrumentFilter,
    ) -> (
        impl IntoIterator<Item = OrderRequestCancel<ExchangeIndex, InstrumentIndex>> + 'a,
        impl IntoIterator<Item = OrderRequestOpen<ExchangeIndex, InstrumentIndex>> + 'a,
    )
    where
        ExchangeIndex: 'a,
        AssetIndex: 'a,
        InstrumentIndex: 'a,
    {
        close_open_positions_with_market_orders(&self.id, state, filter, |_| {
            ClientOrderId::random()
        })
    }
}

impl<Clock, State, ExecutionTxs, Risk> OnDisconnectStrategy<Clock, State, ExecutionTxs, Risk>
    for DeciderStrategy
{
    type OnDisconnect = ();

    fn on_disconnect(
        _: &mut Engine<Clock, State, ExecutionTxs, Self, Risk>,
        _: ExchangeId,
    ) -> Self::OnDisconnect {
    }
}

impl<Clock, State, ExecutionTxs, Risk> OnTradingDisabled<Clock, State, ExecutionTxs, Risk>
    for DeciderStrategy
{
    type OnTradingDisabled = ();

    fn on_trading_disabled(
        _: &mut Engine<Clock, State, ExecutionTxs, Self, Risk>,
    ) -> Self::OnTradingDisabled {
    }
}
