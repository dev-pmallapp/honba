"""ML prediction engine (was: Yosoku 予測).

Model training, inference, scheduled retraining, Colibri LLM integration,
RD-Agent factor discovery, and feature engineering.

Current layout (modules marked * are empty stubs)::

    ml/
    ├── __init__.py          this file — init/shutdown, model registry
    ├── features.py *        feature engineering — fundamental, technical,
    │                        sentiment, NSE delivery (India-specific)
    ├── colibri.py *         local LLM client — news -> sentiment features
    ├── rd_agent.py *        RD-Agent factor discovery loop
    ├── models/
    │   ├── __init__.py      train_model(), predict(), ModelRegistry
    │   ├── classifier.py *  binary classification (scikit-learn)
    │   ├── regressor.py *   regression (XGBoost, LightGBM)
    │   └── ensemble.py *    ensembling & stacking
    └── retraining/
        ├── __init__.py      RetrainingConfig, RetrainingScheduler
        ├── drift.py         concept drift & performance decay detection
        ├── scheduler.py *   (empty — scheduler lives in __init__.py)
        └── triggers.py *    event-driven retraining triggers

Design principles
-----------------
1. LLM calls NEVER in the Nautilus hot path — Colibri features are
   pre-computed in batch and stored as CustomData events.
2. Scheduled retraining with drift detection — models refresh when
   performance decays, not blindly on a fixed interval.
3. Jesse-compatible API surface (``train_model`` / ``ml_predict``) for
   familiarity.

Unpriced risk (docs/research/build-vs-extend.md §8, feature #3)
---------------------------------------------------------------
``features.py`` as a single source of truth is the right idea; *proving*
it is the work. Offline you will write ``df.rolling(20).mean()``; online
you will write an incremental EMA in ``on_bar``; they diverge silently.
This package needs a replay-equivalence test asserting offline features
== online features bar-for-bar before any model is trusted. Meta-labeling
additionally needs purged k-fold + embargo + sample-uniqueness weights.
"""

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from honba.research.ml.retraining import RetrainingScheduler

logger = logging.getLogger(__name__)

# Model storage root — models persist as .pkl files here
MODEL_ROOT = Path(__file__).parent / "models" / "trained"

# Feature store — registry of all feature names known to the system
FEATURE_STORE: dict[str, str] = {}

# Retraining scheduler — singleton, configured from honba.toml
_scheduler: Optional["RetrainingScheduler"] = None


def init(cfg: dict[str, Any]) -> None:
    """Initialize the ML engine from honba configuration.

    Called once at application startup. Registers features, starts the
    retraining scheduler, and warms the Colibri client if enabled.
    """
    global _scheduler
    from honba.research.ml.retraining import RetrainingScheduler

    logger.info("ML engine initialised — model root: %s", MODEL_ROOT)
    MODEL_ROOT.mkdir(parents=True, exist_ok=True)

    retraining_cfg = cfg.get("ml", {}).get("retraining", {})
    if retraining_cfg.get("enabled", False):
        _scheduler = RetrainingScheduler(retraining_cfg)
        _scheduler.start()
        logger.info(
            "Retraining scheduler started — interval %s",
            retraining_cfg.get("interval", "daily"),
        )


def shutdown() -> None:
    """Graceful teardown — stop scheduler, flush logs."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.stop()
        _scheduler = None
        logger.info("Retraining scheduler stopped")


__all__ = [
    "FEATURE_STORE",
    "MODEL_ROOT",
    "init",
    "shutdown",
]
