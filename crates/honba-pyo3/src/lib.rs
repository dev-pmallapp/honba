use pyo3::prelude::*;

mod backtest;

#[pyfunction]
fn calculate_dsr(
    observed_sharpe: f64,
    num_trials: usize,
    var_trials: f64,
    sample_length_t: usize,
    skewness: f64,
    kurtosis: f64,
) -> PyResult<f64> {
    Ok(honba_overfit::AntiOverfitEngine::compute_dsr(
        observed_sharpe,
        num_trials,
        var_trials,
        sample_length_t,
        skewness,
        kurtosis,
    ))
}

#[pyfunction]
fn calculate_pbo(is_performances: Vec<f64>, oos_performances: Vec<f64>) -> PyResult<f64> {
    Ok(honba_overfit::AntiOverfitEngine::evaluate_pbo(
        &is_performances,
        &oos_performances,
    ))
}

/// honba package version.
#[pyfunction]
fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Version of the `run_backtest` JSON contract (config, actions, ctx, report).
#[pyfunction]
fn contract_version() -> u32 {
    honba_barter::CONTRACT_VERSION
}

#[pymodule]
fn _core(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(calculate_dsr, m)?)?;
    m.add_function(wrap_pyfunction!(calculate_pbo, m)?)?;
    m.add_function(wrap_pyfunction!(backtest::run_backtest, m)?)?;
    m.add_function(wrap_pyfunction!(version, m)?)?;
    m.add_function(wrap_pyfunction!(contract_version, m)?)?;
    Ok(())
}
