mod common;

use common::*;
use honba_barter::{
    Action, ActionSide, BacktestConfig, Event, FillReason, ModifyRequest, OrderRequest, OrderRole,
    OrderStatus, TimeInForce,
};

fn long_bracket(qty: f64, stop: f64, target: f64) -> Action {
    OrderRequest::market("SBIN", ActionSide::Buy, qty)
        .with_id("E")
        .stop_loss(stop)
        .take_profit(target)
        .into()
}

fn cancels(events: &[Event]) -> Vec<(String, String)> {
    events
        .iter()
        .filter_map(|e| match e {
            Event::Cancel { id, reason, .. } => Some((id.clone(), reason.clone())),
            _ => None,
        })
        .collect()
}

#[test]
fn take_profit_fills_and_cancels_stop_loss() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: entry @100 close
        (100.0, 105.0, 96.0, 104.0),  // 1: inside the bracket
        (104.0, 111.0, 103.0, 108.0), // 2: target 110 hit
    ]);
    let (report, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [(0, vec![long_bracket(10.0, 95.0, 110.0)])],
    );

    let open = &seen[1].open_orders;
    assert_eq!(open.len(), 2);
    let sl = open.iter().find(|o| o.role == OrderRole::StopLoss).unwrap();
    assert_eq!(
        (sl.id.as_str(), sl.trigger, sl.qty),
        ("E:sl", Some(95.0), 10.0)
    );
    assert_eq!(sl.parent.as_deref(), Some("E"));
    assert_eq!(sl.status, OrderStatus::Open);

    let fills2 = fills(&seen[2].events);
    assert_eq!(fills2.len(), 1);
    assert_eq!(
        (fills2[0].id.as_str(), fills2[0].price, fills2[0].reason),
        ("E:tp", 110.0, FillReason::TakeProfit)
    );
    assert_eq!(cancels(&seen[2].events), [("E:sl".into(), "oco".into())]);
    assert_eq!(seen[2].positions["SBIN"].qty, 0.0);
    assert!(seen[2].open_orders.is_empty());
    let status = |id: &str| report.orders.iter().find(|o| o.id == id).unwrap().status;
    assert_eq!(status("E:tp"), OrderStatus::Filled);
    assert_eq!(status("E:sl"), OrderStatus::Cancelled);
}

#[test]
fn stop_loss_gap_fills_at_open() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0),
        (90.0, 92.0, 88.0, 91.0), // gap below the stop
    ]);
    let (_, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [(0, vec![long_bracket(10.0, 95.0, 110.0)])],
    );
    let fills1 = fills(&seen[1].events);
    let exit = fills1.iter().find(|f| f.id == "E:sl").unwrap();
    assert_eq!((exit.price, exit.reason), (90.0, FillReason::StopLoss));
}

fn conflict(cfg: BacktestConfig, bar: (f64, f64, f64, f64)) -> (f64, FillReason) {
    let bars = daily(&[(100.0, 100.0, 100.0, 100.0), bar]);
    let (_, seen) = run(
        cfg,
        "SBIN",
        bars,
        [(0, vec![long_bracket(10.0, 95.0, 110.0)])],
    );
    let fills1 = fills(&seen[1].events);
    let exits = fills1
        .iter()
        .filter(|f| f.id.starts_with("E:"))
        .collect::<Vec<_>>();
    assert_eq!(exits.len(), 1, "exactly one bracket leg fills");
    (exits[0].price, exits[0].reason)
}

#[test]
fn same_bar_stop_and_target_use_priority() {
    let both = (100.0, 111.0, 94.0, 100.0);
    assert_eq!(
        conflict(config(&["SBIN"]), both),
        (95.0, FillReason::StopLoss)
    );

    let target_first: BacktestConfig = serde_json::from_value(serde_json::json!({
        "symbols": ["SBIN"], "initial_cash": 100000.0, "same_bar_priority": "target_first"
    }))
    .unwrap();
    assert_eq!(
        conflict(target_first, both),
        (110.0, FillReason::TakeProfit)
    );

    // A gap through the target at the open happened before any intrabar stop touch
    assert_eq!(
        conflict(config(&["SBIN"]), (112.0, 113.0, 94.0, 100.0)),
        (112.0, FillReason::TakeProfit)
    );
}

#[test]
fn pending_exits_follow_their_entry() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: limit entry 98 with bracket, and a second one
        (100.0, 100.0, 99.0, 100.0),  // 1: not filled; cancel entry X
        (100.0, 100.0, 97.0, 99.0),   // 2: E fills @98; exits activate next bar
        (99.0, 99.0, 99.0, 99.0),     // 3
    ]);
    let entry = |id: &str| {
        Action::from(
            OrderRequest::market("SBIN", ActionSide::Buy, 5.0)
                .limit(98.0)
                .tif(TimeInForce::Gtc)
                .with_id(id.to_string())
                .stop_loss(90.0)
                .take_profit(120.0),
        )
    };
    let (_, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [
            (0, vec![entry("E"), entry("X")]),
            (1, vec![Action::cancel("X")]),
        ],
    );

    let pending = seen[1]
        .open_orders
        .iter()
        .filter(|o| o.status == OrderStatus::Pending)
        .count();
    assert_eq!(pending, 4);
    let cancelled = cancels(&seen[2].events);
    assert!(cancelled.contains(&("X".into(), "user".into())));
    assert!(cancelled.contains(&("X:sl".into(), "parent_closed".into())));
    assert!(cancelled.contains(&("X:tp".into(), "parent_closed".into())));

    let exits = &seen[3].open_orders;
    assert_eq!(exits.len(), 2);
    assert!(exits
        .iter()
        .all(|o| o.status == OrderStatus::Open && o.qty == 5.0));
}

#[test]
fn modify_exits_and_manual_exit_cancels_them() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: entry
        (100.0, 100.0, 100.0, 100.0), // 1: raise stop via entry id, move target via child id
        (100.0, 100.0, 97.5, 100.0),  // 2: new stop 98 hit @98
    ]);
    let (report, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [
            (0, vec![long_bracket(10.0, 95.0, 110.0)]),
            (
                1,
                vec![
                    ModifyRequest {
                        id: "E".into(),
                        stop_loss: Some(98.0),
                        ..ModifyRequest::default()
                    }
                    .into(),
                    ModifyRequest {
                        id: "E:tp".into(),
                        price: Some(105.0),
                        ..ModifyRequest::default()
                    }
                    .into(),
                ],
            ),
        ],
    );
    let exit = fills(&seen[2].events)[0].clone();
    assert_eq!((exit.id.as_str(), exit.price), ("E:sl", 98.0));
    let entry = report.orders.iter().find(|o| o.id == "E").unwrap();
    assert_eq!(
        (entry.stop_loss, entry.take_profit),
        (Some(98.0), Some(105.0))
    );

    // Manual exit closes the position: remaining exits are cancelled
    let bars = daily(&flat(3, 100.0));
    let (_, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [
            (0, vec![long_bracket(10.0, 95.0, 110.0)]),
            (1, vec![Action::sell("SBIN", 10.0)]),
        ],
    );
    let cancelled = cancels(&seen[2].events);
    assert!(cancelled.contains(&("E:sl".into(), "position_closed".into())));
    assert!(cancelled.contains(&("E:tp".into(), "position_closed".into())));
}

#[test]
fn short_bracket_and_validation() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0),
        (100.0, 100.0, 89.0, 90.0), // short target 90 hit
    ]);
    let mut cfg = config(&["SBIN"]);
    cfg.allow_short = true;
    let (_, seen) = run(
        cfg,
        "SBIN",
        bars,
        [(
            0,
            vec![
                OrderRequest::market("SBIN", ActionSide::Sell, 10.0)
                    .with_id("S")
                    .stop_loss(105.0)
                    .take_profit(90.0)
                    .into(),
                // stop above the entry for a long is not protective
                OrderRequest::market("SBIN", ActionSide::Buy, 1.0)
                    .with_id("bad")
                    .stop_loss(101.0)
                    .into(),
            ],
        )],
    );
    assert!(seen[1].events.iter().any(|e| matches!(
        e,
        Event::Reject { id: Some(id), reason, .. } if id == "bad" && reason == "invalid_stop_loss"
    )));
    let exit = fills(&seen[1].events)
        .into_iter()
        .find(|f| f.id == "S:tp")
        .unwrap()
        .clone();
    assert_eq!((exit.side, exit.price), (ActionSide::Buy, 90.0));
    assert_eq!(seen[1].positions["SBIN"].qty, 0.0);
}
