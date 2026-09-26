"""FastAPI Application Server for Honba Financial Platform."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import logging
from typing import Any, AsyncGenerator, List, Optional

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from honba.api.market_store import market_store
from honba.api.models import (
    CandleItem,
    InstrumentDetailResponse,
    InstrumentSchema,
    LiveTick,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("honba.api.server")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manages background task lifecycle."""
    logger.info("Honba API Server initializing background data services...")
    await market_store.start_background_updater()
    yield
    logger.info("Honba API Server shutting down...")
    await market_store.stop_background_updater()


app = FastAPI(
    title="Honba Financial Engine API",
    description="High-frequency market data, universe catalog, and quantitative research backend.",
    version="0.1.0",
    lifespan=lifespan,
)

# Enable CORS for frontend Vite development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check() -> dict[str, Any]:
    """Health check and engine status."""
    return {
        "status": "healthy",
        "engine": "honba-fastapi",
        "totalInstruments": len(market_store.instruments),
        "lastUpdated": market_store.last_updated.isoformat(),
        "activeSubscribers": len(market_store.active_subscribers),
    }


@app.get("/api/instruments", response_model=List[InstrumentSchema])
async def list_instruments(
    country: str = Query("IN", description="Two-letter country code (IN, US, JP, UK)"),
    asset_type: Optional[str] = Query(None, description="stocks | index | mf | ipo | etf"),
    search: Optional[str] = Query(None, description="Search ticker symbol or company name"),
    limit: int = Query(4000, ge=1, le=10000),
    offset: int = Query(0, ge=0),
) -> List[InstrumentSchema]:
    """Fetches paginated instruments matching criteria from the active universe."""
    return market_store.get_instruments(
        country=country,
        asset_type=asset_type,
        search=search,
        limit=limit,
        offset=offset,
    )


@app.get("/api/instruments/categories")
async def get_categories_overview() -> dict[str, Any]:
    """Returns overview statistics per instrument category."""
    all_insts = list(market_store.instruments.values())
    equities = [i for i in all_insts if i.assetType == "stocks"]
    indices = [i for i in all_insts if i.assetType == "index"]
    mfs = [i for i in all_insts if i.assetType == "mf"]
    ipos = [i for i in all_insts if i.assetType == "ipo"]

    return {
        "counts": {
            "total": len(all_insts),
            "equities": len(equities),
            "indices": len(indices),
            "mutualFunds": len(mfs),
            "ipos": len(ipos),
        },
        "topMovers": {
            "gainers": sorted(equities, key=lambda x: x.changePercent, reverse=True)[:5],
            "losers": sorted(equities, key=lambda x: x.changePercent)[:5],
            "mostActive": sorted(equities, key=lambda x: x.volume, reverse=True)[:5],
        },
    }


@app.get("/api/instruments/{symbol}", response_model=InstrumentDetailResponse)
async def get_instrument_detail(symbol: str) -> InstrumentDetailResponse:
    """Returns deep TradingView-grade details for a single symbol."""
    detail = market_store.get_instrument_detail(symbol)
    if not detail:
        raise HTTPException(status_code=404, detail=f"Instrument '{symbol}' not found")
    return detail


@app.get("/api/instruments/{symbol}/candles", response_model=List[CandleItem])
async def get_instrument_candles(
    symbol: str,
    timeframe: str = Query("1M", description="1D, 5D, 1M, 6M, 1Y, 5Y"),
) -> List[CandleItem]:
    """Returns candlestick history for charts."""
    detail = market_store.get_instrument_detail(symbol)
    if not detail:
        raise HTTPException(status_code=404, detail=f"Instrument '{symbol}' not found")
    return detail.candles


@app.post("/api/instruments/refresh")
async def trigger_refresh() -> dict[str, Any]:
    """Manually triggers background dataset refresh."""
    # Re-initialize universe from latest Parquet
    market_store._initialize_universe()
    return {
        "success": True,
        "totalInstruments": len(market_store.instruments),
        "refreshedAt": market_store.last_updated.isoformat(),
    }


# WebSocket endpoint for real-time tick streaming
@app.websocket("/ws")
@app.websocket("/ws/market")
async def websocket_market_feed(websocket: WebSocket) -> None:
    """Streams live real-time price updates and market ticks."""
    await websocket.accept()
    logger.info("Client connected to WebSocket live market feed.")

    queue: asyncio.Queue[LiveTick] = asyncio.Queue(maxsize=100)

    async def on_tick(tick: LiveTick) -> None:
        try:
            if not queue.full():
                queue.put_nowait(tick)
        except Exception:
            pass

    market_store.subscribe_ticks(on_tick)

    try:
        while True:
            # Send tick or handle ping/pong
            try:
                tick = await asyncio.wait_for(queue.get(), timeout=20.0)
                await websocket.send_json(tick.model_dump())
            except asyncio.TimeoutError:
                # Keep-alive heartbeat
                await websocket.send_json({"type": "ping", "timestamp": int(asyncio.get_event_loop().time() * 1000)})
    except WebSocketDisconnect:
        logger.info("Client disconnected from WebSocket.")
    except Exception as exc:
        logger.warning("WebSocket connection closed with error: %s", exc)
    finally:
        market_store.unsubscribe_ticks(on_tick)


def run_server(host: str = "127.0.0.1", port: int = 8000, reload: bool = False) -> None:
    """Entry point to launch the uvicorn API server."""
    import uvicorn

    uvicorn.run("honba.api.server:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    run_server(host="127.0.0.1", port=8000)
