/**
 * Market Indices & Benchmarks Registry
 * Provides comprehensive index definitions (Nifty 50, Sensex, Bank Nifty, Nifty 500, Sectoral, etc.)
 * and intelligent instrument-to-index matching for multi-market screening.
 */

import { CountryCode, Instrument } from './market-data';

export type IndexBadgeType =
  | 'number'
  | 'bank'
  | 'finance'
  | 'auto'
  | 'pharma'
  | 'it'
  | 'metal'
  | 'fmcg'
  | 'realty'
  | 'psubank'
  | 'bse'
  | 'default';

export interface IndexItem {
  code: string;
  name: string;
  country: CountryCode;
  badgeType: IndexBadgeType;
  badgeLabel?: string;
  badgeColor?: string;
  description?: string;
}

export const MARKET_INDICES: Record<CountryCode, IndexItem[]> = {
  IN: [
    { code: 'NIFTY', name: 'Nifty 50', country: 'IN', badgeType: 'number', badgeLabel: '50', badgeColor: '#2962FF' },
    { code: 'SENSEX', name: 'BSE Sensex', country: 'IN', badgeType: 'bse', badgeLabel: 'BSE', badgeColor: '#1E53E5' },
    { code: 'BANKNIFTY', name: 'Nifty Bank', country: 'IN', badgeType: 'bank', badgeColor: '#00897B' },
    { code: 'CNXFINANCE', name: 'Nifty Financial Services', country: 'IN', badgeType: 'finance', badgeColor: '#43A047' },
    { code: 'CNX500', name: 'Nifty 500', country: 'IN', badgeType: 'number', badgeLabel: '500', badgeColor: '#5E35B1' },
    { code: 'NIFTYJR', name: 'Nifty Next 50', country: 'IN', badgeType: 'number', badgeLabel: '50', badgeColor: '#00ACC1' },
    { code: 'CNXAUTO', name: 'Nifty Auto', country: 'IN', badgeType: 'auto', badgeColor: '#FB8C00' },
    { code: 'CNXPHARMA', name: 'Nifty Pharma', country: 'IN', badgeType: 'pharma', badgeColor: '#E53935' },
    { code: 'CNXPSUBANK', name: 'Nifty PSU Bank', country: 'IN', badgeType: 'psubank', badgeColor: '#3949AB' },
    { code: 'CNXIT', name: 'Nifty IT', country: 'IN', badgeType: 'it', badgeColor: '#8E24AA' },
    { code: 'CNXMETAL', name: 'Nifty Metal', country: 'IN', badgeType: 'metal', badgeColor: '#546E7A' },
    { code: 'CNXFMCG', name: 'Nifty FMCG', country: 'IN', badgeType: 'fmcg', badgeColor: '#FBC02D' },
    { code: 'CNXREALTY', name: 'Nifty Realty', country: 'IN', badgeType: 'realty', badgeColor: '#00897B' },
    { code: 'NIFTYFINSRV25_50', name: 'Nifty Financial Services 25/50', country: 'IN', badgeType: 'finance', badgeColor: '#1E88E5' },
  ],
  US: [
    { code: 'SPX', name: 'S&P 500', country: 'US', badgeType: 'number', badgeLabel: '500', badgeColor: '#2962FF' },
    { code: 'NDX', name: 'NASDAQ 100', country: 'US', badgeType: 'number', badgeLabel: '100', badgeColor: '#00ACC1' },
    { code: 'DJI', name: 'Dow Jones Industrial', country: 'US', badgeType: 'number', badgeLabel: '30', badgeColor: '#D81B60' },
    { code: 'RUT', name: 'Russell 2000', country: 'US', badgeType: 'number', badgeLabel: '2K', badgeColor: '#7B1FA2' },
    { code: 'SOX', name: 'PHLX Semiconductor', country: 'US', badgeType: 'it', badgeColor: '#0288D1' },
    { code: 'XLK', name: 'Technology Select', country: 'US', badgeType: 'it', badgeColor: '#5E35B1' },
    { code: 'XLF', name: 'Financial Select', country: 'US', badgeType: 'finance', badgeColor: '#43A047' },
    { code: 'XLE', name: 'Energy Select', country: 'US', badgeType: 'default', badgeLabel: 'ENG', badgeColor: '#F57C00' },
    { code: 'XLV', name: 'Health Care Select', country: 'US', badgeType: 'pharma', badgeColor: '#E53935' },
  ],
  JP: [
    { code: 'N225', name: 'Nikkei 225', country: 'JP', badgeType: 'number', badgeLabel: '225', badgeColor: '#D81B60' },
    { code: 'TOPIX', name: 'TOPIX Index', country: 'JP', badgeType: 'default', badgeLabel: 'TPX', badgeColor: '#2962FF' },
    { code: 'JPX400', name: 'JPX-Nikkei 400', country: 'JP', badgeType: 'number', badgeLabel: '400', badgeColor: '#00897B' },
  ],
  UK: [
    { code: 'FTSE100', name: 'FTSE 100', country: 'UK', badgeType: 'number', badgeLabel: '100', badgeColor: '#1E88E5' },
    { code: 'FTSE250', name: 'FTSE 250', country: 'UK', badgeType: 'number', badgeLabel: '250', badgeColor: '#FB8C00' },
    { code: 'FTSEALL', name: 'FTSE All-Share', country: 'UK', badgeType: 'default', badgeLabel: 'ALL', badgeColor: '#43A047' },
  ],
};

export function getIndicesForMarket(market: CountryCode): IndexItem[] {
  return MARKET_INDICES[market] || MARKET_INDICES.IN;
}

export function instrumentBelongsToIndex(inst: Instrument, indexCode: string): boolean {
  const code = indexCode.toUpperCase();

  // If instrument has explicit indices array defined
  if ((inst as any).indices && Array.isArray((inst as any).indices)) {
    if ((inst as any).indices.includes(code)) return true;
  }

  // Dynamic heuristic matching based on market, sector, cap and known stocks
  if (inst.country === 'IN') {
    switch (code) {
      case 'CNX500':
        return true; // All Indian stocks in universe belong to Nifty 500
      case 'NIFTY': // Nifty 50
        return inst.marketCapTier === 'mega' || inst.marketCap >= 1500000000000;
      case 'SENSEX':
        return inst.marketCapTier === 'mega' || inst.marketCap >= 1800000000000;
      case 'NIFTYJR': // Next 50
        return inst.marketCapTier === 'large';
      case 'BANKNIFTY':
        return (
          inst.sector === 'Financials' &&
          (inst.industry?.toLowerCase().includes('bank') ||
            ['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'INDUSINDBK', 'BANDHANBNK', 'FEDERALBNK', 'PNB', 'BANKBARODA'].includes(inst.symbol))
        );
      case 'CNXPSUBANK':
        return (
          inst.symbol === 'SBIN' ||
          inst.industry?.toLowerCase().includes('public') ||
          ['SBIN', 'PNB', 'BANKBARODA', 'CANBK', 'UNIONBANK', 'INDIANB'].includes(inst.symbol)
        );
      case 'CNXFINANCE':
      case 'NIFTYFINSRV25_50':
        return inst.sector === 'Financials';
      case 'CNXAUTO':
        return (
          inst.sector === 'Automotive' ||
          inst.industry?.toLowerCase().includes('auto') ||
          ['MARUTI', 'TATAMOTORS', 'M&M', 'BAJAJ-AUTO', 'HEROMOTOCO', 'EICHERMOT', 'TVSMOTOR', 'HEROMOTORS', 'OLAELEC'].includes(inst.symbol)
        );
      case 'CNXPHARMA':
        return (
          inst.sector === 'Healthcare' ||
          inst.industry?.toLowerCase().includes('pharma') ||
          inst.industry?.toLowerCase().includes('health') ||
          ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP', 'BIOCON', 'LUPIN', 'MANKIND', 'CUPID'].includes(inst.symbol)
        );
      case 'CNXIT':
        return (
          inst.sector === 'Technology' ||
          inst.industry?.toLowerCase().includes('it') ||
          inst.industry?.toLowerCase().includes('software') ||
          ['TCS', 'INFY', 'HCLTECH', 'WIPRO', 'TECHM', 'LTIM', 'PERSISTENT', 'COFORGE', 'POLICYBZR'].includes(inst.symbol)
        );
      case 'CNXMETAL':
        return (
          inst.sector === 'Materials' ||
          inst.industry?.toLowerCase().includes('metal') ||
          inst.industry?.toLowerCase().includes('steel') ||
          inst.industry?.toLowerCase().includes('mining') ||
          ['TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'COALINDIA', 'VEDL', 'NMDC', 'SAIL'].includes(inst.symbol)
        );
      case 'CNXFMCG':
        return (
          inst.sector === 'Consumer Defensive' ||
          inst.industry?.toLowerCase().includes('fmcg') ||
          inst.industry?.toLowerCase().includes('food') ||
          ['ITC', 'HINDUNILVR', 'NESTLEIND', 'BRITANNIA', 'DABUR', 'MARICO', 'GODREJCP', 'TATACONSUM', 'SSRETAIL'].includes(inst.symbol)
        );
      case 'CNXREALTY':
        return (
          inst.sector === 'Real Estate' ||
          inst.industry?.toLowerCase().includes('realty') ||
          inst.industry?.toLowerCase().includes('real estate') ||
          ['DLF', 'GODREJPROP', 'OBEROIRLTY', 'PHOENIXLTD', 'RAYMONDREL', 'MACROTECH'].includes(inst.symbol)
        );
      default:
        return false;
    }
  }

  if (inst.country === 'US') {
    switch (code) {
      case 'SPX':
        return true;
      case 'NDX':
        return inst.exchange === 'NASDAQ';
      case 'DJI':
        return inst.marketCapTier === 'mega';
      case 'RUT':
        return inst.marketCapTier === 'mid' || inst.marketCapTier === 'small';
      case 'XLK':
        return inst.sector === 'Technology';
      case 'XLF':
        return inst.sector === 'Financials';
      case 'XLE':
        return inst.sector === 'Energy';
      case 'XLV':
        return inst.sector === 'Healthcare';
      case 'SOX':
        return (
          inst.industry?.toLowerCase().includes('semiconductor') ||
          ['NVDA', 'AMD', 'INTC', 'AVGO', 'QCOM', 'TXN', 'MU'].includes(inst.symbol)
        );
      default:
        return false;
    }
  }

  return true;
}
