"""Instrument master parsing, search, expiries and engine metadata."""
# ruff: noqa: D103, E501

from __future__ import annotations

import io
from datetime import date

import pytest

import honba as hb
from honba.data import DhanLoader, InstrumentMaster

DETAILED = """EXCH_ID,SEGMENT,SECURITY_ID,ISIN,INSTRUMENT,UNDERLYING_SYMBOL,SYMBOL_NAME,DISPLAY_NAME,SERIES,LOT_SIZE,SM_EXPIRY_DATE,STRIKE_PRICE,OPTION_TYPE,TICK_SIZE
NSE,E,3045,INE062A01020,EQUITY,SBIN,STATE BANK OF INDIA,State Bank Of India,EQ,1,,-0.01,,5.0000
BSE,E,500112,INE062A01020,EQUITY,SBIN,STATE BANK OF INDIA,State Bank Of India,A,1,,-0.01,,5.0000
NSE,D,51700,,FUTIDX,NIFTY,NIFTY-Sep2026-FUT,NIFTY SEP FUT,NA,75,2026-09-29 14:30:00,-0.01,,5.0000
NSE,D,51701,,FUTIDX,NIFTY,NIFTY-Oct2026-FUT,NIFTY OCT FUT,NA,75,2026-10-27 14:30:00,-0.01,,5.0000
NSE,D,51710,,OPTIDX,NIFTY,NIFTY-Sep2026-24000-CE,NIFTY 24000 CE,NA,75,2026-09-29 14:30:00,24000.0,CE,5.0000
NSE,D,52000,,FUTSTK,SBIN,SBIN-Sep2026-FUT,SBIN SEP FUT,NA,750,2026-09-29 14:30:00,-0.01,,5.0000
MCX,M,1234,,FUTCOM,GOLD,GOLD-Oct2026-FUT,GOLD FUT,NA,100,2026-10-05 23:30:00,-0.01,,100.0000
"""

COMPACT = """SEM_EXM_EXCH_ID,SEM_SEGMENT,SEM_SMST_SECURITY_ID,SEM_INSTRUMENT_NAME,SEM_EXPIRY_CODE,SEM_TRADING_SYMBOL,SEM_LOT_UNITS,SEM_CUSTOM_SYMBOL,SEM_EXPIRY_DATE,SEM_STRIKE_PRICE,SEM_OPTION_TYPE,SEM_TICK_SIZE,SEM_SERIES
NSE,E,11536,EQUITY,0,TCS,1,Tata Consultancy,,0,,5,EQ
"""


@pytest.fixture
def master():
    return InstrumentMaster.from_csv(io.StringIO(DETAILED))


def test_parse_segments_and_units(master):
    assert len(master) == 7
    sbin = master.get("SBIN")
    assert (sbin.exchange, sbin.exchange_segment, sbin.series) == ("NSE", "NSE_EQ", "EQ")
    assert sbin.tick_size == pytest.approx(0.05) and sbin.isin == "INE062A01020"
    assert master.get("NIFTY-Sep2026-FUT").segment == "equity_futures"
    assert master.get("NIFTY-Sep2026-24000-CE").segment == "equity_options"
    assert master.get("GOLD-Oct2026-FUT").segment == "commodity"
    assert master.get("NIFTY-Sep2026-FUT").expiry == date(2026, 9, 29)


def test_compact_format():
    m = InstrumentMaster.from_csv(io.StringIO(COMPACT))
    rec = m.get("tcs")
    assert rec.security_id == "11536" and rec.name == "Tata Consultancy"


def test_search_ranking_and_filters(master):
    hits = master.search("sbin")
    assert hits[0].symbol == "SBIN" and hits[0].exchange == "NSE"
    assert {h.symbol for h in master.search("nifty", segment="equity_options")} == {
        "NIFTY-Sep2026-24000-CE"
    }
    assert master.search("INE062A01020", exchange="BSE")[0].security_id == "500112"
    assert master.search("zzz") == []
    assert len(master.search("sbin", limit=1)) == 1


def test_expiries_and_contracts(master):
    assert master.expiries("NIFTY") == [date(2026, 9, 29), date(2026, 10, 27)]
    assert master.expiries("NIFTY", instrument="OPTIDX") == [date(2026, 9, 29)]
    assert master.expiries("NIFTY", after=date(2026, 10, 1)) == [date(2026, 10, 27)]
    cts = master.contracts("NIFTY", date(2026, 9, 29), option_type="CE")
    assert [c.strike for c in cts] == [24000.0]


def test_to_engine_instruments_and_freeze(master, tmp_path):
    freeze = tmp_path / "freeze.csv"
    freeze.write_text("SYMBOL,VOL_FRZ_QTY\nNIFTY,1800\nSBIN,10000\n")
    m = master.with_freeze_quantities(freeze)
    out = m.to_engine_instruments(["SBIN", "NIFTY-Sep2026-FUT", "NIFTY-Sep2026-24000-CE"])
    fut = out["NIFTY-Sep2026-FUT"]
    assert isinstance(fut, hb.Instrument)
    assert (fut.segment, fut.lot_size, fut.tick_size, fut.freeze_qty) == (
        "equity_futures",
        75.0,
        0.05,
        1800.0,
    )
    assert out["SBIN"].segment == "equity_cash" and out["SBIN"].freeze_qty == 10000.0
    assert master.get("NIFTY-Sep2026-FUT").freeze_qty is None  # original untouched
    cfg = hb.BacktestConfig(instruments=out)
    assert cfg.instruments["SBIN"].tick_size == pytest.approx(0.05)
    with pytest.raises(KeyError):
        m.to_engine_instruments(["NOPE"])
    assert m.to_engine_instruments(["NOPE"], strict=False) == {}


def test_dhan_security_ids_feed_the_loader(master):
    sec = master.dhan_security("NIFTY-Sep2026-FUT")
    assert (sec.security_id, sec.exchange_segment, sec.instrument) == ("51700", "NSE_FNO", "FUTIDX")
    assert DhanLoader(master=master).security("SBIN").security_id == "3045"
    assert master.to_frame().shape[0] == 7


def test_compact_derivative_underlying_from_trading_symbol():
    text = COMPACT + "NSE,D,9,FUTIDX,0,NIFTY-Sep2026-FUT,75,NIFTY FUT,2026-09-29,0,,5,NA\n"
    m = InstrumentMaster.from_csv(io.StringIO(text))
    assert m.expiries("NIFTY") == [date(2026, 9, 29)]
