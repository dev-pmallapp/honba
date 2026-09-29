mod common;

use common::*;
use honba_barter::{
    parse_actions, Action, ActionSide, BacktestConfig, Event, ModifyRequest, OrderRequest, Product,
    TrailMode, TrailSpec,
};

const FUT: &str = "NIFTYFUT";

fn fut_config() -> BacktestConfig {
    serde_json::from_value(serde_json::json!({
        "symbols": [FUT],
        "initial_cash": 10000000.0,
        "costs": {"model": "india"},
        "instruments": {
            FUT: {"segment": "equity_futures", "lot_size": 75, "tick_size": 0.05,
                  "freeze_qty": 1800, "price_band_pct": 10.0}
        }
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

#[test]
fn lot_tick_and_freeze_validation() {
    let bars = daily(&flat(3, 100.0));
    let actions = parse_actions(
        r#"[
            {"id": "lot", "symbol": "NIFTYFUT", "side": "buy", "qty": 100},
            {"id": "freeze", "symbol": "NIFTYFUT", "side": "buy", "qty": 1875},
            {"id": "tick", "symbol": "NIFTYFUT", "side": "buy", "qty": 75, "kind": "limit",
             "price": 99.03},
            {"id": "sl_tick", "symbol": "NIFTYFUT", "side": "buy", "qty": 75,
             "stop_loss": 95.02},
            {"id": "ok", "symbol": "NIFTYFUT", "side": "buy", "qty": 150, "kind": "limit",
             "price": 99.05, "tif": "gtc"}
        ]"#,
    )
    .unwrap();
    let modify_bad = Action::from(ModifyRequest {
        id: "ok".into(),
        price: Some(99.01),
        ..ModifyRequest::default()
    });
    let (report, seen) = run(
        fut_config(),
        FUT,
        bars,
        [(0, actions), (1, vec![modify_bad])],
    );

    assert_eq!(
        rejects(&seen[1].events),
        [
            ("lot".into(), "invalid_lot".into()),
            ("freeze".into(), "above_freeze_qty".into()),
            ("tick".into(), "invalid_tick".into()),
            ("sl_tick".into(), "invalid_tick".into()),
        ]
    );
    assert_eq!(
        rejects(&seen[2].events),
        [("ok".into(), "invalid_tick".into())]
    );
    let ok = report.orders.iter().find(|o| o.id == "ok").unwrap();
    assert_eq!(ok.product, Product::NRML, "F&O defaults to NRML");
    assert_eq!(ok.price, Some(99.05));
}

#[test]
fn segment_drives_costs_and_trailing_rounds_to_tick() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: buy 75 with 3% trail
        (100.0, 101.37, 99.9, 101.0), // 1: 101.37 * 0.97 = 98.3289 -> 98.30
        (101.0, 101.0, 101.0, 101.0), // 2: sell
        (101.0, 101.0, 101.0, 101.0),
    ]);
    let trail = TrailSpec {
        mode: TrailMode::Percent,
        value: 3.0,
        atr_period: None,
        activation_price: None,
        step: None,
    };
    let (report, seen) = run(
        fut_config(),
        FUT,
        bars,
        [
            (
                0,
                vec![OrderRequest::market(FUT, ActionSide::Buy, 75.0)
                    .with_id("E")
                    .trail(trail)
                    .into()],
            ),
            (2, vec![Action::sell(FUT, 75.0)]),
        ],
    );

    let stop = seen[1].open_orders.iter().find(|o| o.id == "E:sl").unwrap();
    assert_close(stop.trigger.unwrap(), 98.30);

    // Futures: no STT on the buy, 0.02% on the sell; exchange 0.00173%; stamp 0.002% on buy
    let (buy, sell) = (&report.trades[0], &report.trades[1]);
    assert_eq!(buy.product, Product::NRML);
    assert_eq!(buy.costs.stt, 0.0);
    assert_close(buy.costs.stamp_duty, 7500.0 * 0.00002);
    assert_close(buy.costs.exchange_fee, 7500.0 * 0.0000173);
    assert_close(sell.costs.stt, 7575.0 * 0.0002);
}
