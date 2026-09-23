# Combinatorial Purged Cross-Validation (CPCV)

## 1. Information Leakage in Financial Time Series

Standard $K$-Fold cross-validation assumes Independent and Identically Distributed (I.I.D.) data. In financial markets:
- Trades span multiple bars, causing holding periods to overlap across train and test boundaries.
- Asset returns exhibit serial autocorrelation.

Standard CV leaks future knowledge into past training folds, generating falsely optimistic results.

---

## 2. Purging and Embargoing

To prevent information leakage:
1. **Purging**: Deletes training observations whose trade labels overlap with the test evaluation window.
2. **Embargoing**: Deletes training observations immediately *following* the test set to eliminate post-event autoregressive memory.

```
[--- Train Set ---] [Purge] [=== Test Set ===] [Embargo] [--- Train Set ---]
                      |<-- Holding Overlap -->|  |<-- Serial Memory -->|
```

---

## 3. Combinatorial Folds (CPCV)

Instead of a single test split:
- The historical timeline is partitioned into $N$ chronological segments.
- The engine evaluates all $\binom{N}{k}$ combinations where $k$ segments form the test set and $N - k$ form the training set.
- Produces an entire **distribution of Out-Of-Sample (OOS) equity paths** rather than a single cherry-picked path.
