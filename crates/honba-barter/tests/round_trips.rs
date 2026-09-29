mod common;

use common::*;
use honba_barter::{Action, BacktestConfig};

#[test]
fn net_round_trips_with_partials_and_flips() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: buy 10
        (110.0, 110.0, 110.0, 110.0), // 1: sell 4 (partial)
        (120.0, 120.0, 120.0, 120.0), // 2: sell 16: closes 6, flips short 10
        (100.0, 100.0, 100.0, 100.0), // 3: buy 10: closes the short
        (100.0, 100.0, 100.0, 100.0), // 4: buy 1 @100, sell 1 @100.1: gross +, net - (fees)
        (100.1, 100.1, 100.1, 100.1),
    ]);
    let mut cfg = BacktestConfig {
        allow_short: true,
        fees_percent: 0.1,
        ..config(&["SBIN"])
    };
    cfg.trading_days_per_year = 250;
    let (report, _) = run(
        cfg,
        "SBIN",
        bars,
        [
            (0, vec![Action::buy("SBIN", 10.0)]),
            (1, vec![Action::sell("SBIN", 4.0)]),
            (2, vec![Action::sell("SBIN", 16.0)]),
            (3, vec![Action::buy("SBIN", 10.0)]),
            (4, vec![Action::buy("SBIN", 1.0)]),
            (5, vec![Action::sell("SBIN", 1.0)]),
        ],
    );

    let trips = &report.round_trips;
    assert_eq!(trips.len(), 3);
    let long = &trips[0];
    assert_eq!((long.side.as_str(), long.qty), ("long", 10.0));
    assert_close(long.entry_price, 100.0);
    assert_close(long.exit_price, (4.0 * 110.0 + 6.0 * 120.0) / 10.0);
    assert_close(long.gross_pnl, 4.0 * 10.0 + 6.0 * 20.0);
    // entry fee + partial exit fee + 6/16 of the flipping fill's fee
    let fee = |value: f64| value * 0.001;
    let long_costs = fee(1000.0) + fee(440.0) + fee(16.0 * 120.0) * 6.0 / 16.0;
    assert_close(long.costs, long_costs);
    assert_close(long.net_pnl, long.gross_pnl - long_costs);

    let short = &trips[1];
    assert_eq!((short.side.as_str(), short.qty), ("short", 10.0));
    assert_close(short.gross_pnl, 10.0 * 20.0);
    assert_close(short.costs, fee(16.0 * 120.0) * 10.0 / 16.0 + fee(1000.0));

    // Gross winner, net loser: counts as a loss
    let small = &trips[2];
    assert!(small.gross_pnl > 0.0 && small.net_pnl < 0.0);
    assert_eq!(report.summary.num_round_trips, 3);
    assert_close(report.summary.win_rate.unwrap(), 2.0 / 3.0);
    assert_close(
        report.summary.profit_factor.unwrap(),
        (long.net_pnl + short.net_pnl) / -small.net_pnl,
    );
}

#[test]
fn trading_days_per_year_scales_sharpe() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0),
        (101.0, 101.0, 101.0, 101.0),
        (100.5, 100.5, 100.5, 100.5),
        (102.0, 102.0, 102.0, 102.0),
        (103.0, 103.0, 103.0, 103.0),
    ]);
    let sharpe = |days: u32| {
        let cfg = BacktestConfig {
            trading_days_per_year: days,
            ..config(&["SBIN"])
        };
        let (report, _) = run(
            cfg,
            "SBIN",
            bars.clone(),
            [(0, vec![Action::buy("SBIN", 100.0)])],
        );
        report.summary.sharpe.unwrap()
    };
    assert_eq!(BacktestConfig::default().trading_days_per_year, 250);
    assert_close(sharpe(252) / sharpe(250), (252.0f64 / 250.0).sqrt());
}
