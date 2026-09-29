//! Decider-facing contract types: actions in, bar context / events out.
//!
//! All types serialize to the JSON shapes used by `_core.run_backtest` (see the crate docs).

use crate::data::Bar;
use serde::{de::Error as _, Deserialize, Deserializer, Serialize};
use std::collections::BTreeMap;

/// Order direction.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActionSide {
    #[serde(alias = "BUY", alias = "Buy")]
    Buy,
    #[serde(alias = "SELL", alias = "Sell")]
    Sell,
}

impl ActionSide {
    /// +1 for buys, -1 for sells.
    pub fn sign(self) -> f64 {
        match self {
            Self::Buy => 1.0,
            Self::Sell => -1.0,
        }
    }

    pub fn opposite(self) -> Self {
        match self {
            Self::Buy => Self::Sell,
            Self::Sell => Self::Buy,
        }
    }
}

impl From<ActionSide> for barter_instrument::Side {
    fn from(value: ActionSide) -> Self {
        match value {
            ActionSide::Buy => Self::Buy,
            ActionSide::Sell => Self::Sell,
        }
    }
}

/// Order type. `stop` is a stop-market (SL-M), `stop_limit` a stop-limit (SL) order.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrderType {
    #[default]
    #[serde(alias = "MARKET")]
    Market,
    #[serde(alias = "LIMIT")]
    Limit,
    #[serde(alias = "STOP", alias = "SL-M", alias = "sl-m", alias = "sl_m")]
    Stop,
    #[serde(alias = "STOP_LIMIT", alias = "SL", alias = "sl")]
    StopLimit,
}

/// Time in force. `day` orders expire at the end of the first session they could trade in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimeInForce {
    #[serde(alias = "DAY")]
    Day,
    #[serde(alias = "IOC")]
    Ioc,
    #[serde(alias = "GTC")]
    Gtc,
}

/// Indian broker product type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Product {
    #[serde(alias = "cnc")]
    CNC,
    #[serde(alias = "mis")]
    MIS,
    #[serde(alias = "nrml")]
    NRML,
    #[serde(alias = "mtf")]
    MTF,
}

/// Market segment of an instrument.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Segment {
    #[default]
    EquityCash,
    EquityFutures,
    EquityOptions,
    Commodity,
    Currency,
}

impl Segment {
    pub fn default_product(self) -> Product {
        match self {
            Self::EquityCash => Product::CNC,
            _ => Product::NRML,
        }
    }
}

/// How a trailing stop offset is measured.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrailMode {
    /// `value` percent of the extreme price.
    #[serde(alias = "pct")]
    Percent,
    /// `value` price units.
    #[serde(alias = "abs")]
    Amount,
    /// `value` x ATR(`atr_period`).
    Atr,
}

/// Trailing stop parameters.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TrailSpec {
    #[serde(alias = "type")]
    pub mode: TrailMode,
    pub value: f64,
    /// ATR lookback for `mode = "atr"` (default 14).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub atr_period: Option<usize>,
    /// Trailing starts once price trades through this level (long: high >= it).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activation_price: Option<f64>,
    /// Minimum stop improvement before the stop is moved.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub step: Option<f64>,
}

/// `{"op": "place", ...}`: submit a new order. `op` may be omitted.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OrderRequest {
    /// Client order id; generated (`o<n>`) when absent. Must be unique among open orders.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub symbol: String,
    pub side: ActionSide,
    pub qty: f64,
    #[serde(default)]
    pub kind: OrderType,
    /// Limit price (`limit`, `stop_limit`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub price: Option<f64>,
    /// Trigger price (`stop`, `stop_limit`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger: Option<f64>,
    /// Defaults to `day` (market orders fill immediately regardless).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tif: Option<TimeInForce>,
    /// Defaults to the instrument's `default_product`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub product: Option<Product>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    /// Attached protective stop, activated when this order fills (OCO with `take_profit`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_loss: Option<f64>,
    /// Attached target, activated when this order fills (OCO with `stop_loss`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub take_profit: Option<f64>,
    /// Trailing parameters: for an entry, trails the attached stop loss; for a `stop` order,
    /// trails the order's own trigger.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail: Option<TrailSpec>,
    /// Only reduce an existing position (clamped at fill time).
    #[serde(default)]
    pub reduce_only: bool,
}

impl OrderRequest {
    pub fn market(symbol: impl Into<String>, side: ActionSide, qty: f64) -> Self {
        Self {
            id: None,
            symbol: symbol.into(),
            side,
            qty,
            kind: OrderType::Market,
            price: None,
            trigger: None,
            tif: None,
            product: None,
            tag: None,
            stop_loss: None,
            take_profit: None,
            trail: None,
            reduce_only: false,
        }
    }

    pub fn with_id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    pub fn limit(mut self, price: f64) -> Self {
        self.kind = OrderType::Limit;
        self.price = Some(price);
        self
    }

    pub fn stop(mut self, trigger: f64) -> Self {
        self.kind = OrderType::Stop;
        self.trigger = Some(trigger);
        self
    }

    pub fn stop_limit(mut self, trigger: f64, price: f64) -> Self {
        self.kind = OrderType::StopLimit;
        self.trigger = Some(trigger);
        self.price = Some(price);
        self
    }

    pub fn tif(mut self, tif: TimeInForce) -> Self {
        self.tif = Some(tif);
        self
    }

    pub fn product(mut self, product: Product) -> Self {
        self.product = Some(product);
        self
    }

    pub fn tag(mut self, tag: impl Into<String>) -> Self {
        self.tag = Some(tag.into());
        self
    }

    pub fn stop_loss(mut self, price: f64) -> Self {
        self.stop_loss = Some(price);
        self
    }

    pub fn take_profit(mut self, price: f64) -> Self {
        self.take_profit = Some(price);
        self
    }

    pub fn trail(mut self, trail: TrailSpec) -> Self {
        self.trail = Some(trail);
        self
    }

    pub fn reduce_only(mut self) -> Self {
        self.reduce_only = true;
        self
    }
}

/// `{"op": "modify", "id": ...}`: change an open order (or, for an unfilled entry, its
/// attached exits). Absent fields are left unchanged.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ModifyRequest {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub qty: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub price: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tif: Option<TimeInForce>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_loss: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub take_profit: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail: Option<TrailSpec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
}

/// One instruction returned by a [`Decider`](crate::Decider).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Action {
    Place(OrderRequest),
    Modify(ModifyRequest),
    Cancel {
        id: String,
    },
    CancelAll {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        symbol: Option<String>,
    },
}

impl Action {
    /// Market buy.
    pub fn buy(symbol: impl Into<String>, qty: f64) -> Self {
        Self::Place(OrderRequest::market(symbol, ActionSide::Buy, qty))
    }

    /// Market sell.
    pub fn sell(symbol: impl Into<String>, qty: f64) -> Self {
        Self::Place(OrderRequest::market(symbol, ActionSide::Sell, qty))
    }

    pub fn cancel(id: impl Into<String>) -> Self {
        Self::Cancel { id: id.into() }
    }

    pub fn cancel_all(symbol: Option<String>) -> Self {
        Self::CancelAll { symbol }
    }
}

impl From<OrderRequest> for Action {
    fn from(value: OrderRequest) -> Self {
        Self::Place(value)
    }
}

impl From<ModifyRequest> for Action {
    fn from(value: ModifyRequest) -> Self {
        Self::Modify(value)
    }
}

impl<'de> Deserialize<'de> for Action {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let mut map = serde_json::Map::deserialize(deserializer)?;
        let op = match map.remove("op") {
            None | Some(serde_json::Value::Null) => "place".to_string(),
            Some(serde_json::Value::String(op)) => op.to_ascii_lowercase(),
            Some(other) => return Err(D::Error::custom(format!("invalid op {other}"))),
        };
        let value = serde_json::Value::Object(map);

        #[derive(Deserialize)]
        struct CancelArgs {
            id: String,
        }
        #[derive(Deserialize)]
        struct CancelAllArgs {
            #[serde(default)]
            symbol: Option<String>,
        }

        match op.as_str() {
            "place" => serde_json::from_value(value).map(Action::Place),
            "modify" => serde_json::from_value(value).map(Action::Modify),
            "cancel" => {
                serde_json::from_value::<CancelArgs>(value).map(|a| Action::Cancel { id: a.id })
            }
            "cancel_all" => serde_json::from_value::<CancelAllArgs>(value)
                .map(|a| Action::CancelAll { symbol: a.symbol }),
            other => return Err(D::Error::custom(format!("unknown op {other:?}"))),
        }
        .map_err(D::Error::custom)
    }
}

/// Parse the JSON array returned by a decider (`null` means no actions).
pub fn parse_actions(json: &str) -> Result<Vec<Action>, serde_json::Error> {
    Ok(serde_json::from_str::<Option<Vec<Action>>>(json)?.unwrap_or_default())
}

/// Per-fill transaction costs in the quote currency.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct CostBreakdown {
    pub brokerage: f64,
    pub stt: f64,
    pub exchange_fee: f64,
    pub sebi_fee: f64,
    pub stamp_duty: f64,
    pub gst: f64,
    pub dp: f64,
    pub total: f64,
}

impl CostBreakdown {
    /// Flat fee booked as brokerage.
    pub fn flat(fee: f64) -> Self {
        Self {
            brokerage: fee,
            total: fee,
            ..Self::default()
        }
    }

    pub fn add(&mut self, other: &Self) {
        self.brokerage += other.brokerage;
        self.stt += other.stt;
        self.exchange_fee += other.exchange_fee;
        self.sebi_fee += other.sebi_fee;
        self.stamp_duty += other.stamp_duty;
        self.gst += other.gst;
        self.dp += other.dp;
        self.total += other.total;
    }
}

/// Position as seen by the decider.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct PositionView {
    /// Signed quantity: positive long, negative short.
    pub qty: f64,
    /// Average entry price of the open quantity (0 when flat).
    pub avg_price: f64,
    /// Product of the open position (`null` when flat).
    pub product: Option<Product>,
    /// Realised PnL (gross of costs) accumulated in this symbol.
    pub realised_pnl: f64,
    /// Open quantity marked at the latest close.
    pub unrealised_pnl: f64,
    /// `realised_pnl + unrealised_pnl`.
    pub pnl: f64,
}

/// Why a fill happened.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FillReason {
    /// Market order.
    Signal,
    Limit,
    Stop,
    StopLoss,
    TakeProfit,
    TrailingStop,
    SquareOff,
    /// `liquidate_at_end` exit at the final bar's close.
    LiquidateEnd,
}

/// A fill.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FillEvent {
    pub time_ms: i64,
    /// Order id.
    pub id: String,
    pub fill_id: String,
    pub symbol: String,
    pub side: ActionSide,
    pub qty: f64,
    pub price: f64,
    pub value: f64,
    pub costs: CostBreakdown,
    /// Realised PnL (gross of costs) of any quantity this fill closed.
    pub realised_pnl: f64,
    pub product: Product,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    pub reason: FillReason,
    /// Quantity of the order still working after this fill (0 when the order is done).
    #[serde(default)]
    pub remaining_qty: f64,
    /// Freeze-quantity slice (`<id>#<n>`) when the order was split (`freeze_policy: split`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slice: Option<String>,
}

/// Something that happened to an order since the previous `on_bar`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    Fill(FillEvent),
    Cancel {
        time_ms: i64,
        id: String,
        symbol: String,
        reason: String,
    },
    Expire {
        time_ms: i64,
        id: String,
        symbol: String,
        reason: String,
    },
    Reject {
        time_ms: i64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        symbol: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        side: Option<ActionSide>,
        qty: f64,
        reason: String,
    },
    TrailUpdate {
        time_ms: i64,
        id: String,
        symbol: String,
        old_stop: Option<f64>,
        new_stop: f64,
    },
}

/// Session state at the bar (only meaningful when a `session` is configured).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionView {
    pub is_open: bool,
    /// Exchange-local trading date (`YYYY-MM-DD`).
    pub date: String,
    /// Minutes until session close, `null` without a session config or when closed.
    pub minutes_to_close: Option<i64>,
}

/// Status of an order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrderStatus {
    /// Accepted, waiting to trigger / fill.
    Open,
    /// Attached exit waiting for its entry to fill.
    Pending,
    /// Open with part of its quantity filled (reported only; internally still open).
    PartiallyFilled,
    Filled,
    Cancelled,
    Expired,
    Rejected,
}

/// Role of an order relative to a bracket.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrderRole {
    Entry,
    StopLoss,
    TakeProfit,
    SquareOff,
    /// `liquidate_at_end` exit.
    Liquidation,
}

/// An order as exposed in `open_orders` and the report's `orders`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OrderView {
    pub id: String,
    pub symbol: String,
    pub side: ActionSide,
    pub kind: OrderType,
    pub qty: f64,
    pub filled_qty: f64,
    pub avg_fill_price: Option<f64>,
    pub price: Option<f64>,
    pub trigger: Option<f64>,
    pub tif: TimeInForce,
    pub product: Product,
    pub tag: Option<String>,
    pub role: OrderRole,
    pub parent: Option<String>,
    pub status: OrderStatus,
    /// Why the order was cancelled / expired / rejected.
    pub reason: Option<String>,
    pub stop_loss: Option<f64>,
    pub take_profit: Option<f64>,
    pub trail: Option<TrailSpec>,
    /// Current (open) or final (closed) trailing stop level.
    pub trail_stop: Option<f64>,
    pub created_ms: i64,
    pub updated_ms: i64,
}

/// Snapshot handed to a [`Decider`](crate::Decider) once every bar with timestamp `time_ms`
/// has been processed (resting orders already matched against those bars).
#[derive(Debug, Clone)]
pub struct BarContext<'a> {
    /// Bar timestamp (epoch ms).
    pub time_ms: i64,
    /// Latest bar of every symbol that has received at least one bar (may be older than
    /// `time_ms` if a symbol has no bar at this timestamp).
    pub candles: BTreeMap<String, Bar>,
    /// Full bar history per symbol, oldest first, up to and including `time_ms`.
    pub history: BTreeMap<String, &'a [Bar]>,
    /// Position per symbol (every configured symbol is present).
    pub positions: BTreeMap<String, PositionView>,
    /// Open and pending (attached, waiting for entry) orders.
    pub open_orders: Vec<OrderView>,
    /// Fills, cancels, expiries, rejects and trail updates since the previous `on_bar`.
    pub events: Vec<Event>,
    pub session: SessionView,
    /// True while `time_ms < start_ms` (orders are rejected with `warmup`).
    pub warmup: bool,
    /// Available cash in the quote currency.
    pub cash: f64,
    /// Cash plus positions marked at their latest close.
    pub equity: f64,
}

impl BarContext<'_> {
    /// Signed position quantity of `symbol` (0 when unknown).
    pub fn qty(&self, symbol: &str) -> f64 {
        self.positions
            .get(symbol)
            .map(|p| p.qty)
            .unwrap_or_default()
    }
}

/// JSON payload of a [`BarContext`] (everything except `history`).
#[derive(Debug, Clone, Serialize)]
pub struct BarContextPayload<'a> {
    pub time_ms: i64,
    pub candles: BTreeMap<&'a str, CandlePayload>,
    pub positions: &'a BTreeMap<String, PositionView>,
    pub open_orders: &'a [OrderView],
    pub events: &'a [Event],
    pub session: &'a SessionView,
    pub warmup: bool,
    pub cash: f64,
    pub equity: f64,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct CandlePayload {
    pub time_ms: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

impl<'a> BarContext<'a> {
    pub fn payload(&'a self) -> BarContextPayload<'a> {
        BarContextPayload {
            time_ms: self.time_ms,
            candles: self
                .candles
                .iter()
                .map(|(symbol, bar)| {
                    (
                        symbol.as_str(),
                        CandlePayload {
                            time_ms: bar.time_ms,
                            open: bar.open,
                            high: bar.high,
                            low: bar.low,
                            close: bar.close,
                            volume: bar.volume,
                        },
                    )
                })
                .collect(),
            positions: &self.positions,
            open_orders: &self.open_orders,
            events: &self.events,
            session: &self.session,
            warmup: self.warmup,
            cash: self.cash,
            equity: self.equity,
        }
    }

    /// The context as the JSON object passed to Python `on_bar`.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(&self.payload())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_actions_defaults_and_ops() {
        let actions = parse_actions(
            r#"[
                {"symbol": "SBIN", "side": "buy", "qty": 10, "unknown_key": 1},
                {"op": "place", "id": "e1", "symbol": "SBIN", "side": "SELL", "qty": 5,
                 "kind": "stop_limit", "trigger": 99.5, "price": 99.0, "tif": "gtc",
                 "product": "MIS", "tag": "x", "stop_loss": 101.0,
                 "trail": {"mode": "percent", "value": 1.5}},
                {"op": "modify", "id": "e1", "price": 98.5},
                {"op": "cancel", "id": "e1"},
                {"op": "cancel_all"},
                {"op": "cancel_all", "symbol": "SBIN"}
            ]"#,
        )
        .unwrap();

        assert_eq!(actions[0], Action::buy("SBIN", 10.0));
        let Action::Place(order) = &actions[1] else {
            panic!("expected place")
        };
        assert_eq!(order.kind, OrderType::StopLimit);
        assert_eq!(order.product, Some(Product::MIS));
        assert_eq!(order.tif, Some(TimeInForce::Gtc));
        assert_eq!(order.trail.unwrap().mode, TrailMode::Percent);
        assert!(matches!(&actions[2], Action::Modify(m) if m.price == Some(98.5)));
        assert_eq!(actions[3], Action::cancel("e1"));
        assert_eq!(actions[4], Action::cancel_all(None));
        assert_eq!(actions[5], Action::cancel_all(Some("SBIN".into())));

        assert!(parse_actions("null").unwrap().is_empty());
        assert!(parse_actions(r#"[{"op": "explode"}]"#).is_err());
        assert!(parse_actions(r#"[{"symbol": "SBIN", "side": "hold", "qty": 1}]"#).is_err());
    }

    #[test]
    fn action_serializes_with_op_tag() {
        let json = serde_json::to_value(Action::buy("SBIN", 1.0)).unwrap();
        assert_eq!(json["op"], "place");
        assert_eq!(json["kind"], "market");
        let back: Action = serde_json::from_value(json).unwrap();
        assert_eq!(back, Action::buy("SBIN", 1.0));
    }
}
