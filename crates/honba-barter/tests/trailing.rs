mod common;

use common::*;
use honba_barter::{
    Action, ActionSide, BacktestConfig, Event, FillReason, ModifyRequest, OrderRequest,
    OrderStatus, OrderType, TimeInForce, TrailMode, TrailSpec,
};

fn trail(mode: TrailMode, value: f64) -> TrailSpec {
    TrailSpec {
        mode,
        value,
        atr_period: None,
        activation_price: None,
        step: None,
    }
}

fn entry(trail: TrailSpec) -> OrderRequest {
    OrderRequest::market("SBIN", ActionSide::Buy, 10.0)
        .with_id("E")
        .trail(trail)
}

fn trail_updates(events: &[Event]) -> Vec<(Option<f64>, f64)> {
    events
        .iter()
        .filter_map(|e| match e {
            Event::TrailUpdate {
                old_stop, new_stop, ..
            } => Some((*old_stop, *new_stop)),
            _ => None,
        })
        .collect()
}

fn assert_updates(events: &[Event], expected: &[(Option<f64>, f64)]) {
    let actual = trail_updates(events);
    assert_eq!(actual.len(), expected.len(), "{actual:?} != {expected:?}");
    for ((old, new), (old_e, new_e)) in actual.iter().zip(expected) {
        assert_eq!(old.is_some(), old_e.is_some(), "{actual:?} != {expected:?}");
        if let (Some(a), Some(b)) = (old, old_e) {
            assert_close(*a, *b);
        }
        assert_close(*new, *new_e);
    }
}

fn exit_fill(seen: &[Seen], bar: usize) -> (f64, FillReason) {
    let fills = fills(&seen[bar].events);
    let exit = fills
        .iter()
        .find(|f| f.side == ActionSide::Sell)
        .expect("exit fill");
    (exit.price, exit.reason)
}

#[test]
fn percent_trail_ratchets_up_and_never_loosens() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: entry @100 -> stop 95
        (100.0, 110.0, 99.0, 108.0),  // 1: high 110 -> stop 104.5
        (108.0, 109.0, 105.0, 106.0), // 2: lower high: stop stays 104.5
        (106.0, 107.0, 104.0, 104.0), // 3: low 104 <= 104.5 -> exit @104.5
    ]);
    let (report, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [(0, vec![entry(trail(TrailMode::Percent, 5.0)).into()])],
    );

    // Initial stop from the entry fill, then bar 1's high moves it (effective from bar 2)
    assert_updates(&seen[1].events, &[(None, 95.0), (Some(95.0), 104.5)]);
    assert_eq!(seen[1].open_orders[0].trigger, Some(104.5));
    assert_updates(&seen[2].events, &[]); // lower high: never loosens
    assert_eq!(exit_fill(&seen, 3), (104.5, FillReason::TrailingStop));

    let sl = report.orders.iter().find(|o| o.id == "E:sl").unwrap();
    assert_eq!(sl.status, OrderStatus::Filled);
    assert_eq!(sl.trail_stop, Some(104.5));
    assert_eq!(
        report.trades.last().unwrap().reason,
        FillReason::TrailingStop
    );
}

#[test]
fn amount_and_atr_trails() {
    let bars = daily(&[
        (100.0, 101.0, 99.0, 100.0),  // 0: entry @100 (ATR so far 2)
        (100.0, 106.0, 104.0, 105.0), // 1: TR = 6 (high 106 - prev close 100)
        (105.0, 107.0, 105.0, 106.0), // 2
        (106.0, 106.0, 100.0, 101.0), // 3: exits
    ]);

    // Amount: stop = highest high - 3
    let (_, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars.clone(),
        [(0, vec![entry(trail(TrailMode::Amount, 3.0)).into()])],
    );
    assert_updates(&seen[1].events, &[(None, 97.0), (Some(97.0), 103.0)]);
    assert_updates(&seen[2].events, &[(Some(103.0), 104.0)]);
    assert_eq!(exit_fill(&seen, 3), (104.0, FillReason::TrailingStop));

    // ATR(2) x 1: at entry ATR = 2 (one bar) -> 98; bar 1 TRs [2, 6] -> ATR 4 -> 106 - 4
    let mut atr = trail(TrailMode::Atr, 1.0);
    atr.atr_period = Some(2);
    let (_, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [(0, vec![entry(atr).into()])],
    );
    assert_updates(&seen[1].events, &[(None, 98.0), (Some(98.0), 102.0)]);
    // Bar 2: TRs [6, 2] -> ATR 4, high 107 -> 103
    assert_updates(&seen[2].events, &[(Some(102.0), 103.0)]);
    assert_eq!(exit_fill(&seen, 3), (103.0, FillReason::TrailingStop));
}

#[test]
fn no_same_bar_look_ahead_and_gap_through() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: entry, stop 95
        (100.0, 120.0, 110.0, 115.0), // 1: new stop 114 would be hit in this bar: not used
        (113.0, 113.0, 112.0, 112.0), // 2: opens below 114 -> gap fill @113
    ]);
    let (_, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [(0, vec![entry(trail(TrailMode::Percent, 5.0)).into()])],
    );
    // Bar 1 low 110 is below the new 114 stop, but the bar was matched against 95
    assert_eq!(
        seen[1].positions["SBIN"].qty, 10.0,
        "still long after bar 1"
    );
    assert_updates(&seen[1].events, &[(None, 95.0), (Some(95.0), 114.0)]);
    assert_eq!(exit_fill(&seen, 2), (113.0, FillReason::TrailingStop));
}

#[test]
fn trailing_stop_vs_take_profit_priority() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: entry, stop 95, target 106
        (100.0, 103.0, 100.0, 102.0), // 1: stop -> 97.85
        (102.0, 107.0, 97.0, 100.0),  // 2: both target 106 and stop 97.85 inside the bar
    ]);
    let script = || {
        [(
            0,
            vec![entry(trail(TrailMode::Percent, 5.0))
                .take_profit(106.0)
                .into()],
        )]
    };
    let (_, seen) = run(config(&["SBIN"]), "SBIN", bars.clone(), script());
    assert_eq!(exit_fill(&seen, 2), (97.85, FillReason::TrailingStop));

    let target_first: BacktestConfig = serde_json::from_value(serde_json::json!({
        "symbols": ["SBIN"], "initial_cash": 100000.0, "intrabar_priority": "target_first"
    }))
    .unwrap();
    let (_, seen) = run(target_first, "SBIN", bars, script());
    assert_eq!(exit_fill(&seen, 2), (106.0, FillReason::TakeProfit));
    assert!(seen[2]
        .events
        .iter()
        .any(|e| matches!(e, Event::Cancel { id, reason, .. } if id == "E:sl" && reason == "oco")));
}

#[test]
fn activation_price_and_step() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: entry, fixed stop 90, trail activates at 110
        (100.0, 108.0, 99.0, 107.0),  // 1: not active yet
        (107.0, 112.0, 106.0, 111.0), // 2: activates, extreme 112 -> 106.4
        (111.0, 112.5, 110.0, 112.0), // 3: candidate 106.875 < step 1 above -> unchanged
        (112.0, 114.0, 111.0, 113.0), // 4: candidate 108.3 -> moves
    ]);
    let spec = TrailSpec {
        activation_price: Some(110.0),
        step: Some(1.0),
        ..trail(TrailMode::Percent, 5.0)
    };
    let (_, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [(
            0,
            vec![OrderRequest::market("SBIN", ActionSide::Buy, 10.0)
                .with_id("E")
                .stop_loss(90.0)
                .trail(spec)
                .into()],
        )],
    );
    assert_updates(&seen[1].events, &[]);
    assert_eq!(seen[1].open_orders[0].trigger, Some(90.0));
    // Bar 2 reaches the activation price: trailing starts from its high
    assert_updates(&seen[2].events, &[(Some(90.0), 106.4)]);
    // Bar 3's candidate 106.875 improves by less than the 1.0 step
    assert_updates(&seen[3].events, &[]);
    assert_updates(&seen[4].events, &[(Some(106.4), 108.3)]);
}

#[test]
fn short_standalone_and_partial_exit() {
    // Short entry with a trailing buy stop following the lows
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: short 10 @100, stop 105
        (100.0, 101.0, 90.0, 92.0),   // 1: low 90 -> stop 94.5
        (92.0, 95.0, 91.0, 94.0),     // 2: high 95 >= 94.5 -> cover @94.5
    ]);
    let mut cfg = config(&["SBIN"]);
    cfg.allow_short = true;
    let (_, seen) = run(
        cfg,
        "SBIN",
        bars,
        [(
            0,
            vec![OrderRequest::market("SBIN", ActionSide::Sell, 10.0)
                .with_id("S")
                .trail(trail(TrailMode::Percent, 5.0))
                .into()],
        )],
    );
    assert_updates(&seen[1].events, &[(None, 105.0), (Some(105.0), 94.5)]);
    let cover = fills(&seen[2].events)[0].clone();
    assert_eq!((cover.side, cover.price), (ActionSide::Buy, 94.5));

    // Standalone trailing sell stop (no trigger given) that survives a partial manual exit
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: buy 10
        (100.0, 100.0, 100.0, 100.0), // 1: place trailing stop (2 below) -> 98; sell 4
        (100.0, 104.0, 100.0, 103.0), // 2: stop -> 102
        (103.0, 103.0, 101.0, 101.0), // 3: exit remaining 6 @102
    ]);
    let (report, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [
            (0, vec![Action::buy("SBIN", 10.0)]),
            (
                1,
                vec![
                    {
                        // Stop order without a trigger: the trail sets it
                        let mut stop = OrderRequest::market("SBIN", ActionSide::Sell, 10.0)
                            .with_id("T")
                            .trail(trail(TrailMode::Amount, 2.0))
                            .tif(TimeInForce::Gtc)
                            .reduce_only();
                        stop.kind = OrderType::Stop;
                        stop.into()
                    },
                    Action::sell("SBIN", 4.0),
                ],
            ),
        ],
    );
    assert_updates(&seen[2].events, &[(None, 98.0), (Some(98.0), 102.0)]);
    let t = report.orders.iter().find(|o| o.id == "T").unwrap();
    assert_eq!(t.status, OrderStatus::Filled);
    let exit = report.trades.iter().find(|f| f.order_id == "T").unwrap();
    assert_eq!((exit.qty, exit.price), (6.0, 102.0));
    assert_eq!(exit.reason, FillReason::TrailingStop);
    assert_eq!(report.final_positions["SBIN"], 0.0);
}

#[test]
fn modify_trail_params_and_cancel_with_position() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: entry, 10% trail -> 90
        (100.0, 110.0, 100.0, 109.0), // 1: -> 99
        (109.0, 109.0, 109.0, 109.0), // 2: tighten to 2% -> 107.8; then 20% cannot loosen
        (109.0, 109.0, 109.0, 109.0), // 3: sell everything -> stop cancelled
        (109.0, 109.0, 109.0, 109.0),
    ]);
    let tighten = ModifyRequest {
        id: "E".into(),
        trail: Some(trail(TrailMode::Percent, 2.0)),
        ..ModifyRequest::default()
    };
    let loosen = ModifyRequest {
        id: "E:sl".into(),
        trail: Some(trail(TrailMode::Percent, 20.0)),
        ..ModifyRequest::default()
    };
    let (_, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [
            (0, vec![entry(trail(TrailMode::Percent, 10.0)).into()]),
            (2, vec![tighten.into()]),
            (3, vec![loosen.into(), Action::sell("SBIN", 10.0)]),
        ],
    );
    assert_updates(&seen[1].events, &[(None, 90.0), (Some(90.0), 99.0)]);
    assert_updates(&seen[3].events, &[(Some(99.0), 107.8)]);
    let stop = seen[3].open_orders.iter().find(|o| o.id == "E:sl").unwrap();
    assert_eq!(stop.trigger, Some(107.8));
    assert!(seen[4].events.iter().any(|e| matches!(
        e,
        Event::Cancel { id, reason, .. } if id == "E:sl" && reason == "position_closed"
    )));
    assert_updates(&seen[4].events, &[]);
}
