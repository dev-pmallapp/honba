//! honba's order book and portfolio accounting.
//!
//! barter's mock exchange only fills market orders and does not track cash correctly (see
//! [`Ledger`](crate::Ledger)), so honba keeps the portfolio (cash, positions, costs) and the
//! order lifecycle here. Resting orders (limit, stop, stop-limit) live in this book and are
//! matched against each bar's OHLC; every fill the book decides on is executed through barter
//! as a market order at the fill price and only applied once barter reports the trade.
//!
//! # Matching rules (per bar, orders placed on earlier bars only)
//!
//! | kind        | buy                                         | sell (mirror)                 |
//! |-------------|---------------------------------------------|-------------------------------|
//! | market      | open (only when resting, see `fill_model`)  | open                          |
//! | limit `L`   | open if open <= L, else L if low <= L        | open if open >= L, else L if high >= L |
//! | stop `T`    | open if open >= T, else T if high >= T       | open if open <= T, else T if low <= T  |
//! | stop_limit  | triggers like stop; fills at the trigger price if it is within the limit, at the open-gap price if within the limit, at L if the bar gapped past the limit and later traded back to it; otherwise rests as a triggered limit | mirror |
//!
//! Orders created at a bar are first matched against the next bar. With the default `close`
//! fill model, market orders and orders that are already marketable / triggered at the
//! decision bar's close fill immediately at that close.

use crate::{
    config::InstrumentMeta,
    data::Bar,
    model::{
        Action, ActionSide, CostBreakdown, Event, FillEvent, FillReason, ModifyRequest,
        OrderRequest, OrderRole, OrderStatus, OrderType, OrderView, PositionView, Product, Segment,
        SessionView, TimeInForce, TrailMode, TrailSpec,
    },
    session::Session,
};
use chrono::{DateTime, FixedOffset, NaiveDate};
use honba_core::{
    tax::BrokeragePlan,
    types::{MarketSegment, OrderSide, ProductType},
    IndianTaxCalculator,
};
use rust_decimal::{
    prelude::{FromPrimitive, ToPrimitive},
    Decimal,
};
use std::collections::{HashMap, VecDeque};

/// Longest supported ATR lookback for trailing stops.
pub const MAX_ATR_PERIOD: usize = 1000;
const DEFAULT_ATR_PERIOD: usize = 14;

/// Relative tolerance for quantity / cash comparisons.
const EPS: f64 = 1e-9;

fn approx_le(a: f64, b: f64) -> bool {
    a <= b + EPS * b.abs().max(1.0)
}

/// Is `value` an integer multiple of `step` (within float noise).
fn is_multiple(value: f64, step: f64) -> bool {
    if step.is_nan() || step <= 0.0 {
        return true;
    }
    let ratio = value / step;
    (ratio - ratio.round()).abs() <= 1e-6
}

/// Per-fill transaction cost model.
#[derive(Debug, Clone, PartialEq)]
pub enum CostModel {
    /// Fraction of traded value.
    Flat(f64),
    India(BrokeragePlan),
}

impl CostModel {
    pub fn costs(
        &self,
        segment: Segment,
        product: Product,
        side: ActionSide,
        price: f64,
        qty: f64,
    ) -> CostBreakdown {
        match self {
            Self::Flat(rate) => CostBreakdown::flat(price * qty * rate),
            Self::India(plan) => {
                let (Some(price), Some(qty)) = (Decimal::from_f64(price), Decimal::from_f64(qty))
                else {
                    return CostBreakdown::default();
                };
                let segment = match segment {
                    Segment::EquityCash => MarketSegment::EquityCash,
                    Segment::EquityFutures => MarketSegment::EquityFutures,
                    Segment::EquityOptions => MarketSegment::EquityOptions,
                    Segment::Commodity => MarketSegment::Commodity,
                    Segment::Currency => MarketSegment::Currency,
                };
                let product = match product {
                    Product::CNC => ProductType::CNC,
                    Product::MIS => ProductType::MIS,
                    Product::NRML => ProductType::NRML,
                    Product::MTF => ProductType::MTF,
                };
                let side = match side {
                    ActionSide::Buy => OrderSide::Buy,
                    ActionSide::Sell => OrderSide::Sell,
                };
                let costs =
                    IndianTaxCalculator::calculate_for(segment, product, side, price, qty, plan);
                let f = |d: Decimal| d.to_f64().unwrap_or_default();
                CostBreakdown {
                    brokerage: f(costs.brokerage),
                    stt: f(costs.stt),
                    exchange_fee: f(costs.exchange_fee),
                    sebi_fee: f(costs.sebi_fee),
                    stamp_duty: f(costs.stamp_duty),
                    gst: f(costs.gst),
                    dp: f(costs.dp),
                    total: f(costs.total),
                }
            }
        }
    }
}

/// Static configuration of a [`Book`].
#[derive(Debug, Clone)]
pub struct BookConfig {
    /// Symbol per instrument index.
    pub symbols: Vec<String>,
    pub initial_cash: f64,
    pub costs: CostModel,
    /// Exchange rules per instrument index.
    pub instruments: Vec<InstrumentMeta>,
    pub allow_short: bool,
    /// Exchange-local UTC offset (trading dates for `day` orders).
    pub utc_offset: FixedOffset,
    /// Trading hours; `None` means always open (no square-off).
    pub session: Option<Session>,
    /// `next_open` fill model: market orders fill at the next bar's open and nothing executes
    /// at the decision bar's close.
    pub next_open: bool,
    /// Bars before this timestamp are warm-up (no orders, no equity points).
    pub start_ms: Option<i64>,
    /// When a bracket's stop loss and take profit both trigger inside one bar (neither at the
    /// open), the stop loss wins if true.
    pub stop_first: bool,
}

/// Net position in one instrument with average-cost accounting.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Position {
    /// Signed quantity: positive long, negative short.
    pub qty: f64,
    pub avg_price: f64,
    pub product: Option<Product>,
    /// Realised PnL (gross of costs).
    pub realised_pnl: f64,
}

impl Position {
    /// Apply a fill of signed quantity `delta` at `price`, returning the realised PnL (gross of
    /// costs) of any quantity it closed.
    pub fn apply(&mut self, delta: f64, price: f64, product: Product) -> f64 {
        let flat = self.qty.abs() <= EPS;
        if flat || self.qty.signum() == delta.signum() {
            let qty_new = self.qty + delta;
            self.avg_price =
                (self.qty.abs() * self.avg_price + delta.abs() * price) / qty_new.abs();
            self.qty = qty_new;
            if flat {
                self.product = Some(product);
            }
            return 0.0;
        }

        let closed = delta.abs().min(self.qty.abs());
        let realised = closed * (price - self.avg_price) * self.qty.signum();
        let qty_new = self.qty + delta;
        if qty_new.abs() <= EPS * delta.abs().max(1.0) {
            self.qty = 0.0;
            self.avg_price = 0.0;
            self.product = None;
        } else {
            if qty_new.signum() != self.qty.signum() {
                // Flipped through flat: the remainder was opened at this price
                self.avg_price = price;
                self.product = Some(product);
            }
            self.qty = qty_new;
        }
        self.realised_pnl += realised;
        realised
    }
}

/// An order tracked by the book.
#[derive(Debug, Clone, PartialEq)]
pub struct Order {
    pub id: String,
    pub instrument: Option<usize>,
    pub symbol: String,
    pub side: ActionSide,
    pub kind: OrderType,
    pub qty: f64,
    pub filled_qty: f64,
    pub filled_value: f64,
    pub price: Option<f64>,
    pub trigger: Option<f64>,
    pub tif: TimeInForce,
    pub product: Product,
    pub tag: Option<String>,
    pub role: OrderRole,
    pub parent: Option<String>,
    pub status: OrderStatus,
    pub reason: Option<String>,
    pub reduce_only: bool,
    pub stop_loss: Option<f64>,
    pub take_profit: Option<f64>,
    pub trail: Option<TrailSpec>,
    pub trail_stop: Option<f64>,
    /// Highest high (sell stop) / lowest low (buy stop) since the trail activated.
    pub trail_extreme: Option<f64>,
    pub trail_active: bool,
    /// Stop-limit whose stop has triggered (now behaves as a limit order).
    pub triggered: bool,
    /// First bar index this order may be matched against.
    pub active_from_bar: usize,
    /// Trading date of the first bar the order was matched against (`day` expiry).
    pub first_eval_date: Option<NaiveDate>,
    pub created_ms: i64,
    pub updated_ms: i64,
}

impl Order {
    pub fn remaining(&self) -> f64 {
        (self.qty - self.filled_qty).max(0.0)
    }

    pub fn is_open(&self) -> bool {
        matches!(self.status, OrderStatus::Open | OrderStatus::Pending)
    }

    pub fn view(&self) -> OrderView {
        OrderView {
            id: self.id.clone(),
            symbol: self.symbol.clone(),
            side: self.side,
            kind: self.kind,
            qty: self.qty,
            filled_qty: self.filled_qty,
            avg_fill_price: (self.filled_qty > 0.0).then(|| self.filled_value / self.filled_qty),
            price: self.price,
            trigger: self.trigger,
            tif: self.tif,
            product: self.product,
            tag: self.tag.clone(),
            role: self.role,
            parent: self.parent.clone(),
            status: self.status,
            reason: self.reason.clone(),
            stop_loss: self.stop_loss,
            take_profit: self.take_profit,
            trail: self.trail,
            trail_stop: self.trail_stop,
            created_ms: self.created_ms,
            updated_ms: self.updated_ms,
        }
    }
}

/// A fill the book decided on, waiting for barter to execute it.
#[derive(Debug, Clone, PartialEq)]
pub struct FillIntent {
    pub fill_id: String,
    pub order: usize,
    pub instrument: usize,
    pub side: ActionSide,
    pub qty: f64,
    pub price: f64,
    pub reason: FillReason,
    pub costs: CostBreakdown,
    pub time_ms: i64,
    pub bar_index: usize,
}

/// A request honba refused (or an order that failed at fill time).
#[derive(Debug, Clone, PartialEq)]
pub struct Rejection {
    pub time_ms: i64,
    pub id: Option<String>,
    pub symbol: String,
    pub side: Option<ActionSide>,
    pub qty: f64,
    pub reason: String,
}

/// Where a limit order fills within a bar.
fn limit_fill(side: ActionSide, limit: f64, bar: &Bar) -> Option<f64> {
    match side {
        ActionSide::Buy if bar.open <= limit => Some(bar.open),
        ActionSide::Buy if bar.low <= limit => Some(limit),
        ActionSide::Sell if bar.open >= limit => Some(bar.open),
        ActionSide::Sell if bar.high >= limit => Some(limit),
        _ => None,
    }
}

/// Where a stop triggers within a bar (gap through the stop triggers at the open).
fn stop_touch(side: ActionSide, trigger: f64, bar: &Bar) -> Option<f64> {
    match side {
        ActionSide::Buy if bar.open >= trigger => Some(bar.open),
        ActionSide::Buy if bar.high >= trigger => Some(trigger),
        ActionSide::Sell if bar.open <= trigger => Some(bar.open),
        ActionSide::Sell if bar.low <= trigger => Some(trigger),
        _ => None,
    }
}

/// Is `price` at least as good as `limit` for `side`.
fn within_limit(side: ActionSide, price: f64, limit: f64) -> bool {
    match side {
        ActionSide::Buy => price <= limit,
        ActionSide::Sell => price >= limit,
    }
}

/// Outcome of matching one order against one bar.
#[derive(Debug, Clone, Copy, PartialEq)]
enum Match {
    None,
    /// A stop-limit triggered but could not fill within its limit in this bar.
    Triggered,
    Fill(f64, FillReason),
}

fn match_order(order: &Order, bar: &Bar) -> Match {
    let side = order.side;
    match order.kind {
        OrderType::Market => Match::Fill(bar.open, FillReason::Signal),
        OrderType::Limit => order
            .price
            .and_then(|limit| limit_fill(side, limit, bar))
            .map_or(Match::None, |price| {
                Match::Fill(price, order.limit_reason())
            }),
        OrderType::Stop => order
            .trigger
            .and_then(|trigger| stop_touch(side, trigger, bar))
            .map_or(Match::None, |price| Match::Fill(price, order.stop_reason())),
        OrderType::StopLimit => {
            let (Some(trigger), Some(limit)) = (order.trigger, order.price) else {
                return Match::None;
            };
            if order.triggered {
                return limit_fill(side, limit, bar)
                    .map_or(Match::None, |price| Match::Fill(price, FillReason::Stop));
            }
            let Some(touch) = stop_touch(side, trigger, bar) else {
                return Match::None;
            };
            if within_limit(side, touch, limit) {
                return Match::Fill(touch, FillReason::Stop);
            }
            // Gapped through the limit at the open: price later trading back to the limit fills
            let gapped = touch == bar.open;
            let traded_back = match side {
                ActionSide::Buy => bar.low <= limit,
                ActionSide::Sell => bar.high >= limit,
            };
            if gapped && traded_back {
                Match::Fill(limit, FillReason::Stop)
            } else {
                Match::Triggered
            }
        }
    }
}

impl Order {
    fn limit_reason(&self) -> FillReason {
        match self.role {
            OrderRole::TakeProfit => FillReason::TakeProfit,
            _ => FillReason::Limit,
        }
    }

    fn stop_reason(&self) -> FillReason {
        match self.role {
            OrderRole::StopLoss if self.trail.is_some() => FillReason::TrailingStop,
            OrderRole::StopLoss => FillReason::StopLoss,
            _ if self.trail.is_some() => FillReason::TrailingStop,
            _ => FillReason::Stop,
        }
    }

    /// Can this order execute at `close` right away (close fill model).
    fn marketable_at(&self, close: f64) -> Option<FillReason> {
        let side = self.side;
        match self.kind {
            OrderType::Market => Some(FillReason::Signal),
            OrderType::Limit => self
                .price
                .filter(|limit| within_limit(side, close, *limit))
                .map(|_| self.limit_reason()),
            OrderType::Stop => self
                .trigger
                .filter(|trigger| within_limit(side.opposite(), close, *trigger))
                .map(|_| self.stop_reason()),
            OrderType::StopLimit => match (self.trigger, self.price) {
                (Some(trigger), Some(limit))
                    if within_limit(side.opposite(), close, trigger)
                        && within_limit(side, close, limit) =>
                {
                    Some(FillReason::Stop)
                }
                _ => None,
            },
        }
    }
}

/// Portfolio + order book.
#[derive(Debug, Clone)]
pub struct Book {
    cfg: BookConfig,
    pub cash: f64,
    pub positions: Vec<Position>,
    pub last_close: Vec<Option<f64>>,
    pub orders: Vec<Order>,
    pub fills: Vec<FillEvent>,
    pub rejections: Vec<Rejection>,
    pub costs: CostBreakdown,
    pub equity_curve: Vec<(i64, f64)>,
    /// Most recent bars per instrument (ATR for trailing stops).
    recent: Vec<VecDeque<Bar>>,
    /// Date of the last MIS square-off per instrument.
    squared_off: Vec<Option<NaiveDate>>,
    pending: HashMap<String, FillIntent>,
    /// Batch-local projection of cash / positions including not yet confirmed intents.
    proj_cash: f64,
    proj_qty: Vec<f64>,
    events: Vec<Event>,
    order_seq: u64,
    fill_seq: u64,
}

/// Outcome of validating a fill.
type Check = Result<(), &'static str>;

impl Book {
    pub fn new(cfg: BookConfig) -> Self {
        let n = cfg.symbols.len();
        Self {
            cash: cfg.initial_cash,
            proj_cash: cfg.initial_cash,
            positions: vec![Position::default(); n],
            last_close: vec![None; n],
            proj_qty: vec![0.0; n],
            orders: Vec::new(),
            fills: Vec::new(),
            rejections: Vec::new(),
            costs: CostBreakdown::default(),
            equity_curve: Vec::new(),
            recent: vec![VecDeque::new(); n],
            squared_off: vec![None; n],
            pending: HashMap::new(),
            events: Vec::new(),
            order_seq: 0,
            fill_seq: 0,
            cfg,
        }
    }

    pub fn config(&self) -> &BookConfig {
        &self.cfg
    }

    pub fn instrument(&self, symbol: &str) -> Option<usize> {
        self.cfg.symbols.iter().position(|s| s == symbol)
    }

    /// Fill intents not yet confirmed or failed.
    pub fn has_pending(&self) -> bool {
        !self.pending.is_empty()
    }

    pub fn pending_ids(&self) -> impl Iterator<Item = &String> {
        self.pending.keys()
    }

    /// Mark-to-market equity.
    pub fn equity(&self) -> f64 {
        self.positions
            .iter()
            .zip(&self.last_close)
            .fold(self.cash, |equity, (position, close)| {
                equity + position.qty * close.unwrap_or(position.avg_price)
            })
    }

    pub fn position_view(&self, instrument: usize) -> PositionView {
        let position = &self.positions[instrument];
        let unrealised = self.last_close[instrument]
            .map(|close| position.qty * (close - position.avg_price))
            .unwrap_or_default();
        PositionView {
            qty: position.qty,
            avg_price: position.avg_price,
            product: position.product,
            realised_pnl: position.realised_pnl,
            unrealised_pnl: unrealised,
            pnl: position.realised_pnl + unrealised,
        }
    }

    pub fn open_orders(&self) -> Vec<OrderView> {
        self.orders
            .iter()
            .filter(|order| order.is_open())
            .map(Order::view)
            .collect()
    }

    /// Events since the previous call.
    pub fn take_events(&mut self) -> Vec<Event> {
        std::mem::take(&mut self.events)
    }

    fn trading_date(&self, time_ms: i64) -> NaiveDate {
        DateTime::from_timestamp_millis(time_ms)
            .unwrap_or_default()
            .with_timezone(&self.cfg.utc_offset)
            .date_naive()
    }

    fn market_open(&self, time_ms: i64) -> bool {
        self.cfg
            .session
            .as_ref()
            .is_none_or(|session| session.is_open(time_ms))
    }

    /// Session state for the bar context.
    pub fn session_view(&self, time_ms: i64) -> SessionView {
        SessionView {
            is_open: self.market_open(time_ms),
            date: self.trading_date(time_ms).to_string(),
            minutes_to_close: self
                .cfg
                .session
                .as_ref()
                .and_then(|session| session.minutes_to_close(time_ms)),
        }
    }

    /// Has a `day` order first eligible on `first` expired by `time_ms` (`date`).
    fn day_expired(&self, first: NaiveDate, date: NaiveDate, time_ms: i64) -> bool {
        date > first
            || (date == first
                && self
                    .cfg
                    .session
                    .as_ref()
                    .is_some_and(|session| session.past_close(time_ms)))
    }

    /// Close MIS positions at the square-off time (at the bar close).
    fn square_off(
        &mut self,
        instrument: usize,
        bar: &Bar,
        bar_index: usize,
        date: NaiveDate,
        time_ms: i64,
    ) -> Option<FillIntent> {
        let due = self
            .cfg
            .session
            .as_ref()
            .is_some_and(|session| session.past_square_off(time_ms));
        if !due || self.squared_off[instrument] == Some(date) {
            return None;
        }
        self.squared_off[instrument] = Some(date);

        // Working MIS orders go first
        let working = self
            .orders
            .iter()
            .enumerate()
            .filter(|(_, o)| {
                o.instrument == Some(instrument) && o.is_open() && o.product == Product::MIS
            })
            .map(|(i, _)| i)
            .collect::<Vec<_>>();
        for index in working {
            if self.orders[index].is_open() {
                self.close_order(index, OrderStatus::Cancelled, "square_off", time_ms);
            }
        }

        let qty = self.proj_qty[instrument];
        if self.positions[instrument].product != Some(Product::MIS) || qty.abs() <= EPS {
            return None;
        }
        let side = if qty > 0.0 {
            ActionSide::Sell
        } else {
            ActionSide::Buy
        };
        let id = format!("sq-{}-{}", self.cfg.symbols[instrument], date);
        self.orders.push(Order {
            id,
            instrument: Some(instrument),
            symbol: self.cfg.symbols[instrument].clone(),
            side,
            kind: OrderType::Market,
            qty: qty.abs(),
            filled_qty: 0.0,
            filled_value: 0.0,
            price: None,
            trigger: None,
            tif: TimeInForce::Day,
            product: Product::MIS,
            tag: None,
            role: OrderRole::SquareOff,
            parent: None,
            status: OrderStatus::Open,
            reason: None,
            reduce_only: true,
            stop_loss: None,
            take_profit: None,
            trail: None,
            trail_stop: None,
            trail_extreme: None,
            trail_active: false,
            triggered: false,
            active_from_bar: bar_index,
            first_eval_date: Some(date),
            created_ms: time_ms,
            updated_ms: time_ms,
        });
        let index = self.orders.len() - 1;
        // Mandatory exit: no cash / short checks
        Some(self.intent(
            index,
            qty.abs(),
            bar.close,
            FillReason::SquareOff,
            time_ms,
            bar_index,
        ))
    }

    fn sync_projection(&mut self) {
        self.proj_cash = self.cash;
        for (proj, position) in self.proj_qty.iter_mut().zip(&self.positions) {
            *proj = position.qty;
        }
        for pending in self.pending.values() {
            self.proj_cash -=
                pending.side.sign() * pending.qty * pending.price + pending.costs.total;
            self.proj_qty[pending.instrument] += pending.side.sign() * pending.qty;
        }
    }

    /// Start processing the bars at `time_ms` (`bars[i]` is instrument `i`'s bar, if any):
    /// expire `day` orders from earlier sessions and match resting orders against the bars.
    ///
    /// Returns the resulting fills (to be executed through barter).
    pub fn begin_bar(
        &mut self,
        bar_index: usize,
        time_ms: i64,
        bars: &[Option<Bar>],
    ) -> Vec<FillIntent> {
        for ((close, recent), bar) in self.last_close.iter_mut().zip(&mut self.recent).zip(bars) {
            if let Some(bar) = bar {
                *close = Some(bar.close);
                if recent.len() > MAX_ATR_PERIOD {
                    recent.pop_front();
                }
                recent.push_back(*bar);
            }
        }
        self.sync_projection();
        let date = self.trading_date(time_ms);

        let open = self.market_open(time_ms);

        let mut intents = Vec::new();
        for (instrument, bar) in bars.iter().enumerate() {
            let Some(bar) = bar else {
                continue;
            };

            // Expire day orders whose session has ended
            let expired = self
                .orders
                .iter()
                .enumerate()
                .filter(|(_, o)| {
                    o.instrument == Some(instrument)
                        && o.is_open()
                        && o.tif == TimeInForce::Day
                        // market orders (next_open) execute at the next available open
                        && o.kind != OrderType::Market
                        && o.first_eval_date
                            .is_some_and(|first| self.day_expired(first, date, time_ms))
                })
                .map(|(i, _)| i)
                .collect::<Vec<_>>();
            for index in expired {
                if self.orders[index].is_open() {
                    self.close_order(index, OrderStatus::Expired, "day", time_ms);
                }
            }
            if !open {
                // No matching outside trading hours
                continue;
            }

            let mut candidates = self
                .orders
                .iter()
                .enumerate()
                .filter(|(_, order)| {
                    order.instrument == Some(instrument)
                        && order.status == OrderStatus::Open
                        && order.active_from_bar <= bar_index
                })
                .map(|(index, _)| index)
                .collect::<Vec<_>>();
            // Protective exits act before new entries
            candidates.sort_by_key(|&index| self.orders[index].role == OrderRole::Entry);

            let mut brackets_done: Vec<String> = Vec::new();
            for index in candidates {
                if !self.orders[index].is_open() {
                    continue;
                }
                self.orders[index].first_eval_date.get_or_insert(date);

                let (index, result) = match self.orders[index].parent.clone() {
                    Some(parent) if brackets_done.contains(&parent) => continue,
                    Some(parent) => {
                        brackets_done.push(parent);
                        self.resolve_bracket(index, bar_index, bar)
                    }
                    None => (index, match_order(&self.orders[index], bar)),
                };

                match result {
                    Match::Fill(price, reason) => {
                        if let Some(intent) =
                            self.try_fill(index, price, reason, time_ms, bar_index)
                        {
                            intents.push(intent);
                        }
                    }
                    Match::Triggered => {
                        self.orders[index].triggered = true;
                        self.expire_ioc(index, time_ms);
                    }
                    Match::None => self.expire_ioc(index, time_ms),
                }
            }

            // Trailing stops move after the bar was matched against the stop as it stood at
            // the open of the bar: the new level only applies from the next bar.
            self.update_trails(instrument, bar, bar_index, time_ms);

            intents.extend(self.square_off(instrument, bar, bar_index, date, time_ms));
        }
        intents
    }

    /// Average true range over the last `period` bars of `instrument`.
    fn atr(&self, instrument: usize, period: usize) -> Option<f64> {
        let bars = &self.recent[instrument];
        let n = period.min(bars.len());
        if n == 0 {
            return None;
        }
        let start = bars.len() - n;
        let sum = (start..bars.len())
            .map(|i| {
                let bar = &bars[i];
                let range = bar.high - bar.low;
                match i.checked_sub(1).map(|p| bars[p].close) {
                    Some(prev) => range
                        .max((bar.high - prev).abs())
                        .max((bar.low - prev).abs()),
                    None => range,
                }
            })
            .sum::<f64>();
        Some(sum / n as f64)
    }

    fn trail_offset(&self, instrument: usize, spec: &TrailSpec, extreme: f64) -> Option<f64> {
        match spec.mode {
            TrailMode::Percent => Some(extreme * spec.value / 100.0),
            TrailMode::Amount => Some(spec.value),
            TrailMode::Atr => self
                .atr(instrument, spec.atr_period.unwrap_or(DEFAULT_ATR_PERIOD))
                .map(|atr| atr * spec.value),
        }
    }

    /// Round a stop to the instrument tick, away from the market (down for sell stops).
    fn round_stop(&self, instrument: usize, side: ActionSide, value: f64) -> f64 {
        match self.meta(instrument).tick_size {
            Some(tick) if tick > 0.0 => {
                let ticks = value / tick;
                let ticks = match side {
                    ActionSide::Sell => (ticks + 1e-9).floor(),
                    ActionSide::Buy => (ticks - 1e-9).ceil(),
                };
                ticks * tick
            }
            _ => value,
        }
    }

    /// Move a trailing stop towards the market if the trail allows; never loosens.
    fn ratchet(&mut self, index: usize, time_ms: i64) {
        let order = &self.orders[index];
        let (Some(spec), Some(extreme), Some(instrument)) =
            (order.trail, order.trail_extreme, order.instrument)
        else {
            return;
        };
        if !order.trail_active {
            return;
        }
        let Some(offset) = self.trail_offset(instrument, &spec, extreme) else {
            return;
        };
        let side = order.side;
        let candidate = self.round_stop(
            instrument,
            side,
            match side {
                ActionSide::Sell => extreme - offset,
                ActionSide::Buy => extreme + offset,
            },
        );
        if !(candidate.is_finite() && candidate > 0.0) {
            return;
        }
        let current = order.trigger;
        let step = spec.step.unwrap_or(0.0).max(0.0);
        let tighter = match (current, side) {
            (None, _) => true,
            (Some(stop), ActionSide::Sell) => candidate > stop && candidate - stop >= step,
            (Some(stop), ActionSide::Buy) => candidate < stop && stop - candidate >= step,
        };
        if !tighter {
            return;
        }

        let order = &mut self.orders[index];
        order.trigger = Some(candidate);
        order.trail_stop = Some(candidate);
        order.updated_ms = time_ms;
        let (id, symbol, parent, role) = (
            order.id.clone(),
            order.symbol.clone(),
            order.parent.clone(),
            order.role,
        );
        if role == OrderRole::StopLoss {
            if let Some(parent) = parent.and_then(|p| self.orders.iter().position(|o| o.id == p)) {
                self.orders[parent].stop_loss = Some(candidate);
            }
        }
        self.events.push(Event::TrailUpdate {
            time_ms,
            id,
            symbol,
            old_stop: current,
            new_stop: candidate,
        });
    }

    /// Start trailing from `reference` (entry fill / placement price) unless an activation
    /// price is still to be reached.
    fn init_trail(&mut self, index: usize, reference: f64, time_ms: i64) {
        let order = &mut self.orders[index];
        let Some(spec) = order.trail else {
            return;
        };
        order.trail_stop = order.trigger;
        if spec.activation_price.is_none() {
            order.trail_active = true;
            order.trail_extreme = Some(reference);
            self.ratchet(index, time_ms);
        }
    }

    /// Update extremes / activation of the trailing stops on `instrument` from `bar`.
    fn update_trails(&mut self, instrument: usize, bar: &Bar, bar_index: usize, time_ms: i64) {
        let trailing = self
            .orders
            .iter()
            .enumerate()
            .filter(|(index, order)| {
                order.instrument == Some(instrument)
                    && order.status == OrderStatus::Open
                    && order.trail.is_some()
                    && order.active_from_bar <= bar_index
                    && !self.pending.values().any(|p| p.order == *index)
            })
            .map(|(index, _)| index)
            .collect::<Vec<_>>();

        for index in trailing {
            let order = &mut self.orders[index];
            let spec = order.trail.expect("filtered on trail");
            let (favourable, extreme) = match order.side {
                ActionSide::Sell => (
                    bar.high,
                    order.trail_extreme.map_or(bar.high, |e| e.max(bar.high)),
                ),
                ActionSide::Buy => (
                    bar.low,
                    order.trail_extreme.map_or(bar.low, |e| e.min(bar.low)),
                ),
            };
            if !order.trail_active {
                let reached = spec
                    .activation_price
                    .is_some_and(|activation| match order.side {
                        ActionSide::Sell => favourable >= activation,
                        ActionSide::Buy => favourable <= activation,
                    });
                if !reached {
                    continue;
                }
                order.trail_active = true;
                order.trail_extreme = Some(favourable);
            } else {
                order.trail_extreme = Some(extreme);
            }
            self.ratchet(index, time_ms);
        }
    }

    fn check_trail(spec: &TrailSpec) -> Check {
        let valid = spec.value.is_finite()
            && spec.value > 0.0
            && spec
                .atr_period
                .is_none_or(|p| (1..=MAX_ATR_PERIOD).contains(&p))
            && spec
                .activation_price
                .is_none_or(|p| p.is_finite() && p > 0.0)
            && spec.step.is_none_or(|s| s.is_finite() && s >= 0.0)
            && !(spec.mode == TrailMode::Percent && spec.value >= 100.0);
        if valid {
            Ok(())
        } else {
            Err("invalid_trail")
        }
    }

    /// Open, active OCO sibling of a bracket exit.
    fn active_sibling(&self, index: usize, bar_index: usize) -> Option<usize> {
        let parent = self.orders[index].parent.as_ref()?;
        self.orders.iter().position(|order| {
            order.parent.as_ref() == Some(parent)
                && order.id != self.orders[index].id
                && order.status == OrderStatus::Open
                && order.active_from_bar <= bar_index
        })
    }

    /// Match a bracket exit together with its OCO sibling: when both trigger in one bar, the
    /// one filling at the open (a gap) happened first; otherwise `stop_first` decides.
    fn resolve_bracket(&self, index: usize, bar_index: usize, bar: &Bar) -> (usize, Match) {
        let result = match_order(&self.orders[index], bar);
        let Some(sibling) = self.active_sibling(index, bar_index) else {
            return (index, result);
        };
        let sibling_result = match_order(&self.orders[sibling], bar);
        match (result, sibling_result) {
            (Match::Fill(price, _), Match::Fill(sibling_price, _)) => {
                let at_open = price == bar.open;
                let sibling_at_open = sibling_price == bar.open;
                let preferred = if self.cfg.stop_first {
                    OrderRole::StopLoss
                } else {
                    OrderRole::TakeProfit
                };
                let this_first = match (at_open, sibling_at_open) {
                    (true, false) => true,
                    (false, true) => false,
                    _ => self.orders[index].role == preferred,
                };
                if this_first {
                    (index, result)
                } else {
                    (sibling, sibling_result)
                }
            }
            (Match::Fill(..), _) => (index, result),
            (_, Match::Fill(..)) => (sibling, sibling_result),
            _ => (index, result),
        }
    }

    fn expire_ioc(&mut self, index: usize, time_ms: i64) {
        if self.orders[index].tif == TimeInForce::Ioc && self.orders[index].is_open() {
            self.close_order(index, OrderStatus::Expired, "ioc", time_ms);
        }
    }

    /// Is `time_ms` a warm-up bar (before `start_ms`).
    pub fn is_warmup(&self, time_ms: i64) -> bool {
        self.cfg.start_ms.is_some_and(|start| time_ms < start)
    }

    /// Record the equity point of a completed bar (not for warm-up bars).
    pub fn end_bar(&mut self, time_ms: i64) {
        if self.is_warmup(time_ms) {
            return;
        }
        let point = (time_ms, self.equity());
        match self.equity_curve.last_mut() {
            Some(last) if last.0 == time_ms => *last = point,
            _ => self.equity_curve.push(point),
        }
    }

    fn push_reject(&mut self, rejection: Rejection) {
        self.events.push(Event::Reject {
            time_ms: rejection.time_ms,
            id: rejection.id.clone(),
            symbol: rejection.symbol.clone(),
            side: rejection.side,
            qty: rejection.qty,
            reason: rejection.reason.clone(),
        });
        self.rejections.push(rejection);
    }

    fn reject_request(
        &mut self,
        time_ms: i64,
        request: &OrderRequest,
        id: Option<String>,
        reason: &str,
    ) {
        self.push_reject(Rejection {
            time_ms,
            id,
            symbol: request.symbol.clone(),
            side: Some(request.side),
            qty: request.qty,
            reason: reason.to_string(),
        });
    }

    fn reject_op(&mut self, time_ms: i64, id: Option<String>, reason: &str) {
        let symbol = id
            .as_ref()
            .and_then(|id| self.orders.iter().find(|o| &o.id == id))
            .map(|o| o.symbol.clone())
            .unwrap_or_default();
        self.push_reject(Rejection {
            time_ms,
            id,
            symbol,
            side: None,
            qty: 0.0,
            reason: reason.to_string(),
        });
    }

    /// Close an order as cancelled / expired / rejected with an event.
    fn close_order(&mut self, index: usize, status: OrderStatus, reason: &str, time_ms: i64) {
        // Attached exits of an entry that never filled go with it
        if self.orders[index].role == OrderRole::Entry {
            let id = self.orders[index].id.clone();
            let children = self
                .orders
                .iter()
                .enumerate()
                .filter(|(_, o)| o.parent.as_ref() == Some(&id) && o.status == OrderStatus::Pending)
                .map(|(i, _)| i)
                .collect::<Vec<_>>();
            for child in children {
                self.close_order(child, OrderStatus::Cancelled, "parent_closed", time_ms);
            }
        }
        let order = &mut self.orders[index];
        order.status = status;
        order.reason = Some(reason.to_string());
        order.updated_ms = time_ms;
        let (id, symbol) = (order.id.clone(), order.symbol.clone());
        let reason = reason.to_string();
        match status {
            OrderStatus::Expired => self.events.push(Event::Expire {
                time_ms,
                id,
                symbol,
                reason,
            }),
            OrderStatus::Rejected => {
                let (side, qty) = (order.side, order.remaining());
                self.push_reject(Rejection {
                    time_ms,
                    id: Some(id),
                    symbol,
                    side: Some(side),
                    qty,
                    reason,
                });
            }
            _ => self.events.push(Event::Cancel {
                time_ms,
                id,
                symbol,
                reason,
            }),
        }
    }

    fn next_order_id(&mut self) -> String {
        loop {
            self.order_seq += 1;
            let id = format!("o{}", self.order_seq);
            if !self.orders.iter().any(|order| order.id == id) {
                return id;
            }
        }
    }

    fn open_order_index(&self, id: &str) -> Option<usize> {
        self.orders
            .iter()
            .position(|order| order.id == id && order.is_open())
    }

    fn meta(&self, instrument: usize) -> InstrumentMeta {
        self.cfg
            .instruments
            .get(instrument)
            .copied()
            .unwrap_or_default()
    }

    fn default_product(&self, instrument: usize) -> Product {
        self.meta(instrument).default_product()
    }

    /// Lot size and freeze quantity rules.
    fn check_qty(&self, instrument: usize, qty: f64) -> Check {
        if !qty.is_finite() || qty <= 0.0 {
            return Err("invalid_qty");
        }
        let meta = self.meta(instrument);
        if meta.lot_size.is_some_and(|lot| !is_multiple(qty, lot)) {
            return Err("invalid_lot");
        }
        if meta
            .freeze_qty
            .is_some_and(|freeze| !approx_le(qty, freeze))
        {
            return Err("above_freeze_qty");
        }
        Ok(())
    }

    /// Prices must sit on the instrument tick.
    fn check_ticks(&self, instrument: usize, prices: &[Option<f64>]) -> Check {
        match self.meta(instrument).tick_size {
            Some(tick) if prices.iter().flatten().any(|p| !is_multiple(*p, tick)) => {
                Err("invalid_tick")
            }
            _ => Ok(()),
        }
    }

    fn costs_for(
        &self,
        instrument: usize,
        side: ActionSide,
        product: Product,
        price: f64,
        qty: f64,
    ) -> CostBreakdown {
        self.cfg
            .costs
            .costs(self.meta(instrument).segment, product, side, price, qty)
    }

    /// Can `instrument` be traded `side` x `qty` at `price` given the projected portfolio.
    fn check_fill(
        &self,
        instrument: usize,
        side: ActionSide,
        product: Product,
        qty: f64,
        price: f64,
    ) -> Check {
        match side {
            ActionSide::Buy => {
                let required =
                    price * qty + self.costs_for(instrument, side, product, price, qty).total;
                if !approx_le(required, self.proj_cash) {
                    return Err("insufficient_cash");
                }
            }
            ActionSide::Sell => {
                // Cash equity can only be shorted intraday (MIS); F&O shorts are allowed
                let long = self.proj_qty[instrument];
                let short_ok = self.cfg.allow_short
                    || product == Product::MIS
                    || self.meta(instrument).segment != Segment::EquityCash;
                if !short_ok && !approx_le(qty, long) {
                    return Err("insufficient_position");
                }
            }
        }
        Ok(())
    }

    /// Validate and create a fill intent for `order` at `price`; rejects the order on failure.
    fn try_fill(
        &mut self,
        index: usize,
        price: f64,
        reason: FillReason,
        time_ms: i64,
        bar_index: usize,
    ) -> Option<FillIntent> {
        let order = &self.orders[index];
        let instrument = order.instrument?;
        let mut qty = order.remaining();
        if order.reduce_only {
            let position = self.proj_qty[instrument];
            let closable = match order.side {
                ActionSide::Buy => (-position).max(0.0),
                ActionSide::Sell => position.max(0.0),
            };
            qty = qty.min(closable);
            if qty <= EPS {
                self.close_order(index, OrderStatus::Cancelled, "position_closed", time_ms);
                return None;
            }
        }
        if let Err(reason) = self.check_fill(instrument, order.side, order.product, qty, price) {
            self.close_order(index, OrderStatus::Rejected, reason, time_ms);
            return None;
        }
        Some(self.intent(index, qty, price, reason, time_ms, bar_index))
    }

    fn intent(
        &mut self,
        order: usize,
        qty: f64,
        price: f64,
        reason: FillReason,
        time_ms: i64,
        bar_index: usize,
    ) -> FillIntent {
        let (instrument, side, product) = {
            let order = &self.orders[order];
            (
                order
                    .instrument
                    .expect("fillable orders have an instrument"),
                order.side,
                order.product,
            )
        };
        let costs = self.costs_for(instrument, side, product, price, qty);
        self.proj_cash -= side.sign() * qty * price + costs.total;
        self.proj_qty[instrument] += side.sign() * qty;

        self.fill_seq += 1;
        let intent = FillIntent {
            fill_id: format!("f{}", self.fill_seq),
            order,
            instrument,
            side,
            qty,
            price,
            reason,
            costs,
            time_ms,
            bar_index,
        };
        self.pending.insert(intent.fill_id.clone(), intent.clone());
        intent
    }

    /// Apply one decider action. Returns fills to execute now.
    pub fn apply(&mut self, bar_index: usize, time_ms: i64, action: Action) -> Vec<FillIntent> {
        self.sync_projection();
        match action {
            Action::Place(request) => self
                .place(bar_index, time_ms, request)
                .into_iter()
                .collect(),
            Action::Modify(modify) => {
                self.modify(bar_index, time_ms, modify);
                Vec::new()
            }
            Action::Cancel { id } => {
                match self.open_order_index(&id) {
                    Some(index) => self.cancel(index, "user", time_ms),
                    None => self.reject_op(time_ms, Some(id), "unknown_order"),
                }
                Vec::new()
            }
            Action::CancelAll { symbol } => {
                let targets = self
                    .orders
                    .iter()
                    .enumerate()
                    .filter(|(_, order)| {
                        order.is_open() && symbol.as_ref().is_none_or(|s| &order.symbol == s)
                    })
                    .map(|(index, _)| index)
                    .collect::<Vec<_>>();
                for index in targets {
                    if self.orders[index].is_open() {
                        self.cancel(index, "user", time_ms);
                    }
                }
                Vec::new()
            }
        }
    }

    fn cancel(&mut self, index: usize, reason: &str, time_ms: i64) {
        self.close_order(index, OrderStatus::Cancelled, reason, time_ms);
    }

    /// Validate the price fields an order kind needs.
    fn check_prices(kind: OrderType, price: Option<f64>, trigger: Option<f64>) -> Check {
        let valid = |value: Option<f64>| value.is_some_and(|v| v.is_finite() && v > 0.0);
        match kind {
            OrderType::Market => Ok(()),
            OrderType::Limit if !valid(price) => Err("invalid_price"),
            OrderType::Stop if !valid(trigger) => Err("invalid_trigger"),
            OrderType::StopLimit if !valid(trigger) => Err("invalid_trigger"),
            OrderType::StopLimit if !valid(price) => Err("invalid_price"),
            _ => Ok(()),
        }
    }

    /// Attached exits must be on the protective / profitable side of the entry reference.
    fn check_bracket(
        side: ActionSide,
        reference: f64,
        stop_loss: Option<f64>,
        take_profit: Option<f64>,
    ) -> Check {
        let valid = |v: f64| v.is_finite() && v > 0.0;
        if let Some(stop) = stop_loss {
            let protective = match side {
                ActionSide::Buy => stop < reference,
                ActionSide::Sell => stop > reference,
            };
            if !valid(stop) || !protective {
                return Err("invalid_stop_loss");
            }
        }
        if let Some(target) = take_profit {
            let profitable = match side {
                ActionSide::Buy => target > reference,
                ActionSide::Sell => target < reference,
            };
            if !valid(target) || !profitable {
                return Err("invalid_take_profit");
            }
        }
        Ok(())
    }

    /// Open or pending attached exit of `parent` with `role`.
    fn find_child(&self, parent: &str, role: OrderRole) -> Option<usize> {
        self.orders.iter().position(|order| {
            order.parent.as_deref() == Some(parent) && order.role == role && order.is_open()
        })
    }

    /// Create the stop-loss (stop) or take-profit (limit) exit of entry `parent`. It stays
    /// `pending` until the entry fills, then covers the filled quantity (reduce-only, GTC).
    fn attach_exit(
        &mut self,
        parent: usize,
        role: OrderRole,
        level: Option<f64>,
        trail: Option<TrailSpec>,
        time_ms: i64,
        bar_index: usize,
    ) -> usize {
        let entry = &self.orders[parent];
        let filled = entry.filled_qty > 0.0;
        let (kind, price, trigger, suffix) = match role {
            OrderRole::StopLoss => (OrderType::Stop, None, level, "sl"),
            _ => (OrderType::Limit, level, None, "tp"),
        };
        let child = Order {
            id: format!("{}:{suffix}", entry.id),
            instrument: entry.instrument,
            symbol: entry.symbol.clone(),
            side: entry.side.opposite(),
            kind,
            qty: if filled { entry.filled_qty } else { entry.qty },
            filled_qty: 0.0,
            filled_value: 0.0,
            price,
            trigger,
            tif: TimeInForce::Gtc,
            product: entry.product,
            tag: entry.tag.clone(),
            role,
            parent: Some(entry.id.clone()),
            status: if filled {
                OrderStatus::Open
            } else {
                OrderStatus::Pending
            },
            reason: None,
            reduce_only: true,
            stop_loss: None,
            take_profit: None,
            trail,
            trail_stop: None,
            trail_extreme: None,
            trail_active: false,
            triggered: false,
            active_from_bar: if filled { bar_index + 1 } else { usize::MAX },
            first_eval_date: None,
            created_ms: time_ms,
            updated_ms: time_ms,
        };
        self.orders.push(child);
        let index = self.orders.len() - 1;
        if filled {
            // Attached to a live position: trail from the current market
            let reference = self.orders[index]
                .instrument
                .and_then(|i| self.last_close[i])
                .unwrap_or(f64::NAN);
            self.init_trail(index, reference, time_ms);
        }
        index
    }

    /// After a fill: activate an entry's exits, cancel an exit's OCO sibling, and drop exits
    /// that no longer have a position to protect.
    fn after_fill(&mut self, order: usize, price: f64, bar_index: usize, time_ms: i64) {
        let id = self.orders[order].id.clone();
        match self.orders[order].role {
            OrderRole::Entry => {
                let filled = self.orders[order].filled_qty;
                let mut activated = Vec::new();
                for (index, child) in self.orders.iter_mut().enumerate().filter(|(_, o)| {
                    o.parent.as_ref() == Some(&id) && o.is_open() && o.role != OrderRole::Entry
                }) {
                    child.qty = filled;
                    if child.status == OrderStatus::Pending {
                        child.status = OrderStatus::Open;
                        child.active_from_bar = bar_index + 1;
                        child.updated_ms = time_ms;
                        activated.push(index);
                    }
                }
                // Trailing exits start from the entry fill price
                for index in activated {
                    self.init_trail(index, price, time_ms);
                }
            }
            OrderRole::StopLoss | OrderRole::TakeProfit => {
                let parent = self.orders[order].parent.clone();
                let siblings = self
                    .orders
                    .iter()
                    .enumerate()
                    .filter(|(i, o)| *i != order && o.parent == parent && o.is_open())
                    .map(|(i, _)| i)
                    .collect::<Vec<_>>();
                for sibling in siblings {
                    self.close_order(sibling, OrderStatus::Cancelled, "oco", time_ms);
                }
            }
            OrderRole::SquareOff => {}
        }

        let Some(instrument) = self.orders[order].instrument else {
            return;
        };
        if self.positions[instrument].qty.abs() <= EPS {
            let orphans = self
                .orders
                .iter()
                .enumerate()
                .filter(|(_, o)| {
                    o.instrument == Some(instrument)
                        && o.status == OrderStatus::Open
                        && matches!(o.role, OrderRole::StopLoss | OrderRole::TakeProfit)
                })
                .map(|(i, _)| i)
                .collect::<Vec<_>>();
            for orphan in orphans {
                self.close_order(orphan, OrderStatus::Cancelled, "position_closed", time_ms);
            }
        }
    }

    /// Accept a new order. Returns a fill intent if it executes immediately.
    pub fn place(
        &mut self,
        bar_index: usize,
        time_ms: i64,
        request: OrderRequest,
    ) -> Option<FillIntent> {
        let id = match &request.id {
            Some(id) if self.open_order_index(id).is_some() => {
                self.reject_request(time_ms, &request, Some(id.clone()), "duplicate_id");
                return None;
            }
            Some(id) => id.clone(),
            None => self.next_order_id(),
        };

        let Some(instrument) = self.instrument(&request.symbol) else {
            self.reject_request(time_ms, &request, Some(id), "unknown_symbol");
            return None;
        };
        if let Err(reason) = self.check_qty(instrument, request.qty).and_then(|()| {
            self.check_ticks(
                instrument,
                &[
                    request.price,
                    request.trigger,
                    request.stop_loss,
                    request.take_profit,
                ],
            )
        }) {
            self.reject_request(time_ms, &request, Some(id), reason);
            return None;
        }
        // A trail on a stop order without an attached stop loss trails the order itself;
        // otherwise it trails the attached stop loss.
        let own_trail = request.trail.is_some()
            && request.kind == OrderType::Stop
            && request.stop_loss.is_none();
        let trigger_check = if own_trail {
            request.trigger.or(Some(1.0))
        } else {
            request.trigger
        };
        if let Err(reason) = Self::check_prices(request.kind, request.price, trigger_check) {
            self.reject_request(time_ms, &request, Some(id), reason);
            return None;
        }
        if let Some(trail) = &request.trail {
            if let Err(reason) = Self::check_trail(trail) {
                self.reject_request(time_ms, &request, Some(id), reason);
                return None;
            }
            if request.kind == OrderType::StopLimit {
                self.reject_request(time_ms, &request, Some(id), "unsupported_trail");
                return None;
            }
        }
        if self.is_warmup(time_ms) {
            self.reject_request(time_ms, &request, Some(id), "warmup");
            return None;
        }
        if !self.market_open(time_ms) {
            self.reject_request(time_ms, &request, Some(id), "market_closed");
            return None;
        }
        let Some(close) = self.last_close[instrument] else {
            self.reject_request(time_ms, &request, Some(id), "no_price");
            return None;
        };
        let reference = request.price.or(request.trigger).unwrap_or(close);
        if let Err(reason) = Self::check_bracket(
            request.side,
            reference,
            request.stop_loss,
            request.take_profit,
        ) {
            self.reject_request(time_ms, &request, Some(id), reason);
            return None;
        }
        let (stop_loss, take_profit) = (request.stop_loss, request.take_profit);
        // Orders reducing a position default to its product, others to the instrument's
        let position = &self.positions[instrument];
        let reduces = position.qty * request.side.sign() < 0.0;
        let product = request
            .product
            .or(position.product.filter(|_| reduces))
            .unwrap_or_else(|| self.default_product(instrument));
        let past_square_off = self
            .cfg
            .session
            .as_ref()
            .is_some_and(|session| session.past_square_off(time_ms));
        if past_square_off && product == Product::MIS && !reduces {
            self.reject_request(time_ms, &request, Some(id), "after_square_off");
            return None;
        }
        let (own_trail, exit_trail) = match request.trail {
            Some(trail) if own_trail => (Some(trail), None),
            trail => (None, trail),
        };

        let order = Order {
            id,
            instrument: Some(instrument),
            symbol: request.symbol,
            side: request.side,
            kind: request.kind,
            qty: request.qty,
            filled_qty: 0.0,
            filled_value: 0.0,
            price: request.price.filter(|_| request.kind != OrderType::Market),
            trigger: request
                .trigger
                .filter(|_| matches!(request.kind, OrderType::Stop | OrderType::StopLimit)),
            tif: request.tif.unwrap_or(TimeInForce::Day),
            product,
            tag: request.tag,
            role: OrderRole::Entry,
            parent: None,
            status: OrderStatus::Open,
            reason: None,
            reduce_only: request.reduce_only,
            stop_loss,
            take_profit,
            trail: own_trail,
            trail_stop: None,
            trail_extreme: None,
            trail_active: false,
            triggered: false,
            active_from_bar: bar_index + 1,
            // With a session, a day order placed during it belongs to that session
            first_eval_date: self
                .cfg
                .session
                .as_ref()
                .map(|_| self.trading_date(time_ms)),
            created_ms: time_ms,
            updated_ms: time_ms,
        };

        self.orders.push(order);
        let index = self.orders.len() - 1;
        if own_trail.is_some() {
            self.init_trail(index, close, time_ms);
        }
        if stop_loss.is_some() || exit_trail.is_some() {
            self.attach_exit(
                index,
                OrderRole::StopLoss,
                stop_loss,
                exit_trail,
                time_ms,
                bar_index,
            );
        }
        if let Some(level) = take_profit {
            self.attach_exit(
                index,
                OrderRole::TakeProfit,
                Some(level),
                None,
                time_ms,
                bar_index,
            );
        }

        if self.cfg.next_open {
            // Everything is matched from the next bar on (market orders at its open)
            return None;
        }

        // Close fill model: execute now at the decision bar's close when possible
        let immediate = self.orders[index].marketable_at(close);

        match immediate {
            Some(reason) => self.try_fill(index, close, reason, time_ms, bar_index),
            None if self.orders[index].tif == TimeInForce::Ioc => {
                self.close_order(index, OrderStatus::Expired, "ioc", time_ms);
                None
            }
            None => {
                if self.orders[index].kind == OrderType::StopLimit
                    && within_limit(
                        self.orders[index].side.opposite(),
                        close,
                        self.orders[index].trigger.unwrap_or(f64::NAN),
                    )
                {
                    // Stop already through at the close but limit not reachable: rest as limit
                    self.orders[index].triggered = true;
                }
                None
            }
        }
    }

    fn modify(&mut self, bar_index: usize, time_ms: i64, modify: ModifyRequest) {
        let brackets = modify.stop_loss.is_some() || modify.take_profit.is_some();
        // A filled entry can still have its attached exits changed
        let index = self.open_order_index(&modify.id).or_else(|| {
            (brackets || modify.trail.is_some())
                .then(|| {
                    self.orders.iter().rposition(|o| {
                        o.id == modify.id && o.role == OrderRole::Entry && o.filled_qty > 0.0
                    })
                })
                .flatten()
        });
        let Some(index) = index else {
            self.reject_op(time_ms, Some(modify.id), "unknown_order");
            return;
        };
        let order = &self.orders[index];
        let open = order.is_open();
        let order_fields = modify.qty.is_some()
            || modify.price.is_some()
            || modify.trigger.is_some()
            || modify.tif.is_some();
        if !open && order_fields {
            self.reject_op(time_ms, Some(modify.id), "order_closed");
            return;
        }
        let qty = modify.qty.unwrap_or(order.qty);
        let price = modify.price.or(order.price);
        let trigger = modify.trigger.or(order.trigger);
        if qty < order.filled_qty - EPS {
            self.reject_op(time_ms, Some(modify.id), "invalid_qty");
            return;
        }
        if let Some(instrument) = order.instrument {
            let checks = self.check_qty(instrument, qty).and_then(|()| {
                self.check_ticks(
                    instrument,
                    &[
                        modify.price,
                        modify.trigger,
                        modify.stop_loss,
                        modify.take_profit,
                    ],
                )
            });
            if let Err(reason) = checks {
                self.reject_op(time_ms, Some(modify.id), reason);
                return;
            }
        }
        let trailing = order.trail.is_some() || modify.trail.is_some();
        let trigger_check = if trailing && order.kind == OrderType::Stop {
            trigger.or(Some(1.0))
        } else {
            trigger
        };
        if let Err(reason) = Self::check_prices(order.kind, price, trigger_check) {
            self.reject_op(time_ms, Some(modify.id), reason);
            return;
        }
        if let Some(trail) = &modify.trail {
            if let Err(reason) = Self::check_trail(trail) {
                self.reject_op(time_ms, Some(modify.id), reason);
                return;
            }
            if order.role == OrderRole::TakeProfit
                || order.role != OrderRole::Entry && order.kind != OrderType::Stop
            {
                self.reject_op(time_ms, Some(modify.id), "unsupported_trail");
                return;
            }
        }
        if brackets {
            if order.role != OrderRole::Entry {
                self.reject_op(time_ms, Some(modify.id), "not_an_entry");
                return;
            }
            let reference = if order.filled_qty > 0.0 {
                // Protective side relative to the current market once in the position
                order
                    .instrument
                    .and_then(|i| self.last_close[i])
                    .unwrap_or(order.filled_value / order.filled_qty)
            } else {
                price
                    .or(trigger)
                    .or(order.instrument.and_then(|i| self.last_close[i]))
                    .unwrap_or(f64::NAN)
            };
            if let Err(reason) =
                Self::check_bracket(order.side, reference, modify.stop_loss, modify.take_profit)
            {
                self.reject_op(time_ms, Some(modify.id), reason);
                return;
            }
        }

        for (role, level) in [
            (OrderRole::StopLoss, modify.stop_loss),
            (OrderRole::TakeProfit, modify.take_profit),
        ] {
            let Some(level) = level else {
                continue;
            };
            match self.find_child(&modify.id, role) {
                Some(child) => {
                    let child = &mut self.orders[child];
                    match role {
                        OrderRole::StopLoss => child.trigger = Some(level),
                        _ => child.price = Some(level),
                    }
                    child.updated_ms = time_ms;
                }
                None => {
                    self.attach_exit(index, role, Some(level), None, time_ms, bar_index);
                }
            }
            match role {
                OrderRole::StopLoss => self.orders[index].stop_loss = Some(level),
                _ => self.orders[index].take_profit = Some(level),
            }
        }

        if let Some(trail) = modify.trail {
            // Trail the order itself (a stop exit, or a stop entry without an attached stop
            // loss), otherwise the entry's attached stop loss
            let order = &self.orders[index];
            let own = order.is_open()
                && order.kind == OrderType::Stop
                && (order.role != OrderRole::Entry
                    || order.trail.is_some()
                    || (order.stop_loss.is_none()
                        && self.find_child(&modify.id, OrderRole::StopLoss).is_none()));
            let target = if own {
                Some(index)
            } else {
                self.find_child(&modify.id, OrderRole::StopLoss)
            };
            match target {
                Some(target) => {
                    let order = &mut self.orders[target];
                    let started = order.trail_active;
                    order.trail = Some(trail);
                    order.updated_ms = time_ms;
                    let live = order.status == OrderStatus::Open;
                    if started {
                        self.ratchet(target, time_ms);
                    } else if live {
                        let reference = order
                            .instrument
                            .and_then(|i| self.last_close[i])
                            .unwrap_or(f64::NAN);
                        self.init_trail(target, reference, time_ms);
                    }
                }
                None => {
                    self.attach_exit(
                        index,
                        OrderRole::StopLoss,
                        None,
                        Some(trail),
                        time_ms,
                        bar_index,
                    );
                }
            }
        }

        let order = &mut self.orders[index];
        if open {
            order.qty = qty;
            if order.kind != OrderType::Market {
                order.price = price.filter(|_| order.kind != OrderType::Stop);
                order.trigger = trigger.filter(|_| order.kind != OrderType::Limit);
            }
            if let Some(tif) = modify.tif {
                order.tif = tif;
            }
        }
        if let Some(tag) = modify.tag {
            order.tag = Some(tag);
        }
        order.updated_ms = time_ms;

        // Keep the entry's view of its exits in sync
        let (role, parent, level) = (
            order.role,
            order.parent.clone(),
            order.trigger.or(order.price),
        );
        if let Some(parent) = parent.and_then(|p| self.orders.iter().position(|o| o.id == p)) {
            match role {
                OrderRole::StopLoss => self.orders[parent].stop_loss = level,
                OrderRole::TakeProfit => self.orders[parent].take_profit = level,
                _ => {}
            }
        }
    }

    /// barter executed `fill_id`: apply it to the portfolio.
    pub fn confirm(&mut self, fill_id: &str) -> bool {
        let Some(intent) = self.pending.remove(fill_id) else {
            return false;
        };

        let order = &mut self.orders[intent.order];
        let product = order.product;
        order.filled_qty += intent.qty;
        order.filled_value += intent.qty * intent.price;
        order.updated_ms = intent.time_ms;
        // Reduce-only orders clamped to the position are done once filled
        if order.remaining() <= EPS * order.qty.max(1.0) || order.reduce_only {
            order.status = OrderStatus::Filled;
        }
        let tag = order.tag.clone();
        let order_id = order.id.clone();

        let delta = intent.side.sign() * intent.qty;
        self.cash -= delta * intent.price + intent.costs.total;
        let realised = self.positions[intent.instrument].apply(delta, intent.price, product);
        self.costs.add(&intent.costs);

        let fill = FillEvent {
            time_ms: intent.time_ms,
            id: order_id,
            fill_id: intent.fill_id,
            symbol: self.cfg.symbols[intent.instrument].clone(),
            side: intent.side,
            qty: intent.qty,
            price: intent.price,
            value: intent.qty * intent.price,
            costs: intent.costs,
            realised_pnl: realised,
            product,
            tag,
            reason: intent.reason,
        };
        self.fills.push(fill.clone());
        self.events.push(Event::Fill(fill));
        self.after_fill(intent.order, intent.price, intent.bar_index, intent.time_ms);
        true
    }

    /// barter refused `fill_id`.
    pub fn fail(&mut self, fill_id: &str, reason: &str) -> bool {
        let Some(intent) = self.pending.remove(fill_id) else {
            return false;
        };
        self.close_order(intent.order, OrderStatus::Rejected, reason, intent.time_ms);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn position_average_cost_and_realised_pnl() {
        let cnc = Product::CNC;
        let mut position = Position::default();
        assert_eq!(position.apply(10.0, 100.0, cnc), 0.0);
        assert_eq!(position.product, Some(cnc));
        assert_eq!(position.apply(10.0, 110.0, cnc), 0.0);
        assert_eq!(position.avg_price, 105.0);

        // Close half at 120: 10 * (120 - 105)
        assert_eq!(position.apply(-10.0, 120.0, cnc), 150.0);
        assert_eq!(position.qty, 10.0);

        // Sell 15 at 100 closes 10 (-50) and flips short 5 @ 100
        assert_eq!(position.apply(-15.0, 100.0, Product::MIS), -50.0);
        assert_eq!(position.qty, -5.0);
        assert_eq!(position.avg_price, 100.0);
        assert_eq!(position.product, Some(Product::MIS));

        // Cover the short at 90: 5 * (90 - 100) * -1
        assert_eq!(position.apply(5.0, 90.0, Product::MIS), 50.0);
        assert_eq!(position.qty, 0.0);
        assert_eq!(position.product, None);
        assert_eq!(position.realised_pnl, 150.0);
    }

    fn bar(open: f64, high: f64, low: f64, close: f64) -> Bar {
        Bar::new(0, open, high, low, close, 0.0)
    }

    fn order(side: ActionSide, kind: OrderType, price: Option<f64>, trigger: Option<f64>) -> Order {
        Order {
            id: "t".into(),
            instrument: Some(0),
            symbol: "X".into(),
            side,
            kind,
            qty: 1.0,
            filled_qty: 0.0,
            filled_value: 0.0,
            price,
            trigger,
            tif: TimeInForce::Gtc,
            product: Product::CNC,
            tag: None,
            role: OrderRole::Entry,
            parent: None,
            status: OrderStatus::Open,
            reason: None,
            reduce_only: false,
            stop_loss: None,
            take_profit: None,
            trail: None,
            trail_stop: None,
            trail_extreme: None,
            trail_active: false,
            triggered: false,
            active_from_bar: 0,
            first_eval_date: None,
            created_ms: 0,
            updated_ms: 0,
        }
    }

    #[test]
    fn matching_rules() {
        use ActionSide::{Buy, Sell};
        use OrderType::*;
        let b = bar(100.0, 105.0, 95.0, 102.0);

        // Limits: inside the range fill at the limit, gaps fill at the open
        assert_eq!(
            match_order(&order(Buy, Limit, Some(97.0), None), &b),
            Match::Fill(97.0, FillReason::Limit)
        );
        assert_eq!(
            match_order(&order(Buy, Limit, Some(101.0), None), &b),
            Match::Fill(100.0, FillReason::Limit)
        );
        assert_eq!(
            match_order(&order(Buy, Limit, Some(94.0), None), &b),
            Match::None
        );
        assert_eq!(
            match_order(&order(Sell, Limit, Some(104.0), None), &b),
            Match::Fill(104.0, FillReason::Limit)
        );
        assert_eq!(
            match_order(&order(Sell, Limit, Some(99.0), None), &b),
            Match::Fill(100.0, FillReason::Limit)
        );

        // Stops: trigger inside the range fills at the trigger, gap through fills at the open
        assert_eq!(
            match_order(&order(Buy, Stop, None, Some(103.0)), &b),
            Match::Fill(103.0, FillReason::Stop)
        );
        assert_eq!(
            match_order(&order(Buy, Stop, None, Some(99.0)), &b),
            Match::Fill(100.0, FillReason::Stop)
        );
        assert_eq!(
            match_order(&order(Sell, Stop, None, Some(96.0)), &b),
            Match::Fill(96.0, FillReason::Stop)
        );
        assert_eq!(
            match_order(&order(Sell, Stop, None, Some(101.0)), &b),
            Match::Fill(100.0, FillReason::Stop)
        );
        assert_eq!(
            match_order(&order(Sell, Stop, None, Some(94.0)), &b),
            Match::None
        );

        // Stop-limit: trigger within limit fills at trigger; gap past limit that trades back
        // fills at the limit; otherwise it rests triggered
        assert_eq!(
            match_order(&order(Buy, StopLimit, Some(104.0), Some(103.0)), &b),
            Match::Fill(103.0, FillReason::Stop)
        );
        assert_eq!(
            match_order(&order(Buy, StopLimit, Some(98.0), Some(99.0)), &b),
            Match::Fill(98.0, FillReason::Stop)
        );
        assert_eq!(
            match_order(&order(Buy, StopLimit, Some(102.0), Some(103.0)), &b),
            Match::Triggered
        );
        let gap_up = bar(110.0, 112.0, 108.0, 111.0);
        assert_eq!(
            match_order(&order(Buy, StopLimit, Some(106.0), Some(105.0)), &gap_up),
            Match::Triggered
        );
        let mut triggered = order(Buy, StopLimit, Some(106.0), Some(105.0));
        triggered.triggered = true;
        assert_eq!(
            match_order(&triggered, &bar(107.0, 108.0, 105.5, 106.0)),
            Match::Fill(106.0, FillReason::Stop)
        );
    }
}
