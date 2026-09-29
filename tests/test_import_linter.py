"""The documented import-linter command passes (``make lint-imports``)."""
# ruff: noqa: D103

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


@pytest.mark.skipif(shutil.which("lint-imports") is None, reason="import-linter not installed")
def test_documented_lint_imports_command_passes():
    result = subprocess.run(
        ["lint-imports", "--config", "../pyproject.toml"],
        cwd=ROOT / "python",
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "0 broken" in result.stdout


@pytest.mark.skipif(shutil.which("make") is None, reason="make not installed")
def test_makefile_target_matches_the_documented_command():
    text = (ROOT / "Makefile").read_text()
    assert "cd python && lint-imports --config ../pyproject.toml" in text
