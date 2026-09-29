"""``InstrumentMaster``: Dhan's scrip master as a searchable table feeding the engine config."""

from __future__ import annotations

import csv
import io
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd

from honba.strategy.market import Instrument

from .dhan import DhanSecurity

__all__ = ["InstrumentMaster", "InstrumentRecord"]

# Column names of Dhan's compact (api-scrip-master.csv) and detailed (...-detailed.csv) files.
_ALIASES: dict[str, tuple[str, ...]] = {
    "exchange": ("SEM_EXM_EXCH_ID", "EXCH_ID"),
    "segment_code": ("SEM_SEGMENT", "SEGMENT"),
    "security_id": ("SEM_SMST_SECURITY_ID", "SECURITY_ID"),
    "instrument": ("SEM_INSTRUMENT_NAME", "INSTRUMENT"),
    "symbol": ("SEM_TRADING_SYMBOL",),
    "name": ("SEM_CUSTOM_SYMBOL", "DISPLAY_NAME"),
    "lot_size": ("SEM_LOT_UNITS", "LOT_SIZE"),
    "expiry": ("SEM_EXPIRY_DATE", "SM_EXPIRY_DATE"),
    "strike": ("SEM_STRIKE_PRICE", "STRIKE_PRICE"),
    "option_type": ("SEM_OPTION_TYPE", "OPTION_TYPE"),
    "tick_size": ("SEM_TICK_SIZE", "TICK_SIZE"),
    "series": ("SEM_SERIES", "SERIES"),
    "isin": ("SEM_ISIN", "ISIN"),
    "underlying": ("SEM_UNDERLYING_SYMBOL", "UNDERLYING_SYMBOL"),
    "expiry_code": ("SEM_EXPIRY_CODE",),
    "freeze_qty": ("FREEZE_QTY", "SEM_FREEZE_QTY", "VOL_FRZ_QTY"),
}

_EXCHANGE_SEGMENT = {
    ("NSE", "E"): "NSE_EQ",
    ("BSE", "E"): "BSE_EQ",
    ("NSE", "D"): "NSE_FNO",
    ("BSE", "D"): "BSE_FNO",
    ("NSE", "I"): "IDX_I",
    ("BSE", "I"): "IDX_I",
    ("NSE", "C"): "NSE_CURRENCY",
    ("BSE", "C"): "BSE_CURRENCY",
    ("MCX", "M"): "MCX_COMM",
}


@dataclass(frozen=True, slots=True)
class InstrumentRecord:
    """One row of the scrip master (tick size in rupees, lot size in units)."""

    exchange: str
    exchange_segment: str
    security_id: str
    symbol: str
    name: str
    instrument: str
    series: str
    isin: str
    lot_size: float
    tick_size: float | None
    freeze_qty: float | None
    expiry: date | None
    strike: float | None
    option_type: str
    underlying: str
    expiry_code: int = 0

    @property
    def segment(self) -> str:
        """The SDK segment (``equity_cash``, ``equity_futures``, ``equity_options``, ...)."""
        inst = self.instrument.upper()
        if self.exchange_segment == "MCX_COMM":
            return "commodity"
        if self.exchange_segment.endswith("CURRENCY") or "CUR" in inst:
            return "currency"
        if inst.startswith("OPT"):
            return "equity_options"
        if inst.startswith("FUT"):
            return "equity_futures"
        return "equity_cash"

    def to_instrument(self) -> Instrument:
        """The engine's exchange rules for this contract."""
        return Instrument(
            segment=self.segment,
            lot_size=self.lot_size if self.lot_size > 0 else 1.0,
            tick_size=self.tick_size if self.tick_size and self.tick_size > 0 else None,
            freeze_qty=self.freeze_qty if self.freeze_qty and self.freeze_qty > 0 else None,
        )

    def to_dhan(self) -> DhanSecurity:
        """The ids the Dhan API needs."""
        return DhanSecurity(
            self.security_id, self.exchange_segment, self.instrument, self.expiry_code
        )


def _pick(row: Mapping[str, str], field: str) -> str:
    for col in _ALIASES[field]:
        value = row.get(col)
        if value is not None and value.strip() not in ("", "NA", "nan"):
            return value.strip()
    return ""


def _num(text: str) -> float | None:
    try:
        return float(text) if text else None
    except ValueError:
        return None


def _expiry(text: str) -> date | None:
    if not text or text.startswith("0001"):
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d-%m-%Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


class InstrumentMaster:
    """Searchable Dhan scrip master.

    ``from_csv`` reads the compact or the detailed scrip master file (download it from Dhan; this
    class never touches the network). The scrip master has no freeze quantity: pass an NSE freeze
    quantity file to :meth:`with_freeze_quantities` (or include a ``FREEZE_QTY`` column). Dhan
    quotes ``TICK_SIZE`` in paise, so it is divided by ``tick_divisor`` (100).
    """

    def __init__(self, records: Iterable[InstrumentRecord]) -> None:
        self.records = list(records)
        self._by_symbol: dict[str, list[InstrumentRecord]] = {}
        for rec in self.records:
            self._by_symbol.setdefault(rec.symbol.upper(), []).append(rec)

    def __len__(self) -> int:
        return len(self.records)

    @classmethod
    def from_csv(
        cls, source: str | Path | io.TextIOBase, *, tick_divisor: float = 100.0
    ) -> InstrumentMaster:
        """Load a Dhan scrip master CSV (path or open text file)."""
        if isinstance(source, (str, Path)):
            with open(source, newline="", encoding="utf-8-sig") as handle:
                return cls._parse(csv.DictReader(handle), tick_divisor)
        return cls._parse(csv.DictReader(source), tick_divisor)

    @classmethod
    def _parse(cls, reader: Iterable[dict[str, str]], tick_divisor: float) -> InstrumentMaster:
        out: list[InstrumentRecord] = []
        for row in reader:
            exch = _pick(row, "exchange").upper()
            code = _pick(row, "segment_code").upper()
            instrument = _pick(row, "instrument").upper()
            symbol = _pick(row, "symbol")
            if not symbol:  # detailed file: derivatives carry their trading symbol in SYMBOL_NAME
                derivative = instrument.startswith(("FUT", "OPT"))
                symbol = row.get("SYMBOL_NAME", "").strip() if derivative else ""
                symbol = symbol or _pick(row, "underlying")
            if not (exch and code and symbol):
                continue
            tick = _num(_pick(row, "tick_size"))
            out.append(
                InstrumentRecord(
                    exchange=exch,
                    exchange_segment=_EXCHANGE_SEGMENT.get((exch, code), f"{exch}_{code}"),
                    security_id=_pick(row, "security_id"),
                    symbol=symbol,
                    name=_pick(row, "name") or symbol,
                    instrument=instrument,
                    series=_pick(row, "series").upper(),
                    isin=_pick(row, "isin"),
                    lot_size=_num(_pick(row, "lot_size")) or 1.0,
                    tick_size=None if tick is None else tick / tick_divisor,
                    freeze_qty=_num(_pick(row, "freeze_qty")),
                    expiry=_expiry(_pick(row, "expiry")),
                    strike=_num(_pick(row, "strike")),
                    option_type=_pick(row, "option_type").upper(),
                    underlying=_pick(row, "underlying") or symbol.split("-")[0],
                    expiry_code=int(_num(_pick(row, "expiry_code")) or 0),
                )
            )
        return cls(out)

    # -- freeze quantities -------------------------------------------------------------------
    def with_freeze_quantities(self, freeze: Mapping[str, float] | str | Path) -> InstrumentMaster:
        """Copy with ``freeze_qty`` filled from ``{underlying: qty}`` or an NSE freeze CSV.

        The CSV needs ``SYMBOL`` and ``VOL_FRZ_QTY`` (or ``FREEZE_QTY``) columns. Derivative
        contracts match on their underlying, equities on their symbol.
        """
        if not isinstance(freeze, Mapping):
            table: dict[str, float] = {}
            with open(freeze, newline="", encoding="utf-8-sig") as handle:
                for row in csv.DictReader(handle):
                    row = {k.strip().upper(): v for k, v in row.items() if k}
                    qty = _num((row.get("VOL_FRZ_QTY") or row.get("FREEZE_QTY") or "").strip())
                    if row.get("SYMBOL") and qty:
                        table[row["SYMBOL"].strip().upper()] = qty
            freeze = table
        upper = {k.upper(): v for k, v in freeze.items()}
        out = []
        for rec in self.records:
            qty = upper.get(rec.underlying.upper()) or upper.get(rec.symbol.upper())
            out.append(rec if qty is None else _replace(rec, freeze_qty=float(qty)))
        return InstrumentMaster(out)

    # -- queries -----------------------------------------------------------------------------
    def search(
        self,
        query: str,
        *,
        exchange: str | None = None,
        segment: str | None = None,
        instrument: str | None = None,
        limit: int = 20,
    ) -> list[InstrumentRecord]:
        """Case-insensitive search of symbol / name / ISIN: exact, then prefix, then substring.

        ``segment`` is the SDK segment (``equity_cash`` ...) or the Dhan exchange segment
        (``NSE_EQ`` ...); ``instrument`` the Dhan instrument (``EQUITY``, ``FUTSTK`` ...).
        """
        q = query.strip().upper()
        ranked: list[tuple[int, str, InstrumentRecord]] = []
        for rec in self.records:
            if exchange and rec.exchange != exchange.upper():
                continue
            if (
                segment
                and segment.lower() != rec.segment
                and segment.upper() != (rec.exchange_segment)
            ):
                continue
            if instrument and rec.instrument != instrument.upper():
                continue
            names = (rec.symbol.upper(), rec.name.upper(), rec.isin.upper())
            if q in names:
                rank = 0
            elif any(n.startswith(q) for n in names):
                rank = 1
            elif any(q in n for n in names):
                rank = 2
            else:
                continue
            ranked.append((rank, rec.symbol, rec))
        ranked.sort(key=lambda t: (t[0], t[2].expiry or date.max, t[1]))
        return [r for _, _, r in ranked[:limit]]

    def get(
        self, symbol: str, *, exchange: str | None = None, expiry: date | None = None
    ) -> InstrumentRecord | None:
        """The record for an exact trading symbol (NSE equity preferred, else first match)."""
        matches = self._by_symbol.get(symbol.strip().upper(), [])
        if exchange:
            matches = [m for m in matches if m.exchange == exchange.upper()]
        if expiry:
            matches = [m for m in matches if m.expiry == expiry]
        if not matches:
            return None

        def rank(rec: InstrumentRecord) -> tuple[int, int, int]:
            return (
                rec.exchange != "NSE",
                rec.exchange_segment != "NSE_EQ",
                rec.series not in ("EQ", ""),
            )

        return min(matches, key=rank)

    def expiries(
        self, underlying: str, *, instrument: str | None = None, after: date | None = None
    ) -> list[date]:
        """Sorted expiry dates of the derivatives of ``underlying`` (e.g. ``NIFTY``)."""
        u = underlying.strip().upper()
        found = {
            r.expiry
            for r in self.records
            if r.expiry
            and r.underlying.upper() == u
            and (instrument is None or r.instrument == instrument.upper())
            and (after is None or r.expiry >= after)
        }
        return sorted(found)

    def contracts(
        self,
        underlying: str,
        expiry: date | None = None,
        *,
        instrument: str | None = None,
        option_type: str | None = None,
    ) -> list[InstrumentRecord]:
        """Derivative contracts of ``underlying`` (optionally one expiry / kind), by strike."""
        u = underlying.strip().upper()
        out = [
            r
            for r in self.records
            if r.expiry
            and r.underlying.upper() == u
            and (expiry is None or r.expiry == expiry)
            and (instrument is None or r.instrument == instrument.upper())
            and (option_type is None or r.option_type == option_type.upper())
        ]
        return sorted(out, key=lambda r: (r.expiry or date.max, r.strike or 0.0, r.symbol))

    def dhan_security(self, symbol: str) -> DhanSecurity | None:
        """Ids for :class:`~honba.data.DhanLoader` (``None`` for an unknown symbol)."""
        rec = self.get(symbol)
        return rec.to_dhan() if rec else None

    def to_engine_instruments(
        self, symbols: Iterable[str], *, exchange: str | None = None, strict: bool = True
    ) -> dict[str, Instrument]:
        """``{symbol: hb.Instrument}`` for ``BacktestConfig(instruments=...)``.

        Symbols are exact trading symbols (``SBIN``, ``NIFTY-Sep2026-FUT``). Unknown symbols
        raise ``KeyError`` unless ``strict=False`` (they are then left out and the engine treats
        them as equity cash, lot 1).
        """
        out: dict[str, Instrument] = {}
        missing = []
        for sym in symbols:
            rec = self.get(sym, exchange=exchange)
            if rec is None:
                missing.append(sym)
            else:
                out[sym] = rec.to_instrument()
        if missing and strict:
            raise KeyError(f"not in the instrument master: {missing}")
        return out

    def to_frame(self) -> pd.DataFrame:
        """The whole master as a DataFrame (one column per record field)."""
        return pd.DataFrame([{**_asdict(r), "segment": r.segment} for r in self.records])


def _asdict(rec: InstrumentRecord) -> dict[str, Any]:
    return {f: getattr(rec, f) for f in rec.__dataclass_fields__}


def _replace(rec: InstrumentRecord, **changes: Any) -> InstrumentRecord:
    return InstrumentRecord(**{**_asdict(rec), **changes})
