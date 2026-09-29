mod common;

use common::*;
use honba_barter::{run_backtest, Action, BacktestError, Bar, Event};
use std::collections::BTreeMap;

#[test]
fn invalid_bars_are_data_errors() {
    let bad_bars = [
        Bar::new(START_MS, 0.0, 1.0, 0.5, 1.0, 1.0),  // open <= 0
        Bar::new(START_MS, 1.0, 1.0, -1.0, 1.0, 1.0), // low <= 0
        Bar::new(START_MS, 1.0, 0.9, 1.1, 1.0, 1.0),  // high < low
        Bar::new(START_MS, f64::NAN, 1.0, 1.0, 1.0, 1.0), // NaN
        Bar::new(START_MS, 1.0, f64::INFINITY, 1.0, 1.0, 1.0),
        Bar::new(START_MS, 1.0, 1.0, 1.0, 1.0, -5.0), // negative volume
    ];
    for bar in bad_bars {
        let candles = BTreeMap::from([("SBIN".to_string(), vec![bar])]);
        let result = run_backtest(config(&["SBIN"]), candles, Scripted::new([]));
        assert!(matches!(result, Err(BacktestError::Data(_))), "{bar:?}");
    }
}

#[test]
fn absurd_notional_is_rejected_not_a_panic() {
    for costs in [
        serde_json::json!(null),
        serde_json::json!({"model": "india"}),
    ] {
        let mut cfg = config(&["SBIN"]);
        cfg.initial_cash = 1e300;
        cfg.costs = serde_json::from_value(costs).unwrap();
        let (report, seen) = run(
            cfg,
            "SBIN",
            daily(&flat(2, 100.0)),
            [(
                0,
                vec![Action::buy("SBIN", 1e20), Action::sell("SBIN", 1e30)],
            )],
        );
        assert!(report.trades.is_empty());
        let reasons = seen[1]
            .events
            .iter()
            .filter_map(|e| match e {
                Event::Reject { reason, .. } => Some(reason.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>();
        assert_eq!(reasons, ["invalid_qty", "invalid_qty"]);
    }
}
