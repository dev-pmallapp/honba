mod common;

use common::*;
use honba_barter::{
    run_backtest, Action, ActionSide, BacktestConfig, Event, OrderRequest, Product,
};
use std::collections::BTreeMap;

fn cfg(extra: serde_json::Value) -> BacktestConfig {
    let mut json = serde_json::json!({"symbols": ["A", "B"], "initial_cash": 10000.0});
    if let (Some(base), Some(extra)) = (json.as_object_mut(), extra.as_object()) {
        for (key, value) in extra {
            base.insert(key.clone(), value.clone());
        }
    }
    serde_json::from_value(json).unwrap()
}

fn mis(symbol: &str, side: ActionSide, qty: f64) -> Action {
    OrderRequest::market(symbol, side, qty)
        .product(Product::MIS)
        .into()
}

fn reasons(events: &[Event]) -> Vec<String> {
    events
        .iter()
        .filter_map(|e| match e {
            Event::Reject { reason, .. } => Some(reason.clone()),
            _ => None,
        })
        .collect()
}

fn two(
    bars_a: Vec<honba_barter::Bar>,
    bars_b: Vec<honba_barter::Bar>,
) -> BTreeMap<String, Vec<honba_barter::Bar>> {
    BTreeMap::from([("A".to_string(), bars_a), ("B".to_string(), bars_b)])
}

#[test]
fn short_proceeds_do_not_fund_purchases() {
    let decider = Scripted::new([
        (0, vec![mis("A", ActionSide::Sell, 1000.0)]), // 1,00,000 notional on 10,000
        (1, vec![mis("A", ActionSide::Sell, 100.0)]),  // 10,000: uses all margin
        (2, vec![Action::buy("B", 90.0)]),             // 9,000 CNC: nothing left
    ]);
    let report = run_backtest(
        cfg(serde_json::json!({})),
        two(daily(&flat(4, 100.0)), daily(&flat(4, 100.0))),
        decider.clone(),
    )
    .unwrap();
    let seen = decider.seen();
    assert_eq!(reasons(&seen[1].events), ["insufficient_margin"]);
    assert_eq!(seen[2].positions["A"].qty, -100.0);
    assert_eq!(reasons(&seen[3].events), ["insufficient_cash"]);
    assert_eq!(report.final_positions["B"], 0.0);
}

#[test]
fn leverage_bounds_exposure_and_exits_are_exempt() {
    // 5x MIS: 50,000 of shorts on 10,000
    let a = daily(&[
        (100.0, 100.0, 100.0, 100.0),
        (100.0, 100.0, 100.0, 100.0),
        (150.0, 150.0, 150.0, 150.0), // short loses 25,000 > equity
        (150.0, 150.0, 150.0, 150.0),
    ]);
    let decider = Scripted::new([
        (0, vec![mis("A", ActionSide::Sell, 500.0)]),
        (1, vec![mis("A", ActionSide::Sell, 10.0)]),
        (2, vec![mis("A", ActionSide::Buy, 500.0)]), // covering is never rejected
    ]);
    let report = run_backtest(
        cfg(serde_json::json!({"margin": {"mis_leverage": 5.0}})),
        two(a, daily(&flat(4, 100.0))),
        decider.clone(),
    )
    .unwrap();
    let seen = decider.seen();
    assert_eq!(seen[1].positions["A"].qty, -500.0);
    assert_eq!(reasons(&seen[2].events), ["insufficient_margin"]);
    assert!(reasons(&seen[3].events).is_empty());
    assert_eq!(report.final_positions["A"], 0.0);
    assert_close(report.summary.final_cash, 10_000.0 - 25_000.0);
}

#[test]
fn futures_margin_pct() {
    let config = cfg(serde_json::json!({
        "symbols": ["A"],
        "margin": {"nrml_margin_pct": 20.0},
        "instruments": {"A": {"segment": "equity_futures"}}
    }));
    let decider = Scripted::new([
        (0, vec![Action::buy("A", 500.0)]), // 50,000 notional, 10,000 margin
        (1, vec![Action::sell("A", 1000.0)]), // closes 500 and opens a 500 short: allowed
        (2, vec![Action::sell("A", 1.0)]),  // no margin left
    ]);
    let candles = BTreeMap::from([("A".to_string(), daily(&flat(4, 100.0)))]);
    run_backtest(config, candles, decider.clone()).unwrap();
    let seen = decider.seen();
    assert_eq!(seen[1].positions["A"].qty, 500.0);
    assert_eq!(seen[2].positions["A"].qty, -500.0);
    assert_eq!(reasons(&seen[3].events), ["insufficient_margin"]);
}
