import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Instrument } from '../../../core/market-data';
import { useScreenerStore } from '../../../core/store/use-screener-store';
import { useLayoutStore } from '../../../layouts/use-layout-store';
import { dataLayer } from '../../../core/data-layer';
import { Sparkline } from '../../ui/sparkline';
import { RangeBar } from '../../ui/range-bar';
import {
  ChevronUp,
  ChevronDown,
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Filter,
} from 'lucide-react';
import { ColumnHeaderMenu, isColumnFiltered } from './column-header-menu';
import { ColumnDef } from '../../../core/columns';

interface ScreenerTableProps {
  instruments: Instrument[];
}

// Brand Logo Palette & Icons for Top Instruments
const BRAND_LOGOS: Record<string, { bg: string; color: string; label?: string }> = {
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
  VFIAX: { bg: '#991b1b', color: '#ffffff', label: 'VG' },
  FCNTX: { bg: '#15803d', color: '#ffffff', label: 'FD' },
  GS2034: { bg: '#047857', color: '#ffffff', label: 'GS' },
  US10Y: { bg: '#0369a1', color: '#ffffff', label: '10Y' },
};

const KNOWN_SECTORS: Record<string, string> = {
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
  RAYMONDREL: 'Finance',
  RAYMOND: 'Consumer non-durables',
  LTF: 'Finance',
  HDFCLIFE: 'Finance',
  CUPID: 'Health technology',
};

const getLogoForSymbol = (symbol: string) => {
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

export const ScreenerTable: React.FC<ScreenerTableProps> = ({ instruments }) => {
  const columns = useScreenerStore((state) => state.columns);
  const sortField = useScreenerStore((state) => state.sortField);
  const sortOrder = useScreenerStore((state) => state.sortOrder);
  const setSort = useScreenerStore((state) => state.setSort);
  const activeSymbol = useScreenerStore((state) => state.activeSymbol);
  const setActiveSymbol = useScreenerStore((state) => state.setActiveSymbol);
  const currentPage = useScreenerStore((state) => state.currentPage);
  const setPage = useScreenerStore((state) => state.setPage);
  const pageSize = useScreenerStore((state) => state.pageSize);
  const setPageSize = useScreenerStore((state) => state.setPageSize);
  const screenerType = useScreenerStore((state) => state.screenerType || 'stocks');
  const setColumnModalOpen = useScreenerStore((state) => state.setColumnModalOpen);

  const itemLabel =
    screenerType === 'etf'
      ? 'ETFs'
      : screenerType === 'bonds'
      ? 'bonds'
      : screenerType === 'mf'
      ? 'funds'
      : 'stocks';

  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchQuery = useScreenerStore((state) => state.searchQuery);
  const setSearchQuery = useScreenerStore((state) => state.setSearchQuery);
  const advancedFilters = useScreenerStore((state) => state.advancedFilters);
  const [activeMenuCol, setActiveMenuCol] = useState<{ col: ColumnDef; anchorEl: HTMLElement } | null>(null);

  useEffect(() => {
    if (headerSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [headerSearchOpen]);

  const market = dataLayer.getCurrentMarketInfo();
  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);

  // Sorting
  const sortedInstruments = useMemo(() => {
    if (!sortField || !sortOrder) return instruments;
    const sorted = [...instruments];
    sorted.sort((a, b) => {
      if (sortField === 'relVol') {
        const rA = a.volume / (a.avgVolume30d || a.volume);
        const rB = b.volume / (b.avgVolume30d || b.volume);
        return sortOrder === 'asc' ? rA - rB : rB - rA;
      }
      if (sortField === 'epsGrowth') {
        const gA = a.revenueGrowth ?? 0;
        const gB = b.revenueGrowth ?? 0;
        return sortOrder === 'asc' ? gA - gB : gB - gA;
      }
      if (sortField === 'analystRating') {
        return sortOrder === 'asc'
          ? a.technicalRating.localeCompare(b.technicalRating)
          : b.technicalRating.localeCompare(a.technicalRating);
      }
      if (sortField === 'range52') {
        const pctA = (a.price - a.low52) / (a.high52 - a.low52 || 1);
        const pctB = (b.price - b.low52) / (b.high52 - b.low52 || 1);
        return sortOrder === 'asc' ? pctA - pctB : pctB - pctA;
      }

      const valA = a[sortField as keyof Instrument];
      const valB = b[sortField as keyof Instrument];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      return 0;
    });
    return sorted;
  }, [instruments, sortField, sortOrder]);

  // Pagination
  const totalItems = sortedInstruments.length;
  const maxPage = pageSize === 0 ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const validPage = Math.min(currentPage, maxPage);

  const paginatedInstruments = useMemo(() => {
    if (pageSize === 0) return sortedInstruments;
    const start = (validPage - 1) * pageSize;
    return sortedInstruments.slice(start, start + pageSize);
  }, [sortedInstruments, validPage, pageSize]);

  const formatNumber = (num: number, decimals: number = 2): string => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatCompact = (num: number): string => {
    if (num >= 1e12) return (num / 1e12).toFixed(2) + ' T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + ' B';
    if (num >= 1e7) return (num / 1e7).toFixed(2) + ' Cr';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + ' M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + ' K';
    return String(num);
  };

  const handleSortToggle = (colId: string) => {
    if (sortField === colId) {
      if (sortOrder === 'asc') setSort(colId); // will flip to desc
      else if (sortOrder === 'desc') setSort(''); // reset
    } else {
      setSort(colId);
    }
  };

  const renderSortIndicator = (colId: string) => {
    if (sortField !== colId) return null;
    return sortOrder === 'asc' ? (
      <span style={{ marginLeft: 3, fontSize: 10, color: 'var(--text-primary)' }}>↑</span>
    ) : (
      <span style={{ marginLeft: 3, fontSize: 10, color: 'var(--text-primary)' }}>↓</span>
    );
  };

  const renderCellContent = (colId: string, inst: Instrument) => {
    const isUp = inst.changePercent >= 0;
    const sign = isUp ? '+' : '';

    switch (colId) {
      case 'symbol':
        const logo = getLogoForSymbol(inst.symbol);
        const hasDividend = inst.dividendYield && inst.dividendYield > 0;
        return (
          <div className="tv-symbol-cell">
            <div className="tv-symbol-logo" style={{ backgroundColor: logo.bg, color: logo.color }}>
              {logo.label}
            </div>
            <div className="tv-symbol-details">
              <span className="tv-symbol-ticker">{inst.symbol}</span>
              <span className="tv-symbol-name" title={inst.name}>
                {inst.name}
              </span>
              {hasDividend && (
                <span className="tv-dividend-tag" title={`Dividend Yield: ${inst.dividendYield.toFixed(2)}%`}>
                  D
                </span>
              )}
            </div>
          </div>
        );

      case 'price':
        return (
          <div>
            <span className="tv-num-val">{formatNumber(inst.price)}</span>
            <span className="tv-curr-unit">{market.currency}</span>
          </div>
        );

      case 'changePercent':
        return (
          <span className={isUp ? 'tv-change-up' : 'tv-change-down'}>
            {sign}{inst.changePercent.toFixed(2)}%
          </span>
        );

      case 'change':
        return (
          <span className={isUp ? 'tv-change-up' : 'tv-change-down'}>
            {sign}{formatNumber(inst.change)}
          </span>
        );

      case 'volume':
        return <span className="tv-num-val">{formatCompact(inst.volume)}</span>;

      case 'relVol':
        const relVol = inst.volume / (inst.avgVolume30d || inst.volume);
        return <span className="tv-num-val">{relVol.toFixed(2)}</span>;

      case 'marketCap':
        return (
          <div>
            <span className="tv-num-val">{formatCompact(inst.marketCap)}</span>
            <span className="tv-curr-unit">{market.currency}</span>
          </div>
        );

      case 'pe':
        return <span className="tv-num-val">{inst.pe ? inst.pe.toFixed(2) : '—'}</span>;

      case 'forwardPe':
        return <span className="tv-num-val">{inst.forwardPe ? inst.forwardPe.toFixed(2) : '—'}</span>;

      case 'eps':
        return (
          <div>
            <span className="tv-num-val">{inst.eps ? inst.eps.toFixed(2) : '—'}</span>
            <span className="tv-curr-unit">{market.currency}</span>
          </div>
        );

      case 'epsGrowth':
        const epsGrowth = inst.revenueGrowth ?? 0;
        return (
          <span className={epsGrowth >= 0 ? 'tv-change-up' : 'tv-change-down'}>
            {epsGrowth >= 0 ? '+' : ''}{epsGrowth.toFixed(2)}%
          </span>
        );

      case 'pb':
        return <span className="tv-num-val">{inst.pb ? inst.pb.toFixed(2) : '—'}</span>;

      case 'dividendYield':
        return (
          <span className="tv-num-val">
            {inst.dividendYield ? inst.dividendYield.toFixed(2) + '%' : '0.00%'}
          </span>
        );

      case 'sector':
        const displaySector = KNOWN_SECTORS[inst.symbol] || inst.sector;
        return <span className="tv-sector-text">{displaySector}</span>;

      case 'analystRating':
      case 'technicalRating':
        const rating = inst.technicalRating;
        const isBullish = rating.includes('Buy');
        const isBearish = rating.includes('Sell');
        const isStrong = rating.startsWith('Strong');
        const arrow = isBullish ? '⌃' : isBearish ? '⌄' : '—';
        const ratingClass = isBullish
          ? (isStrong ? 'rating-strong-buy rating-strong' : 'rating-buy')
          : isBearish
          ? (isStrong ? 'rating-strong-sell rating-strong' : 'rating-sell')
          : 'rating-neutral';
        const formattedRating =
          rating === 'Strong Buy' ? 'Strong buy' : rating === 'Strong Sell' ? 'Strong sell' : rating;
        return (
          <span className={`tv-analyst-badge ${ratingClass}`}>
            <span className="tv-rating-arrow">{arrow}</span>
            <span>{formattedRating}</span>
          </span>
        );

      case 'sparkline':
        return (
          <Sparkline
            points={inst.sparkline || [inst.price * 0.98, inst.price]}
            isUp={isUp}
            symbol={inst.symbol}
          />
        );

      case 'range52':
        return <RangeBar current={inst.price} low={inst.low52} high={inst.high52} />;

      case 'high52':
        return (
          <div>
            <span className="tv-num-val">{formatNumber(inst.high52)}</span>
            <span className="tv-curr-unit">{market.currency}</span>
          </div>
        );

      case 'low52':
        return (
          <div>
            <span className="tv-num-val">{formatNumber(inst.low52)}</span>
            <span className="tv-curr-unit">{market.currency}</span>
          </div>
        );

      case 'rsi14':
        return (
          <span className={`tv-num-val ${inst.rsi14 > 70 ? 'tv-change-down' : inst.rsi14 < 35 ? 'tv-change-up' : ''}`}>
            {inst.rsi14.toFixed(1)}
          </span>
        );

      case 'sma200':
        return (
          <div>
            <span className="tv-num-val">{formatNumber(inst.sma200)}</span>
            <span className="tv-curr-unit">{market.currency}</span>
          </div>
        );

      case 'perf1W':
        return (
          <span className={(inst.perf1W ?? 0) >= 0 ? 'tv-change-up' : 'tv-change-down'}>
            {(inst.perf1W ?? 0) >= 0 ? '+' : ''}{(inst.perf1W ?? 0).toFixed(2)}%
          </span>
        );

      case 'perf1M':
        return (
          <span className={(inst.perf1M ?? 0) >= 0 ? 'tv-change-up' : 'tv-change-down'}>
            {(inst.perf1M ?? 0) >= 0 ? '+' : ''}{(inst.perf1M ?? 0).toFixed(2)}%
          </span>
        );

      case 'perf1Y':
        return (
          <span className={(inst.perf1Y ?? 0) >= 0 ? 'tv-change-up' : 'tv-change-down'}>
            {(inst.perf1Y ?? 0) >= 0 ? '+' : ''}{(inst.perf1Y ?? 0).toFixed(2)}%
          </span>
        );

      case 'revenueGrowth':
        return (
          <span className={(inst.revenueGrowth ?? 0) >= 0 ? 'tv-change-up' : 'tv-change-down'}>
            {(inst.revenueGrowth ?? 0) >= 0 ? '+' : ''}{(inst.revenueGrowth ?? 0).toFixed(1)}%
          </span>
        );

      case 'netMargin':
        return <span className="tv-num-val">{inst.netMargin ? inst.netMargin.toFixed(1) + '%' : '—'}</span>;

      case 'roce':
        return <span className="tv-num-val">{inst.roce ? inst.roce.toFixed(1) + '%' : '—'}</span>;

      case 'debtToEquity':
        return <span className="tv-num-val">{inst.debtToEquity ? inst.debtToEquity.toFixed(2) : '—'}</span>;

      default:
        return <span>—</span>;
    }
  };

  const handleRowClick = (inst: Instrument) => {
    setActiveSymbol(inst.symbol);
  };

  return (
    <div className="tv-table-wrapper" id="table-scroll-container">
      <table className="tv-screener-table">
        <thead>
          <tr>
            {visibleColumns.map((col) => {
              if (col.id === 'symbol') {
                const isSearchActive = headerSearchOpen || searchQuery.trim() !== '';

                return (
                  <th key={col.id} className="tv-th-symbol">
                    {isSearchActive ? (
                      <div className="tv-th-symbol-search-active">
                        <Search size={13} className="tv-th-search-icon-inside" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          placeholder="Search"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setHeaderSearchOpen(false);
                              setSearchQuery('');
                            }
                          }}
                          className="tv-th-search-input"
                        />
                        <button
                          className="tv-th-search-close-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHeaderSearchOpen(false);
                            setSearchQuery('');
                          }}
                          title="Clear search (Esc)"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div
                        className="tv-th-symbol-inner"
                        onClick={() => setHeaderSearchOpen(true)}
                        title="Click to search tickers"
                      >
                        <div className="tv-th-symbol-title-row">
                          <button
                            className="tv-th-search-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setHeaderSearchOpen(true);
                            }}
                            title="Search ticker..."
                          >
                            <Search size={13} />
                          </button>
                          <span
                            className="tv-th-symbol-label"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSortToggle('symbol');
                            }}
                            title="Sort by symbol"
                          >
                            Symbol
                          </span>
                          {renderSortIndicator('symbol')}
                        </div>
                        <div className="tv-th-count-row">{totalItems.toLocaleString()}</div>
                      </div>
                    )}
                  </th>
                );
              }

              const isFiltered = isColumnFiltered(col.id, advancedFilters);

              return (
                <th
                  key={col.id}
                  className={`sortable ${isFiltered ? 'has-active-filter' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenuCol({ col, anchorEl: e.currentTarget });
                  }}
                  title={`Click to filter, sort, or configure ${col.label}`}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                    {isFiltered && <Filter size={10} className="tv-th-filter-active-icon" />}
                    {renderSortIndicator(col.id)}
                    <span>{col.label}</span>
                    <ChevronDown size={10} className="tv-th-filter-icon" />
                  </div>
                </th>
              );
            })}

            {/* Trailing Add Column (+) Header Button */}
            <th
              className="tv-th-add-col"
              onClick={() => setColumnModalOpen(true)}
              title="Add / Remove columns"
            >
              <Plus size={14} />
            </th>
          </tr>
        </thead>

        <tbody>
          {paginatedInstruments.length === 0 ? (
            <tr>
              <td
                colSpan={visibleColumns.length + 1}
                style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}
              >
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                  No matching instruments found
                </div>
                <div style={{ fontSize: 13 }}>Try clearing some of your filter parameters or search query.</div>
              </td>
            </tr>
          ) : (
            paginatedInstruments.map((inst) => {
              const isSelected = activeSymbol === inst.symbol;

              return (
                <tr
                  key={inst.symbol}
                  className={`tv-row ${isSelected ? 'row-selected' : ''}`}
                  onClick={() => handleRowClick(inst)}
                >
                  {visibleColumns.map((col) => (
                    <td
                      key={col.id}
                      className={col.id === 'symbol' ? 'tv-col-symbol' : ''}
                    >
                      {renderCellContent(col.id, inst)}
                    </td>
                  ))}
                  <td style={{ width: 38 }} />
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Pagination Footer */}
      <div className="table-pagination-footer">
        <div className="pagination-info">
          Page <strong>{validPage}</strong> of <strong>{maxPage}</strong> ({totalItems.toLocaleString()} {itemLabel})
        </div>

        <div className="pagination-controls">
          <button
            className="pagination-btn"
            disabled={validPage <= 1}
            onClick={() => setPage(validPage - 1)}
            title="Previous Page"
          >
            <ChevronLeft size={14} />
          </button>

          <span className="pagination-page-indicator">{validPage}</span>

          <button
            className="pagination-btn"
            disabled={validPage >= maxPage}
            onClick={() => setPage(validPage + 1)}
            title="Next Page"
          >
            <ChevronRight size={14} />
          </button>

          <div className="page-size-selector">
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="page-size-select"
            >
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="0">All</option>
            </select>
          </div>
        </div>
      </div>

      {/* Honba Column Header Filter & Sort Popover Menu */}
      {activeMenuCol && (
        <ColumnHeaderMenu
          column={activeMenuCol.col}
          isOpen={Boolean(activeMenuCol)}
          onClose={() => setActiveMenuCol(null)}
          anchorEl={activeMenuCol.anchorEl}
        />
      )}
    </div>
  );
};

export const HbScreenerTable = ScreenerTable;

