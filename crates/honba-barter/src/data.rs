//! Candle (OHLCV bar) market data for barter backtests.
//!
//! barter's [`DefaultInstrumentMarketData`](barter::engine::state::instrument::data::DefaultInstrumentMarketData)
//! only understands trades and L1 books and silently ignores [`DataKind::Candle`]. Honba
//! strategies are bar based, so this module provides:
//! - [`Bar`]: a plain OHLCV bar keyed by epoch milliseconds.
//! - [`CandleData`]: an [`InstrumentDataState`] that keeps the candle history of an instrument
//!   and prices it at the last close.
//! - [`CandleMarketData`]: a [`BacktestMarketData`] source that replays bars in time order and
//!   paces the replay so each bar is fully decided and filled before the next one is released.

use barter::{
    backtest::market_data::BacktestMarketData,
    engine::state::order::in_flight_recorder::InFlightRequestRecorder,
    engine::{state::instrument::data::InstrumentDataState, Processor},
    error::BarterError,
};
use barter_data::{
    event::{DataKind, MarketEvent},
    streams::{consumer::MarketStreamEvent, reconnect::Event},
    subscription::candle::Candle,
};
use barter_execution::{
    order::request::{OrderRequestCancel, OrderRequestOpen},
    AccountEvent,
};
use barter_instrument::{exchange::ExchangeId, instrument::InstrumentIndex};
use chrono::{DateTime, Utc};
use futures_util::{future, stream, Stream, StreamExt};
use rust_decimal::{prelude::FromPrimitive, Decimal};
use serde::{Deserialize, Serialize};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::watch;

/// A single OHLCV bar. `time_ms` is the bar timestamp in epoch milliseconds (UTC).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Bar {
    pub time_ms: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

impl Bar {
    pub fn new(time_ms: i64, open: f64, high: f64, low: f64, close: f64, volume: f64) -> Self {
        Self {
            time_ms,
            open,
            high,
            low,
            close,
            volume,
        }
    }

    fn from_candle(time: DateTime<Utc>, candle: &Candle) -> Self {
        Self {
            time_ms: time.timestamp_millis(),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
        }
    }

    fn to_candle(self, time: DateTime<Utc>) -> Candle {
        Candle {
            close_time: time,
            open: self.open,
            high: self.high,
            low: self.low,
            close: self.close,
            volume: self.volume,
            trade_count: 0,
        }
    }
}

/// Candle aware [`InstrumentDataState`]: stores every bar received for the instrument and uses
/// the last close as the instrument price.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CandleData {
    pub history: Vec<Bar>,
}

impl CandleData {
    /// Most recent bar, if any.
    pub fn last(&self) -> Option<&Bar> {
        self.history.last()
    }
}

impl InstrumentDataState for CandleData {
    type MarketEventKind = DataKind;

    fn price(&self) -> Option<Decimal> {
        self.last().and_then(|bar| Decimal::from_f64(bar.close))
    }
}

impl<InstrumentKey> Processor<&MarketEvent<InstrumentKey, DataKind>> for CandleData {
    type Audit = ();

    fn process(&mut self, event: &MarketEvent<InstrumentKey, DataKind>) -> Self::Audit {
        let DataKind::Candle(candle) = &event.kind else {
            return;
        };

        let bar = Bar::from_candle(event.time_exchange, candle);
        match self.history.last_mut() {
            // Replace an update of the most recent bar, ignore out-of-order bars
            Some(last) if last.time_ms == bar.time_ms => *last = bar,
            Some(last) if last.time_ms > bar.time_ms => {}
            _ => self.history.push(bar),
        }
    }
}

impl<ExchangeKey, AssetKey, InstrumentKey>
    Processor<&AccountEvent<ExchangeKey, AssetKey, InstrumentKey>> for CandleData
{
    type Audit = ();

    fn process(&mut self, _: &AccountEvent<ExchangeKey, AssetKey, InstrumentKey>) -> Self::Audit {}
}

impl<ExchangeKey, InstrumentKey> InFlightRequestRecorder<ExchangeKey, InstrumentKey>
    for CandleData
{
    fn record_in_flight_cancel(&mut self, _: &OrderRequestCancel<ExchangeKey, InstrumentKey>) {}

    fn record_in_flight_open(&mut self, _: &OrderRequestOpen<ExchangeKey, InstrumentKey>) {}
}

/// Upper bound (virtual time) the replay waits for a bar to settle before moving on anyway.
///
/// barter's execution layer times requests out after 1s, so a healthy bar always settles well
/// within this bound; it only guards against a wedged backtest.
const GATE_TIMEOUT: Duration = Duration::from_secs(60);

/// Synchronisation point between the market data replay and the [`DeciderStrategy`](crate::DeciderStrategy).
///
/// The replay releases bar `i` only once bars `0..i` are settled: the decider has run and every
/// order it produced has been filled or rejected. Without this, barter would replay the whole
/// in-memory dataset before the (latency simulating) mock exchange reports a single fill.
#[derive(Debug)]
pub struct BarGate {
    settled: watch::Sender<usize>,
    aborted: AtomicBool,
}

impl Default for BarGate {
    fn default() -> Self {
        Self {
            settled: watch::Sender::new(0),
            aborted: AtomicBool::new(false),
        }
    }
}

impl BarGate {
    /// Mark the first `num_bars` bars as settled.
    pub fn settle(&self, num_bars: usize) {
        self.settled.send_if_modified(|current| {
            if num_bars > *current {
                *current = num_bars;
                true
            } else {
                false
            }
        });
    }

    /// Stop releasing further bars (eg/ the decider failed).
    pub fn abort(&self) {
        self.aborted.store(true, Ordering::SeqCst);
        // Wake any waiter so it can observe the abort
        self.settled.send_modify(|current| *current = usize::MAX);
    }

    pub fn is_aborted(&self) -> bool {
        self.aborted.load(Ordering::SeqCst)
    }

    async fn wait_settled(&self, num_bars: usize) {
        let mut rx = self.settled.subscribe();
        let _ =
            tokio::time::timeout(GATE_TIMEOUT, rx.wait_for(|settled| *settled >= num_bars)).await;
    }
}

/// All bars sharing one timestamp, in instrument index order.
pub type BarGroup = (i64, Vec<MarketStreamEvent<InstrumentIndex, DataKind>>);

/// Paced, in-memory candle market data (see [`BarGate`]).
#[derive(Debug, Clone)]
pub struct CandleMarketData {
    time_first_event: DateTime<Utc>,
    groups: Arc<Vec<BarGroup>>,
    gate: Arc<BarGate>,
}

impl CandleMarketData {
    /// Build from per-instrument bars. `bars[i]` belongs to `InstrumentIndex(i)`; each series must
    /// be sorted by time without duplicates.
    pub fn new(exchange: ExchangeId, bars: &[Vec<Bar>], gate: Arc<BarGate>) -> Option<Self> {
        let mut events = bars
            .iter()
            .enumerate()
            .flat_map(|(index, series)| series.iter().map(move |bar| (bar.time_ms, index, *bar)))
            .collect::<Vec<_>>();
        events.sort_by_key(|(time_ms, index, _)| (*time_ms, *index));

        let mut groups: Vec<BarGroup> = Vec::new();
        for (time_ms, index, bar) in events {
            let time = DateTime::<Utc>::from_timestamp_millis(time_ms)?;
            let event = Event::Item(MarketEvent {
                time_exchange: time,
                time_received: time,
                exchange,
                instrument: InstrumentIndex(index),
                kind: DataKind::Candle(bar.to_candle(time)),
            });

            match groups.last_mut() {
                Some((group_time, group)) if *group_time == time_ms => group.push(event),
                _ => groups.push((time_ms, vec![event])),
            }
        }

        let time_first_event = DateTime::<Utc>::from_timestamp_millis(groups.first()?.0)?;
        Some(Self {
            time_first_event,
            groups: Arc::new(groups),
            gate,
        })
    }

    /// Timestamp and number of bars for every replayed time step.
    pub fn schedule(&self) -> Vec<(i64, usize)> {
        self.groups
            .iter()
            .map(|(time_ms, group)| (*time_ms, group.len()))
            .collect()
    }

    pub fn gate(&self) -> &Arc<BarGate> {
        &self.gate
    }
}

impl BacktestMarketData for CandleMarketData {
    type Kind = DataKind;

    async fn time_first_event(&self) -> Result<DateTime<Utc>, BarterError> {
        Ok(self.time_first_event)
    }

    async fn stream(
        &self,
    ) -> Result<
        impl Stream<Item = MarketStreamEvent<InstrumentIndex, Self::Kind>> + Send + 'static,
        BarterError,
    > {
        let groups = Arc::clone(&self.groups);
        let gate = Arc::clone(&self.gate);
        let num_groups = groups.len();

        // Step `i` waits for bars 0..i to settle then releases group `i`. The extra final step
        // waits for the last bar so the backtest doesn't shut down before its fills arrive.
        let stream = stream::iter(0..=num_groups)
            .then(move |step| {
                let groups = Arc::clone(&groups);
                let gate = Arc::clone(&gate);
                async move {
                    if step > 0 {
                        gate.wait_settled(step).await;
                    }
                    if gate.is_aborted() {
                        None
                    } else {
                        Some(
                            groups
                                .get(step)
                                .map(|(_, group)| group.clone())
                                .unwrap_or_default(),
                        )
                    }
                }
            })
            .take_while(|events| future::ready(events.is_some()))
            .flat_map(|events| stream::iter(events.unwrap_or_default()));

        Ok(stream)
    }
}
