// Type-level smoke test for the generated wire types (run: `npx tsc --noEmit`).
// Fixtures are loaded from the shared schema/fixtures directory and asserted to be assignable.
import type { BacktestRun, Fill, Instrument, MarketEvent, Order } from "./wire";
import { TIMEFRAME_VALUES } from "./wire";
import instrument from "../../../schema/fixtures/instrument.json";
import tick from "../../../schema/fixtures/market_event_tick.json";
import order from "../../../schema/fixtures/order.json";
import fill from "../../../schema/fixtures/fill.json";
import run from "../../../schema/fixtures/backtest_run.json";

export const fixtures = {
  instrument: instrument as Instrument,
  tick: tick as MarketEvent,
  order: order as Order,
  fill: fill as Fill,
  run: run as BacktestRun,
};

export function describe(ev: MarketEvent): string {
  switch (ev.kind) {
    case "tick":
      return `${ev.tick.symbol} @ ${ev.tick.price}`;
    case "bar":
      return `${ev.bar.symbol} ${ev.bar.timeframe} c=${ev.bar.close}`;
  }
}

export const timeframes: readonly string[] = TIMEFRAME_VALUES;
