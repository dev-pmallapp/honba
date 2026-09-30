/**
 * Honba Screener Column Definitions & Composable Cell Renderers
 * Migrated to .tsx for rich, institutional-grade visual data representation.
 */

import React from 'react';
import { Instrument, MarketCountry } from './market-data';
import { Sparkline } from '../components/ui/sparkline';
import { RangeBar } from '../components/ui/range-bar';
import { ExternalLink } from 'lucide-react';

export interface ColumnRenderContext {
  market?: MarketCountry;
  currency?: string;
  onSelectSymbol?: (symbol: string) => void;
}

export interface ColumnDef {
  id: string;
  label: string;
  category: 'overview' | 'performance' | 'valuation' | 'technicals' | 'fundamentals';
  visible: boolean;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  render?: (inst: Instrument, ctx?: ColumnRenderContext) => React.ReactNode;
}

// Brand Logo Palette & Icons for Top Instruments
export const BRAND_LOGOS: Record<string, { bg: string; color: string; label?: string }> = {
  RELIANCE: { bg: '#0b2046', color: '#ffffff', label: 'R' },
  BHARTIARTL: { bg: '#e40000', color: '#ffffff', label: 'a' },
  HDFCBANK: { bg: '#004c8f', color: '#ed1c24', label: 'HD' },
  ICICIBANK: { bg: '#b32219', color: '#ffffff', label: 'i' },
  SBIN: { bg: '#00a3e0', color: '#ffffff', label: 'S' },
  TCS: { bg: '#00539b', color: '#ffffff', label: 'TCS' },
  BAJFINANCE: { bg: '#00629b', color: '#ffffff', label: 'B' },
  LT: { bg: '#00205b', color: '#ffffff', label: 'LT' },
  LICI: { bg: '#005aa9', color: '#ffcc00', label: 'LIC' },
  HINDUNILVER: { bg: '#001a9c', color: '#ffffff', label: 'U' },
  SUNPHARMA: { bg: '#ff9900', color: '#ffffff', label: 'SP' },
  TITAN: { bg: '#008080', color: '#ffffff', label: 'T' },
  ADANIPORTS: { bg: '#800080', color: '#ffffff', label: 'a' },
  ADANIENT: { bg: '#800080', color: '#ffffff', label: 'a' },
  ADANIPOWER: { bg: '#800080', color: '#ffffff', label: 'a' },
  INFY: { bg: '#007cc3', color: '#ffffff', label: 'infy' },
  KOTAKBANK: { bg: '#ed1b24', color: '#ffffff', label: 'K' },
  AXISBANK: { bg: '#97144d', color: '#ffffff', label: 'A' },
  MARUTI: { bg: '#172f85', color: '#ffffff', label: 'M' },
  MM: { bg: '#ea1b26', color: '#ffffff', label: 'M' },
  NTPC: { bg: '#005b94', color: '#ffffff', label: 'N' },
  ONGC: { bg: '#e31b23', color: '#ffffff', label: 'O' },
  COALINDIA: { bg: '#003366', color: '#ffffff', label: 'CIL' },
  BAJAJFINSV: { bg: '#00629b', color: '#ffffff', label: 'B' },
  ASIANPAINT: { bg: '#e31e24', color: '#ffffff', label: 'AP' },
  POLICYBZR: { bg: '#2962ff', color: '#ffffff', label: 'PB' },
  SSRETAIL: { bg: '#089981', color: '#ffffff', label: 'SS' },
  HEROMOTOCO: { bg: '#ed1c24', color: '#ffffff', label: 'HM' },
  HEROMOTORS: { bg: '#ed1c24', color: '#ffffff', label: 'HM' },
  MFSL: { bg: '#1e293b', color: '#ffffff', label: 'M' },
  OLAELEC: { bg: '#00c389', color: '#000000', label: 'O' },
  KSCL: { bg: '#10b981', color: '#ffffff', label: 'K' },
  MCX: { bg: '#0f172a', color: '#38bdf8', label: 'M' },
  BSE: { bg: '#1e40af', color: '#ffffff', label: 'BSE' },
  NIFTYBEES: { bg: '#f97316', color: '#ffffff', label: 'NB' },
  BANKBEES: { bg: '#2563eb', color: '#ffffff', label: 'BB' },
  GOLDBEES: { bg: '#eab308', color: '#000000', label: 'GB' },
  SPY: { bg: '#1e3a8a', color: '#ffffff', label: 'SPY' },
  QQQ: { bg: '#4338ca', color: '#ffffff', label: 'QQQ' },
  PPFAS_FLEXI: { bg: '#1e3a8a', color: '#ffffff', label: 'PP' },
  HDFC_MIDCAP: { bg: '#004c8f', color: '#ed1c24', label: 'HD' },
  NIPPON_SMALLCAP: { bg: '#dc2626', color: '#ffffff', label: 'NI' },
  MIRAE_LARGE: { bg: '#ea580c', color: '#ffffff', label: 'MA' },
  SBI_CONTRA: { bg: '#0284c7', color: '#ffffff', label: 'SBI' },
  ICICI_BLUECHIP: { bg: '#991b1b', color: '#ffffff', label: 'IC' },
  SWIGGY: { bg: '#fc8019', color: '#ffffff', label: 'SW' },
  HYUNDAI: { bg: '#002c5f', color: '#ffffff', label: 'HY' },
  WAAREE: { bg: '#f59e0b', color: '#ffffff', label: 'WE' },
  BAJAJHFL: { bg: '#00629b', color: '#ffffff', label: 'BJ' },
  NTPCGREEN: { bg: '#10b981', color: '#ffffff', label: 'NG' },
};

export const KNOWN_SECTORS: Record<string, string> = {
  RELIANCE: 'Energy minerals',
  BHARTIARTL: 'Communications',
  HDFCBANK: 'Finance',
  ICICIBANK: 'Finance',
  SBIN: 'Finance',
  TCS: 'Technology services',
  BAJFINANCE: 'Finance',
  LT: 'Industrial services',
  LICI: 'Finance',
  HINDUNILVER: 'Consumer non-durables',
  SUNPHARMA: 'Health technology',
  TITAN: 'Consumer durables',
  ADANIPORTS: 'Transportation',
  ADANIENT: 'Distribution services',
  ADANIPOWER: 'Utilities',
  INFY: 'Technology services',
  KOTAKBANK: 'Finance',
  AXISBANK: 'Finance',
  MARUTI: 'Consumer durables',
  MM: 'Consumer durables',
  NTPC: 'Utilities',
  ONGC: 'Energy minerals',
  COALINDIA: 'Energy minerals',
  BAJAJFINSV: 'Finance',
  ASIANPAINT: 'Process industries',
  POLICYBZR: 'Technology services',
  SSRETAIL: 'Retail trade',
  HEROMOTOCO: 'Consumer durables',
  HEROMOTORS: 'Consumer durables',
  MFSL: 'Finance',
  OLAELEC: 'Consumer durables',
  KSCL: 'Non-energy minerals',
  MCX: 'Finance',
  BSE: 'Finance',
  SWIGGY: 'Consumer Discretionary',
  HYUNDAI: 'Automobile',
  WAAREE: 'Clean Energy',
  BAJAJHFL: 'Finance',
  NTPCGREEN: 'Utilities',
};

export const getLogoForSymbol = (symbol: string) => {
  const cleanSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (BRAND_LOGOS[cleanSymbol]) {
    return BRAND_LOGOS[cleanSymbol];
  }
  const colors = ['#2962ff', '#089981', '#7b1fa2', '#f57c00', '#0097a7', '#455a64', '#b71c1c'];
  const hash = cleanSymbol.charCodeAt(0) + (cleanSymbol.charCodeAt(cleanSymbol.length - 1) || 0);
  return {
    bg: colors[hash % colors.length],
    color: '#ffffff',
    label: cleanSymbol.slice(0, 2),
  };
};

export const formatNumber = (num: number | undefined | null): string => {
  if (num === undefined || num === null || isNaN(num)) return '—';
  if (num >= 1000) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return num.toFixed(2);
};

export const formatCompact = (num: number | undefined | null): string => {
  if (num === undefined || num === null || isNaN(num)) return '—';
  if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e7) return (num / 1e7).toFixed(2) + 'Cr';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e5) return (num / 1e5).toFixed(2) + 'L';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'k';
  return num.toString();
};

export const ALL_COLUMNS: ColumnDef[] = [
  // Overview
  {
    id: 'symbol',
    label: 'Symbol',
    category: 'overview',
    visible: true,
    render: (inst) => {
      const logo = getLogoForSymbol(inst.symbol);
      const hasDividend = inst.dividendYield && inst.dividendYield > 0;
      return (
        <div className="tv-symbol-cell">
          <div className="tv-symbol-logo" style={{ backgroundColor: logo.bg, color: logo.color }}>
            {logo.label}
          </div>
          <div className="tv-symbol-details">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="tv-symbol-ticker">{inst.symbol}</span>
              <a
                href={`/instrument.html?symbol=${encodeURIComponent(inst.symbol)}`}
                className="tv-symbol-open-icon"
                title="Open Dedicated Instrument Page"
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: 'var(--text-muted)',
                  transition: 'color var(--transition-fast)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                <ExternalLink size={10} />
              </a>
            </div>
            <span className="tv-symbol-name" title={inst.name}>
              {inst.name}
            </span>
            {hasDividend && (
              <span className="tv-dividend-tag" title={`Dividend Yield: ${inst.dividendYield?.toFixed(2)}%`}>
                D
              </span>
            )}
          </div>
        </div>
      );
    },
  },
  {
    id: 'price',
    label: 'Price',
    category: 'overview',
    visible: true,
    render: (inst, ctx) => (
      <div>
        <span className="tv-num-val">{formatNumber(inst.price)}</span>
        <span className="tv-curr-unit">{ctx?.market?.currency || 'INR'}</span>
      </div>
    ),
  },
  {
    id: 'changePercent',
    label: 'Chg %',
    category: 'overview',
    visible: true,
    render: (inst) => {
      const isUp = inst.changePercent >= 0;
      return (
        <span className={isUp ? 'tv-change-up' : 'tv-change-down'}>
          {isUp ? '+' : ''}
          {inst.changePercent.toFixed(2)}%
        </span>
      );
    },
  },
  {
    id: 'volume',
    label: 'Vol',
    category: 'overview',
    visible: true,
    render: (inst) => <span className="tv-num-val">{formatCompact(inst.volume)}</span>,
  },
  {
    id: 'relVol',
    label: 'Rel Vol',
    category: 'overview',
    visible: true,
    render: (inst) => {
      const relVol = inst.volume / (inst.avgVolume30d || inst.volume);
      return <span className="tv-num-val">{relVol.toFixed(2)}</span>;
    },
  },
  {
    id: 'marketCap',
    label: 'Mkt Cap',
    category: 'overview',
    visible: true,
    render: (inst, ctx) => (
      <div>
        <span className="tv-num-val">{formatCompact(inst.marketCap)}</span>
        <span className="tv-curr-unit">{ctx?.market?.currency || 'INR'}</span>
      </div>
    ),
  },
  {
    id: 'pe',
    label: 'P/E',
    category: 'overview',
    visible: true,
    render: (inst) => <span className="tv-num-val">{inst.pe ? inst.pe.toFixed(2) : '—'}</span>,
  },
  {
    id: 'eps',
    label: 'EPS Dil TTM',
    category: 'overview',
    visible: true,
    render: (inst, ctx) => (
      <div>
        <span className="tv-num-val">{inst.eps ? inst.eps.toFixed(2) : '—'}</span>
        <span className="tv-curr-unit">{ctx?.market?.currency || 'INR'}</span>
      </div>
    ),
  },
  {
    id: 'epsGrowth',
    label: 'EPS Dil Growth',
    category: 'overview',
    visible: true,
    render: (inst) => {
      const epsGrowth = inst.revenueGrowth ?? 0;
      return (
        <span className={epsGrowth >= 0 ? 'tv-change-up' : 'tv-change-down'}>
          {epsGrowth >= 0 ? '+' : ''}
          {epsGrowth.toFixed(2)}%
        </span>
      );
    },
  },
  {
    id: 'dividendYield',
    label: 'Div Yield %',
    category: 'overview',
    visible: true,
    render: (inst) => (
      <span className="tv-num-val">
        {inst.dividendYield ? inst.dividendYield.toFixed(2) + '%' : '0.00%'}
      </span>
    ),
  },
  {
    id: 'sector',
    label: 'Sector',
    category: 'overview',
    visible: true,
    render: (inst) => {
      const displaySector = KNOWN_SECTORS[inst.symbol] || inst.sector;
      return <span className="tv-sector-text">{displaySector}</span>;
    },
  },
  {
    id: 'analystRating',
    label: 'Analyst Rating',
    category: 'overview',
    visible: true,
    render: (inst) => renderRatingBadge(inst.technicalRating),
  },

  // Valuation
  {
    id: 'forwardPe',
    label: 'Forward P/E',
    category: 'valuation',
    visible: false,
    render: (inst) => <span className="tv-num-val">{inst.forwardPe ? inst.forwardPe.toFixed(2) : '—'}</span>,
  },
  {
    id: 'pb',
    label: 'Price to Book',
    category: 'valuation',
    visible: false,
    render: (inst) => <span className="tv-num-val">{inst.pb ? inst.pb.toFixed(2) : '—'}</span>,
  },
  {
    id: 'revenueGrowth',
    label: 'Rev Growth %',
    category: 'valuation',
    visible: false,
    render: (inst) => (
      <span className={(inst.revenueGrowth ?? 0) >= 0 ? 'tv-change-up' : 'tv-change-down'}>
        {(inst.revenueGrowth ?? 0) >= 0 ? '+' : ''}
        {(inst.revenueGrowth ?? 0).toFixed(1)}%
      </span>
    ),
  },

  // Technicals
  {
    id: 'technicalRating',
    label: 'Technical Rating',
    category: 'technicals',
    visible: false,
    render: (inst) => renderRatingBadge(inst.technicalRating),
  },
  {
    id: 'rsi14',
    label: 'RSI (14)',
    category: 'technicals',
    visible: false,
    render: (inst) => (
      <span className={`tv-num-val ${inst.rsi14 > 70 ? 'tv-change-down' : inst.rsi14 < 35 ? 'tv-change-up' : ''}`}>
        {inst.rsi14.toFixed(1)}
      </span>
    ),
  },
  {
    id: 'range52',
    label: '52W Range Bar',
    category: 'technicals',
    visible: false,
    render: (inst) => <RangeBar current={inst.price} low={inst.low52} high={inst.high52} />,
  },
  {
    id: 'sma200',
    label: '200 SMA',
    category: 'technicals',
    visible: false,
    render: (inst, ctx) => (
      <div>
        <span className="tv-num-val">{formatNumber(inst.sma200)}</span>
        <span className="tv-curr-unit">{ctx?.market?.currency || 'INR'}</span>
      </div>
    ),
  },
  {
    id: 'sparkline',
    label: '7D Trend',
    category: 'technicals',
    visible: false,
    render: (inst) => (
      <Sparkline
        points={inst.sparkline || [inst.price * 0.98, inst.price]}
        isUp={inst.changePercent >= 0}
        symbol={inst.symbol}
      />
    ),
  },
  {
    id: 'high52',
    label: '52W High',
    category: 'technicals',
    visible: false,
    render: (inst, ctx) => (
      <div>
        <span className="tv-num-val">{formatNumber(inst.high52)}</span>
        <span className="tv-curr-unit">{ctx?.market?.currency || 'INR'}</span>
      </div>
    ),
  },
  {
    id: 'low52',
    label: '52W Low',
    category: 'technicals',
    visible: false,
    render: (inst, ctx) => (
      <div>
        <span className="tv-num-val">{formatNumber(inst.low52)}</span>
        <span className="tv-curr-unit">{ctx?.market?.currency || 'INR'}</span>
      </div>
    ),
  },

  // Performance
  {
    id: 'change',
    label: 'Change (Pts)',
    category: 'performance',
    visible: false,
    render: (inst) => {
      const isUp = inst.change >= 0;
      return (
        <span className={isUp ? 'tv-change-up' : 'tv-change-down'}>
          {isUp ? '+' : ''}
          {formatNumber(inst.change)}
        </span>
      );
    },
  },
  {
    id: 'perf1W',
    label: 'Perf 1W %',
    category: 'performance',
    visible: false,
    render: (inst) => (
      <span className={(inst.perf1W ?? 0) >= 0 ? 'tv-change-up' : 'tv-change-down'}>
        {(inst.perf1W ?? 0) >= 0 ? '+' : ''}
        {(inst.perf1W ?? 0).toFixed(2)}%
      </span>
    ),
  },
  {
    id: 'perf1M',
    label: 'Perf 1M %',
    category: 'performance',
    visible: false,
    render: (inst) => (
      <span className={(inst.perf1M ?? 0) >= 0 ? 'tv-change-up' : 'tv-change-down'}>
        {(inst.perf1M ?? 0) >= 0 ? '+' : ''}
        {(inst.perf1M ?? 0).toFixed(2)}%
      </span>
    ),
  },
  {
    id: 'perf1Y',
    label: 'Perf 1Y %',
    category: 'performance',
    visible: false,
    render: (inst) => (
      <span className={(inst.perf1Y ?? 0) >= 0 ? 'tv-change-up' : 'tv-change-down'}>
        {(inst.perf1Y ?? 0) >= 0 ? '+' : ''}
        {(inst.perf1Y ?? 0).toFixed(2)}%
      </span>
    ),
  },

  // Fundamentals
  {
    id: 'netMargin',
    label: 'Net Margin %',
    category: 'fundamentals',
    visible: false,
    render: (inst) => <span className="tv-num-val">{inst.netMargin ? inst.netMargin.toFixed(1) + '%' : '—'}</span>,
  },
  {
    id: 'roce',
    label: 'ROCE %',
    category: 'fundamentals',
    visible: false,
    render: (inst) => <span className="tv-num-val">{inst.roce ? inst.roce.toFixed(1) + '%' : '—'}</span>,
  },
  {
    id: 'debtToEquity',
    label: 'Debt / Equity',
    category: 'fundamentals',
    visible: false,
    render: (inst) => <span className="tv-num-val">{inst.debtToEquity ? inst.debtToEquity.toFixed(2) : '—'}</span>,
  },
];

function renderRatingBadge(rating: string) {
  const isBullish = rating.includes('Buy');
  const isBearish = rating.includes('Sell');
  const isStrong = rating.startsWith('Strong');
  const arrow = isBullish ? '⌃' : isBearish ? '⌄' : '—';
  const ratingClass = isBullish
    ? isStrong
      ? 'rating-strong-buy rating-strong'
      : 'rating-buy'
    : isBearish
    ? isStrong
      ? 'rating-strong-sell rating-strong'
      : 'rating-sell'
    : 'rating-neutral';

  const formattedRating =
    rating === 'Strong Buy' ? 'Strong buy' : rating === 'Strong Sell' ? 'Strong sell' : rating;

  return (
    <span className={`tv-analyst-badge ${ratingClass}`}>
      <span className="tv-rating-arrow">{arrow}</span>
      <span>{formattedRating}</span>
    </span>
  );
}

export const TAB_COLUMN_PRESETS: Record<string, string[]> = {
  overview: ['symbol', 'price', 'changePercent', 'volume', 'relVol', 'marketCap', 'pe', 'eps', 'epsGrowth', 'dividendYield', 'sector', 'analystRating'],
  performance: ['symbol', 'price', 'changePercent', 'change', 'perf1W', 'perf1M', 'perf1Y', 'volume', 'relVol', 'high52', 'low52'],
  technicals: ['symbol', 'price', 'changePercent', 'technicalRating', 'rsi14', 'sma200', 'range52', 'sparkline'],
  valuation: ['symbol', 'price', 'marketCap', 'pe', 'forwardPe', 'pb', 'eps', 'dividendYield', 'revenueGrowth'],
  dividends: ['symbol', 'price', 'dividendYield', 'eps', 'pe', 'marketCap', 'sector'],
  margins: ['symbol', 'price', 'netMargin', 'roce', 'debtToEquity', 'revenueGrowth', 'sector'],
};
