# Execution Stress Testing & Monte Carlo Permutations

## 1. Execution & Liquidity Stress Testing

Strategies that look profitable under theoretical mid-price fills often collapse under real exchange frictions. Honba subjects backtests to four execution-level stress tests:

1. **Slippage Multiplier Stress**:
   - Reruns backtests with $1.5\times$, $2.0\times$, and $3.0\times$ standard bid-ask spread slippage to identify break-even fragility.
2. **Execution Latency Perturbation**:
   - Injects random delays of 500ms to 3000ms between signal generation and order fill to simulate network and exchange queue congestion.
3. **Overnight Black Swan Gap Shocks**:
   - Injects sudden gap-down open shocks (-2% to -6%) against open overnight positions to verify margin preservation.
4. **Block Bootstrap Return Permutation**:
   - Randomizes historical return blocks to verify whether strategy performance stems from real structural alpha or an isolated lucky market sequence.
