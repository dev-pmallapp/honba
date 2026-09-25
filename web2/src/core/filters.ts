/**
 * Honba Screener Comprehensive Filter Definitions & State
 * Multi-category filter criteria for Descriptive, Financials, and Technical indicators.
 */

export interface AdvancedFilterState {
  sector: string;
  marketCapTier: string;
  exchange: string;
  indices: string[];
  minPrice: number | null;
  maxPrice: number | null;
  minChangePercent?: number | null;
  maxChangePercent?: number | null;
  minVolume?: number | null;
  peMin: number | null;
  peMax: number | null;
  minDividendYield: number | null;
  minRoce: number | null;
  minNetMargin: number | null;
  technicalRating: string;
  rsiMin: number | null;
  rsiMax: number | null;
  priceAbove200Sma: boolean;
  priceAbove50Sma: boolean;
  near52WeekHigh: boolean;
}

export const DEFAULT_ADVANCED_FILTERS: AdvancedFilterState = {
  sector: 'all',
  marketCapTier: 'all',
  exchange: 'all',
  indices: [],
  minPrice: null,
  maxPrice: null,
  minChangePercent: null,
  maxChangePercent: null,
  minVolume: null,
  peMin: null,
  peMax: null,
  minDividendYield: null,
  minRoce: null,
  minNetMargin: null,
  technicalRating: 'all',
  rsiMin: null,
  rsiMax: null,
  priceAbove200Sma: false,
  priceAbove50Sma: false,
  near52WeekHigh: false,
};

export function countActiveFilters(filters: AdvancedFilterState): number {
  let count = 0;
  if (filters.sector !== 'all') count++;
  if (filters.marketCapTier !== 'all') count++;
  if (filters.exchange !== 'all') count++;
  if (filters.indices && filters.indices.length > 0) count++;
  if (filters.minPrice !== null || filters.maxPrice !== null) count++;
  if (filters.minChangePercent !== undefined && filters.minChangePercent !== null) count++;
  if (filters.maxChangePercent !== undefined && filters.maxChangePercent !== null) count++;
  if (filters.minVolume !== undefined && filters.minVolume !== null) count++;
  if (filters.peMin !== null || filters.peMax !== null) count++;
  if (filters.minDividendYield !== null) count++;
  if (filters.minRoce !== null) count++;
  if (filters.minNetMargin !== null) count++;
  if (filters.technicalRating !== 'all') count++;
  if (filters.rsiMin !== null || filters.rsiMax !== null) count++;
  if (filters.priceAbove200Sma) count++;
  if (filters.priceAbove50Sma) count++;
  if (filters.near52WeekHigh) count++;
  return count;
}
