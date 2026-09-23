//! Honba Overfit: Institutional anti-overfitting suite (CPCV, DSR, PBO, WFE).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverfittingAuditReport {
    pub strategy_name: String,
    pub trials_tested: usize,
    pub in_sample_sharpe: f64,
    pub deflated_sharpe_ratio: f64,
    pub probability_backtest_overfitting: f64,
    pub walk_forward_efficiency: f64,
    pub is_robust: bool,
}

pub struct AntiOverfitEngine;

impl AntiOverfitEngine {
    /// Computes the Deflated Sharpe Ratio (DSR) penalizing multiple hypothesis testing
    pub fn compute_dsr(
        observed_sharpe: f64,
        num_trials: usize,
        var_trials: f64,
        sample_length_t: usize,
        skewness: f64,
        kurtosis: f64,
    ) -> f64 {
        if num_trials <= 1 {
            return 1.0;
        }

        let euler_mascheroni = 0.5772156649;
        let n_f64 = num_trials as f64;
        
        // Expected maximum Sharpe ratio under the null hypothesis
        let z_term = (2.0 * n_f64.ln()).sqrt();
        let expected_max_sr = (var_trials.sqrt()) * (z_term + euler_mascheroni / z_term);

        // Adjust for non-normality (skewness, kurtosis)
        let t_f64 = sample_length_t as f64;
        let denom = (1.0 - skewness * observed_sharpe + (kurtosis - 1.0) / 4.0 * observed_sharpe.powi(2)) / t_f64;

        if denom <= 0.0 {
            return 0.5;
        }

        let z_score = (observed_sharpe - expected_max_sr) / denom.sqrt();
        
        // Cumulative normal distribution
        0.5 * (1.0 + (z_score / std::f64::consts::SQRT_2).calc_erf())
    }

    /// Evaluates Probability of Backtest Overfitting (PBO) across IS and OOS performance matrices
    pub fn evaluate_pbo(is_performances: &[f64], oos_performances: &[f64]) -> f64 {
        if is_performances.is_empty() || is_performances.len() != oos_performances.len() {
            return 1.0;
        }

        // Find index of best In-Sample strategy
        let mut best_is_idx = 0;
        let mut max_is_perf = is_performances[0];
        for (i, &perf) in is_performances.iter().enumerate().skip(1) {
            if perf > max_is_perf {
                max_is_perf = perf;
                best_is_idx = i;
            }
        }

        // Calculate percentile of this strategy in Out-Of-Sample partition
        let best_oos_perf = oos_performances[best_is_idx];
        let count_below = oos_performances.iter().filter(|&&p| p < best_oos_perf).count();
        let percentile = count_below as f64 / oos_performances.len() as f64;

        // PBO is the probability that relative percentile <= 0.5 (below median)
        if percentile <= 0.5 {
            1.0 - percentile
        } else {
            1.0 - percentile
        }
    }
}

trait ErfExt {
    fn calc_erf(self) -> f64;
}

impl ErfExt for f64 {
    fn calc_erf(self) -> f64 {
        let t = 1.0 / (1.0 + 0.5 * self.abs());
        let tau = t * (-self * self - 1.26551223 + 1.00002368 * t + 0.37409196 * t.powi(2)
            + 0.09678418 * t.powi(3) - 0.18628806 * t.powi(4) + 0.27886807 * t.powi(5)
            - 1.13520398 * t.powi(6) + 1.48851587 * t.powi(7) - 0.82215223 * t.powi(8)
            + 0.17087277 * t.powi(9)).exp();
        if self >= 0.0 {
            1.0 - tau
        } else {
            tau - 1.0
        }
    }
}
