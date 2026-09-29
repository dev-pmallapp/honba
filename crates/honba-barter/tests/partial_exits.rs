//! J9: attached exits as lists of legs (partial exits).

mod common;

use common::*;
use honba_barter::{
    parse_actions, Action, ActionSide, BacktestConfig, Event, ExitLeg, FillReason, ModifyRequest,
    OrderRequest, OrderRole, OrderStatus, TrailMode, TrailSpec,
};

/// Long 10 @ 100 (bar 0 close) with targets 105 x 5 / 110 x rest and a stop at 95.
fn scaled_entry() -> OrderRequest {
    OrderRequest::market("SBIN", ActionSide::Buy, 10.0)
        .with_id("E")
        .stop_loss(95.0)
        .take_profit_legs(vec![ExitLeg::qty(105.0, 5.0), ExitLeg::rest(110.0)])
}

fn exit_fills(events: &[Event]) -> Vec<(String, f64, f64, FillReason)> {
    fills(events)
        .into_iter()
        .filter(|f| f.id.starts_with("E:"))
        .map(|f| (f.id.clone(), f.qty, f.price, f.reason))
        .collect()
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

fn open_qty(seen: &Seen, id: &str) -> Option<f64> {
    seen.open_orders
        .iter()
        .find(|o| o.id == id)
        .map(|o| o.qty - o.filled_qty)
}

#[test]
fn target_legs_scale_out_and_the_stop_shrinks() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: entry
        (100.0, 106.0, 99.0, 104.0),  // 1: first target
        (104.0, 111.0, 103.0, 108.0), // 2: second target
    ]);
    let (report, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [(0, vec![scaled_entry().into()])],
    );

    // Legs are separate orders with numbered ids, the stop covers the whole entry
    let legs = |i: usize| {
        let mut ids = seen[i]
            .open_orders
            .iter()
            .map(|o| (o.id.clone(), o.qty - o.filled_qty))
            .collect::<Vec<_>>();
        ids.sort_by(|a, b| a.0.cmp(&b.0));
        ids
    };
    assert_eq!(
        legs(1)[..],
        [("E:sl".to_string(), 5.0), ("E:tp2".to_string(), 5.0)]
    );
    assert_eq!(
        exit_fills(&seen[1].events),
        [("E:tp1".into(), 5.0, 105.0, FillReason::TakeProfit)]
    );
    assert_eq!(seen[1].positions["SBIN"].qty, 5.0);

    assert_eq!(
        exit_fills(&seen[2].events),
        [("E:tp2".into(), 5.0, 110.0, FillReason::TakeProfit)]
    );
    assert_eq!(cancels(&seen[2].events), [("E:sl".into(), "oco".into())]);
    assert_eq!(seen[2].positions["SBIN"].qty, 0.0);
    assert!(seen[2].open_orders.is_empty());

    let entry = report.orders.iter().find(|o| o.id == "E").unwrap();
    assert_eq!(
        (entry.stop_loss, entry.take_profit),
        (Some(95.0), Some(110.0))
    );
    let status = |id: &str| report.orders.iter().find(|o| o.id == id).unwrap().status;
    assert_eq!(status("E:tp1"), OrderStatus::Filled);
    assert_eq!(status("E:tp2"), OrderStatus::Filled);
    assert_eq!(status("E:sl"), OrderStatus::Cancelled);
}

#[test]
fn stop_takes_the_rest_after_a_target_leg() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0),
        (100.0, 106.0, 99.0, 104.0), // tp1
        (100.0, 101.0, 93.0, 94.0),  // stop for the remaining 5
    ]);
    let (_, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [(0, vec![scaled_entry().into()])],
    );
    assert_eq!(
        exit_fills(&seen[2].events),
        [("E:sl".into(), 5.0, 95.0, FillReason::StopLoss)]
    );
    assert_eq!(cancels(&seen[2].events), [("E:tp2".into(), "oco".into())]);
    assert_eq!(seen[2].positions["SBIN"].qty, 0.0);
}

#[test]
fn move_stop_to_entry_after_the_first_target() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0),
        (100.0, 106.0, 99.5, 104.0), // tp1: the stop moves to 100
        (103.0, 103.0, 99.0, 99.0),  // back through the entry: stopped at break-even
    ]);
    let (_, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [(
            0,
            vec![scaled_entry().move_sl_to_entry_after_first_tp().into()],
        )],
    );
    let update = seen[1]
        .events
        .iter()
        .find_map(|e| match e {
            Event::StopUpdate {
                id,
                old_stop,
                new_stop,
                reason,
                ..
            } => Some((id.clone(), *old_stop, *new_stop, reason.clone())),
            _ => None,
        })
        .unwrap();
    assert_eq!(
        update,
        ("E:sl".into(), Some(95.0), 100.0, "move_sl_to_entry".into())
    );
    assert_eq!(seen[1].json["events"][2]["type"], "stop_update");
    let sl = seen[1].open_orders.iter().find(|o| o.id == "E:sl").unwrap();
    assert_eq!((sl.trigger, sl.qty), (Some(100.0), 5.0));
    assert_eq!(
        exit_fills(&seen[2].events),
        [("E:sl".into(), 5.0, 100.0, FillReason::StopLoss)]
    );
}

#[test]
fn several_target_legs_fill_in_one_bar() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0),
        (101.0, 112.0, 100.5, 111.0), // through both targets
    ]);
    let (_, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [(0, vec![scaled_entry().into()])],
    );
    assert_eq!(
        exit_fills(&seen[1].events),
        [
            ("E:tp1".into(), 5.0, 105.0, FillReason::TakeProfit),
            ("E:tp2".into(), 5.0, 110.0, FillReason::TakeProfit),
        ]
    );
    assert_eq!(cancels(&seen[1].events), [("E:sl".into(), "oco".into())]);
}

fn both_sides(cfg: BacktestConfig) -> Vec<(String, f64, f64, FillReason)> {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0),
        (100.0, 106.0, 94.0, 100.0), // tp1 and the stop in one bar
    ]);
    let (_, seen) = run(cfg, "SBIN", bars, [(0, vec![scaled_entry().into()])]);
    assert_eq!(seen[1].positions["SBIN"].qty, 0.0);
    exit_fills(&seen[1].events)
}

#[test]
fn stop_and_target_legs_in_one_bar_follow_the_priority() {
    // stop first: the stop takes everything
    assert_eq!(
        both_sides(config(&["SBIN"])),
        [("E:sl".into(), 10.0, 95.0, FillReason::StopLoss)]
    );
    // target first: the first target, then the stop for the rest
    let mut target_first = config(&["SBIN"]);
    target_first.intrabar_priority = honba_barter::IntrabarPriority::TargetFirst;
    assert_eq!(
        both_sides(target_first),
        [
            ("E:tp1".into(), 5.0, 105.0, FillReason::TakeProfit),
            ("E:sl".into(), 5.0, 95.0, FillReason::StopLoss),
        ]
    );
}

#[test]
fn stop_loss_legs_and_trailing_on_the_remaining_quantity() {
    // Two stop legs, one target for everything
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0),
        (100.0, 100.0, 94.0, 96.0), // sl1 (95) only
        (96.0, 111.0, 96.0, 110.0), // the target takes the rest
    ]);
    let entry = OrderRequest::market("SBIN", ActionSide::Buy, 10.0)
        .with_id("E")
        .stop_loss_legs(vec![ExitLeg::pct(95.0, 40.0), ExitLeg::rest(90.0)])
        .take_profit(110.0);
    let (_, seen) = run(config(&["SBIN"]), "SBIN", bars, [(0, vec![entry.into()])]);
    assert_eq!(
        exit_fills(&seen[1].events),
        [("E:sl1".into(), 4.0, 95.0, FillReason::StopLoss)]
    );
    assert_eq!(open_qty(&seen[1], "E:tp"), Some(6.0));
    assert_eq!(open_qty(&seen[1], "E:sl2"), Some(6.0));
    assert_eq!(
        exit_fills(&seen[2].events),
        [("E:tp".into(), 6.0, 110.0, FillReason::TakeProfit)]
    );
    assert_eq!(cancels(&seen[2].events), [("E:sl2".into(), "oco".into())]);

    // A trailing stop covers what the target legs leave
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0),
        (100.0, 106.0, 100.0, 105.0), // tp1; the trail moves up to 106 - 2
        (105.0, 105.0, 103.0, 103.5), // trailing stop 104 hit for the rest
    ]);
    let trailing = OrderRequest::market("SBIN", ActionSide::Buy, 10.0)
        .with_id("E")
        .take_profit_legs(vec![ExitLeg::qty(105.0, 5.0), ExitLeg::rest(120.0)])
        .trail(TrailSpec {
            mode: TrailMode::Amount,
            value: 2.0,
            atr_period: None,
            activation_price: None,
            step: None,
        });
    let (_, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [(0, vec![trailing.into()])],
    );
    let sl = seen[1].open_orders.iter().find(|o| o.id == "E:sl").unwrap();
    assert_eq!((sl.qty, sl.trigger), (5.0, Some(104.0)));
    assert_eq!(
        exit_fills(&seen[2].events),
        [("E:sl".into(), 5.0, 104.0, FillReason::TrailingStop)]
    );
    assert_eq!(cancels(&seen[2].events), [("E:tp2".into(), "oco".into())]);
}

#[test]
fn leg_validation() {
    let cfg: BacktestConfig = serde_json::from_value(serde_json::json!({
        "symbols": ["FUT"],
        "initial_cash": 1.0e8,
        "instruments": {"FUT": {"segment": "equity_futures", "lot_size": 75}},
    }))
    .unwrap();
    let actions = parse_actions(
        r#"[
            {"id": "ok", "symbol": "FUT", "side": "buy", "qty": 300,
             "take_profit": [{"price": 105, "pct": 30}, {"price": 110, "qty": 75}, {"price": 120}],
             "stop_loss": 95},
            {"id": "lot", "symbol": "FUT", "side": "buy", "qty": 300,
             "take_profit": [{"price": 105, "qty": 100}]},
            {"id": "sum", "symbol": "FUT", "side": "buy", "qty": 300,
             "take_profit": [{"price": 105, "qty": 150}, {"price": 110, "qty": 225}]},
            {"id": "rest2", "symbol": "FUT", "side": "buy", "qty": 300,
             "take_profit": [{"price": 105}, {"price": 110}]},
            {"id": "side", "symbol": "FUT", "side": "buy", "qty": 300,
             "stop_loss": [{"price": 95, "qty": 75}, {"price": 101, "qty": 75}]},
            {"id": "empty", "symbol": "FUT", "side": "buy", "qty": 300, "take_profit": []},
            {"id": "tiny", "symbol": "FUT", "side": "buy", "qty": 75,
             "take_profit": [{"price": 105, "pct": 50}, {"price": 110}]},
            {"id": "trail", "symbol": "FUT", "side": "buy", "qty": 150,
             "stop_loss": [{"price": 95, "qty": 75}, {"price": 90}],
             "trail": {"mode": "amount", "value": 2}}
        ]"#,
    )
    .unwrap();
    let (_, seen) = run(cfg, "FUT", daily(&flat(2, 100.0)), [(0, actions)]);
    let rejects = seen[1]
        .events
        .iter()
        .filter_map(|e| match e {
            Event::Reject { id, reason, .. } => Some((id.clone().unwrap(), reason.clone())),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(
        rejects,
        [
            ("lot".into(), "invalid_take_profit".into()),
            ("sum".into(), "invalid_take_profit".into()),
            ("rest2".into(), "invalid_take_profit".into()),
            ("side".into(), "invalid_stop_loss".into()),
            ("empty".into(), "invalid_take_profit".into()),
            ("tiny".into(), "invalid_take_profit".into()),
            ("trail".into(), "unsupported_trail".into()),
        ]
    );
    // 30% of 300 = 90 -> one lot (75); the rest leg gets 300 - 75 - 75
    let mut legs = seen[1]
        .open_orders
        .iter()
        .filter(|o| o.parent.as_deref() == Some("ok") && o.role == OrderRole::TakeProfit)
        .map(|o| (o.id.clone(), o.qty))
        .collect::<Vec<_>>();
    legs.sort_by(|a, b| a.0.cmp(&b.0));
    assert_eq!(
        legs,
        [
            ("ok:tp1".into(), 75.0),
            ("ok:tp2".into(), 75.0),
            ("ok:tp3".into(), 150.0)
        ]
    );
}

#[test]
fn modify_moves_or_replaces_legs() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0),
        (100.0, 104.0, 99.0, 103.0), // no exit
        (103.0, 104.0, 101.0, 103.0),
        (103.0, 113.0, 102.0, 112.0), // the replacement target fills everything
    ]);
    let (report, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [
            (0, vec![scaled_entry().into()]),
            (
                1,
                vec![ModifyRequest {
                    id: "E".into(),
                    take_profit: Some(vec![ExitLeg::qty(112.0, 10.0)].into()),
                    stop_loss: Some(97.0.into()),
                    ..ModifyRequest::default()
                }
                .into()],
            ),
            // Reserved exit ids
            (
                2,
                vec![Action::from(
                    OrderRequest::market("SBIN", ActionSide::Buy, 1.0).with_id("X:tp3"),
                )],
            ),
        ],
    );
    let replaced = cancels(&seen[2].events);
    assert_eq!(
        replaced,
        [
            ("E:tp1".into(), "replaced".into()),
            ("E:tp2".into(), "replaced".into())
        ]
    );
    assert_eq!(open_qty(&seen[2], "E:tp3"), Some(10.0));
    let sl = seen[2].open_orders.iter().find(|o| o.id == "E:sl").unwrap();
    assert_eq!(sl.trigger, Some(97.0));
    assert!(seen[3].events.iter().any(
        |e| matches!(e, Event::Reject { id, reason, .. } if id.as_deref() == Some("X:tp3") && reason == "duplicate_id")
    ));
    assert_eq!(
        exit_fills(&seen[3].events),
        [("E:tp3".into(), 10.0, 112.0, FillReason::TakeProfit)]
    );
    let entry = report.orders.iter().find(|o| o.id == "E").unwrap();
    assert_eq!(
        (entry.stop_loss, entry.take_profit),
        (Some(97.0), Some(112.0))
    );
}

#[test]
fn legs_fill_on_the_entry_bar_with_attached_exit_same_bar() {
    let mut cfg = config(&["SBIN"]);
    cfg.attached_exit_same_bar = true;
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: buy limit 99
        (100.0, 102.0, 98.5, 101.0),  // 1: entry @99, first target @101 in the same bar
    ]);
    let entry = OrderRequest::market("SBIN", ActionSide::Buy, 10.0)
        .with_id("E")
        .limit(99.0)
        .stop_loss(95.0)
        .take_profit_legs(vec![ExitLeg::qty(101.0, 5.0), ExitLeg::rest(103.0)]);
    let (_, seen) = run(cfg, "SBIN", bars, [(0, vec![entry.into()])]);
    assert_eq!(
        exit_fills(&seen[1].events),
        [("E:tp1".into(), 5.0, 101.0, FillReason::TakeProfit)]
    );
    assert_eq!(seen[1].positions["SBIN"].qty, 5.0);
    assert_eq!(open_qty(&seen[1], "E:sl"), Some(5.0));
    assert_eq!(open_qty(&seen[1], "E:tp2"), Some(5.0));
}

#[test]
fn legs_follow_a_partially_filled_entry() {
    // The volume cap fills 5 per bar
    let cfg: BacktestConfig = serde_json::from_value(serde_json::json!({
        "symbols": ["SBIN"],
        "initial_cash": 100000.0,
        "slippage": {"max_volume_share": 0.005},
    }))
    .unwrap();
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: 5 of 15 at the close
        (100.0, 100.0, 100.0, 100.0), // 1: 5 more; the entry is then cancelled
        (100.0, 106.0, 100.0, 105.0), // 2: first target
    ]);
    let entry = OrderRequest::market("SBIN", ActionSide::Buy, 15.0)
        .with_id("E")
        .tif(honba_barter::TimeInForce::Gtc)
        .stop_loss(95.0)
        .take_profit_legs(vec![ExitLeg::qty(105.0, 5.0), ExitLeg::rest(110.0)]);
    let (_, seen) = run(
        cfg,
        "SBIN",
        bars,
        [(0, vec![entry.into()]), (1, vec![Action::cancel("E")])],
    );
    // 10 filled: the rest leg (planned 10) covers what the first leg leaves
    assert_eq!(seen[1].positions["SBIN"].qty, 10.0);
    assert_eq!(open_qty(&seen[1], "E:tp1"), Some(5.0));
    assert_eq!(open_qty(&seen[1], "E:tp2"), Some(5.0));
    assert_eq!(open_qty(&seen[1], "E:sl"), Some(10.0));
    assert_eq!(cancels(&seen[2].events), [("E".into(), "user".into())]);
    assert_eq!(
        exit_fills(&seen[2].events),
        [("E:tp1".into(), 5.0, 105.0, FillReason::TakeProfit)]
    );
    assert_eq!(open_qty(&seen[2], "E:sl"), Some(5.0));
    assert_eq!(open_qty(&seen[2], "E:tp2"), Some(5.0));
}
