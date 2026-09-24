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
