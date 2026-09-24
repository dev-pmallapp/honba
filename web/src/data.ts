import { MarketBar, WatchlistQuote, OptionStrike, BacktestTearsheet } from "./types";

export const WATCHLIST_DATA: WatchlistQuote[] = [
  { symbol: "NIFTY 50", name: "Nifty 50 Index", price: 24850.2, change: 112.3, changePercent: 0.45, exchange: "NSE", volume: "142.5M", high: 24910.0, low: 24780.1 },
  { symbol: "NIFTY ALPHA 50", name: "Alpha Momentum Index", price: 8124.6, change: 96.4, changePercent: 1.2, exchange: "NSE", volume: "42.8M", high: 8180.2, low: 8020.15 },
  { symbol: "BANKNIFTY", name: "Nifty Bank Index", price: 51320.5, change: -145.2, changePercent: -0.28, exchange: "NSE", volume: "88.1M", high: 51600.0, low: 51150.0 },
  { symbol: "NIFTY200 A30", name: "Alpha 30 Low Volatility", price: 4925.1, change: 41.8, changePercent: 0.85, exchange: "NSE", volume: "18.3M", high: 4950.0, low: 4890.0 },
  { symbol: "RELIANCE", name: "Reliance Industries", price: 2984.75, change: 24.5, changePercent: 0.83, exchange: "NSE", volume: "12.4M", high: 3005.0, low: 2962.0 },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", price: 1642.1, change: -6.9, changePercent: -0.42, exchange: "NSE", volume: "19.8M", high: 1658.0, low: 1636.5 },
  { symbol: "TCS", name: "Tata Consultancy Services", price: 4280.0, change: 52.4, changePercent: 1.24, exchange: "NSE", volume: "4.1M", high: 4310.0, low: 4240.0 },
  { symbol: "NIFTYBEES", name: "Nippon ETF Nifty BeES", price: 274.5, change: 1.15, changePercent: 0.42, exchange: "NSE", volume: "5.6M", high: 275.5, low: 273.8 },
  { symbol: "LIQUIDBEES", name: "Nippon Liquid ETF", price: 1000.0, change: 0.0, changePercent: 0.0, exchange: "NSE", volume: "2.1M", high: 1000.05, low: 999.98 },
];

export function generateSampleBars(symbol: string, timeframe: string = "5m"): MarketBar[] {
  let basePrice = 8000;
  if (symbol === "NIFTY 50") basePrice = 24600;
  else if (symbol === "BANKNIFTY") basePrice = 51000;
  else if (symbol === "NIFTY200 A30") basePrice = 4850;
  else if (symbol === "RELIANCE") basePrice = 2920;
  else if (symbol === "TCS") basePrice = 4200;
  else if (symbol === "HDFCBANK") basePrice = 1640;

  let stepSec = 300; // 5m
  if (timeframe === "1s") stepSec = 1;
  else if (timeframe === "1m") stepSec = 60;
  else if (timeframe === "15m") stepSec = 900;
  else if (timeframe === "1h") stepSec = 3600;
  else if (timeframe === "1D") stepSec = 86400;

  const count = 90;
  const bars: MarketBar[] = [];
  let currentPrice = basePrice;
  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = nowSec - count * stepSec;

  for (let i = 0; i < count; i++) {
    const time = startSec + i * stepSec;
    const volatility = basePrice * 0.007;
    const change = (Math.random() - 0.48) * volatility;
    const open = Math.round((currentPrice + (Math.random() - 0.5) * (volatility * 0.1)) * 100) / 100;
    const close = Math.round((open + change) * 100) / 100;
    const high = Math.round((Math.max(open, close) + Math.random() * volatility * 0.5) * 100) / 100;
    const low = Math.round((Math.min(open, close) - Math.random() * volatility * 0.5) * 100) / 100;
    const volume = Math.floor(Math.random() * 450000 + 150000);

    bars.push({ time, open, high, low, close, volume });
    currentPrice = close;
  }

  return bars;
}

export const SAMPLE_OPTIONS_CHAIN: OptionStrike[] = [
  { strikePrice: 24650, callOi: 142000, callOiChange: -12000, callLtp: 245.5, callIv: 13.8, callDelta: 0.72, putDelta: -0.28, putIv: 14.2, putLtp: 45.2, putOiChange: 48000, putOi: 320000 },
  { strikePrice: 24700, callOi: 185000, callOiChange: -8500, callLtp: 202.0, callIv: 13.5, callDelta: 0.65, putDelta: -0.35, putIv: 14.0, putLtp: 58.8, putOiChange: 65000, putOi: 410000 },
  { strikePrice: 24750, callOi: 220000, callOiChange: 5200, callLtp: 163.4, callIv: 13.2, callDelta: 0.58, putDelta: -0.42, putIv: 13.8, putLtp: 76.5, putOiChange: 82000, putOi: 530000 },
  { strikePrice: 24800, callOi: 380000, callOiChange: 24000, callLtp: 129.2, callIv: 13.0, callDelta: 0.51, putDelta: -0.49, putIv: 13.6, putLtp: 98.4, putOiChange: 110000, putOi: 680000 },
  { strikePrice: 24850, callOi: 540000, callOiChange: 78000, callLtp: 99.8, callIv: 12.9, callDelta: 0.44, putDelta: -0.56, putIv: 13.4, putLtp: 124.0, putOiChange: 94000, putOi: 490000 },
  { strikePrice: 24900, callOi: 690000, callOiChange: 95000, callLtp: 74.5, callIv: 13.1, callDelta: 0.36, putDelta: -0.64, putIv: 13.5, putLtp: 154.2, putOiChange: 42000, putOi: 310000 },
  { strikePrice: 24950, callOi: 480000, callOiChange: 51000, callLtp: 53.0, callIv: 13.4, callDelta: 0.28, putDelta: -0.72, putIv: 13.9, putLtp: 191.0, putOiChange: 15000, putOi: 190000 },
  { strikePrice: 25000, callOi: 920000, callOiChange: 145000, callLtp: 37.2, callIv: 13.7, callDelta: 0.21, putDelta: -0.79, putIv: 14.3, putLtp: 232.5, putOiChange: -5000, putOi: 140000 },
];

export const DEFAULT_TEARSHEET: BacktestTearsheet = {
  netProfit: 342500,
  netProfitPercent: 28.4,
  profitFactor: 2.18,
  sharpeRatio: 2.14,
  sortinoRatio: 3.42,
  maxDrawdown: -7.2,
  winRate: 62.5,
  expectancy: 2675,
  tradesCount: 128,
  dsr: 0.97,
  pbo: 0.11,
};
