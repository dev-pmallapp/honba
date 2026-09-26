"""Pydantic schemas for Honba API."""

from __future__ import annotations
from typing import Any, List, Optional
from pydantic import BaseModel, Field


class CandleItem(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class PeerComparison(BaseModel):
    symbol: str
    name: str
    price: float
    pe: float
    marketCap: float
    changePercent: float


class ShareholdingPattern(BaseModel):
    promoter: float
    fii: float
    dii: float
    public: float
    others: float


class QuarterlyFinancial(BaseModel):
    period: str
    revenue: float  # in Cr INR
    netProfit: float
    operatingMargin: float  # %
    eps: float


class IndexConstituent(BaseModel):
    symbol: str
    name: str
    weight: float  # %
    price: float
    changePercent: float
    sector: str


class MutualFundHolding(BaseModel):
    symbol: str
    name: str
    sector: str
    weight: float  # %
    assetClass: str = "Equity"


class IpoDetails(BaseModel):
    status: str  # 'upcoming' | 'open' | 'closed' | 'listed'
    priceBand: str
    lotSize: int
    minInvestment: float
    issueSizeCr: float
    freshIssueCr: float
    ofsCr: float
    openDate: str
    closeDate: str
    allotmentDate: str
    listingDate: str
    gmpPrice: float
    gmpPercent: float
    subscriptionQib: float
    subscriptionNii: float
    subscriptionRetail: float
    subscriptionTotal: float
    leadManagers: List[str]


class InstrumentSchema(BaseModel):
    symbol: str
    name: str
    country: str = "IN"
    exchange: str = "NSE"
    sector: str = "Financial"
    industry: str = "General"
    assetType: str = "stocks"  # 'stocks' | 'etf' | 'bonds' | 'mf' | 'index' | 'ipo'
    price: float
    change: float
    changePercent: float
    volume: int = 0
    avgVolume30d: int = 0
    marketCap: float = 0.0
    marketCapTier: str = "large"
    pe: Optional[float] = None
    forwardPe: Optional[float] = None
    pb: Optional[float] = None
    eps: Optional[float] = None
    dividendYield: Optional[float] = None
    high52: float = 0.0
    low52: float = 0.0
    rsi14: float = 50.0
    sma20: float = 0.0
    sma50: float = 0.0
    sma200: float = 0.0
    technicalRating: str = "Neutral"
    perf1W: Optional[float] = None
    perf1M: Optional[float] = None
    perf3M: Optional[float] = None
    perf1Y: Optional[float] = None
    revenueGrowth: Optional[float] = None
    netMargin: Optional[float] = None
    roce: Optional[float] = None
    roe: Optional[float] = None
    debtToEquity: Optional[float] = None
    # Extra delivery analytics for equities
    deliverableQty: Optional[int] = None
    deliveryPct: Optional[float] = None


class InstrumentDetailResponse(BaseModel):
    instrument: InstrumentSchema
    candles: List[CandleItem] = []
    about: str = ""
    # Asset-type specifics:
    peers: List[PeerComparison] = []
    shareholding: Optional[ShareholdingPattern] = None
    quarterly: List[QuarterlyFinancial] = []
    constituents: List[IndexConstituent] = []  # For index
    sectorWeights: dict[str, float] = {}  # For index
    advances: Optional[int] = None  # For index
    declines: Optional[int] = None  # For index
    mfHoldings: List[MutualFundHolding] = []  # For mutual funds
    aumCr: Optional[float] = None  # For mutual funds
    expenseRatio: Optional[float] = None  # For mutual funds
    fundManager: Optional[str] = None  # For mutual funds
    categoryAvgReturn1Y: Optional[float] = None  # For mutual funds
    cagr3Y: Optional[float] = None  # For mutual funds
    cagr5Y: Optional[float] = None  # For mutual funds
    ipoDetails: Optional[IpoDetails] = None  # For IPOs


class LiveTick(BaseModel):
    symbol: str
    price: float
    change: float
    changePercent: float
    volume: int
    timestamp: int
