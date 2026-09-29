"""Cross-language contract: schema/fixtures round-trip through the generated pydantic models."""

import json
from pathlib import Path

import pytest

from honba import wire

FIXTURES = Path(__file__).resolve().parent.parent / "schema" / "fixtures"

CASES = {
    "instrument.json": wire.Instrument,
    "market_event_tick.json": wire.MarketEventAdapter,
    "market_event_bar.json": wire.MarketEventAdapter,
    "order.json": wire.Order,
    "fill.json": wire.Fill,
    "backtest_run.json": wire.BacktestRun,
}


@pytest.mark.parametrize("name", sorted(CASES))
def test_fixture_round_trips(name):
    """Each fixture parses and re-serialises to the same JSON."""
    text = (FIXTURES / name).read_text()
    model = CASES[name]
    if isinstance(model, type):
        obj = model.model_validate_json(text)
        out = wire.dumps(obj)
    else:
        obj = model.validate_json(text)
        out = wire.dumps(obj)
    assert json.loads(out) == json.loads(text)


def test_discriminated_union_and_decimal():
    """The ``kind`` tag selects the union member and decimals keep their exact value."""
    tick = wire.MarketEventAdapter.validate_json((FIXTURES / "market_event_tick.json").read_text())
    assert isinstance(tick, wire.TickEvent) and tick.tick.bids[0].price == 1190.4
    fill = wire.Fill.model_validate_json((FIXTURES / "fill.json").read_text())
    assert str(fill.costs.total) == "21.19"


def test_every_fixture_is_covered():
    """A new fixture must be registered in CASES (and in the Rust test)."""
    assert {p.name for p in FIXTURES.glob("*.json")} == set(CASES)
