mod common;

use common::*;
use honba_barter::{
    Action, ActionSide, BacktestConfig, Event, FillModel, FillReason, OrderRequest, OrderStatus,
};

fn next_open() -> BacktestConfig {
    BacktestConfig {
        fill_model: FillModel::NextOpen,
        ..config(&["SBIN"])
    }
}

#[test]
fn next_open_fills_market_orders_at_the_next_open() {
    let bars = daily(&[
        (100.0, 101.0, 99.0, 100.0),  // 0: buy
        (102.0, 104.0, 101.0, 103.0), // 1: filled @102; sell
        (98.0, 99.0, 97.0, 98.5),     // 2: filled @98; buy again (never filled: last bar)
    ]);
    let (report, seen) = run(
        next_open(),
        "SBIN",
        bars,
        [
            (0, vec![Action::buy("SBIN", 10.0)]),
            (1, vec![Action::sell("SBIN", 10.0)]),
            (2, vec![Action::buy("SBIN", 1.0)]),
        ],
    );

    assert!(seen[0].events.is_empty());
    let buy = fills(&seen[1].events)[0].clone();
    assert_eq!(
        (buy.price, buy.reason, buy.time_ms),
        (102.0, FillReason::Signal, START_MS + DAY_MS)
    );
    assert_eq!(seen[1].positions["SBIN"].avg_price, 102.0);
    assert_eq!(fills(&seen[2].events)[0].price, 98.0);
    assert_close(report.trades[1].realised_pnl, 10.0 * (98.0 - 102.0));
    let last = report.orders.last().unwrap();
    assert_eq!(last.status, OrderStatus::Open, "no bar left to fill it");
}

#[test]
fn next_open_rests_marketable_orders_and_brackets() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: buy limit 105 (marketable) with stop 95
        (102.0, 103.0, 90.0, 96.0),   // 1: entry @102 (open <= 105); stop not active yet
        (96.0, 96.0, 94.0, 95.0),     // 2: stop 95 hit
    ]);
    let (_, seen) = run(
        next_open(),
        "SBIN",
        bars,
        [(
            0,
            vec![OrderRequest::market("SBIN", ActionSide::Buy, 10.0)
                .limit(105.0)
                .with_id("E")
                .stop_loss(95.0)
                .into()],
        )],
    );
    assert!(fills(&seen[0].events).is_empty());
    let entry = fills(&seen[1].events)[0].clone();
    assert_eq!((entry.price, entry.reason), (102.0, FillReason::Limit));
    assert_eq!(
        seen[1].positions["SBIN"].qty, 10.0,
        "stop activates from the next bar"
    );
    let exit = fills(&seen[2].events)[0].clone();
    assert_eq!((exit.id.as_str(), exit.price), ("E:sl", 95.0));
}

#[test]
fn warmup_bars_feed_history_but_not_orders_or_metrics() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0),
        (101.0, 101.0, 101.0, 101.0),
        (102.0, 102.0, 102.0, 102.0),
        (103.0, 103.0, 103.0, 103.0), // start
        (104.0, 104.0, 104.0, 104.0),
    ]);
    let mut cfg = config(&["SBIN"]);
    cfg.start_ms = Some(START_MS + 3 * DAY_MS);
    let decider = Scripted::new((0..5).map(|i| (i, vec![Action::buy("SBIN", 1.0)])));
    let candles = std::collections::BTreeMap::from([("SBIN".to_string(), bars)]);
    let report = honba_barter::run_backtest(cfg, candles, decider.clone()).unwrap();
    let seen = decider.seen();

    assert_eq!(
        seen.iter().map(|s| s.warmup).collect::<Vec<_>>(),
        [true, true, true, false, false]
    );
    assert!(seen[1]
        .events
        .iter()
        .any(|e| matches!(e, Event::Reject { reason, .. } if reason == "warmup")));
    assert_eq!(report.warmup_bars, 3);
    assert_eq!(report.start_ms, START_MS + 3 * DAY_MS);
    assert_eq!(report.bars_decided, 5);
    assert_eq!(report.trades.len(), 2);
    assert_eq!(report.trades[0].time_ms, START_MS + 3 * DAY_MS);
    assert_eq!(report.equity_curve.len(), 2);
    assert_eq!(report.equity_curve[0].0, START_MS + 3 * DAY_MS);
    assert_eq!(report.summary.num_rejected, 3);
}
