"""Data layer — ingestion, cleaning, storage, instrument registry.

Consolidates the former ``soba``, ``nagare``, ``renko``, ``kage`` and
``tsuchi`` packages:

    Soba    (相場) market data hub — instrument registry, NSE/BSE session
                  calendars, ISIN lookup, price feed abstraction
    Nagare  (流れ) streaming — WebSocket ingestion, tick-to-bar aggregation,
                  live option chain snapshots
    Renko  (練行足) cleaning — bhavcopy parsing, corporate action adjustment,
                  outlier detection
    Kage   (陰/影) scrapers — Screener.in, Moneycontrol, NSE/BSE downloads
    Tsuchi  (土)  storage — PostgreSQL schema, Parquet layout, caching

Storage rule
------------
This package owns its Parquet schema and writes it with pyarrow/polars
directly. ``ParquetDataCatalog`` is an *export target*, not the system of
record — its API changed materially in v2.0.0rc6 and the Indian dataset
(adjusted bars, chain snapshots, PIT index membership, filing-stamped
fundamentals) is the one asset that must outlive any Nautilus rename.

Conversion to the catalog happens only in ``_catalog_export.py``.

See ``docs/research/build-vs-extend.md`` §6d.
"""
