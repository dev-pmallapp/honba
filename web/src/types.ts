export interface MarketBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WatchlistQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  exchange: "NSE" | "BSE" | "MCX";
  volume: string;
  high: number;
  low: number;
}

export interface OptionStrike {
  strikePrice: number;
  callOi: number;
  callOiChange: number;
  callLtp: number;
  callIv: number;
  callDelta: number;
  putDelta: number;
  putIv: number;
  putLtp: number;
  putOiChange: number;
  putOi: number;
}

export interface BacktestTearsheet {
  netProfit: number;
  netProfitPercent: number;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  winRate: number;
  expectancy: number;
  tradesCount: number;
  dsr: number;
  pbo: number;
}

export interface ScreenerStock {
  symbol: string;
  name: string;
  sector: string;
  index: string;
  price: number;
  changePoints1D: number;
  changePercent1D: number;
  changePercent1W: number;
  changePercent1M: number;
  changePercent3M: number;
  changePercent6M: number;
  changePercent1Y: number;
  changePercentYTD: number;
  volume: string;
  volumeRaw: number;
  rvol: number;
  rsi: number;
  techRating: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";
  emaCross: "BULLISH_CROSS" | "BEARISH_CROSS" | "BULLISH_TREND" | "BEARISH_TREND";
  supertrend: "BULLISH" | "BEARISH";
  macdSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
  high52w: number;
  low52w: number;
  high52wDiff: number;
  beta: number;
  volatility1M: number;
  bbWidth: number;
  atr: number;
  marketCapCr: number;
  pe: number;
  forwardPe: number;
  eps: number;
  pb: number;
  evEbitda: number;
  ps: number;
  peg: number;
  divYield: number;
  divPerShare: number;
  roe: number;
  roce: number;
  debtToEquity: number;
  netMargin: number;
  yoyProfitGrowth: number;
  sparkline: number[];
  tags: string[];
}


