//! Shared helpers for integration tests.
#![allow(dead_code)]

use honba_barter::{
    run_backtest, Action, BacktestConfig, BacktestReport, Bar, BarContext, Decider, DeciderError,
    Event, OrderView, PositionView,
};
use std::{
    collections::{BTreeMap, HashMap},
    sync::{Arc, Mutex},
};

pub const DAY_MS: i64 = 86_400_000;
/// 2024-01-01T00:00:00Z
pub const START_MS: i64 = 1_704_067_200_000;

/// Daily bars from `(open, high, low, close)` tuples starting at [`START_MS`].
pub fn daily(ohlc: &[(f64, f64, f64, f64)]) -> Vec<Bar> {
    bars_every(START_MS, DAY_MS, ohlc)
}

pub fn bars_every(start_ms: i64, step_ms: i64, ohlc: &[(f64, f64, f64, f64)]) -> Vec<Bar> {
    ohlc.iter()
        .enumerate()
        .map(|(i, &(o, h, l, c))| Bar::new(start_ms + i as i64 * step_ms, o, h, l, c, 1_000.0))
        .collect()
}

/// Flat bars at `price`.
pub fn flat(n: usize, price: f64) -> Vec<(f64, f64, f64, f64)> {
    vec![(price, price, price, price); n]
}

pub fn config(symbols: &[&str]) -> BacktestConfig {
    BacktestConfig {
        symbols: symbols.iter().map(|s| s.to_string()).collect(),
        initial_cash: 100_000.0,
        ..BacktestConfig::default()
    }
}

/// What a scripted decider saw at one bar.
#[derive(Debug, Clone)]
pub struct Seen {
    pub time_ms: i64,
    pub positions: BTreeMap<String, PositionView>,
    pub open_orders: Vec<OrderView>,
    pub events: Vec<Event>,
    pub cash: f64,
    pub equity: f64,
    pub warmup: bool,
    pub json: serde_json::Value,
}

/// Decider that returns pre-scripted actions per bar index and records every context.
pub struct Scripted {
    script: HashMap<usize, Vec<Action>>,
    calls: Mutex<usize>,
    pub seen: Arc<Mutex<Vec<Seen>>>,
}

impl Scripted {
    pub fn new(script: impl IntoIterator<Item = (usize, Vec<Action>)>) -> Arc<Self> {
        Arc::new(Self {
            script: script.into_iter().collect(),
            calls: Mutex::new(0),
            seen: Arc::new(Mutex::new(Vec::new())),
        })
    }

    pub fn seen(&self) -> Vec<Seen> {
        self.seen.lock().unwrap().clone()
    }
}

impl Decider for Scripted {
    fn on_bar(&self, ctx: &BarContext<'_>) -> Result<Vec<Action>, DeciderError> {
        let mut calls = self.calls.lock().unwrap();
        let index = *calls;
        *calls += 1;
        self.seen.lock().unwrap().push(Seen {
            time_ms: ctx.time_ms,
            positions: ctx.positions.clone(),
            open_orders: ctx.open_orders.clone(),
            events: ctx.events.clone(),
            cash: ctx.cash,
            equity: ctx.equity,
            warmup: ctx.warmup,
            json: serde_json::from_str(&ctx.to_json().unwrap()).unwrap(),
        });
        Ok(self.script.get(&index).cloned().unwrap_or_default())
    }
}

/// Run a single-symbol backtest with a scripted decider.
pub fn run(
    cfg: BacktestConfig,
    symbol: &str,
    bars: Vec<Bar>,
    script: impl IntoIterator<Item = (usize, Vec<Action>)>,
) -> (BacktestReport, Vec<Seen>) {
    let decider = Scripted::new(script);
    let candles = BTreeMap::from([(symbol.to_string(), bars)]);
    let report = run_backtest(cfg, candles, decider.clone()).unwrap();
    (report, decider.seen())
}

pub fn fills(events: &[Event]) -> Vec<&honba_barter::FillEvent> {
    events
        .iter()
        .filter_map(|event| match event {
            Event::Fill(fill) => Some(fill),
            _ => None,
        })
        .collect()
}

pub fn assert_close(a: f64, b: f64) {
    assert!((a - b).abs() < 1e-9, "{a} != {b}");
}
