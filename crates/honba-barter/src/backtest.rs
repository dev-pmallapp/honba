//! Backtest entry points built on [`barter::backtest::backtest`].

use crate::{
    book::{Book, BookConfig},
    config::{BacktestConfig, IntrabarPriority, MAX_LATENCY_MS},
    data::{Bar, BarGate, CandleData, CandleMarketData},
    ledger::Ledger,
    report::{build_report, BacktestReport, ReportInputs},
    strategy::{lock, Decider, DeciderStrategy, DeciderStrategyConfig, HonbaEngineState, RunState},
};
use barter::{
    backtest::{backtest, BacktestArgsConstant, BacktestArgsDynamic},
    engine::state::{builder::EngineStateBuilder, trading::TradingState},
    risk::DefaultRiskManager,
    statistic::time::Annual252,
    system::config::{ExecutionConfig, InstrumentConfig},
};
use barter_execution::{
    balance::{AssetBalance, Balance},
    client::mock::MockExecutionConfig,
    InstrumentAccountSnapshot, UnindexedAccountSnapshot,
};
use barter_instrument::{
    exchange::ExchangeId,
    index::IndexedInstruments,
    instrument::{kind::InstrumentKind, name::InstrumentNameExchange, quote::InstrumentQuoteAsset},
    Underlying,
};
use chrono::{DateTime, FixedOffset, Utc};
use futures_util::future::try_join_all;
use rust_decimal::{prelude::FromPrimitive, Decimal};
use smol_str::SmolStr;
use std::{
    collections::{BTreeMap, HashSet},
    sync::{Arc, Mutex},
};

/// Errors returned by [`run_backtest`] / [`run_sweep`].
#[derive(Debug, thiserror::Error)]
pub enum BacktestError {
    #[error("invalid backtest config: {0}")]
    Config(String),
    #[error("invalid candle data: {0}")]
    Data(String),
    #[error("decider failed: {0}")]
    Decider(String),
    #[error("barter engine error: {0}")]
    Engine(String),
    #[error("tokio runtime error: {0}")]
    Runtime(String),
}

/// barter's mock exchange never credits sale proceeds to the quote balance (see
/// [`Ledger`]), so it is seeded with an effectively unlimited balance and honba enforces the
/// real cash limit itself.
const MOCK_QUOTE_BALANCE: i64 = 1_000_000_000_000_000;

const EXCHANGE: ExchangeId = ExchangeId::Mock;

/// India Standard Time (UTC+05:30): trading dates are IST calendar dates.
const IST: FixedOffset = match FixedOffset::east_opt(5 * 3600 + 30 * 60) {
    Some(offset) => offset,
    None => panic!("valid offset"),
};

/// Validated, instrument-indexed inputs shared by every run over the same data.
struct Prepared {
    config: BacktestConfig,
    instruments: IndexedInstruments,
    /// Symbol per `InstrumentIndex` (barter sorts instruments, so this is not config order).
    symbols: Vec<String>,
    names_internal: Vec<String>,
    bars: Vec<Vec<Bar>>,
    execution: ExecutionConfig,
    fee_rate: f64,
    risk_free_return: Decimal,
}

fn prepare(
    mut config: BacktestConfig,
    mut candles: BTreeMap<String, Vec<Bar>>,
) -> Result<Prepared, BacktestError> {
    if config.symbols.is_empty() {
        config.symbols = candles.keys().cloned().collect();
    }
    if config.symbols.is_empty() {
        return Err(BacktestError::Config("no symbols to backtest".into()));
    }
    if !(config.initial_cash.is_finite() && config.initial_cash >= 0.0) {
        return Err(BacktestError::Config("initial_cash must be >= 0".into()));
    }
    if !(config.fees_percent.is_finite() && (0.0..100.0).contains(&config.fees_percent)) {
        return Err(BacktestError::Config(
            "fees_percent must be in [0, 100)".into(),
        ));
    }
    if config.latency_ms > MAX_LATENCY_MS {
        return Err(BacktestError::Config(format!(
            "latency_ms must be <= {MAX_LATENCY_MS} (barter times out requests after 1s)"
        )));
    }
    let quote = config.quote.to_lowercase();
    if quote.is_empty() {
        return Err(BacktestError::Config("quote must not be empty".into()));
    }

    let mut seen = HashSet::new();
    for symbol in &config.symbols {
        let base = symbol.to_lowercase();
        if base.is_empty() || base == quote {
            return Err(BacktestError::Config(format!("invalid symbol {symbol:?}")));
        }
        if !seen.insert(base) {
            return Err(BacktestError::Config(format!(
                "duplicate symbol (case-insensitive) {symbol:?}"
            )));
        }
    }

    let instruments =
        IndexedInstruments::new(config.symbols.iter().map(|symbol| InstrumentConfig {
            exchange: EXCHANGE,
            name_exchange: InstrumentNameExchange::from(symbol.as_str()),
            underlying: Underlying::new(symbol.to_lowercase().as_str(), quote.as_str()),
            quote: InstrumentQuoteAsset::UnderlyingQuote,
            kind: InstrumentKind::Spot,
            spec: None,
        }));

    let symbols = instruments
        .instruments()
        .iter()
        .map(|keyed| keyed.value.name_exchange.name().to_string())
        .collect::<Vec<_>>();
    let names_internal = instruments
        .instruments()
        .iter()
        .map(|keyed| keyed.value.name_internal.name().to_string())
        .collect::<Vec<_>>();

    let bars = symbols
        .iter()
        .map(|symbol| {
            let mut series = candles.remove(symbol).ok_or_else(|| {
                BacktestError::Data(format!("no candles provided for symbol {symbol:?}"))
            })?;
            if let Some(bar) = series.iter().find(|bar| {
                ![bar.open, bar.high, bar.low, bar.close, bar.volume]
                    .iter()
                    .all(|value| value.is_finite())
                    || bar.close <= 0.0
                    || DateTime::<Utc>::from_timestamp_millis(bar.time_ms).is_none()
            }) {
                return Err(BacktestError::Data(format!(
                    "invalid bar for {symbol:?} at {}: {bar:?}",
                    bar.time_ms
                )));
            }
            // Sort by time, keeping the last of any duplicate timestamps
            series.sort_by_key(|bar| bar.time_ms);
            series.reverse();
            series.dedup_by_key(|bar| bar.time_ms);
            series.reverse();
            Ok(series)
        })
        .collect::<Result<Vec<_>, _>>()?;

    if bars.iter().all(Vec::is_empty) {
        return Err(BacktestError::Data("no candles provided".into()));
    }

    let time_start = bars
        .iter()
        .filter_map(|series| series.first())
        .map(|bar| bar.time_ms)
        .min()
        .and_then(DateTime::<Utc>::from_timestamp_millis)
        .unwrap_or_default();

    let execution = ExecutionConfig::Mock(MockExecutionConfig {
        mocked_exchange: EXCHANGE,
        initial_state: UnindexedAccountSnapshot {
            exchange: EXCHANGE,
            balances: std::iter::once(quote.clone())
                .chain(config.symbols.iter().map(|symbol| symbol.to_lowercase()))
                .map(|asset| {
                    let total = if asset == quote {
                        Decimal::from(MOCK_QUOTE_BALANCE)
                    } else {
                        Decimal::ZERO
                    };
                    AssetBalance {
                        asset: asset.as_str().into(),
                        balance: Balance { total, free: total },
                        time_exchange: time_start,
                    }
                })
                .collect(),
            instruments: symbols
                .iter()
                .map(|symbol| InstrumentAccountSnapshot {
                    instrument: InstrumentNameExchange::from(symbol.as_str()),
                    orders: Vec::new(),
                })
                .collect(),
        },
        latency_ms: config.latency_ms,
        fees_percent: Decimal::from_f64(config.fee_rate())
            .ok_or_else(|| BacktestError::Config("invalid fees_percent".into()))?,
    });

    let risk_free_return = Decimal::from_f64(config.risk_free_return)
        .ok_or_else(|| BacktestError::Config("invalid risk_free_return".into()))?;

    Ok(Prepared {
        fee_rate: config.fee_rate(),
        config,
        instruments,
        symbols,
        names_internal,
        bars,
        execution,
        risk_free_return,
    })
}

/// Everything one run needs; the gate makes market data and strategy per-run.
struct RunSetup {
    id: String,
    args_constant: Arc<BacktestArgsConstant<CandleMarketData, Annual252, HonbaEngineState>>,
    args_dynamic: BacktestArgsDynamic<DeciderStrategy, DefaultRiskManager<HonbaEngineState>>,
    schedule: Vec<(i64, usize)>,
    run: Arc<Mutex<RunState>>,
}

fn setup_run(
    prepared: &Prepared,
    id: String,
    decider: Arc<dyn Decider>,
) -> Result<RunSetup, BacktestError> {
    let gate = Arc::new(BarGate::default());
    let market_data = CandleMarketData::new(EXCHANGE, &prepared.bars, Arc::clone(&gate))
        .ok_or_else(|| BacktestError::Data("no candles provided".into()))?;
    let schedule = market_data.schedule();

    let time_start = DateTime::<Utc>::from_timestamp_millis(schedule[0].0).unwrap_or_default();
    let engine_state = EngineStateBuilder::new(&prepared.instruments, Ledger::default(), |_| {
        CandleData::default()
    })
    .time_engine_start(time_start)
    .trading_state(TradingState::Enabled)
    .build();

    let book = Book::new(BookConfig {
        symbols: prepared.symbols.clone(),
        initial_cash: prepared.config.initial_cash,
        fee_rate: prepared.fee_rate,
        allow_short: prepared.config.allow_short,
        utc_offset: IST,
        stop_first: prepared.config.intrabar_priority == IntrabarPriority::StopFirst,
    });
    let strategy = DeciderStrategy::new(
        decider,
        Arc::new(DeciderStrategyConfig {
            schedule: schedule.clone(),
            utc_offset: IST,
        }),
        gate,
        book,
    );
    let run = strategy.run_state();

    Ok(RunSetup {
        args_constant: Arc::new(BacktestArgsConstant {
            instruments: prepared.instruments.clone(),
            executions: vec![prepared.execution.clone()],
            market_data,
            summary_interval: Annual252,
            engine_state,
        }),
        args_dynamic: BacktestArgsDynamic {
            id: SmolStr::new(&id),
            risk_free_return: prepared.risk_free_return,
            strategy,
            risk: DefaultRiskManager::default(),
        },
        id,
        schedule,
        run,
    })
}

async fn execute(prepared: &Prepared, setup: RunSetup) -> Result<BacktestReport, BacktestError> {
    let RunSetup {
        id,
        args_constant,
        args_dynamic,
        schedule,
        run,
    } = setup;

    let summary = backtest(args_constant, args_dynamic)
        .await
        .map_err(|error| BacktestError::Engine(error.to_string()))?;

    let run = lock(&run);
    if let Some(error) = &run.error {
        return Err(BacktestError::Decider(error.0.clone()));
    }

    Ok(build_report(ReportInputs {
        id,
        config: &prepared.config,
        names_internal: &prepared.names_internal,
        schedule: &schedule,
        book: &run.book,
        bars_decided: run.bars_decided,
        trading_summary: &summary.trading_summary,
    }))
}

/// Build the runtime backtests execute on.
///
/// Single threaded with a paused clock: the mock exchange's latency `sleep`s then advance
/// virtual time instantly whenever the runtime is idle, so `latency_ms` costs no wall time
/// and event ordering is deterministic.
fn runtime() -> Result<tokio::runtime::Runtime, BacktestError> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .start_paused(true)
        .build()
        .map_err(|error| BacktestError::Runtime(error.to_string()))
}

/// Run a bar-by-bar backtest of `decider` over `candles` (symbol -> bars).
///
/// Orders are barter market orders against barter's mock exchange, filled at the close of the
/// bar they were decided on, charged `fees_percent`, and constrained by honba's cash ledger.
///
/// Blocks the calling thread on a private tokio runtime, so it must not be called from within
/// an async context.
pub fn run_backtest(
    config: BacktestConfig,
    candles: BTreeMap<String, Vec<Bar>>,
    decider: Arc<dyn Decider>,
) -> Result<BacktestReport, BacktestError> {
    let prepared = prepare(config, candles)?;
    let setup = setup_run(&prepared, "backtest".to_string(), decider)?;
    runtime()?.block_on(execute(&prepared, setup))
}

/// Run one backtest per `(id, decider)` over the same config and data (eg/ a parameter sweep),
/// concurrently on one runtime. Reports are returned in input order.
///
/// Note: barter's `run_backtests` shares one `BacktestArgsConstant` (and so one market data
/// source) across runs, but honba's paced replay needs a per-run [`BarGate`] shared between
/// the market data and the strategy. This therefore drives [`barter::backtest::backtest`]
/// once per run with its own constants, which is what `run_backtests` does internally.
pub fn run_sweep(
    config: BacktestConfig,
    candles: BTreeMap<String, Vec<Bar>>,
    deciders: Vec<(String, Arc<dyn Decider>)>,
) -> Result<Vec<BacktestReport>, BacktestError> {
    let prepared = prepare(config, candles)?;
    let setups = deciders
        .into_iter()
        .map(|(id, decider)| setup_run(&prepared, id, decider))
        .collect::<Result<Vec<_>, _>>()?;

    runtime()?.block_on(try_join_all(
        setups.into_iter().map(|setup| execute(&prepared, setup)),
    ))
}
