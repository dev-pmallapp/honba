//! JSON shape of the bar context and the report (the `_core.run_backtest` contract).

mod common;

use common::*;
use honba_barter::{parse_actions, TimeInForce};
use serde_json::Value;

fn keys(value: &Value) -> Vec<&str> {
    let mut keys = value
        .as_object()
        .unwrap_or_else(|| panic!("not an object: {value}"))
        .keys()
        .map(String::as_str)
        .collect::<Vec<_>>();
    keys.sort_unstable();
    keys
}

const ORDER_KEYS: [&str; 22] = [
    "avg_fill_price",
    "created_ms",
    "filled_qty",
    "id",
    "kind",
    "parent",
    "price",
    "product",
    "qty",
    "reason",
    "role",
    "side",
    "status",
    "stop_loss",
    "symbol",
    "tag",
    "take_profit",
    "tif",
    "trail",
    "trail_stop",
    "trigger",
    "updated_ms",
];

#[test]
fn context_events_and_open_orders_json() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0),
        (100.0, 100.0, 100.0, 100.0),
        (100.0, 100.0, 100.0, 100.0),
    ]);
    let actions = parse_actions(
        r#"[
            {"symbol": "SBIN", "side": "buy", "qty": 2, "tag": "entry",
             "stop_loss": 90, "take_profit": 120},
            {"id": "L", "symbol": "SBIN", "side": "buy", "qty": 1, "kind": "limit",
             "price": 80, "tif": "gtc"},
            {"id": "X", "symbol": "SBIN", "side": "buy", "qty": 1, "kind": "limit",
             "price": 80, "tif": "ioc"},
            {"symbol": "NOPE", "side": "buy", "qty": 1}
        ]"#,
    )
    .unwrap();
    let (report, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [
            (0, actions),
            (
                1,
                parse_actions(r#"[{"op": "cancel", "id": "L"}]"#).unwrap(),
            ),
        ],
    );

    let ctx = &seen[1].json;
    let events = ctx["events"].as_array().unwrap();
    let types = events
        .iter()
        .map(|e| e["type"].as_str().unwrap())
        .collect::<Vec<_>>();
    // Placement-time outcomes of bar 0 decisions are reported at bar 1
    assert_eq!(types, ["expire", "reject", "fill"]);
    assert_eq!(
        keys(&events[2]),
        [
            "costs",
            "fill_id",
            "id",
            "price",
            "product",
            "qty",
            "realised_pnl",
            "reason",
            "remaining_qty",
            "side",
            "symbol",
            "tag",
            "time_ms",
            "type",
            "value"
        ]
    );
    assert_eq!(
        keys(&events[2]["costs"]),
        [
            "brokerage",
            "dp",
            "exchange_fee",
            "gst",
            "sebi_fee",
            "stamp_duty",
            "stt",
            "total"
        ]
    );
    assert_eq!(events[1]["reason"], "unknown_symbol");
    assert_eq!(events[0]["reason"], "ioc");

    let open = ctx["open_orders"].as_array().unwrap();
    assert_eq!(open.len(), 3); // L, o1:sl, o1:tp
    for order in open {
        assert_eq!(keys(order), ORDER_KEYS);
    }
    assert!(open
        .iter()
        .any(|o| o["role"] == "stop_loss" && o["parent"] == "o1"));
    assert_eq!(ctx["session"]["date"], "2024-01-02");

    let cancel = &seen[2].json["events"][0];
    assert_eq!(
        (cancel["type"].as_str(), cancel["id"].as_str()),
        (Some("cancel"), Some("L"))
    );

    // Report
    let json: Value = serde_json::from_str(&report.to_json().unwrap()).unwrap();
    for order in json["orders"].as_array().unwrap() {
        assert_eq!(keys(order), ORDER_KEYS);
    }
    let statuses = report
        .orders
        .iter()
        .map(|o| (o.id.as_str(), serde_json::to_value(o.status).unwrap()))
        .collect::<Vec<_>>();
    assert!(statuses.contains(&("o1", "filled".into())));
    assert!(statuses.contains(&("L", "cancelled".into())));
    assert!(statuses.contains(&("X", "expired".into())));
    assert_eq!(
        report.orders.iter().find(|o| o.id == "L").unwrap().tif,
        TimeInForce::Gtc
    );

    assert_eq!(json["contract_version"], honba_barter::CONTRACT_VERSION);
    assert!(json["round_trips"].is_array());
    let trade = &json["trades"][0];
    assert_eq!(trade["order_id"], "o1");
    assert_eq!(trade["tag"], "entry");
    assert_eq!(trade["reason"], "signal");
    assert!(trade["costs"]["total"].is_number());
    assert!(json["summary"]["costs"]["stt"].is_number());
    assert_eq!(json["rejected"][0]["reason"], "unknown_symbol");
    assert!(json["positions"]["SBIN"]["avg_price"].is_number());
}
