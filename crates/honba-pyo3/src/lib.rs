use pyo3::prelude::*;

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

#[pymodule]
fn _core(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(calculate_dsr, m)?)?;
    m.add_function(wrap_pyfunction!(calculate_pbo, m)?)?;
    Ok(())
}
