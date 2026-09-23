# Anti-Overfitting Methodology & Statistical Rigor

## 1. The Core Hazard: Multiple Hypothesis Testing (P-Hacking)

When a quant trader or AI agent evaluates hundreds of parameter combinations on historical market data, standard optimization metrics inevitably pick strategies that fit historical noise rather than genuine market alpha.

```
       Parameter Optimization on Historical Data
                           |
                           v
          +---------------------------------+
          | High In-Sample Sharpe (> 3.0)   |
          | Artificially Smooth Curve       |
          +----------------+----------------+
                           |
              Deployed to Live Market
                           |
                           v
          +---------------------------------+
          | Severe Drawdown & Capital Loss  |
          | Immediate Strategy Decay        |
          +---------------------------------+
```

Honba integrates institutional econometrics (based on Marcos López de Prado, David Bailey, and Jonathan Borwein) directly into the backtesting engine.

---

## 2. Probability of Backtest Overfitting (PBO)

The **Probability of Backtest Overfitting (PBO)** quantifies the probability that the strategy with the best In-Sample (IS) performance underperforms the median Out-Of-Sample (OOS) performance:

$$\text{PBO} = P(\mathcal{R}_{n^*} \le 0.5)$$

Where $n^*$ is the index of the strategy selected by IS performance and $\mathcal{R}_{n^*}$ is its relative percentile rank in the OOS partition.

### Interpretation Benchmarks
- **$\text{PBO} < 0.15$**: **Robust Strategy**. Statistically significant predictive edge.
- **$0.15 \le \text{PBO} < 0.35$**: Acceptable, but demands conservative sizing and tight risk monitoring.
- **$\text{PBO} > 0.40$**: **Overfitted Strategy**. The selection process is indistinguishable from random chance.

---

## 3. Deflated Sharpe Ratio (DSR)

Standard Sharpe Ratio ($SR$) suffers from selection bias: testing $N$ independent random strategies increases the expected maximum Sharpe ratio by $\approx \sqrt{2 \ln N}$.

The **Deflated Sharpe Ratio (DSR)** penalizes the estimated Sharpe ratio by explicitly accounting for:
1. **Number of trials ($N$)**: Total strategy variations or hyperparameter vectors tested.
2. **Variance across trials**: Spread of Sharpe ratios across all tested variants.
3. **Non-normal return distribution**: Skewness ($\gamma_3$) and kurtosis ($\gamma_4$).
4. **Sample length ($T$)**: Number of trade observations.

If $\text{DSR} < 0.95$ (95% confidence level), the strategy is flagged as non-significant.
