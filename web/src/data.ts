import { MarketBar, WatchlistQuote, OptionStrike, BacktestTearsheet, ScreenerStock } from "./types";

export const WATCHLIST_DATA: WatchlistQuote[] = [
  { symbol: "NIFTY 50", name: "Nifty 50 Index", price: 24850.2, change: 112.3, changePercent: 0.45, exchange: "NSE", volume: "142.5M", high: 24910.0, low: 24780.1 },
  { symbol: "NIFTY ALPHA 50", name: "Alpha Momentum Index", price: 8124.6, change: 96.4, changePercent: 1.2, exchange: "NSE", volume: "42.8M", high: 8180.2, low: 8020.15 },
  { symbol: "BANKNIFTY", name: "Nifty Bank Index", price: 51320.5, change: -145.2, changePercent: -0.28, exchange: "NSE", volume: "88.1M", high: 51600.0, low: 51150.0 },
  { symbol: "NIFTY200 A30", name: "Alpha 30 Low Volatility", price: 4925.1, change: 41.8, changePercent: 0.85, exchange: "NSE", volume: "18.3M", high: 4950.0, low: 4890.0 },
  { symbol: "RELIANCE", name: "Reliance Industries", price: 2984.75, change: 24.5, changePercent: 0.83, exchange: "NSE", volume: "12.4M", high: 3005.0, low: 2962.0 },
  { symbol: "TCS", name: "Tata Consultancy Services", price: 4280.0, change: 52.4, changePercent: 1.24, exchange: "NSE", volume: "4.1M", high: 4310.0, low: 4240.0 },
  { symbol: "INFY", name: "Infosys Ltd", price: 1912.4, change: 31.0, changePercent: 1.65, exchange: "NSE", volume: "8.9M", high: 1925.0, low: 1890.0 },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", price: 1642.1, change: -6.9, changePercent: -0.42, exchange: "NSE", volume: "19.8M", high: 1658.0, low: 1636.5 },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd", price: 1225.6, change: 9.5, changePercent: 0.78, exchange: "NSE", volume: "14.2M", high: 1235.0, low: 1218.0 },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", price: 1548.3, change: 31.8, changePercent: 2.10, exchange: "NSE", volume: "6.7M", high: 1555.0, low: 1520.0 },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd", price: 978.5, change: -23.5, changePercent: -2.35, exchange: "NSE", volume: "16.5M", high: 1005.0, low: 972.0 },
  { symbol: "LT", name: "Larsen & Toubro", price: 3624.0, change: 51.8, changePercent: 1.45, exchange: "NSE", volume: "3.2M", high: 3650.0, low: 3590.0 },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", price: 7320.0, change: -134.0, changePercent: -1.80, exchange: "NSE", volume: "2.8M", high: 7480.0, low: 7290.0 },
  { symbol: "SUNPHARMA", name: "Sun Pharma", price: 1895.0, change: 36.2, changePercent: 1.95, exchange: "NSE", volume: "4.8M", high: 1905.0, low: 1865.0 },
  { symbol: "NIFTYBEES", name: "Nippon ETF Nifty BeES", price: 274.5, change: 1.15, changePercent: 0.42, exchange: "NSE", volume: "5.6M", high: 275.5, low: 273.8 },
  { symbol: "LIQUIDBEES", name: "Nippon Liquid ETF", price: 1000.0, change: 0.0, changePercent: 0.0, exchange: "NSE", volume: "2.1M", high: 1000.05, low: 999.98 },
];

export const SCREENER_DATA: ScreenerStock[] = [
  {
    symbol: "RELIANCE",
    name: "Reliance Industries Ltd",
    sector: "Energy / Conglomerate",
    price: 2984.75,
    changePercent1D: 0.83,
    changePercent1W: 3.45,
    changePercent1M: 6.80,
    volume: "12.4M",
    rvol: 2.15,
    rsi: 64.2,
    emaCross: "BULLISH_TREND",
    supertrend: "BULLISH",
    high52wDiff: -1.2,
    tags: ["momentum", "supertrend", "high_volume"],
  },
  {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    sector: "Information Tech",
    price: 4280.0,
    changePercent1D: 1.24,
    changePercent1W: 4.10,
    changePercent1M: 9.20,
    volume: "4.1M",
    rvol: 2.80,
    rsi: 71.5,
    emaCross: "BULLISH_CROSS",
    supertrend: "BULLISH",
    high52wDiff: -0.4,
    tags: ["momentum", "breakout", "supertrend", "high_volume"],
  },
  {
    symbol: "HDFCBANK",
    name: "HDFC Bank Ltd",
    sector: "Banking / Financials",
    price: 1642.1,
    changePercent1D: -0.42,
    changePercent1W: -1.15,
    changePercent1M: 1.80,
    volume: "19.8M",
    rvol: 0.95,
    rsi: 48.3,
    emaCross: "BEARISH_TREND",
    supertrend: "BEARISH",
    high52wDiff: -6.5,
    tags: ["consolidation"],
  },
  {
    symbol: "INFY",
    name: "Infosys Ltd",
    sector: "Information Tech",
    price: 1912.4,
    changePercent1D: 1.65,
    changePercent1W: 4.80,
    changePercent1M: 11.40,
    volume: "8.9M",
    rvol: 2.45,
    rsi: 68.7,
    emaCross: "BULLISH_CROSS",
    supertrend: "BULLISH",
    high52wDiff: -0.8,
    tags: ["momentum", "breakout", "supertrend", "high_volume"],
  },
  {
    symbol: "ICICIBANK",
    name: "ICICI Bank Ltd",
    sector: "Banking / Financials",
    price: 1225.6,
    changePercent1D: 0.78,
    changePercent1W: 2.90,
    changePercent1M: 5.60,
    volume: "14.2M",
    rvol: 1.60,
    rsi: 62.0,
    emaCross: "BULLISH_TREND",
    supertrend: "BULLISH",
    high52wDiff: -1.5,
    tags: ["momentum", "supertrend"],
  },
  {
    symbol: "BHARTIARTL",
    name: "Bharti Airtel Ltd",
    sector: "Telecom",
    price: 1548.3,
    changePercent1D: 2.10,
    changePercent1W: 5.20,
    changePercent1M: 14.10,
    volume: "6.7M",
    rvol: 3.10,
    rsi: 74.8,
    emaCross: "BULLISH_TREND",
    supertrend: "BULLISH",
    high52wDiff: 0.0,
    tags: ["momentum", "breakout", "supertrend", "high_volume"],
  },
  {
    symbol: "TATAMOTORS",
    name: "Tata Motors Ltd",
    sector: "Automobile",
    price: 978.5,
    changePercent1D: -2.35,
    changePercent1W: -5.40,
    changePercent1M: -9.80,
    volume: "16.5M",
    rvol: 1.85,
    rsi: 31.4,
    emaCross: "BEARISH_CROSS",
    supertrend: "BEARISH",
    high52wDiff: -18.2,
    tags: ["oversold", "reversal"],
  },
  {
    symbol: "SBIN",
    name: "State Bank of India",
    sector: "Banking / PSU",
    price: 792.15,
    changePercent1D: -0.15,
    changePercent1W: 1.40,
    changePercent1M: 3.20,
    volume: "11.8M",
    rvol: 1.10,
    rsi: 52.1,
    emaCross: "BULLISH_TREND",
    supertrend: "BULLISH",
    high52wDiff: -8.4,
    tags: ["supertrend"],
  },
  {
    symbol: "LT",
    name: "Larsen & Toubro Ltd",
    sector: "Infrastructure / Capital Goods",
    price: 3624.0,
    changePercent1D: 1.45,
    changePercent1W: 3.80,
    changePercent1M: 7.90,
    volume: "3.2M",
    rvol: 2.20,
    rsi: 66.4,
    emaCross: "BULLISH_CROSS",
    supertrend: "BULLISH",
    high52wDiff: -2.1,
    tags: ["momentum", "breakout", "supertrend", "high_volume"],
  },
  {
    symbol: "ITC",
    name: "ITC Ltd",
    sector: "FMCG / Tobacco",
    price: 512.4,
    changePercent1D: 0.35,
    changePercent1W: 0.90,
    changePercent1M: 4.50,
    volume: "15.1M",
    rvol: 1.05,
    rsi: 58.2,
    emaCross: "BULLISH_TREND",
    supertrend: "BULLISH",
    high52wDiff: -3.0,
    tags: ["supertrend"],
  },
  {
    symbol: "BAJFINANCE",
    name: "Bajaj Finance Ltd",
    sector: "Financial Services / NBFC",
    price: 7320.0,
    changePercent1D: -1.80,
    changePercent1W: -4.20,
    changePercent1M: -6.50,
    volume: "2.8M",
    rvol: 1.40,
    rsi: 33.8,
    emaCross: "BEARISH_TREND",
    supertrend: "BEARISH",
    high52wDiff: -15.6,
    tags: ["oversold", "reversal"],
  },
  {
    symbol: "SUNPHARMA",
    name: "Sun Pharmaceutical Industries",
    sector: "Healthcare / Pharma",
    price: 1895.0,
    changePercent1D: 1.95,
    changePercent1W: 6.20,
    changePercent1M: 12.80,
    volume: "4.8M",
    rvol: 2.65,
    rsi: 72.1,
    emaCross: "BULLISH_CROSS",
    supertrend: "BULLISH",
    high52wDiff: -0.2,
    tags: ["momentum", "breakout", "supertrend", "high_volume"],
  },
];

export function generateSampleBars(symbol: string, timeframe: string = "5m"): MarketBar[] {
  let basePrice = 8000;
  if (symbol === "NIFTY 50") basePrice = 24600;
  else if (symbol === "BANKNIFTY") basePrice = 51000;
  else if (symbol === "NIFTY200 A30") basePrice = 4850;
  else if (symbol === "RELIANCE") basePrice = 2920;
  else if (symbol === "TCS") basePrice = 4200;
  else if (symbol === "HDFCBANK") basePrice = 1640;
  else if (symbol === "INFY") basePrice = 1880;
  else if (symbol === "ICICIBANK") basePrice = 1210;
  else if (symbol === "BHARTIARTL") basePrice = 1510;
  else if (symbol === "TATAMOTORS") basePrice = 995;
  else if (symbol === "SBIN") basePrice = 785;
  else if (symbol === "LT") basePrice = 3580;
  else if (symbol === "BAJFINANCE") basePrice = 7420;
  else if (symbol === "SUNPHARMA") basePrice = 1860;
  else if (symbol === "ITC") basePrice = 508;

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
