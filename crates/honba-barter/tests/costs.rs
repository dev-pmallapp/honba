mod common;

use common::*;
use honba_barter::{
    run_backtest, Action, ActionSide, BacktestConfig, BacktestError, OrderRequest, Product,
};
use std::collections::BTreeMap;

fn india(extra: serde_json::Value) -> BacktestConfig {
    let mut json = serde_json::json!({
        "symbols": ["SBIN"],
        "initial_cash": 1000000.0,
        "costs": {"model": "india"}
    });
    if let (Some(base), Some(extra)) = (json.as_object_mut(), extra.as_object()) {
        for (key, value) in extra {
            base.insert(key.clone(), value.clone());
        }
    }
    serde_json::from_value(json).unwrap()
}

fn round_trip(product: Product) -> Vec<Action> {
    vec![OrderRequest::market("SBIN", ActionSide::Buy, 100.0)
        .product(product)
        .into()]
}

#[test]
fn india_costs_delivery_vs_intraday() {
    let bars = daily(&flat(3, 1000.0)); // turnover 1,00,000 per fill
    let script = |product: Product| {
        [
            (0, round_trip(product)),
            (1, vec![Action::sell("SBIN", 100.0)]),
        ]
    };

    let (cnc, _) = run(
        india(serde_json::json!({})),
        "SBIN",
        bars.clone(),
        script(Product::CNC),
    );
    let (buy, sell) = (&cnc.trades[0].costs, &cnc.trades[1].costs);
    assert_eq!(buy.brokerage, 0.0, "delivery is brokerage free");
    assert_close(buy.stt, 100.0); // 0.1%
    assert_close(buy.stamp_duty, 15.0); // 0.015%
    assert_close(buy.exchange_fee, 2.97);
    assert_close(buy.sebi_fee, 0.1);
    assert_close(buy.gst, (2.97 + 0.1) * 0.18);
    assert_close(sell.stt, 100.0);
    assert_eq!(sell.stamp_duty, 0.0);
    assert_eq!(cnc.trades[1].fees, sell.total);

    // Cash reflects every cost component
    let total = buy.total + sell.total;
    assert_close(cnc.summary.final_cash, 1_000_000.0 - total);
    assert_close(cnc.summary.costs.total, total);
    assert_close(cnc.summary.costs.stt, 200.0);
    assert_close(cnc.summary.total_fees, total);

    let (mis, _) = run(
        india(serde_json::json!({})),
        "SBIN",
        bars,
        script(Product::MIS),
    );
    let (buy, sell) = (&mis.trades[0].costs, &mis.trades[1].costs);
    assert_eq!(
        mis.trades[1].product,
        Product::MIS,
        "exit inherits the position product"
    );
    assert_eq!(buy.stt, 0.0);
    assert_close(buy.stamp_duty, 3.0); // 0.003%
    assert_close(buy.brokerage, 20.0); // min(20, 0.03% = 30)
    assert_close(sell.stt, 25.0); // 0.025% sell side
    assert!(mis.summary.costs.total < cnc.summary.costs.total);
}

#[test]
fn brokerage_plan_and_dp() {
    let bars = daily(&flat(3, 1000.0));
    let cfg = india(serde_json::json!({
        "costs": {"model": "india", "table": "2024-10-01",
                  "brokerage": {"per_order": 10.0, "pct": 0.01, "cnc_free": false,
                                "dp_per_sell": 15.93}}
    }));
    let (report, _) = run(
        cfg,
        "SBIN",
        bars,
        [
            (0, round_trip(Product::CNC)),
            (1, vec![Action::sell("SBIN", 100.0)]),
        ],
    );
    assert_close(report.trades[0].costs.brokerage, 10.0); // min(10, 0.01% = 10)
    assert_close(report.trades[1].costs.dp, 15.93);
    assert_eq!(report.trades[0].costs.dp, 0.0);
}

#[test]
fn flat_model_is_the_default_and_tables_are_validated() {
    let bars = daily(&flat(2, 100.0));
    let mut cfg = config(&["SBIN"]);
    cfg.fees_percent = 0.5;
    let (report, _) = run(
        cfg,
        "SBIN",
        bars.clone(),
        [(0, vec![Action::buy("SBIN", 10.0)])],
    );
    let costs = report.trades[0].costs;
    assert_close(costs.brokerage, 5.0);
    assert_close(costs.total, 5.0);
    assert_eq!(costs.stt, 0.0);

    let bad = india(serde_json::json!({"costs": {"model": "india", "table": "2019-01-01"}}));
    let candles = BTreeMap::from([("SBIN".to_string(), bars)]);
    let result = run_backtest(bad, candles, Scripted::new([]));
    assert!(matches!(result, Err(BacktestError::Config(_))));
}
