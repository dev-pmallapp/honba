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
    data::Bar,
    model::{
        Action, ActionSide, CostBreakdown, Event, FillEvent, FillReason, ModifyRequest,
        OrderRequest, OrderRole, OrderStatus, OrderType, OrderView, PositionView, Product,
        TimeInForce, TrailSpec,
    },
};
use chrono::{DateTime, FixedOffset, NaiveDate};
use std::collections::HashMap;

/// Relative tolerance for quantity / cash comparisons.
const EPS: f64 = 1e-9;

fn approx_le(a: f64, b: f64) -> bool {
    a <= b + EPS * b.abs().max(1.0)
}

/// Static configuration of a [`Book`].
#[derive(Debug, Clone)]
pub struct BookConfig {
    /// Symbol per instrument index.
    pub symbols: Vec<String>,
    pub initial_cash: f64,
    /// Flat fee as a fraction of traded value.
    pub fee_rate: f64,
    pub allow_short: bool,
    /// Exchange-local UTC offset (trading dates for `day` orders).
    pub utc_offset: FixedOffset,
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
            .map_or(Match::None, |price| Match::Fill(price, FillReason::Limit)),
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
                .map(|_| FillReason::Limit),
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
        _histories: &[&[Bar]],
    ) -> Vec<FillIntent> {
        for (close, bar) in self.last_close.iter_mut().zip(bars) {
            if let Some(bar) = bar {
                *close = Some(bar.close);
            }
        }
        self.sync_projection();
        let date = self.trading_date(time_ms);

        let mut intents = Vec::new();
        for (instrument, bar) in bars.iter().enumerate() {
            let Some(bar) = bar else {
                continue;
            };
            let candidates = self
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

            for index in candidates {
                // Expire day orders whose session has passed
                let order = &mut self.orders[index];
                if order.tif == TimeInForce::Day && order.first_eval_date.is_some_and(|d| d < date)
                {
                    self.close_order(index, OrderStatus::Expired, "day", time_ms);
                    continue;
                }
                order.first_eval_date.get_or_insert(date);

                match match_order(order, bar) {
                    Match::Fill(price, reason) => {
                        if let Some(intent) = self.try_fill(index, price, reason, time_ms) {
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
        }
        intents
    }

    fn expire_ioc(&mut self, index: usize, time_ms: i64) {
        if self.orders[index].tif == TimeInForce::Ioc && self.orders[index].is_open() {
            self.close_order(index, OrderStatus::Expired, "ioc", time_ms);
        }
    }

    /// Record the equity point of a completed bar.
    pub fn end_bar(&mut self, time_ms: i64) {
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

    fn costs_for(
        &self,
        _instrument: usize,
        _side: ActionSide,
        price: f64,
        qty: f64,
    ) -> CostBreakdown {
        CostBreakdown::flat(price * qty * self.cfg.fee_rate)
    }

    /// Can `instrument` be traded `side` x `qty` at `price` given the projected portfolio.
    fn check_fill(&self, instrument: usize, side: ActionSide, qty: f64, price: f64) -> Check {
        match side {
            ActionSide::Buy => {
                let required = price * qty + self.costs_for(instrument, side, price, qty).total;
                if !approx_le(required, self.proj_cash) {
                    return Err("insufficient_cash");
                }
            }
            ActionSide::Sell => {
                let long = self.proj_qty[instrument];
                if !self.cfg.allow_short && !approx_le(qty, long) {
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
        if let Err(reason) = self.check_fill(instrument, order.side, qty, price) {
            self.close_order(index, OrderStatus::Rejected, reason, time_ms);
            return None;
        }
        Some(self.intent(index, qty, price, reason, time_ms))
    }

    fn intent(
        &mut self,
        order: usize,
        qty: f64,
        price: f64,
        reason: FillReason,
        time_ms: i64,
    ) -> FillIntent {
        let (instrument, side) = {
            let order = &self.orders[order];
            (
                order
                    .instrument
                    .expect("fillable orders have an instrument"),
                order.side,
            )
        };
        let costs = self.costs_for(instrument, side, price, qty);
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
                self.modify(time_ms, modify);
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
        if !request.qty.is_finite() || request.qty <= 0.0 {
            self.reject_request(time_ms, &request, Some(id), "invalid_qty");
            return None;
        }
        if let Err(reason) = Self::check_prices(request.kind, request.price, request.trigger) {
            self.reject_request(time_ms, &request, Some(id), reason);
            return None;
        }
        if request.stop_loss.is_some() || request.take_profit.is_some() || request.trail.is_some() {
            self.reject_request(time_ms, &request, Some(id), "unsupported_bracket");
            return None;
        }
        let Some(close) = self.last_close[instrument] else {
            self.reject_request(time_ms, &request, Some(id), "no_price");
            return None;
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
            product: request.product.unwrap_or(Product::CNC),
            tag: request.tag,
            role: OrderRole::Entry,
            parent: None,
            status: OrderStatus::Open,
            reason: None,
            reduce_only: request.reduce_only,
            stop_loss: None,
            take_profit: None,
            trail: None,
            trail_stop: None,
            triggered: false,
            active_from_bar: bar_index + 1,
            first_eval_date: None,
            created_ms: time_ms,
            updated_ms: time_ms,
        };

        // Close fill model: execute now at the decision bar's close when possible
        let immediate = order.marketable_at(close);
        self.orders.push(order);
        let index = self.orders.len() - 1;

        match immediate {
            Some(reason) => self.try_fill(index, close, reason, time_ms),
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

    fn modify(&mut self, time_ms: i64, modify: ModifyRequest) {
        let Some(index) = self.open_order_index(&modify.id) else {
            self.reject_op(time_ms, Some(modify.id), "unknown_order");
            return;
        };
        let order = &self.orders[index];
        let qty = modify.qty.unwrap_or(order.qty);
        let price = modify.price.or(order.price);
        let trigger = modify.trigger.or(order.trigger);
        if !qty.is_finite() || qty <= 0.0 || qty < order.filled_qty - EPS {
            self.reject_op(time_ms, Some(modify.id), "invalid_qty");
            return;
        }
        if let Err(reason) = Self::check_prices(order.kind, price, trigger) {
            self.reject_op(time_ms, Some(modify.id), reason);
            return;
        }
        if modify.stop_loss.is_some() || modify.take_profit.is_some() || modify.trail.is_some() {
            self.reject_op(time_ms, Some(modify.id), "unsupported_bracket");
            return;
        }

        let order = &mut self.orders[index];
        order.qty = qty;
        if order.kind != OrderType::Market {
            order.price = price.filter(|_| order.kind != OrderType::Stop);
            order.trigger = trigger.filter(|_| order.kind != OrderType::Limit);
        }
        if let Some(tif) = modify.tif {
            order.tif = tif;
        }
        if let Some(tag) = modify.tag {
            order.tag = Some(tag);
        }
        order.updated_ms = time_ms;
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
