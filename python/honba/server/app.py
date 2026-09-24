"""FastAPI application gateway for Web UI, Parquet Data Catalog, and WebSocket feeds."""

from __future__ import annotations

import asyncio
from datetime import date
import logging
from pathlib import Path
from typing import Any, Optional

from fastapi import BackgroundTasks, FastAPI, Query, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import polars as pl

from honba.data.bhavcopy import BhavcopyIngestion

logger = logging.getLogger("honba.server")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Honba Quant API Gateway", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ingestion = BhavcopyIngestion()


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "engine": "honba-core-rust",
        "catalog_bars_exists": ingestion.daily_bars_path.exists(),
        "instruments_exists": ingestion.instruments_path.exists(),
    }


@app.get("/api/instruments")
async def get_instruments(
    country: str = Query("IN", description="Country code (IN, US, JP, UK)"),
    limit: int = Query(1000, description="Max instruments to return"),
    search: Optional[str] = Query(None, description="Symbol or name search"),
) -> list[dict[str, Any]]:
    """Loads instruments dynamically from the compressed Parquet store in assets/data."""
    if not ingestion.instruments_path.exists():
        # Trigger an initial ingestion if not already created
        await ingestion.update_daily_bhavcopy()

    df = pl.read_parquet(ingestion.instruments_path)

    if search:
        s = search.upper().strip()
        df = df.filter(
            pl.col("symbol").str.contains(s) | pl.col("name").str.to_uppercase().str.contains(s)
        )

    if limit > 0:
        df = df.head(limit)

    results = []
    for row in df.iter_rows(named=True):
        close_p = row.get("close") or 0.0
        change = row.get("change") or 0.0
        change_pct = row.get("change_percent") or 0.0
        vol = row.get("volume") or 0

        # Technical rating estimation based on change %
        rating = "Neutral"
        if change_pct > 3.0:
            rating = "Strong Buy"
        elif change_pct > 0.5:
            rating = "Buy"
        elif change_pct < -3.0:
            rating = "Strong Sell"
        elif change_pct < -0.5:
            rating = "Sell"

        item = {
            "symbol": row["symbol"],
            "name": row.get("name") or row["symbol"],
            "country": "IN",
            "exchange": "NSE",
            "sector": "Broad Market",
            "industry": row.get("series", "EQ"),
            "price": close_p,
            "change": change,
            "changePercent": change_pct,
            "volume": vol,
            "avgVolume30d": vol,
            "marketCap": int(close_p * vol * 100),
            "marketCapTier": row.get("market_cap_tier") or "mid",
            "pe": 24.5,
            "forwardPe": 21.0,
            "pb": 2.8,
            "eps": round(close_p / 24.5, 2) if close_p > 0 else 0.0,
            "dividendYield": 0.8,
            "high52": row.get("high") or close_p,
            "low52": row.get("low") or close_p,
            "rsi14": 52.0,
            "sma20": close_p,
            "sma50": close_p,
            "sma200": close_p,
            "technicalRating": rating,
            "perf1W": change_pct,
            "perf1M": change_pct,
            "perf3M": change_pct,
            "perf1Y": change_pct,
            "revenueGrowth": 12.0,
            "netMargin": 8.5,
            "roce": 15.0,
            "roe": 14.0,
            "debtToEquity": 0.4,
            "deliveryPct": row.get("delivery_pct", 0.0),
            "sparkline": [close_p, close_p],
            "history": [],
            "description": f"{row.get('name', row['symbol'])} listed on NSE (Series {row.get('series', 'EQ')}).",
        }
        results.append(item)

    return results


@app.post("/api/instruments/update")
async def trigger_update(
    background_tasks: BackgroundTasks,
    target_date: Optional[str] = Query(None, description="Optional target date YYYY-MM-DD"),
):
    """Triggers an asynchronous background update of the daily Bhavcopy into Parquet."""
    parsed_date = date.fromisoformat(target_date) if target_date else None

    async def _run():
        try:
            await ingestion.update_daily_bhavcopy(target_date=parsed_date)
            logger.info("Background Bhavcopy update finished successfully.")
        except Exception as e:
            logger.error("Background Bhavcopy update failed: %s", e)

    background_tasks.add_task(_run)
    return {
        "status": "queued",
        "message": f"Daily Bhavcopy update initiated for {target_date or 'latest market session'}",
    }


@app.get("/api/bars/{symbol}")
async def get_symbol_bars(
    symbol: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Vectorized scan of historical bars for a specific symbol from daily_bars.parquet."""
    try:
        df = ingestion.load_symbol_history(symbol=symbol, start_date=start_date, end_date=end_date)
        return df.to_dicts()
    except Exception as e:
        return {"error": str(e)}


@app.websocket("/ws/telemetry")
async def ws_telemetry(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.send_json({"heartbeat": "ping", "engine_status": "ready"})
            await asyncio.sleep(5)
    except Exception:
        pass
