//! I9: slippage on market-like fills and the bar-volume participation cap (partial fills).

mod common;

use common::*;
use honba_barter::{
    Action, ActionSide, BacktestConfig, Event, FillReason, OrderRequest, OrderStatus, TimeInForce,
};

fn slip_config(slippage: serde_json::Value) -> BacktestConfig {
    serde_json::from_value(serde_json::json!({
        "symbols": ["SBIN"],
        "initial_cash": 1000000.0,
        "allow_short": true,
        "instruments": {"SBIN": {"tick_size": 0.05}},
        "slippage": slippage,
    }))
    .unwrap()
}

#[test]
fn fixed_bps_moves_market_and_stop_fills_against_the_order() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: market buy @close, stop sell 95, limit sell 105
        (100.0, 106.0, 94.0, 100.0),  // 1: limit and stop both fill
        (100.0, 100.0, 100.0, 100.0), // 2: market sell @close
    ]);
    let (report, seen) = run(
        slip_config(serde_json::json!({"model": "bps", "bps": 7.0})),
        "SBIN",
        bars,
        [
            (
                0,
                vec![
                    Action::buy("SBIN", 10.0),
                    OrderRequest::market("SBIN", ActionSide::Sell, 5.0)
                        .with_id("S")
                        .stop(95.0)
                        .into(),
                    OrderRequest::market("SBIN", ActionSide::Sell, 5.0)
                        .with_id("L")
                        .limit(105.0)
                        .into(),
                ],
            ),
            (2, vec![Action::buy("SBIN", 1.0)]),
        ],
    );
    let bar1 = fills(&seen[1].events);
    let entry = bar1.iter().find(|f| f.side == ActionSide::Buy).unwrap();
    // 100 x (1 + 7bps) = 100.07, rounded up to the tick
    assert_close(entry.price, 100.10);

    let stop = bar1.iter().find(|f| f.id == "S").unwrap();
    // 95 x (1 - 7bps) = 94.9335, rounded down to the tick
    assert_eq!((stop.reason, stop.price), (FillReason::Stop, 94.90));
    let limit = bar1.iter().find(|f| f.id == "L").unwrap();
    assert_close(limit.price, 105.0);

    let last = report.trades.last().unwrap();
    assert_close(last.price, 100.10);
    assert_eq!(report.config.slippage.unwrap().bps, 7.0);
}

#[test]
fn volume_share_model_scales_with_participation() {
    // bars trade 1000; 100 shares = 10% -> 5 + 50 x 0.1 = 10 bps
    let bars = daily(&flat(2, 100.0));
    let (_, seen) = run(
        slip_config(serde_json::json!({"model": "volume_share", "bps": 5.0, "impact_bps": 50.0})),
        "SBIN",
        bars,
        [(0, vec![Action::sell("SBIN", 100.0)])],
    );
    assert_close(fills(&seen[1].events)[0].price, 99.90);
}

#[test]
fn volume_cap_partially_fills_and_keeps_the_rest_working() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0),
        (101.0, 101.0, 101.0, 101.0),
        (102.0, 102.0, 102.0, 102.0),
        (103.0, 103.0, 103.0, 103.0),
    ]);
    let (report, seen) = run(
        slip_config(serde_json::json!({"max_volume_share": 0.1})),
        "SBIN",
        bars,
        [(
            0,
            vec![
                // GTC: a day order's remainder would expire with its session (bar 1)
                Action::from(
                    OrderRequest::market("SBIN", ActionSide::Buy, 250.0)
                        .with_id("B")
                        .tif(TimeInForce::Gtc),
                ),
                // Shares bar 0's volume: the cap is per symbol and bar
                Action::from(OrderRequest::market("SBIN", ActionSide::Buy, 10.0).with_id("C")),
            ],
        )],
    );

    // Bar 0 close: B gets 100 (C nothing, same bar); bar 1 open: B's next 100 (C none)
    let first = fills(&seen[1].events);
    assert_eq!(
        first
            .iter()
            .map(|f| (f.id.as_str(), f.qty, f.price, f.remaining_qty))
            .collect::<Vec<_>>(),
        [("B", 100.0, 100.0, 150.0), ("B", 100.0, 101.0, 50.0)]
    );
    let working = seen[1].open_orders.iter().find(|o| o.id == "B").unwrap();
    assert_eq!(working.status, OrderStatus::PartiallyFilled);
    assert_eq!((working.qty, working.filled_qty), (250.0, 200.0));
    assert_eq!(seen[1].json["open_orders"][0]["status"], "partially_filled");
    // C got nothing yet and keeps working
    let c = seen[1].open_orders.iter().find(|o| o.id == "C").unwrap();
    assert_eq!(c.status, OrderStatus::Open);

    // Bar 2: B's last 50, then C's 10
    let bar2 = fills(&seen[2].events);
    assert_eq!(
        bar2.iter()
            .map(|f| (f.id.as_str(), f.qty, f.remaining_qty))
            .collect::<Vec<_>>(),
        [("B", 50.0, 0.0), ("C", 10.0, 0.0)]
    );
    assert_eq!(seen[2].positions["SBIN"].qty, 260.0);
    let b = report.orders.iter().find(|o| o.id == "B").unwrap();
    assert_eq!(b.status, OrderStatus::Filled);
    assert_close(
        b.avg_fill_price.unwrap(),
        (100.0 * 100.0 + 101.0 * 100.0 + 102.0 * 50.0) / 250.0,
    );
}

#[test]
fn volume_capped_ioc_remainder_expires_and_lots_are_respected() {
    let cfg: BacktestConfig = serde_json::from_value(serde_json::json!({
        "symbols": ["FUT"],
        "initial_cash": 10000000.0,
        "instruments": {"FUT": {"segment": "equity_futures", "lot_size": 75}},
        "slippage": {"max_volume_share": 0.2},
    }))
    .unwrap();
    // 20% of 1000 = 200 -> 150 (two lots)
    let bars = daily(&flat(3, 100.0));
    let (report, seen) = run(
        cfg,
        "FUT",
        bars,
        [(
            0,
            vec![OrderRequest::market("FUT", ActionSide::Buy, 300.0)
                .with_id("I")
                .tif(TimeInForce::Ioc)
                .into()],
        )],
    );
    let events = &seen[1].events;
    assert_eq!(fills(events)[0].qty, 150.0);
    assert!(events
        .iter()
        .any(|e| matches!(e, Event::Expire { id, reason, .. } if id == "I" && reason == "ioc")));
    let order = report.orders.iter().find(|o| o.id == "I").unwrap();
    assert_eq!(
        (order.status, order.filled_qty),
        (OrderStatus::Expired, 150.0)
    );
}

#[test]
fn volume_capped_stop_loss_keeps_protecting_the_rest() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: buy 150 with stop 95
        (100.0, 100.0, 100.0, 100.0), // 1: entry's remaining 50 fill
        (96.0, 96.0, 94.0, 94.0),     // 2: stop triggers: 100 of 150 exit
        (97.0, 97.0, 97.0, 97.0),     // 3: back above the stop: the rest still exits (at open)
    ]);
    let (_, seen) = run(
        slip_config(serde_json::json!({"max_volume_share": 0.1})),
        "SBIN",
        bars,
        [(
            0,
            vec![OrderRequest::market("SBIN", ActionSide::Buy, 150.0)
                .with_id("E")
                .stop_loss(95.0)
                .into()],
        )],
    );
    assert_eq!(seen[1].positions["SBIN"].qty, 150.0);
    let stop = fills(&seen[2].events);
    assert_eq!(
        stop.iter()
            .map(|f| (f.id.as_str(), f.qty, f.price))
            .collect::<Vec<_>>(),
        [("E:sl", 100.0, 95.0)]
    );
    let rest = fills(&seen[3].events);
    assert_eq!(
        rest.iter()
            .map(|f| (f.id.as_str(), f.qty, f.price, f.reason))
            .collect::<Vec<_>>(),
        [("E:sl", 50.0, 97.0, FillReason::StopLoss)]
    );
    assert_eq!(seen[3].positions["SBIN"].qty, 0.0);
}

#[test]
fn invalid_slippage_is_a_config_error() {
    for slippage in [
        serde_json::json!({"bps": -1.0}),
        serde_json::json!({"max_volume_share": 0.0}),
        serde_json::json!({"max_volume_share": 1.5}),
    ] {
        let cfg = slip_config(slippage);
        let candles =
            std::collections::BTreeMap::from([("SBIN".to_string(), daily(&flat(2, 100.0)))]);
        let result = honba_barter::run_backtest(cfg, candles, Scripted::new([]));
        assert!(result.is_err());
    }
}

#[test]
fn day_market_remainder_expires_with_its_session() {
    let bars = daily(&flat(4, 100.0));
    let (report, seen) = run(
        slip_config(serde_json::json!({"max_volume_share": 0.1})),
        "SBIN",
        bars,
        [(
            0,
            vec![Action::from(
                OrderRequest::market("SBIN", ActionSide::Buy, 250.0).with_id("D"),
            )],
        )],
    );
    // bar 0 close + bar 1 (its session on daily bars), then expired
    assert_eq!(seen[1].positions["SBIN"].qty, 200.0);
    assert!(seen[2]
        .events
        .iter()
        .any(|e| matches!(e, Event::Expire { id, reason, .. } if id == "D" && reason == "day")));
    let order = report.orders.iter().find(|o| o.id == "D").unwrap();
    assert_eq!(
        (order.status, order.filled_qty),
        (OrderStatus::Expired, 200.0)
    );
}
