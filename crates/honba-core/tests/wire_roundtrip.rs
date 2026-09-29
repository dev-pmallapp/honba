//! Cross-language contract: every fixture in `schema/fixtures` must parse into the generated
//! wire type and serialise back to the identical JSON value (Python and TS check the same files).

use honba_core::wire::*;
use serde::{de::DeserializeOwned, Serialize};
use std::path::PathBuf;

fn roundtrip<T: Serialize + DeserializeOwned>(name: &str) -> T {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../schema/fixtures")
        .join(name);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path:?}: {e}"));
    let original: serde_json::Value = serde_json::from_str(&text).unwrap();
    let typed: T = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name}: {e}"));
    assert_eq!(
        serde_json::to_value(&typed).unwrap(),
        original,
        "{name} did not round-trip"
    );
    typed
}

#[test]
fn fixtures_round_trip() {
    let inst: Instrument = roundtrip("instrument.json");
    assert_eq!(inst.option_kind, Some(OptionKind::Call));
    assert!(matches!(
        roundtrip::<MarketEvent>("market_event_tick.json"),
        MarketEvent::Tick(_)
    ));
    assert!(matches!(
        roundtrip::<MarketEvent>("market_event_bar.json"),
        MarketEvent::Bar(_)
    ));
    let order: Order = roundtrip("order.json");
    assert_eq!(order.status, OrderStatus::PartiallyFilled);
    let fill: Fill = roundtrip("fill.json");
    assert_eq!(fill.costs.unwrap().total.to_string(), "21.19");
    let run: BacktestRun = roundtrip("backtest_run.json");
    assert_eq!(run.timeframe, Timeframe::D1);
}
