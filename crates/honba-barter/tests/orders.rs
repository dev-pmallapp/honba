mod common;

use common::*;
use honba_barter::{
    Action, ActionSide, Event, FillReason, ModifyRequest, OrderRequest, OrderStatus, Product,
    TimeInForce,
};

fn buy(qty: f64) -> OrderRequest {
    OrderRequest::market("SBIN", ActionSide::Buy, qty)
}

fn sell(qty: f64) -> OrderRequest {
    OrderRequest::market("SBIN", ActionSide::Sell, qty)
}

#[test]
fn limit_fills_at_limit_inside_bar_and_at_open_on_gap() {
    let bars = daily(&[
        (100.0, 101.0, 99.0, 100.0), // 0: place limits
        (100.0, 101.0, 97.0, 99.0),  // 1: low touches 98 -> fill @98
        (99.0, 100.0, 98.0, 99.0),   // 2: place limit 97
        (95.0, 96.0, 94.0, 95.0),    // 3: gaps below 97 -> fill @ open 95
    ]);
    let (report, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [
            (
                0,
                vec![buy(10.0).limit(98.0).tag("dip").with_id("L1").into()],
            ),
            (2, vec![buy(5.0).limit(97.0).tif(TimeInForce::Gtc).into()]),
        ],
    );

    // Not filled at placement (close 100 > 98), visible as open order on bar 0 -> bar 1 ctx
    assert!(seen[0].open_orders.is_empty());
    let fills1 = fills(&seen[1].events);
    assert_eq!(fills1.len(), 1);
    assert_eq!(fills1[0].id, "L1");
    assert_eq!(fills1[0].price, 98.0);
    assert_eq!(fills1[0].reason, FillReason::Limit);
    assert_eq!(fills1[0].tag.as_deref(), Some("dip"));
    assert_eq!(seen[1].positions["SBIN"].qty, 10.0);

    assert_eq!(seen[3].events.len(), 1);
    let fills3 = fills(&seen[3].events);
    assert_eq!(
        fills3[0].price, 95.0,
        "gap below the limit fills at the open"
    );

    assert_eq!(report.trades.len(), 2);
    assert!(report
        .orders
        .iter()
        .all(|o| o.status == OrderStatus::Filled));
    assert_eq!(report.trades[0].reason, FillReason::Limit);
}

#[test]
fn stop_orders_trigger_intrabar_and_gap() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: buy 10, place sell stop 95, buy stop 105
        (100.0, 106.0, 99.0, 104.0),  // 1: buy stop 105 triggers @105
        (104.0, 104.0, 104.0, 104.0), // 2: place sell stop 95 for the full position
        (90.0, 92.0, 89.0, 91.0),     // 3: gaps below 95 -> fills @90
    ]);
    let (report, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [
            (
                0,
                vec![
                    buy(10.0).into(),
                    buy(5.0).stop(105.0).tif(TimeInForce::Gtc).into(),
                ],
            ),
            (2, vec![sell(15.0).stop(95.0).into()]),
        ],
    );

    // Bar 0's market buy (filled at bar 0 close) and the stop fill of bar 1
    let fills1 = fills(&seen[1].events);
    assert_eq!(fills1.len(), 2);
    assert_eq!(fills1[0].reason, FillReason::Signal);
    assert_eq!(
        (fills1[1].price, fills1[1].reason),
        (105.0, FillReason::Stop)
    );
    let fills3 = fills(&seen[3].events);
    assert_eq!((fills3[0].price, fills3[0].qty), (90.0, 15.0));
    assert_eq!(seen[3].positions["SBIN"].qty, 0.0);
    assert_eq!(report.trades.len(), 3);
}

#[test]
fn stop_limit_triggers_then_rests_as_limit() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: buy stop 103 limit 103.5
        (104.0, 106.0, 104.0, 105.0), // 1: gaps over trigger and limit, never back to 103.5
        (105.0, 105.0, 103.0, 104.0), // 2: trades back to limit -> fill @103.5
    ]);
    let (_, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [(
            0,
            vec![buy(1.0)
                .stop_limit(103.0, 103.5)
                .tif(TimeInForce::Gtc)
                .into()],
        )],
    );

    assert!(fills(&seen[1].events).is_empty());
    assert_eq!(seen[1].open_orders.len(), 1);
    let fills2 = fills(&seen[2].events);
    assert_eq!(fills2[0].price, 103.5);
}

#[test]
fn marketable_orders_fill_at_close_and_ioc_expires() {
    let bars = daily(&flat(3, 100.0));
    let (report, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [(
            0,
            vec![
                buy(1.0).limit(101.0).with_id("mkt-limit").into(),
                buy(1.0).stop(99.0).with_id("mkt-stop").into(),
                buy(1.0)
                    .limit(90.0)
                    .tif(TimeInForce::Ioc)
                    .with_id("ioc")
                    .into(),
            ],
        )],
    );

    let fills1 = fills(&seen[1].events);
    assert_eq!(fills1.len(), 2);
    assert!(fills1.iter().all(|f| f.price == 100.0));
    assert_eq!(fills1[0].reason, FillReason::Limit);
    assert_eq!(fills1[1].reason, FillReason::Stop);
    assert!(seen[1]
        .events
        .iter()
        .any(|e| matches!(e, Event::Expire { id, reason, .. } if id == "ioc" && reason == "ioc")));
    let ioc = report.orders.iter().find(|o| o.id == "ioc").unwrap();
    assert_eq!(ioc.status, OrderStatus::Expired);
}

#[test]
fn modify_cancel_and_cancel_all() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: place A (limit 90), B (limit 91), C (limit 92)
        (100.0, 100.0, 99.0, 100.0),  // 1: modify A -> 99, cancel B
        (100.0, 100.0, 98.0, 100.0),  // 2: A fills @99; cancel_all removes C
        (80.0, 80.0, 80.0, 80.0),     // 3: nothing left to fill
    ]);
    let gtc = |id: &str, price: f64| {
        Action::from(
            buy(1.0)
                .limit(price)
                .tif(TimeInForce::Gtc)
                .with_id(id.to_string()),
        )
    };
    let (report, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [
            (0, vec![gtc("A", 90.0), gtc("B", 91.0), gtc("C", 92.0)]),
            (
                1,
                vec![
                    ModifyRequest {
                        id: "A".into(),
                        price: Some(99.0),
                        ..ModifyRequest::default()
                    }
                    .into(),
                    Action::cancel("B"),
                    Action::cancel("nope"),
                    gtc("C", 50.0), // duplicate id of an open order
                ],
            ),
            (2, vec![Action::cancel_all(Some("SBIN".into()))]),
        ],
    );

    assert_eq!(seen[1].open_orders.len(), 3);
    let fills2 = fills(&seen[2].events);
    assert_eq!((fills2[0].id.as_str(), fills2[0].price), ("A", 99.0));
    assert!(seen[2]
        .events
        .iter()
        .any(|e| matches!(e, Event::Cancel { id, reason, .. } if id == "B" && reason == "user")));
    let rejects = seen[2]
        .events
        .iter()
        .filter_map(|e| match e {
            Event::Reject { reason, .. } => Some(reason.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(rejects, ["unknown_order", "duplicate_id"]);
    assert!(seen[3].open_orders.is_empty());

    let status = |id: &str| report.orders.iter().find(|o| o.id == id).unwrap().status;
    assert_eq!(status("A"), OrderStatus::Filled);
    assert_eq!(status("B"), OrderStatus::Cancelled);
    assert_eq!(status("C"), OrderStatus::Cancelled);
    assert_eq!(report.trades.len(), 1);
}

#[test]
fn day_orders_expire_after_their_first_session_gtc_persist() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: place day + gtc limits at 90
        (100.0, 100.0, 95.0, 100.0),  // 1: neither fills (first eligible session)
        (100.0, 100.0, 89.0, 100.0),  // 2: day expired before matching; gtc fills
    ]);
    let (report, seen) = run(
        config(&["SBIN"]),
        "SBIN",
        bars,
        [(
            0,
            vec![
                buy(1.0).limit(90.0).with_id("day").into(),
                buy(1.0)
                    .limit(90.0)
                    .tif(TimeInForce::Gtc)
                    .with_id("gtc")
                    .into(),
            ],
        )],
    );

    assert!(seen[2]
        .events
        .iter()
        .any(|e| matches!(e, Event::Expire { id, reason, .. } if id == "day" && reason == "day")));
    let fills2 = fills(&seen[2].events);
    assert_eq!(fills2.len(), 1);
    assert_eq!(fills2[0].id, "gtc");
    assert_eq!(report.trades.len(), 1);
}

#[test]
fn product_and_fill_time_rejections() {
    let bars = daily(&[
        (100.0, 100.0, 100.0, 100.0), // 0: resting limit buy for more than cash
        (100.0, 100.0, 90.0, 95.0),   // 1: triggers, rejected for cash at fill time
    ]);
    let mut cfg = config(&["SBIN"]);
    cfg.initial_cash = 1_000.0;
    let (report, seen) = run(
        cfg,
        "SBIN",
        bars,
        [(
            0,
            vec![
                buy(50.0).limit(95.0).with_id("big").into(),
                buy(1.0).product(Product::MIS).with_id("mis").into(),
            ],
        )],
    );

    assert_eq!(seen[1].positions["SBIN"].product, Some(Product::MIS));
    assert!(seen[1].events.iter().any(|e| matches!(
        e,
        Event::Reject { id: Some(id), reason, .. } if id == "big" && reason == "insufficient_cash"
    )));
    assert_eq!(report.trades[0].product, Product::MIS);
    let big = report.orders.iter().find(|o| o.id == "big").unwrap();
    assert_eq!(big.status, OrderStatus::Rejected);
}
