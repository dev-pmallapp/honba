//! honba's order book and portfolio accounting.
//!
//! barter's mock exchange only fills market orders and does not track cash correctly (see
//! [`Ledger`](crate::Ledger)), so honba keeps the portfolio (cash, positions, costs) and the
//! order lifecycle here. Every fill the book decides on is executed through barter as a market
//! order at the fill price and only applied once barter reports the trade.

use crate::{
    data::Bar,
    model::{
        Action, ActionSide, CostBreakdown, Event, FillEvent, FillReason, OrderRequest, OrderRole,
        OrderStatus, OrderType, OrderView, PositionView, Product, TimeInForce, TrailSpec,
    },
};
use std::collections::HashMap;

/// Relative tolerance for quantity / cash comparisons.
const EPS: f64 = 1e-9;

/// Static configuration of a [`Book`].
#[derive(Debug, Clone)]
pub struct BookConfig {
    /// Symbol per instrument index.
    pub symbols: Vec<String>,
    pub initial_cash: f64,
    /// Flat fee as a fraction of traded value.
    pub fee_rate: f64,
    pub allow_short: bool,
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
    pub stop_loss: Option<f64>,
    pub take_profit: Option<f64>,
    pub trail: Option<TrailSpec>,
    pub trail_stop: Option<f64>,
    pub created_bar: usize,
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

/// Outcome of validating a new order.
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

    fn sync_projection(&mut self) {
        if self.pending.is_empty() {
            self.proj_cash = self.cash;
            for (proj, position) in self.proj_qty.iter_mut().zip(&self.positions) {
                *proj = position.qty;
            }
        }
    }

    /// Start processing the bars at `time_ms` (`bars[i]` is instrument `i`'s bar, if any).
    ///
    /// Returns the fills of resting orders triggered by these bars.
    pub fn begin_bar(
        &mut self,
        _bar_index: usize,
        _time_ms: i64,
        bars: &[Option<Bar>],
        _histories: &[&[Bar]],
    ) -> Vec<FillIntent> {
        for (close, bar) in self.last_close.iter_mut().zip(bars) {
            if let Some(bar) = bar {
                *close = Some(bar.close);
            }
        }
        self.sync_projection();
        Vec::new()
    }

    /// Record the equity point of a completed bar.
    pub fn end_bar(&mut self, time_ms: i64) {
        let point = (time_ms, self.equity());
        match self.equity_curve.last_mut() {
            Some(last) if last.0 == time_ms => *last = point,
            _ => self.equity_curve.push(point),
        }
    }

    fn reject(&mut self, time_ms: i64, request: &OrderRequest, id: Option<String>, reason: &str) {
        self.rejections.push(Rejection {
            time_ms,
            id: id.clone(),
            symbol: request.symbol.clone(),
            side: Some(request.side),
            qty: request.qty,
            reason: reason.to_string(),
        });
        self.events.push(Event::Reject {
            time_ms,
            id,
            symbol: request.symbol.clone(),
            side: Some(request.side),
            qty: request.qty,
            reason: reason.to_string(),
        });
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
                if required > self.proj_cash + EPS * self.proj_cash.abs().max(1.0) {
                    return Err("insufficient_cash");
                }
            }
            ActionSide::Sell => {
                let long = self.proj_qty[instrument];
                if !self.cfg.allow_short && qty > long + EPS * long.abs().max(1.0) {
                    return Err("insufficient_position");
                }
            }
        }
        Ok(())
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

    /// Accept a new order. Returns a fill intent if it executes immediately.
    pub fn place(
        &mut self,
        bar_index: usize,
        time_ms: i64,
        request: OrderRequest,
    ) -> Option<FillIntent> {
        self.sync_projection();

        let id = match &request.id {
            Some(id) if self.orders.iter().any(|o| &o.id == id && o.is_open()) => {
                self.reject(time_ms, &request, Some(id.clone()), "duplicate_id");
                return None;
            }
            Some(id) => id.clone(),
            None => self.next_order_id(),
        };

        let Some(instrument) = self.instrument(&request.symbol) else {
            self.reject(time_ms, &request, Some(id), "unknown_symbol");
            return None;
        };
        if !request.qty.is_finite() || request.qty <= 0.0 {
            self.reject(time_ms, &request, Some(id), "invalid_qty");
            return None;
        }
        if request.kind != OrderType::Market {
            self.reject(time_ms, &request, Some(id), "unsupported_order_kind");
            return None;
        }
        if request.stop_loss.is_some() || request.take_profit.is_some() || request.trail.is_some() {
            self.reject(time_ms, &request, Some(id), "unsupported_bracket");
            return None;
        }
        let Some(price) = self.last_close[instrument] else {
            self.reject(time_ms, &request, Some(id), "no_price");
            return None;
        };
        if let Err(reason) = self.check_fill(instrument, request.side, request.qty, price) {
            self.reject(time_ms, &request, Some(id), reason);
            return None;
        }

        let order = Order {
            id,
            instrument: Some(instrument),
            symbol: request.symbol,
            side: request.side,
            kind: request.kind,
            qty: request.qty,
            filled_qty: 0.0,
            filled_value: 0.0,
            price: request.price,
            trigger: request.trigger,
            tif: request.tif.unwrap_or(TimeInForce::Day),
            product: request.product.unwrap_or(Product::CNC),
            tag: request.tag,
            role: OrderRole::Entry,
            parent: None,
            status: OrderStatus::Open,
            reason: None,
            stop_loss: None,
            take_profit: None,
            trail: None,
            trail_stop: None,
            created_bar: bar_index,
            created_ms: time_ms,
            updated_ms: time_ms,
        };
        self.orders.push(order);
        let index = self.orders.len() - 1;
        let qty = self.orders[index].qty;
        Some(self.intent(index, qty, price, FillReason::Signal, time_ms))
    }

    /// Apply one decider action. Returns fills to execute now.
    pub fn apply(&mut self, bar_index: usize, time_ms: i64, action: Action) -> Vec<FillIntent> {
        match action {
            Action::Place(request) => self
                .place(bar_index, time_ms, request)
                .into_iter()
                .collect(),
            Action::Modify(modify) => {
                self.reject_op(time_ms, Some(modify.id), "unsupported_op");
                Vec::new()
            }
            Action::Cancel { id } => {
                self.reject_op(time_ms, Some(id), "unsupported_op");
                Vec::new()
            }
            Action::CancelAll { .. } => {
                self.reject_op(time_ms, None, "unsupported_op");
                Vec::new()
            }
        }
    }

    fn reject_op(&mut self, time_ms: i64, id: Option<String>, reason: &str) {
        let symbol = id
            .as_ref()
            .and_then(|id| self.orders.iter().find(|o| &o.id == id))
            .map(|o| o.symbol.clone())
            .unwrap_or_default();
        self.rejections.push(Rejection {
            time_ms,
            id: id.clone(),
            symbol: symbol.clone(),
            side: None,
            qty: 0.0,
            reason: reason.to_string(),
        });
        self.events.push(Event::Reject {
            time_ms,
            id,
            symbol,
            side: None,
            qty: 0.0,
            reason: reason.to_string(),
        });
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
        if order.remaining() <= EPS * order.qty.max(1.0) {
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
        self.sync_projection();
        true
    }

    /// barter refused `fill_id`.
    pub fn fail(&mut self, fill_id: &str, reason: &str) -> bool {
        let Some(intent) = self.pending.remove(fill_id) else {
            return false;
        };
        let order = &mut self.orders[intent.order];
        order.status = OrderStatus::Rejected;
        order.reason = Some(reason.to_string());
        order.updated_ms = intent.time_ms;
        let rejection = Rejection {
            time_ms: intent.time_ms,
            id: Some(order.id.clone()),
            symbol: order.symbol.clone(),
            side: Some(order.side),
            qty: intent.qty,
            reason: reason.to_string(),
        };
        self.events.push(Event::Reject {
            time_ms: rejection.time_ms,
            id: rejection.id.clone(),
            symbol: rejection.symbol.clone(),
            side: rejection.side,
            qty: rejection.qty,
            reason: rejection.reason.clone(),
        });
        self.rejections.push(rejection);
        // Rebuild the projection from confirmed state plus what is still pending
        self.proj_cash = self.cash;
        for (proj, position) in self.proj_qty.iter_mut().zip(&self.positions) {
            *proj = position.qty;
        }
        for pending in self.pending.values() {
            self.proj_cash -=
                pending.side.sign() * pending.qty * pending.price + pending.costs.total;
            self.proj_qty[pending.instrument] += pending.side.sign() * pending.qty;
        }
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
}
