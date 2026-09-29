"""Split / bonus back-adjustment and the actions CSV."""
# ruff: noqa: D103

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import pytest
from sdk_helpers import daily

from honba.data import CorporateAction, adjust_candles, adjustment_factors, load_actions_csv


def _frame():
    # bdays: Jan 1..8 2024; close 100 before the split, 20 after (5-for-1 on Jan 5)
    rows = [(100, 100, 100, 100)] * 4 + [(20, 20, 20, 20)] * 4
    return daily(rows)


def test_split_back_adjusts_prices_and_scales_volume():
    act = CorporateAction("X", date(2024, 1, 5), "split", 5)
    out = adjust_candles(_frame(), [act], symbol="X")
    assert np.allclose(out["close"], 20.0)
    assert out["volume"].tolist() == [5000.0] * 4 + [1000.0] * 4
    assert _frame()["close"].iloc[0] == 100  # input untouched
    # traded value is preserved across the split
    assert np.allclose(out["close"] * out["volume"], [100 * 1000.0] * 4 + [20 * 1000.0] * 4)


def test_bonus_and_stacked_actions():
    acts = [
        CorporateAction("X", date(2024, 1, 3), "bonus", 1),  # 1:1 -> factor 2
        CorporateAction("X", date(2024, 1, 5), "split", 5),
    ]
    f = adjustment_factors(_frame()["time"], acts)
    assert f.tolist() == [10, 10, 5, 5, 1, 1, 1, 1]


def test_other_symbols_and_dividends_do_not_adjust():
    acts = [
        CorporateAction("Y", date(2024, 1, 5), "split", 5),
        CorporateAction("X", date(2024, 1, 5), "dividend", amount=7.5),
    ]
    out = adjust_candles(_frame(), acts, symbol="X")
    assert out["close"].tolist() == _frame()["close"].tolist()
    assert [d.amount for d in out.attrs["dividends"]] == [7.5]
    assert out.attrs["corporate_actions"] == []


def test_mapping_input_and_validation():
    acts = [CorporateAction("A", date(2024, 1, 5), "split", 2)]
    out = adjust_candles({"A": _frame(), "B": _frame()}, acts)
    assert out["A"]["close"].iloc[0] == 50 and out["B"]["close"].iloc[0] == 100
    with pytest.raises(ValueError):
        CorporateAction("A", date(2024, 1, 5), "merger")
    with pytest.raises(ValueError):
        CorporateAction("A", date(2024, 1, 5), "split", 0)


def test_intraday_bars_on_ex_date_are_not_adjusted():
    t = pd.DatetimeIndex(["2024-01-04 15:25", "2024-01-05 09:15"], tz="Asia/Kolkata")
    f = adjustment_factors(t, [CorporateAction("X", date(2024, 1, 5), "split", 2)])
    assert f.tolist() == [2, 1]


def test_load_actions_csv(tmp_path):
    p = tmp_path / "a.csv"
    p.write_text(
        "symbol,ex_date,action,ratio,amount\n"
        "RELIANCE,2024-10-28,bonus,1:1,\n"
        "TCS,2024-06-01,split,5:1,\n"
        "INFY,2024-05-30,dividend,,28\n"
        "HDFC,2024-01-01,bonus,1:2,\n"
    )
    acts = load_actions_csv(p)
    assert [(a.symbol, a.kind, a.ratio, a.amount) for a in acts] == [
        ("RELIANCE", "bonus", 1.0, 0.0),
        ("TCS", "split", 5.0, 0.0),
        ("INFY", "dividend", 1.0, 28.0),
        ("HDFC", "bonus", 0.5, 0.0),
    ]
    assert acts[0].factor == 2 and acts[3].factor == 1.5
    p.write_text("symbol,ex_date,action\nX,notadate,split\n")
    with pytest.raises(ValueError, match=r"a\.csv:2"):
        load_actions_csv(p)
