//! Bar-driven strategy adapter: turns a [`Decider`] into a barter strategy.
//!
//! Per replayed time step the [`DeciderStrategy`] runs three phases, each waiting for barter
//! to execute the fills it produced:
//! 1. **Open**: once every bar at the timestamp has been processed, resting orders are matched
//!    against those bars ([`Book::begin_bar`]).
//! 2. **Decide**: the [`Decider`] sees the resulting portfolio and returns actions, which the
//!    book validates; immediately executable orders fill at the bar close.
//! 3. **Close**: the equity point is recorded and the [`BarGate`] releases the next bar.

use crate::{
    book::{Book, FillIntent},
    data::{Bar, BarGate, CandleData},
    ledger::{ExecutionOutcome, Ledger},
    model::{Action, BarContext},
};
use barter::{
    engine::{
        state::{instrument::filter::InstrumentFilter, EngineState},
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
use rust_decimal::{prelude::FromPrimitive, Decimal};
use std::{
    collections::BTreeMap,
    fmt,
    sync::{Arc, Mutex, MutexGuard},
};

/// barter `EngineState` used by honba backtests.
pub type HonbaEngineState = EngineState<Ledger, CandleData>;

/// Error raised by a [`Decider`]; aborts the backtest.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
#[error("{0}")]
pub struct DeciderError(pub String);

/// Bar-by-bar trading logic.
///
/// Called once per distinct bar timestamp, after all bars at that timestamp have been
/// processed, resting orders matched against them, and all resulting fills applied.
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

/// Static inputs a [`DeciderStrategy`] needs.
#[derive(Debug, Clone)]
pub struct DeciderStrategyConfig {
    /// `(timestamp ms, number of bars)` for every replayed time step.
    pub schedule: Vec<(i64, usize)>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
enum Phase {
    /// Waiting for every bar of `next_bar` to be processed.
    #[default]
    Collect,
    /// Waiting for fills of resting orders triggered by the bar.
    AwaitOpenFills,
    /// Waiting for fills of the decider's actions.
    AwaitDecisionFills,
    /// Final bar with `liquidate_at_end`: waiting for the liquidation fills.
    AwaitLiquidation,
    Done,
}

/// Mutable run state, shared with the caller to build the report after the run.
#[derive(Debug)]
pub struct RunState {
    pub book: Book,
    pub bars_decided: usize,
    pub error: Option<DeciderError>,
    phase: Phase,
    next_bar: usize,
    /// Ledger reports already applied to the book.
    cursor: usize,
}

impl RunState {
    pub fn new(book: Book) -> Self {
        Self {
            book,
            bars_decided: 0,
            error: None,
            phase: Phase::Collect,
            next_bar: 0,
            cursor: 0,
        }
    }
}

/// barter strategy delegating decisions to a [`Decider`], with order handling done by the
/// honba [`Book`] and fills executed as barter market orders.
pub struct DeciderStrategy {
    pub id: StrategyId,
    decider: Arc<dyn Decider>,
    config: Arc<DeciderStrategyConfig>,
    gate: Arc<BarGate>,
    run: Arc<Mutex<RunState>>,
}

impl fmt::Debug for DeciderStrategy {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DeciderStrategy")
            .field("id", &self.id)
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}

pub(crate) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl DeciderStrategy {
    pub fn new(
        decider: Arc<dyn Decider>,
        config: Arc<DeciderStrategyConfig>,
        gate: Arc<BarGate>,
        book: Book,
    ) -> Self {
        Self {
            id: StrategyId::new("honba"),
            decider,
            config,
            gate,
            run: Arc::new(Mutex::new(RunState::new(book))),
        }
    }

    /// Shared handle to the run state (book, counters, decider error).
    pub fn run_state(&self) -> Arc<Mutex<RunState>> {
        Arc::clone(&self.run)
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

    /// Bars at `time_ms`, indexed by instrument.
    fn bars_at(&self, state: &HonbaEngineState, time_ms: i64) -> Vec<Option<Bar>> {
        state
            .instruments
            .instruments(&InstrumentFilter::None)
            .map(|instrument| {
                instrument
                    .data
                    .last()
                    .filter(|bar| bar.time_ms == time_ms)
                    .copied()
            })
            .collect()
    }

    fn context<'a>(
        &self,
        state: &'a HonbaEngineState,
        book: &mut Book,
        time_ms: i64,
    ) -> BarContext<'a> {
        let symbols = &book.config().symbols;
        let mut candles = BTreeMap::new();
        let mut history = BTreeMap::new();
        for instrument in state.instruments.instruments(&InstrumentFilter::None) {
            let symbol = &symbols[instrument.key.index()];
            if let Some(bar) = instrument.data.last() {
                candles.insert(symbol.clone(), *bar);
                history.insert(symbol.clone(), instrument.data.history.as_slice());
            }
        }

        let positions = symbols
            .iter()
            .enumerate()
            .map(|(index, symbol)| (symbol.clone(), book.position_view(index)))
            .collect();

        BarContext {
            time_ms,
            candles,
            history,
            positions,
            open_orders: book.open_orders(),
            events: book.take_events(),
            session: book.session_view(time_ms),
            warmup: book.is_warmup(time_ms),
            cash: book.cash,
            equity: book.equity(),
            unsettled_cash: book.unsettled_cash(),
            available_cash: book.available_cash(),
        }
    }

    /// Convert book fill intents into barter market orders priced at the fill price.
    fn to_requests(
        &self,
        state: &HonbaEngineState,
        book: &mut Book,
        intents: Vec<FillIntent>,
    ) -> Vec<OrderRequestOpen<ExchangeIndex, InstrumentIndex>> {
        intents
            .into_iter()
            .filter_map(|intent| {
                let instrument = InstrumentIndex(intent.instrument);
                let (Some(price), Some(quantity)) = (
                    Decimal::from_f64(intent.price).map(|p| p.normalize()),
                    Decimal::from_f64(intent.qty).map(|q| q.normalize()),
                ) else {
                    book.fail(&intent.fill_id, "invalid_price");
                    return None;
                };
                Some(OrderRequestOpen {
                    key: OrderKey {
                        exchange: state
                            .instruments
                            .instrument_index(&instrument)
                            .instrument
                            .exchange,
                        instrument,
                        strategy: StrategyId::new(&intent.fill_id),
                        cid: ClientOrderId::new(intent.fill_id.as_str()),
                    },
                    state: RequestOpen {
                        side: intent.side.into(),
                        price,
                        quantity,
                        kind: OrderKind::Market,
                        time_in_force: TimeInForce::ImmediateOrCancel,
                    },
                })
            })
            .collect()
    }

    /// Settled unless fills are outstanding. Should the replay move on regardless (gate
    /// timeout), outstanding fills are failed so the run cannot wedge.
    fn fills_settled(&self, state: &HonbaEngineState, run: &mut RunState) -> bool {
        if !run.book.has_pending() {
            return true;
        }
        if self.bar_complete(state, run.next_bar + 1) {
            let pending = run.book.pending_ids().cloned().collect::<Vec<_>>();
            for fill_id in pending {
                run.book.fail(&fill_id, "exchange: timeout");
            }
            return true;
        }
        false
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
        let mut guard = lock(&self.run);
        let run = &mut *guard;

        // Apply execution reports barter produced since the last call
        for report in &state.global.reports[run.cursor.min(state.global.reports.len())..] {
            match &report.outcome {
                ExecutionOutcome::Filled { .. } => run.book.report(&report.fill_id, Ok(())),
                ExecutionOutcome::Failed { reason } => {
                    run.book.report(&report.fill_id, Err(reason.clone()))
                }
            }
        }
        run.cursor = state.global.reports.len();

        let mut requests = Vec::new();
        loop {
            match run.phase {
                Phase::Done => break,
                Phase::Collect => {
                    if !self.bar_complete(state, run.next_bar) {
                        break;
                    }
                    let time_ms = self.config.schedule[run.next_bar].0;
                    let bars = self.bars_at(state, time_ms);
                    let intents = run.book.begin_bar(run.next_bar, time_ms, &bars);
                    requests.extend(self.to_requests(state, &mut run.book, intents));
                    run.phase = Phase::AwaitOpenFills;
                }
                Phase::AwaitOpenFills => {
                    if !self.fills_settled(state, run) {
                        break;
                    }
                    let time_ms = self.config.schedule[run.next_bar].0;
                    let ctx = self.context(state, &mut run.book, time_ms);
                    match self.decider.on_bar(&ctx) {
                        Ok(actions) => {
                            drop(ctx);
                            let mut intents = Vec::new();
                            for action in actions {
                                intents.extend(run.book.apply(run.next_bar, time_ms, action));
                            }
                            requests.extend(self.to_requests(state, &mut run.book, intents));
                            run.bars_decided += 1;
                            run.phase = Phase::AwaitDecisionFills;
                        }
                        Err(error) => {
                            run.error = Some(error);
                            run.phase = Phase::Done;
                            self.gate.abort();
                        }
                    }
                }
                Phase::AwaitDecisionFills => {
                    if !self.fills_settled(state, run) {
                        break;
                    }
                    let last_bar = run.next_bar + 1 == self.config.schedule.len();
                    if last_bar && run.book.config().liquidate_at_end {
                        let time_ms = self.config.schedule[run.next_bar].0;
                        let intents = run.book.liquidate_all(run.next_bar, time_ms);
                        requests.extend(self.to_requests(state, &mut run.book, intents));
                        run.phase = Phase::AwaitLiquidation;
                        continue;
                    }
                    run.phase = Phase::AwaitLiquidation;
                }
                Phase::AwaitLiquidation => {
                    if !self.fills_settled(state, run) {
                        break;
                    }
                    let time_ms = self.config.schedule[run.next_bar].0;
                    run.book.end_bar(time_ms);
                    run.next_bar += 1;
                    self.gate.settle(run.next_bar);
                    run.phase = Phase::Collect;
                }
            }
        }

        (std::iter::empty(), requests)
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
