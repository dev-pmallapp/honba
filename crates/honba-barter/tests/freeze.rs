//! I5: freeze quantity, `freeze_policy: "split"` slices oversized orders.

mod common;

use common::*;
use honba_barter::{
    parse_actions, ActionSide, BacktestConfig, Event, FillReason, OrderRequest, OrderStatus,
};

const FUT: &str = "NIFTYFUT";

fn fut_config(policy: Option<&str>) -> BacktestConfig {
    let mut cfg = serde_json::json!({
        "symbols": [FUT],
        "initial_cash": 1.0e9,
        "costs": {"model": "india"},
        "instruments": {
            FUT: {"segment": "equity_futures", "lot_size": 75, "tick_size": 0.05,
                  "freeze_qty": 1800}
        }
    });
    if let Some(policy) = policy {
        cfg["freeze_policy"] = policy.into();
    }
    serde_json::from_value(cfg).unwrap()
}

#[test]
fn reject_stays_the_default() {
    let actions =
        parse_actions(r#"[{"id": "F", "symbol": "NIFTYFUT", "side": "buy", "qty": 1875}]"#)
            .unwrap();
    let (report, seen) = run(
        fut_config(None),
        FUT,
        daily(&flat(2, 100.0)),
        [(0, actions)],
    );
    assert!(seen[1]
        .events
        .iter()
        .any(|e| matches!(e, Event::Reject { reason, .. } if reason == "above_freeze_qty")));
    assert!(report.trades.is_empty());
}

#[test]
fn split_executes_freeze_sized_slices_of_one_order() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0),
        (100.0, 100.0, 100.0, 100.0),
        (95.0, 96.0, 89.0, 90.0), // stop loss 92 fills: the exit is sliced as well
    ]);
    let (report, seen) = run(
        fut_config(Some("split")),
        FUT,
        bars,
        [(
            0,
            vec![OrderRequest::market(FUT, ActionSide::Buy, 3975.0)
                .with_id("F")
                .stop_loss(92.0)
                .into()],
        )],
    );
    let entry = fills(&seen[1].events);
    assert_eq!(
        entry
            .iter()
            .map(|f| (f.id.as_str(), f.slice.as_deref(), f.qty, f.remaining_qty))
            .collect::<Vec<_>>(),
        [
            ("F", Some("F#1"), 1800.0, 2175.0),
            ("F", Some("F#2"), 1800.0, 375.0),
            ("F", Some("F#3"), 375.0, 0.0),
        ]
    );
    // One order in the book; every slice pays its own brokerage (min(20, 0.03%) per order)
    assert_eq!(entry[0].costs.brokerage, 20.0);
    assert_eq!(entry[1].costs.brokerage, 20.0);
    assert_close(entry[2].costs.brokerage, 375.0 * 100.0 * 0.0003);
    assert_eq!(seen[1].positions[FUT].qty, 3975.0);
    let sl = seen[1].open_orders.iter().find(|o| o.id == "F:sl").unwrap();
    assert_eq!(sl.qty, 3975.0);

    let exit = fills(&seen[2].events);
    assert_eq!(
        exit.iter()
            .map(|f| (f.slice.as_deref(), f.qty, f.reason))
            .collect::<Vec<_>>(),
        [
            (Some("F:sl#1"), 1800.0, FillReason::StopLoss),
            (Some("F:sl#2"), 1800.0, FillReason::StopLoss),
            (Some("F:sl#3"), 375.0, FillReason::StopLoss),
        ]
    );
    assert_eq!(seen[2].positions[FUT].qty, 0.0);

    let f = report.orders.iter().find(|o| o.id == "F").unwrap();
    assert_eq!((f.status, f.filled_qty), (OrderStatus::Filled, 3975.0));
    let sl = report.orders.iter().find(|o| o.id == "F:sl").unwrap();
    assert_eq!((sl.status, sl.filled_qty), (OrderStatus::Filled, 3975.0));
    assert_eq!(report.trades.len(), 6);
    assert_eq!(report.trades[0].slice.as_deref(), Some("F#1"));
    assert_eq!(report.trades[0].order_id, "F");
    assert_eq!(report.summary.num_orders, 2);
    let json: serde_json::Value = serde_json::from_str(&report.to_json().unwrap()).unwrap();
    assert_eq!(json["trades"][2]["slice"], "F#3");
    assert_eq!(json["config"]["freeze_policy"], "split");
}

#[test]
fn split_needs_at_least_one_lot_per_slice() {
    let mut cfg = fut_config(Some("split"));
    cfg.instruments.get_mut(FUT).unwrap().freeze_qty = Some(50.0);
    let actions =
        parse_actions(r#"[{"id": "F", "symbol": "NIFTYFUT", "side": "buy", "qty": 75}]"#).unwrap();
    let (_, seen) = run(cfg, FUT, daily(&flat(2, 100.0)), [(0, actions)]);
    assert!(seen[1]
        .events
        .iter()
        .any(|e| matches!(e, Event::Reject { reason, .. } if reason == "above_freeze_qty")));
}
