/**
 * Honba Screener Column Definitions & Presets
 * Categorized metric definitions for table columns.
 */

export interface ColumnDef {
  id: string;
  label: string;
  category: 'overview' | 'performance' | 'valuation' | 'technicals' | 'fundamentals';
  visible: boolean;
}

export const ALL_COLUMNS: ColumnDef[] = [
  // Overview
  { id: 'symbol', label: 'Symbol', category: 'overview', visible: true },
  { id: 'price', label: 'Price', category: 'overview', visible: true },
  { id: 'changePercent', label: 'Chg %', category: 'overview', visible: true },
  { id: 'volume', label: 'Vol', category: 'overview', visible: true },
  { id: 'relVol', label: 'Rel Vol', category: 'overview', visible: true },
  { id: 'marketCap', label: 'Mkt Cap', category: 'overview', visible: true },
  { id: 'pe', label: 'P/E', category: 'overview', visible: true },
  { id: 'eps', label: 'EPS Dil TTM', category: 'overview', visible: true },
  { id: 'epsGrowth', label: 'EPS Dil Growth', category: 'overview', visible: true },
  { id: 'dividendYield', label: 'Div Yield %', category: 'overview', visible: true },
  { id: 'sector', label: 'Sector', category: 'overview', visible: true },
  { id: 'analystRating', label: 'Analyst Rating', category: 'overview', visible: true },

  // Valuation
  { id: 'forwardPe', label: 'Forward P/E', category: 'valuation', visible: false },
  { id: 'pb', label: 'Price to Book', category: 'valuation', visible: false },
  { id: 'revenueGrowth', label: 'Rev Growth %', category: 'valuation', visible: false },

  // Technicals
  { id: 'technicalRating', label: 'Technical Rating', category: 'technicals', visible: false },
  { id: 'rsi14', label: 'RSI (14)', category: 'technicals', visible: false },
  { id: 'range52', label: '52W Range Bar', category: 'technicals', visible: false },
  { id: 'sma200', label: '200 SMA', category: 'technicals', visible: false },
  { id: 'sparkline', label: '7D Trend', category: 'technicals', visible: false },
  { id: 'high52', label: '52W High', category: 'technicals', visible: false },
  { id: 'low52', label: '52W Low', category: 'technicals', visible: false },

  // Performance
  { id: 'change', label: 'Change (Pts)', category: 'performance', visible: false },
  { id: 'perf1W', label: 'Perf 1W %', category: 'performance', visible: false },
  { id: 'perf1M', label: 'Perf 1M %', category: 'performance', visible: false },
  { id: 'perf1Y', label: 'Perf 1Y %', category: 'performance', visible: false },

  // Fundamentals
  { id: 'netMargin', label: 'Net Margin %', category: 'fundamentals', visible: false },
  { id: 'roce', label: 'ROCE %', category: 'fundamentals', visible: false },
  { id: 'debtToEquity', label: 'Debt / Equity', category: 'fundamentals', visible: false },
];

export const TAB_COLUMN_PRESETS: Record<string, string[]> = {
  overview: ['symbol', 'price', 'changePercent', 'volume', 'relVol', 'marketCap', 'pe', 'eps', 'epsGrowth', 'dividendYield', 'sector', 'analystRating'],
  performance: ['symbol', 'price', 'changePercent', 'change', 'perf1W', 'perf1M', 'perf1Y', 'volume', 'relVol', 'high52', 'low52'],
  technicals: ['symbol', 'price', 'changePercent', 'technicalRating', 'rsi14', 'sma200', 'range52', 'sparkline'],
  valuation: ['symbol', 'price', 'marketCap', 'pe', 'forwardPe', 'pb', 'eps', 'dividendYield', 'revenueGrowth'],
  dividends: ['symbol', 'price', 'dividendYield', 'eps', 'pe', 'marketCap', 'sector'],
  margins: ['symbol', 'price', 'netMargin', 'roce', 'debtToEquity', 'revenueGrowth', 'sector'],
};
