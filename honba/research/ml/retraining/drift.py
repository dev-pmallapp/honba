"""Concept drift & model staleness detection.

Monitors model performance over time and flags when retraining
is required. Three signals:

1. Prediction distribution shift — KL divergence between recent
   prediction distributions and training-time baseline.

2. Performance decay — rolling-window accuracy/MAE decline vs
   the model's original train/test metrics.

3. Feature staleness — training data age exceeds configurable
   threshold (e.g., data older than 90 days during a structural
   regime change).

For Indian markets, structural shifts are common:
- SEBI regulatory changes (2024 weekly-expiry reform)
- Budget day regime reversals
- Index rebalancing (NIFTY 50 semi-annual)
- Earnings season cyclicality
"""

import logging

logger = logging.getLogger(__name__)


def check_models(
    model_names: list[str],
    max_data_age_days: int = 90,
    drift_threshold: float = 0.10,
) -> list[str]:
    """Return models that need retraining.

    A model is flagged if:
    - Training data is older than max_data_age_days, OR
    - Recent prediction accuracy has dropped > drift_threshold.

    Args:
        model_names: list of model names to check
        max_data_age_days: maximum acceptable training data age
        drift_threshold: accuracy decline threshold (0-1)

    Returns:
        list of model names requiring retraining
    """
    stale: list[str] = []
    for name in model_names:
        # TODO: load metadata.json, compute drift metrics
        logger.debug("Checking staleness for model: %s", name)
        # Placeholder: always flag models older than threshold
        # In production: compare last_trained_at vs now, compute
        # rolling accuracy from recent trades vs baseline
        stale.append(name)
    if stale:
        logger.warning("Models flagged for retraining: %s", stale)
    return stale


def trigger_retrain(model_name: str) -> None:
    """Retrain a specific model on fresh data.

    This orchestrates:
    1. Fetch latest training data from honba.data (PostgreSQL/Parquet)
    2. Run train_model() from honba.research.ml.models
    3. Bump version, save new model.pkl + metadata
    4. Emit a model_updated event for downstream consumers
    """
    logger.info("Retraining model: %s", model_name)
    # TODO: full retraining orchestration
    # - Load latest features from PostgreSQL
    # - Call honba.research.ml.models.train_model(...)
    # - Save model + metadata via ModelRegistry
    pass