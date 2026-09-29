//! `_core.run_backtest`: Python bindings for the barter-backed backtester (`honba-barter`).

// pyo3 0.22 `#[pyfunction]` expansion trips this lint on newer clippy.
#![allow(clippy::useless_conversion)]

use honba_barter::{
    Action, ActionSide, BacktestConfig, BacktestError, Bar, BarContext, Decider, DeciderError,
    OrderType,
};
use pyo3::{
    exceptions::{PyRuntimeError, PyTypeError, PyValueError},
    prelude::*,
    types::{PyDict, PyString},
};
use std::{
    collections::{BTreeMap, HashMap},
    sync::{Arc, Mutex},
};

/// `(time_ms, open, high, low, close, volume)`
type CandleTuple = (i64, f64, f64, f64, f64, f64);

/// [`Decider`] calling a Python `on_bar(ctx: dict) -> list[dict]` callback.
///
/// The backtest runs with the GIL released; each callback re-acquires it. The first Python
/// exception is kept so it can be re-raised unchanged once the backtest unwinds.
struct PyDecider {
    on_bar: Py<PyAny>,
    error: Mutex<Option<PyErr>>,
}

impl PyDecider {
    fn take_error(&self) -> Option<PyErr> {
        self.error
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
    }
}

impl Decider for PyDecider {
    fn on_bar(&self, ctx: &BarContext<'_>) -> Result<Vec<Action>, DeciderError> {
        Python::with_gil(|py| {
            let result = context_to_py(py, ctx)
                .and_then(|dict| self.on_bar.bind(py).call1((dict,)))
                .and_then(|actions| actions_from_py(&actions));

            result.map_err(|error| {
                let message = error.to_string();
                self.error
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .get_or_insert(error);
                DeciderError(message)
            })
        })
    }
}

/// `{"time_ms", "candles": {sym: {...}}, "positions": {sym: qty}, "cash", "equity"}`
fn context_to_py<'py>(py: Python<'py>, ctx: &BarContext<'_>) -> PyResult<Bound<'py, PyDict>> {
    let candles = PyDict::new_bound(py);
    for (symbol, bar) in &ctx.candles {
        let candle = PyDict::new_bound(py);
        candle.set_item("time_ms", bar.time_ms)?;
        candle.set_item("open", bar.open)?;
        candle.set_item("high", bar.high)?;
        candle.set_item("low", bar.low)?;
        candle.set_item("close", bar.close)?;
        candle.set_item("volume", bar.volume)?;
        candles.set_item(symbol, candle)?;
    }

    let positions = PyDict::new_bound(py);
    for (symbol, quantity) in &ctx.positions {
        positions.set_item(symbol, quantity)?;
    }

    let dict = PyDict::new_bound(py);
    dict.set_item("time_ms", ctx.time_ms)?;
    dict.set_item("candles", candles)?;
    dict.set_item("positions", positions)?;
    dict.set_item("cash", ctx.cash)?;
    dict.set_item("equity", ctx.equity)?;
    Ok(dict)
}

fn optional_f64(dict: &Bound<'_, PyDict>, key: &str) -> PyResult<Option<f64>> {
    match dict.get_item(key)? {
        Some(value) if !value.is_none() => value.extract().map(Some),
        _ => Ok(None),
    }
}

fn required<'py>(dict: &Bound<'py, PyDict>, key: &str) -> PyResult<Bound<'py, PyAny>> {
    dict.get_item(key)?
        .ok_or_else(|| PyValueError::new_err(format!("action is missing required key {key:?}")))
}

/// Parse `list[dict]` (or `None`) returned by `on_bar`. Unknown keys are ignored.
fn actions_from_py(actions: &Bound<'_, PyAny>) -> PyResult<Vec<Action>> {
    if actions.is_none() {
        return Ok(Vec::new());
    }
    if actions.is_instance_of::<PyString>() || actions.is_instance_of::<PyDict>() {
        return Err(PyTypeError::new_err(
            "on_bar must return a list of action dicts (or None)",
        ));
    }

    actions
        .iter()
        .map_err(|_| PyTypeError::new_err("on_bar must return a list of action dicts (or None)"))?
        .map(|item| {
            let item = item?;
            let dict = item
                .downcast::<PyDict>()
                .map_err(|_| PyTypeError::new_err("each action must be a dict"))?;

            let symbol: String = required(dict, "symbol")?.extract()?;
            let side = match required(dict, "side")?
                .extract::<String>()?
                .to_ascii_lowercase()
                .as_str()
            {
                "buy" => ActionSide::Buy,
                "sell" => ActionSide::Sell,
                other => {
                    return Err(PyValueError::new_err(format!(
                        "action side must be \"buy\" or \"sell\", got {other:?}"
                    )));
                }
            };
            let qty: f64 = required(dict, "qty")?.extract()?;

            let kind = match dict.get_item("kind")? {
                Some(kind) if !kind.is_none() => {
                    match kind.extract::<String>()?.to_ascii_lowercase().as_str() {
                        "market" => OrderType::Market,
                        "limit" => OrderType::Limit,
                        "stop" => OrderType::Stop,
                        "stop_limit" => OrderType::StopLimit,
                        other => {
                            return Err(PyValueError::new_err(format!(
                                "unknown action kind {other:?}"
                            )));
                        }
                    }
                }
                _ => OrderType::Market,
            };

            Ok(Action {
                symbol,
                side,
                qty,
                kind,
                price: optional_f64(dict, "price")?,
                stop_loss: optional_f64(dict, "stop_loss")?,
                take_profit: optional_f64(dict, "take_profit")?,
            })
        })
        .collect()
}

fn backtest_error_to_py(error: BacktestError) -> PyErr {
    match error {
        BacktestError::Config(_) | BacktestError::Data(_) => {
            PyValueError::new_err(error.to_string())
        }
        _ => PyRuntimeError::new_err(error.to_string()),
    }
}

/// Run a bar-by-bar backtest on the barter engine.
///
/// Args:
///     config_json: JSON object with optional keys `symbols`, `exchange` ("NSE"),
///         `quote` ("INR"), `initial_cash`, `fees_percent` (percent, 0.03 = 0.03%),
///         `latency_ms` (< 500), `risk_free_return` (annual fraction), `allow_short`.
///     candles: `{symbol: [(time_ms, open, high, low, close, volume), ...]}`.
///     on_bar: called once per bar timestamp with
///         `{"time_ms", "candles": {sym: {"time_ms","open","high","low","close","volume"}},
///         "positions": {sym: qty}, "cash", "equity"}`; returns a list of
///         `{"symbol", "side": "buy"|"sell", "qty"}` market orders filled at the bar close.
///
/// Returns:
///     The backtest report as a JSON string (see `honba_barter::report`).
#[pyfunction]
pub fn run_backtest(
    py: Python<'_>,
    config_json: &str,
    candles: HashMap<String, Vec<CandleTuple>>,
    on_bar: Py<PyAny>,
) -> PyResult<String> {
    let config = BacktestConfig::from_json(config_json)
        .map_err(|error| PyValueError::new_err(format!("invalid config_json: {error}")))?;
    if !on_bar.bind(py).is_callable() {
        return Err(PyTypeError::new_err("on_bar must be callable"));
    }

    let candles = candles
        .into_iter()
        .map(|(symbol, rows)| {
            let bars = rows
                .into_iter()
                .map(|(time_ms, open, high, low, close, volume)| {
                    Bar::new(time_ms, open, high, low, close, volume)
                })
                .collect();
            (symbol, bars)
        })
        .collect::<BTreeMap<_, _>>();

    let decider = Arc::new(PyDecider {
        on_bar,
        error: Mutex::new(None),
    });
    let engine_decider: Arc<dyn Decider> = Arc::clone(&decider) as Arc<dyn Decider>;

    let result =
        py.allow_threads(move || honba_barter::run_backtest(config, candles, engine_decider));

    if let Some(error) = decider.take_error() {
        return Err(error);
    }
    let report = result.map_err(backtest_error_to_py)?;
    report
        .to_json()
        .map_err(|error| PyRuntimeError::new_err(format!("failed to serialise report: {error}")))
}
