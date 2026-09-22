"""Yosoku model training & inference.

Provides Jesse-compatible API extended with honba-specific features:
scheduled retraining, concept drift detection, and Colibri feature
integration. Wraps scikit-learn, XGBoost, and LightGBM.
"""

import logging
import pickle
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class ModelMetadata:
    """Metadata stored alongside a trained model."""
    name: str
    version: int
    trained_at: str  # ISO 8601
    feature_names: list[str]
    task: str  # "binary" | "multiclass" | "regression"
    metrics: dict[str, float] = field(default_factory=dict)
    training_samples: int = 0


@dataclass
class PredictionResult:
    """Structured prediction output from Yosoku models."""
    symbol: str
    timestamp: str
    probability: Optional[float] = None  # classification
    prediction: Optional[float] = None  # regression
    features_used: list[str] = field(default_factory=list)
    model_version: int = 1


# ---------------------------------------------------------------------------
# Model registry
# ---------------------------------------------------------------------------


class ModelRegistry:
    """Persistent registry of trained models, metadata, and scalers.

    Models are stored as .pkl files under research/ml/models/trained/.
    Each model has companion files: {name}_metadata.json, {name}_scaler.pkl,
    {name}_feature_importance.json.
    """

    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, name: str, model: Any, scaler: StandardScaler,
             metadata: ModelMetadata) -> None:
        """Persist model, scaler, and metadata to disk."""
        version_dir = self.root / f"{name}_v{metadata.version}"
        version_dir.mkdir(exist_ok=True)

        with open(version_dir / "model.pkl", "wb") as f:
            pickle.dump(model, f)
        with open(version_dir / "scaler.pkl", "wb") as f:
            pickle.dump(scaler, f)
        metadata_path = version_dir / "metadata.json"
        metadata_path.write_text(
            pd.DataFrame([metadata.__dict__]).to_json(orient="records")
        )
        logger.info("Model saved: %s v%d → %s", name, metadata.version, version_dir)

    def load(self, name: str, version: Optional[int] = None) -> tuple[Any, StandardScaler, ModelMetadata]:
        """Load the latest (or specific) version of a model."""
        import json
        versions = sorted(self.root.glob(f"{name}_v*"))
        if not versions:
            raise FileNotFoundError(f"No trained model found: {name}")
        target = versions[-1] if version is None else self.root / f"{name}_v{version}"
        with open(target / "model.pkl", "rb") as f:
            model = pickle.load(f)
        with open(target / "scaler.pkl", "rb") as f:
            scaler = pickle.load(f)
        metadata_dicts = pd.read_json(target / "metadata.json").to_dict(orient="records")
        metadata = ModelMetadata(**metadata_dicts[0])
        return model, scaler, metadata

    def list_models(self) -> list[str]:
        """List all trained model names (unique base names)."""
        names = {p.name.split("_v")[0] for p in self.root.iterdir() if p.is_dir()}
        return sorted(names)


# ---------------------------------------------------------------------------
# Jesse-compatible API
# ---------------------------------------------------------------------------


def train_model(
    data: pd.DataFrame,
    feature_names: list[str],
    label_col: str,
    estimator: Any,
    task: str = "binary",
) -> dict:
    """Train a scikit-learn-compatible estimator.

    Jesse-compatible API: same signature pattern as Jesse's
    `jesse.research.train_model()`. Extended with honba metadata.

    Returns:
        dict with keys: model, scaler, feature_names, metrics, metadata
    """
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score, roc_auc_score

    X = data[feature_names].values
    y = data[label_col].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if task == "binary" else None
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    estimator.fit(X_train_scaled, y_train)

    metrics: dict[str, float] = {}
    if task == "binary" and hasattr(estimator, "predict_proba"):
        y_proba = estimator.predict_proba(X_test_scaled)[:, 1]
        y_pred = (y_proba > 0.5).astype(int)
        metrics["accuracy"] = accuracy_score(y_test, y_pred)
        metrics["roc_auc"] = roc_auc_score(y_test, y_proba)
    elif task == "regression":
        from sklearn.metrics import mean_absolute_error, r2_score
        y_pred = estimator.predict(X_test_scaled)
        metrics["mae"] = float(mean_absolute_error(y_test, y_pred))
        metrics["r2"] = float(r2_score(y_test, y_pred))

    return {
        "model": estimator,
        "scaler": scaler,
        "feature_names": feature_names,
        "metrics": metrics,
    }


def predict(
    model: Any,
    scaler: StandardScaler,
    features: dict[str, float],
    feature_names: list[str],
    task: str = "binary",
) -> PredictionResult:
    """Run inference with a pre-trained model.

    Jesse-compatible: mirrors `ml_predict()` / `ml_predict_proba()`.
    """
    X = np.array([features.get(f, 0.0) for f in feature_names]).reshape(1, -1)
    X_scaled = scaler.transform(X)

    result = PredictionResult(symbol="", timestamp="", features_used=feature_names)

    if task == "binary" and hasattr(model, "predict_proba"):
        proba = model.predict_proba(X_scaled)[0]
        result.probability = float(proba[1]) if len(proba) > 1 else float(proba[0])
    elif task == "regression":
        result.prediction = float(model.predict(X_scaled)[0])

    return result