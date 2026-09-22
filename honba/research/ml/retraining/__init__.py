"""Scheduled model retraining pipeline.

The key enhancement over Jesse AI's static training.

Jesse trains a model once (gather_ml_data → train_model → deploy)
and the model never changes unless the user manually retrains it.
honba's Yosoku component adds:

1. Scheduled retraining — cron/APScheduler-based periodic retraining
   on fresh data (e.g., weekly after earnings season, daily for
   sentiment models).

2. Concept drift detection — monitors model performance metrics
   (accuracy, ROC AUC, precision/recall drift) and triggers
   retraining when decay exceeds configurable threshold.

3. Event-driven retraining — SEBI circular announcement, earnings
   season start, index rebalancing → automatically queues retraining
   for affected models.

This ensures models trained on 2023 data don't silently degrade
through 2025 structural market shifts.
"""

import logging
import threading
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


@dataclass
class RetrainingConfig:
    """Configuration for a scheduled retraining job."""
    enabled: bool = True
    interval: str = "weekly"  # "daily" | "weekly" | "monthly"
    target_models: list[str] = field(default_factory=list[str])
    drift_threshold: float = 0.10  # trigger retrain if accuracy drops >10%
    max_data_age_days: int = 90  # retrain if training data >90 days old
    on_retrain: Optional[Callable[[str], None]] = None  # post-retrain hook


class RetrainingScheduler:
    """Manages periodic and event-driven model retraining.

    In production this would use APScheduler or Celery Beat.
    The skeleton below shows the architecture — a simple threading.Timer
    loop that checks freshness and drift on a configurable interval.
    """

    def __init__(self, cfg: dict[str, Any]):
        self.config = RetrainingConfig(**cfg)
        self._timer: Optional[threading.Timer] = None
        self._running = False
        logger.info("RetrainingScheduler configured: interval=%s, drift_threshold=%.2f",
                     self.config.interval, self.config.drift_threshold)

    def start(self) -> None:
        """Begin the periodic retraining loop."""
        if self._running:
            return
        self._running = True
        self._schedule_next()

    def stop(self) -> None:
        """Stop the scheduler gracefully."""
        self._running = False
        if self._timer:
            self._timer.cancel()
        logger.info("RetrainingScheduler stopped")

    def _schedule_next(self) -> None:
        """Schedule the next check-and-retrain cycle."""
        if not self._running:
            return
        interval_seconds = self._interval_seconds()
        self._timer = threading.Timer(interval_seconds, self._check_and_retrain)
        self._timer.daemon = True
        self._timer.start()

    def _check_and_retrain(self) -> None:
        """Check all monitored models for staleness / drift and retrain if needed."""
        try:
            from honba.research.ml.retraining.drift import (
                check_models,
                trigger_retrain as do_retrain,
            )

            stale = check_models(self.config.target_models, self.config.max_data_age_days,
                                 self.config.drift_threshold)
            for model_name in stale:
                logger.warning("Model %s is stale/drifting — triggering retrain", model_name)
                do_retrain(model_name)
                if self.config.on_retrain:
                    self.config.on_retrain(model_name)
        except Exception:
            logger.exception("Retraining check failed")
        finally:
            self._schedule_next()

    def _interval_seconds(self) -> float:
        return {
            "daily": 86_400,
            "weekly": 604_800,
            "monthly": 2_592_000,
        }.get(self.config.interval, 604_800)

    def trigger_now(self, model_name: str) -> None:
        """Immediate retraining trigger (event-driven — SEBI circular, etc.)."""
        from honba.research.ml.retraining.drift import trigger_retrain
        logger.info("Event-driven retrain triggered for %s", model_name)
        trigger_retrain(model_name)