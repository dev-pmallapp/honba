"""``hb.split_order`` freeze-quantity slicing."""
# ruff: noqa: D103

from __future__ import annotations

import pytest

import honba as hb


def test_full_slices_then_remainder_in_lot_multiples():
    out = hb.split_order(4500, 1800, 75)
    assert out == [1800, 1800, 900]
    assert all(q % 75 == 0 for q in out) and sum(out) == 4500


def test_freeze_not_a_lot_multiple_rounds_down():
    out = hb.split_order(1000, 190, 25)  # 190 -> 175 per slice
    assert max(out) == 175 and sum(out) == 1000 and all(q % 25 == 0 for q in out)


def test_balanced_and_sign():
    out = hb.split_order(-4500, 1800, 75, balanced=True)
    assert out == [-1500, -1500, -1500]
    assert hb.split_order(-3600, 1800, 75) == [-1800, -1800]


def test_no_split_needed_or_no_limit():
    assert hb.split_order(150, 1800, 75) == [150]
    assert hb.split_order(150, None, 75) == [150]
    assert hb.split_order(0, 1800, 75) == []


def test_errors():
    with pytest.raises(ValueError, match="multiple"):
        hb.split_order(100, 1800, 75)
    with pytest.raises(ValueError, match="smaller than one lot"):
        hb.split_order(150, 50, 75)
    with pytest.raises(ValueError):
        hb.split_order(150, 1800, 0)


def test_float_lot_sizes():
    assert hb.split_order(0.3, 0.2, 0.1) == pytest.approx([0.2, 0.1])
