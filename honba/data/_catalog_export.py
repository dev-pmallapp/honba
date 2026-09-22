"""The ONLY file in ``honba.data`` that may import ``nautilus_trader``.

Why this file exists
--------------------
honba's one defensible asset is the Indian dataset: corporate-action
adjusted price history, point-in-time index membership, a correct SEBI
cost model, and an option-chain snapshot archive. Everything else in the
ingestion layer is commoditized (``jugaad-data``, ``nsepython``) or
buyable (Kite Connect, ~Rs 2,000/month).

``ParquetDataCatalog``'s API changed materially in v2.0.0rc6
(``data_type`` moved from a string to a ``NautilusDataType`` enum; a
``nautilus catalog migrate-parquet`` tool shipped alongside). Storing the
only copy of the dataset inside it would couple the asset to that churn.

So: ``honba.data`` owns its own Parquet schema, written with
pyarrow/polars. This module converts *into* the catalog for a backtest
run. The dataset survives catalog renames, a v3, or dropping Nautilus
entirely.

Contract
--------
In:   own-schema Parquet (documented in ``docs/schemas.md``)
Out:  a populated ``ParquetDataCatalog`` ready for a backtest run

The reverse direction is not supported. The catalog is a derived
artifact; regenerate it, never hand-edit it, never treat it as the system
of record.

Schema discipline (see docs/research/build-vs-extend.md §6b)
-----------------------------------------------------------
Three silent correctness bugs would invalidate a year of results, and all
three are prevented at write time, here in the data layer, not later:

1. **Unadjusted prices** — bhavcopy is unadjusted; without corporate
   action adjustment every bonus/split reads as a -50% single-day return
   and momentum strategies will "discover" it.
2. **Survivorship** — backtesting today's NIFTY 500 against 2015 data
   inflates every result. Join against point-in-time membership.
3. **Restated fundamentals** — Screener.in shows *current, restated*
   financials with no as-reported history. Stamp every fundamental event
   with the BSE/NSE **filing timestamp**, not the period-end date, or
   "quarterly profit up >20%" is look-ahead biased by construction. Same
   discipline for corporate actions (announcement vs ex-date) and index
   changes.
"""

__all__: list[str] = []
