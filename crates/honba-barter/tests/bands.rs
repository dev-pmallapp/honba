//! I6: price bands (circuit limits) from the previous session's close.

mod common;

use common::*;
use honba_barter::{
    Action, ActionSide, BacktestConfig, Event, FillReason, ModifyRequest, OrderRequest,
    OrderStatus, TimeInForce,
};

fn band_config() -> BacktestConfig {
    serde_json::from_value(serde_json::json!({
        "symbols": ["SBIN"],
        "initial_cash": 1000000.0,
        "instruments": {"SBIN": {"tick_size": 0.05, "price_band_pct": 10.0}},
    }))
    .unwrap()
}

fn rejects(events: &[Event]) -> Vec<(String, String)> {
    events
        .iter()
        .filter_map(|e| match e {
            Event::Reject { id, reason, .. } => {
                Some((id.clone().unwrap_or_default(), reason.clone()))
            }
            _ => None,
        })
        .collect()
}

fn limit(id: &str, side: ActionSide, price: f64) -> Action {
    OrderRequest::market("SBIN", side, 1.0)
        .with_id(id)
        .limit(price)
        .tif(TimeInForce::Gtc)
        .into()
}

#[test]
fn orders_outside_the_band_are_rejected() {
    let bars = daily(&flat(4, 100.0));
    let (_, seen) = run(
        band_config(),
        "SBIN",
        bars,
        [
            // Bar 0 has no previous close: no band yet
            (0, vec![limit("first", ActionSide::Buy, 50.0)]),
            (
                1,
                vec![
                    limit("hi", ActionSide::Sell, 110.05),
                    limit("lo", ActionSide::Buy, 89.95),
                    limit("edge", ActionSide::Sell, 110.0),
                    OrderRequest::market("SBIN", ActionSide::Buy, 1.0)
                        .with_id("stop")
                        .stop(111.0)
                        .into(),
                    // Attached exits are not band-checked
                    OrderRequest::market("SBIN", ActionSide::Buy, 1.0)
                        .with_id("br")
                        .stop_loss(80.0)
                        .into(),
                ],
            ),
            (
                2,
                vec![
                    ModifyRequest {
                        id: "edge".into(),
                        price: Some(111.0),
                        ..ModifyRequest::default()
                    }
                    .into(),
                    ModifyRequest {
                        id: "first".into(),
                        price: Some(95.0),
                        ..ModifyRequest::default()
                    }
                    .into(),
                ],
            ),
        ],
    );
    assert!(rejects(&seen[1].events).is_empty());
    assert_eq!(
        rejects(&seen[2].events),
        [
            ("hi".into(), "outside_price_band".into()),
            ("lo".into(), "outside_price_band".into()),
            ("stop".into(), "outside_price_band".into()),
        ]
    );
    assert_eq!(
        rejects(&seen[3].events),
        [("edge".into(), "outside_price_band".into())]
    );
    assert!(seen[3]
        .open_orders
        .iter()
        .any(|o| o.id == "first" && o.price == Some(95.0)));
    assert_eq!(seen[2].positions["SBIN"].qty, 1.0);
}

#[test]
fn upper_circuit_blocks_buys_until_it_opens() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: resting buy stop 105
        (110.0, 110.0, 110.0, 110.0), // 1: locked at the upper band (100 + 10%)
        (112.0, 115.0, 111.0, 114.0), // 2: trades freely again
    ]);
    let (report, seen) = run(
        band_config(),
        "SBIN",
        bars,
        [
            (
                0,
                vec![OrderRequest::market("SBIN", ActionSide::Buy, 1.0)
                    .with_id("S")
                    .stop(105.0)
                    .tif(TimeInForce::Gtc)
                    .into()],
            ),
            // Market buy at the locked close: rests and fills at the next open
            (
                1,
                vec![Action::from(
                    OrderRequest::market("SBIN", ActionSide::Buy, 2.0).with_id("M"),
                )],
            ),
        ],
    );
    assert!(fills(&seen[1].events).is_empty());
    assert_eq!(seen[1].positions["SBIN"].qty, 0.0);
    let bar2 = fills(&seen[2].events);
    let m = bar2.iter().find(|f| f.id == "M").unwrap();
    assert_eq!((m.qty, m.price, m.reason), (2.0, 112.0, FillReason::Signal));
    // The stop triggered into the locked bar and executes at the next open
    let stop = bar2.iter().find(|f| f.id == "S").unwrap();
    assert_eq!((stop.price, stop.reason), (112.0, FillReason::Stop));
    let s = report.orders.iter().find(|o| o.id == "S").unwrap();
    assert_eq!(s.status, OrderStatus::Filled);
}

#[test]
fn lower_circuit_traps_a_stop_loss_until_the_next_open() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: long 10 with stop 95
        (90.0, 90.0, 90.0, 90.0),     // 1: locked at the lower band: no buyers
        (88.0, 92.0, 85.0, 91.0),     // 2: stop (triggered) executes at the open
    ]);
    let (_, seen) = run(
        band_config(),
        "SBIN",
        bars,
        [(
            0,
            vec![OrderRequest::market("SBIN", ActionSide::Buy, 10.0)
                .with_id("E")
                .stop_loss(95.0)
                .into()],
        )],
    );
    assert_eq!(seen[1].positions["SBIN"].qty, 10.0);
    let exit = fills(&seen[2].events);
    assert_eq!(
        exit.iter()
            .map(|f| (f.id.as_str(), f.price, f.reason))
            .collect::<Vec<_>>(),
        [("E:sl", 88.0, FillReason::StopLoss)]
    );
}

#[test]
fn band_follows_the_previous_session_close_on_intraday_bars() {
    // Two 5-minute bars per day: the band reference is the prior day's last close
    let day2 = START_MS + DAY_MS;
    let mut bars = bars_every(
        START_MS,
        300_000,
        &[(100.0, 100.0, 100.0, 100.0), (120.0, 120.0, 120.0, 120.0)],
    );
    bars.extend(bars_every(day2, 300_000, &flat(2, 125.0)));
    let (_, seen) = run(
        band_config(),
        "SBIN",
        bars,
        [(
            2,
            vec![
                // reference = 120: band 108..132
                limit("in", ActionSide::Sell, 131.0),
                limit("out", ActionSide::Buy, 107.0),
            ],
        )],
    );
    assert_eq!(
        rejects(&seen[3].events),
        [("out".into(), "outside_price_band".into())]
    );
}

#[test]
fn invalid_band_is_a_config_error() {
    let cfg: BacktestConfig = serde_json::from_value(serde_json::json!({
        "symbols": ["SBIN"],
        "instruments": {"SBIN": {"price_band_pct": 0.0}},
    }))
    .unwrap();
    let candles = std::collections::BTreeMap::from([("SBIN".to_string(), daily(&flat(2, 100.0)))]);
    assert!(honba_barter::run_backtest(cfg, candles, Scripted::new([])).is_err());
}
