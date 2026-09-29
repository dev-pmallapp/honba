//! `_core.run_backtest`: Python bindings for the barter-backed backtester (`honba-barter`).
//!
//! The bar context and the actions cross the boundary as JSON so the contract is defined once,
//! by the serde types in `honba_barter::model`.

// pyo3 0.22 `#[pyfunction]` expansion trips this lint on newer clippy.
#![allow(clippy::useless_conversion)]

use honba_barter::{
    parse_actions, Action, BacktestConfig, BacktestError, Bar, BarContext, Decider, DeciderError,
};
use pyo3::{
    exceptions::{PyRuntimeError, PyTypeError, PyValueError},
    prelude::*,
};
use std::{
    collections::{BTreeMap, HashMap},
    sync::{Arc, Mutex},
};

/// `(time_ms, open, high, low, close, volume)`
type CandleTuple = (i64, f64, f64, f64, f64, f64);

/// [`Decider`] calling a Python `on_bar(ctx: dict) -> list[dict] | None` callback.
///
/// The backtest runs with the GIL released; each callback re-acquires it. The first Python
/// exception is kept so it can be re-raised unchanged once the backtest unwinds.
struct PyDecider {
    on_bar: Py<PyAny>,
    json_loads: Py<PyAny>,
    json_dumps: Py<PyAny>,
    error: Mutex<Option<PyErr>>,
}

impl PyDecider {
    fn take_error(&self) -> Option<PyErr> {
        self.error
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
    }

    fn call(&self, py: Python<'_>, ctx: &BarContext<'_>) -> PyResult<Vec<Action>> {
        let ctx_json = ctx
            .to_json()
            .map_err(|error| PyRuntimeError::new_err(format!("failed to encode ctx: {error}")))?;
        let ctx = self.json_loads.bind(py).call1((ctx_json,))?;
        let actions = self.on_bar.bind(py).call1((ctx,))?;
        let actions_json: String = self.json_dumps.bind(py).call1((actions,))?.extract()?;
        parse_actions(&actions_json).map_err(|error| {
            PyValueError::new_err(format!(
                "invalid on_bar return value (expected a list of action dicts or None): {error}"
            ))
        })
    }
}

impl Decider for PyDecider {
    fn on_bar(&self, ctx: &BarContext<'_>) -> Result<Vec<Action>, DeciderError> {
        Python::with_gil(|py| {
            self.call(py, ctx).map_err(|error| {
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
///     config_json: JSON object, see `honba_barter::config::BacktestConfig` (unknown keys are
///         ignored).
///     candles: `{symbol: [(time_ms, open, high, low, close, volume), ...]}`.
///     on_bar: called once per bar timestamp with the bar context dict (see
///         `honba_barter::model::BarContextPayload`); returns a list of action dicts (see
///         `honba_barter::model::Action`) or None.
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

    let json = py.import_bound("json")?;
    let decider = Arc::new(PyDecider {
        on_bar,
        json_loads: json.getattr("loads")?.unbind(),
        json_dumps: json.getattr("dumps")?.unbind(),
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
