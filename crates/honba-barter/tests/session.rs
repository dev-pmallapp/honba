mod common;

use chrono::{FixedOffset, NaiveDateTime};
use common::*;
use honba_barter::{
    run_backtest, Action, ActionSide, BacktestConfig, Bar, Event, FillReason, OrderRequest,
    OrderRole, OrderStatus, Product, TimeInForce,
};
use std::collections::BTreeMap;

fn ist(local: &str) -> i64 {
    NaiveDateTime::parse_from_str(local, "%Y-%m-%d %H:%M")
        .unwrap()
        .and_local_timezone(FixedOffset::east_opt(19_800).unwrap())
        .unwrap()
        .timestamp_millis()
}

fn bars_at(times: &[&str], price: f64) -> Vec<Bar> {
    times
        .iter()
        .map(|t| Bar::new(ist(t), price, price, price, price, 1.0))
        .collect()
}

fn session_config(extra: serde_json::Value) -> BacktestConfig {
    let mut json = serde_json::json!({
        "symbols": ["SBIN"],
        "initial_cash": 1000000.0,
        "session": {"tz": "Asia/Kolkata", "open": "09:15", "close": "15:30",
                    "mis_square_off": "15:20", "holidays": ["2025-10-21"]}
    });
    if let (Some(base), Some(extra)) = (json.as_object_mut(), extra.as_object()) {
        for (key, value) in extra {
            base.insert(key.clone(), value.clone());
        }
    }
    serde_json::from_value(json).unwrap()
}

fn rejects(events: &[Event]) -> Vec<String> {
    events
        .iter()
        .filter_map(|e| match e {
            Event::Reject { reason, .. } => Some(reason.clone()),
            _ => None,
        })
        .collect()
}

#[test]
fn closed_market_and_holidays() {
    let bars = bars_at(
        &[
            "2025-10-20 09:00", // 0: pre-open: rejected
            "2025-10-20 13:25", // 1: open, place GTC limit 90
            "2025-10-21 10:00", // 2: holiday: no matching even though low <= 90
            "2025-10-22 10:00", // 3: fills
        ],
        100.0,
    );
    let mut bars = bars;
    bars[2] = Bar::new(bars[2].time_ms, 100.0, 100.0, 80.0, 100.0, 1.0);
    bars[3] = Bar::new(bars[3].time_ms, 95.0, 95.0, 85.0, 90.0, 1.0);
    let (_, seen) = run(
        session_config(serde_json::json!({})),
        "SBIN",
        bars,
        [
            (0, vec![Action::buy("SBIN", 1.0)]),
            (
                1,
                vec![OrderRequest::market("SBIN", ActionSide::Buy, 1.0)
                    .limit(90.0)
                    .tif(TimeInForce::Gtc)
                    .into()],
            ),
            (2, vec![Action::buy("SBIN", 1.0)]),
        ],
    );

    assert!(!seen[0].json["session"]["is_open"].as_bool().unwrap());
    assert!(seen[0].json["session"]["minutes_to_close"].is_null());
    assert_eq!(rejects(&seen[1].events), ["market_closed"]);
    assert_eq!(seen[1].json["session"]["minutes_to_close"], 125);
    assert_eq!(seen[2].json["session"]["date"], "2025-10-21");
    assert!(!seen[2].json["session"]["is_open"].as_bool().unwrap());
    assert!(
        fills(&seen[2].events).is_empty(),
        "holiday bar is not matched"
    );
    assert_eq!(rejects(&seen[3].events), ["market_closed"]);
    let fill = fills(&seen[3].events)[0].clone();
    assert_eq!(fill.price, 90.0);
}

#[test]
fn day_orders_expire_at_session_close() {
    let mut bars = bars_at(
        &[
            "2025-10-20 15:15", // 0: day limit 90 (valid for this session only)
            "2025-10-20 15:30", // 1: at the close: expired
            "2025-10-22 09:15", // 2: would have filled
        ],
        100.0,
    );
    bars[2] = Bar::new(bars[2].time_ms, 89.0, 89.0, 89.0, 89.0, 1.0);
    let (report, seen) = run(
        session_config(serde_json::json!({})),
        "SBIN",
        bars,
        [(
            0,
            vec![OrderRequest::market("SBIN", ActionSide::Buy, 1.0)
                .limit(90.0)
                .with_id("D")
                .into()],
        )],
    );
    assert!(seen[1]
        .events
        .iter()
        .any(|e| matches!(e, Event::Expire { id, reason, .. } if id == "D" && reason == "day")));
    assert!(report.trades.is_empty());
}

#[test]
fn mis_square_off_and_after_square_off_entries() {
    let times = [
        "2025-10-20 10:00", // 0: MIS long with stop loss, CNC long
        "2025-10-20 15:15", // 1
        "2025-10-20 15:20", // 2: square-off at this bar's close
        "2025-10-20 15:25", // 3: new MIS entry rejected, CNC still allowed
        "2025-10-21 10:00",
    ];
    let mut bars = bars_at(&times, 100.0);
    bars[2] = Bar::new(bars[2].time_ms, 100.0, 102.0, 99.0, 101.0, 1.0);
    let mis = |qty: f64| {
        Action::from(
            OrderRequest::market("SBIN", ActionSide::Buy, qty)
                .product(Product::MIS)
                .stop_loss(90.0),
        )
    };
    let (report, seen) = run(
        session_config(serde_json::json!({})),
        "SBIN",
        bars,
        [
            (0, vec![mis(10.0)]),
            (3, vec![mis(5.0), Action::buy("SBIN", 1.0)]),
        ],
    );

    let events = &seen[2].events;
    let square = fills(events)[0].clone();
    assert_eq!(
        (square.side, square.qty, square.price, square.reason),
        (ActionSide::Sell, 10.0, 101.0, FillReason::SquareOff)
    );
    assert!(events.iter().any(
        |e| matches!(e, Event::Cancel { id, reason, .. } if id == "o1:sl" && reason == "square_off")
    ));
    assert_eq!(seen[2].positions["SBIN"].qty, 0.0);
    let order = report
        .orders
        .iter()
        .find(|o| o.role == OrderRole::SquareOff)
        .unwrap();
    assert_eq!(
        (order.status, order.product),
        (OrderStatus::Filled, Product::MIS)
    );

    // MIS square-off happens once per day; later MIS exposure is refused, CNC is fine
    assert_eq!(rejects(&seen[4].events), ["after_square_off"]);
    assert_eq!(seen[4].positions["SBIN"].qty, 1.0);
    assert_eq!(seen[4].positions["SBIN"].product, Some(Product::CNC));
}

#[test]
fn cash_equity_shorts_only_intraday() {
    let bars = bars_at(&["2025-10-20 10:00", "2025-10-20 10:15"], 100.0);
    let short = |product: Product| {
        Action::from(OrderRequest::market("SBIN", ActionSide::Sell, 5.0).product(product))
    };
    let (_, seen) = run(
        session_config(serde_json::json!({})),
        "SBIN",
        bars.clone(),
        [(0, vec![short(Product::CNC), short(Product::MIS)])],
    );
    assert_eq!(rejects(&seen[1].events), ["insufficient_position"]);
    assert_eq!(seen[1].positions["SBIN"].qty, -5.0);
    assert_eq!(seen[1].positions["SBIN"].product, Some(Product::MIS));

    // Futures can be shorted overnight (NRML)
    let cfg = session_config(serde_json::json!({
        "instruments": {"SBIN": {"segment": "equity_futures", "lot_size": 5}}
    }));
    let candles = BTreeMap::from([("SBIN".to_string(), bars)]);
    let decider = Scripted::new([(0, vec![Action::sell("SBIN", 5.0)])]);
    let report = run_backtest(cfg, candles, decider).unwrap();
    assert_eq!(report.final_positions["SBIN"], -5.0);
    assert_eq!(report.trades[0].product, Product::NRML);
}

#[test]
fn square_off_does_not_cancel_an_exit_that_is_filling() {
    let mut bars = bars_at(
        &["2025-10-20 10:00", "2025-10-20 15:20", "2025-10-20 15:25"],
        100.0,
    );
    // At the square-off bar the stop loss triggers first
    bars[1] = Bar::new(bars[1].time_ms, 100.0, 100.0, 85.0, 88.0, 1.0);
    let (report, seen) = run(
        session_config(serde_json::json!({})),
        "SBIN",
        bars,
        [(
            0,
            vec![OrderRequest::market("SBIN", ActionSide::Buy, 10.0)
                .product(Product::MIS)
                .stop_loss(90.0)
                .into()],
        )],
    );
    let terminal = |id: &str| {
        seen.iter()
            .flat_map(|s| &s.events)
            .filter(|e| match e {
                Event::Fill(f) => f.id == id,
                Event::Cancel { id: i, .. } | Event::Expire { id: i, .. } => i == id,
                Event::Reject { id: i, .. } => i.as_deref() == Some(id),
                Event::TrailUpdate { .. } => false,
            })
            .count()
    };
    assert_eq!(terminal("o1:sl"), 1);
    let sl = report.orders.iter().find(|o| o.id == "o1:sl").unwrap();
    assert_eq!(sl.status, OrderStatus::Filled);
    assert!(report
        .trades
        .iter()
        .all(|t| t.reason != FillReason::SquareOff));
    assert_eq!(report.final_positions["SBIN"], 0.0);
}
