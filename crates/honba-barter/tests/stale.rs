mod common;

use common::*;
use honba_barter::{run_backtest, Action, ActionSide, Event, OrderRequest, TimeInForce};
use std::collections::BTreeMap;

/// B has no bar on day 2 (its price jumps from 50 to 80 in between).
#[test]
fn no_execution_at_a_stale_price() {
    let a = daily(&flat(4, 100.0));
    let mut b = daily(&[
        (50.0, 50.0, 50.0, 50.0),
        (50.0, 50.0, 50.0, 50.0),
        (80.0, 80.0, 80.0, 80.0),
        (80.0, 80.0, 80.0, 80.0),
    ]);
    b.remove(2);
    let candles = BTreeMap::from([("A".to_string(), a), ("B".to_string(), b)]);
    let decider = Scripted::new([(
        2,
        vec![
            Action::buy("B", 1.0),
            // a marketable limit must not fill at B's stale 50 close either
            OrderRequest::market("B", ActionSide::Buy, 1.0)
                .limit(60.0)
                .tif(TimeInForce::Gtc)
                .with_id("L")
                .into(),
        ],
    )]);
    let report = run_backtest(config(&["A", "B"]), candles, decider.clone()).unwrap();
    let seen = decider.seen();

    assert!(seen[3]
        .events
        .iter()
        .any(|e| matches!(e, Event::Reject { reason, .. } if reason == "no_bar")));
    // The limit rests and is matched against B's next real bar (80 > 60: no fill)
    assert!(report.trades.is_empty(), "{:?}", report.trades);
    assert!(seen[3].open_orders.iter().any(|o| o.id == "L"));
}
