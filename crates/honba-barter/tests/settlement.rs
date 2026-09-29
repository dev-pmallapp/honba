//! I2: T+1 settlement of delivery (CNC) trades, holdings vs positions.

mod common;

use common::*;
use honba_barter::{Action, BacktestConfig, Bar, Event};

const HOUR_MS: i64 = 3_600_000;

fn settle_config(settlement: Option<serde_json::Value>) -> BacktestConfig {
    let mut cfg = serde_json::json!({"symbols": ["SBIN"], "initial_cash": 1000.0});
    if let Some(settlement) = settlement {
        cfg["settlement"] = settlement;
    }
    serde_json::from_value(cfg).unwrap()
}

/// `first` hourly bars on 2024-01-01, `second` on 2024-01-02, all at `price`.
fn days(first: usize, second: usize, price: f64) -> Vec<Bar> {
    let mut bars = bars_every(START_MS, HOUR_MS, &flat(first, price));
    bars.extend(bars_every(START_MS + DAY_MS, HOUR_MS, &flat(second, price)));
    bars
}

fn two_days(price: f64) -> Vec<Bar> {
    days(2, 2, price)
}

fn rejects(events: &[Event]) -> Vec<String> {
    events
        .iter()
        .filter_map(|e| match e {
            Event::Reject { reason, .. } => Some(reason.clone()),
            _ => None,
        })
        .collect()
}

/// Buy 10 (all the cash), then sell them and buy back 10 / 5 at the next bar (same day);
/// bar 3 is the next day.
fn rotate(settlement: Option<serde_json::Value>) -> Vec<Seen> {
    let (_, seen) = run(
        settle_config(settlement),
        "SBIN",
        days(3, 1, 100.0),
        [
            (0, vec![Action::buy("SBIN", 10.0)]),
            (
                1,
                vec![
                    Action::sell("SBIN", 10.0),
                    Action::buy("SBIN", 10.0),
                    Action::buy("SBIN", 5.0),
                ],
            ),
        ],
    );
    seen
}

#[test]
fn t0_default_reuses_sale_proceeds_at_once() {
    let seen = rotate(None);
    // Sell 10, buy 10 fine, buy 5 has no cash left
    assert_eq!(rejects(&seen[2].events), ["insufficient_cash"]);
    assert_eq!(seen[2].positions["SBIN"].qty, 10.0);
    assert_eq!(seen[2].unsettled_cash_json(), 0.0);
    // T+0: every CNC long is a holding
    assert_eq!(seen[1].positions["SBIN"].qty_settled, 10.0);
}

#[test]
fn t1_without_same_day_credit_blocks_the_proceeds_until_settlement() {
    let seen = rotate(Some(
        serde_json::json!({"cnc": "T+1", "same_day_sell_credit": 0.0}),
    ));
    assert_eq!(
        rejects(&seen[2].events),
        ["insufficient_cash", "insufficient_cash"]
    );
    assert_eq!(seen[2].positions["SBIN"].qty, 0.0);
    assert_eq!(seen[2].cash, 1000.0);
    assert_eq!(seen[2].json["unsettled_cash"], 1000.0);
    assert_eq!(seen[2].json["available_cash"], 0.0);
    // Next trading date: settled
    assert_eq!(seen[3].json["unsettled_cash"], 0.0);
    assert_eq!(seen[3].json["available_cash"], 1000.0);
}

#[test]
fn t1_with_partial_same_day_credit() {
    let seen = rotate(Some(
        serde_json::json!({"cnc": "T+1", "same_day_sell_credit": 0.5}),
    ));
    // 500 usable: the buy of 10 fails, the buy of 5 fits
    assert_eq!(rejects(&seen[2].events), ["insufficient_cash"]);
    assert_eq!(seen[2].positions["SBIN"].qty, 5.0);
    assert_eq!(seen[2].json["available_cash"], 0.0);
    // The buy was paid from the credit: 1000 of proceeds still settle tomorrow
    assert_eq!(seen[2].json["unsettled_cash"], 1000.0);
}

#[test]
fn t1_holdings_btst_and_netting() {
    let cfg = settle_config(Some(serde_json::json!({"cnc": "T+1"})));
    let (report, seen) = run(
        cfg,
        "SBIN",
        two_days(100.0),
        [
            (0, vec![Action::buy("SBIN", 6.0)]),
            // BTST: sell today's shares before delivery
            (1, vec![Action::sell("SBIN", 2.0)]),
            // Day 2: buy 3 more, then sell 5 -> 3 of today's, 2 from holdings
            (2, vec![Action::buy("SBIN", 3.0)]),
            (3, vec![Action::sell("SBIN", 5.0)]),
        ],
    );
    let position = |i: usize| {
        let p = &seen[i].positions["SBIN"];
        (p.qty, p.qty_settled)
    };
    assert_eq!(position(1), (6.0, 0.0)); // bought today: not delivered
    assert_eq!(position(2), (4.0, 4.0)); // next day: holdings
    assert_eq!(position(3), (7.0, 4.0));
    assert!(rejects(&seen[2].events).is_empty());
    let last = &report.positions["SBIN"];
    assert_eq!((last.qty, last.qty_settled), (2.0, 2.0));
    // Default full same-day credit: nothing blocked, proceeds reported as unsettled
    assert_eq!(report.summary.unsettled_cash, 500.0);
    assert_eq!(seen[1].json["positions"]["SBIN"]["qty_settled"], 0.0);
}

#[test]
fn invalid_settlement_is_a_config_error() {
    let cfg = settle_config(Some(
        serde_json::json!({"cnc": "T+1", "same_day_sell_credit": 1.5}),
    ));
    let candles = std::collections::BTreeMap::from([("SBIN".to_string(), two_days(100.0))]);
    assert!(honba_barter::run_backtest(cfg, candles, Scripted::new([])).is_err());
    assert!(serde_json::from_value::<BacktestConfig>(
        serde_json::json!({"settlement": {"cnc": "T+2"}})
    )
    .is_err());
}

trait SeenExt {
    fn unsettled_cash_json(&self) -> f64;
}

impl SeenExt for Seen {
    fn unsettled_cash_json(&self) -> f64 {
        self.json["unsettled_cash"].as_f64().unwrap()
    }
}
