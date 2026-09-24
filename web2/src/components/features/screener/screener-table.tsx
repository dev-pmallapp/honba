import React, { useMemo } from 'react';
import { Instrument } from '../../../core/market-data';
import { useScreenerStore } from '../../../core/store/use-screener-store';
import { dataLayer } from '../../../core/data-layer';
import { Sparkline } from '../../ui/sparkline';
import { RangeBar } from '../../ui/range-bar';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Plus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface ScreenerTableProps {
  instruments: Instrument[];
}

export const ScreenerTable: React.FC<ScreenerTableProps> = ({ instruments }) => {
  const columns = useScreenerStore((state) => state.columns);
  const sortField = useScreenerStore((state) => state.sortField);
  const sortOrder = useScreenerStore((state) => state.sortOrder);
  const setSort = useScreenerStore((state) => state.setSort);
  const activeSymbol = useScreenerStore((state) => state.activeSymbol);
  const setActiveSymbol = useScreenerStore((state) => state.setActiveSymbol);
  const shortlistedSymbols = useScreenerStore((state) => state.shortlistedSymbols);
  const toggleShortlist = useScreenerStore((state) => state.toggleShortlist);
  const currentPage = useScreenerStore((state) => state.currentPage);
  const setPage = useScreenerStore((state) => state.setPage);
  const pageSize = useScreenerStore((state) => state.pageSize);
  const setPageSize = useScreenerStore((state) => state.setPageSize);
  const setColumnModalOpen = useScreenerStore((state) => state.setColumnModalOpen);

  const market = dataLayer.getCurrentMarketInfo();
  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);

  // Sorting
  const sortedInstruments = useMemo(() => {
    if (!sortField || !sortOrder) return instruments;
    const sorted = [...instruments];
    sorted.sort((a, b) => {
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

  // Master Checkbox
  const allCurrentSymbols = useMemo(() => paginatedInstruments.map((i) => i.symbol), [paginatedInstruments]);
  const isAllSelected =
    allCurrentSymbols.length > 0 &&
    allCurrentSymbols.every((s) => shortlistedSymbols.includes(s));
  const isSomeSelected =
    allCurrentSymbols.some((s) => shortlistedSymbols.includes(s)) && !isAllSelected;

  const handleMasterCheckboxChange = () => {
    if (isAllSelected) {
      allCurrentSymbols.forEach((s) => {
        if (shortlistedSymbols.includes(s)) toggleShortlist(s);
      });
    } else {
      allCurrentSymbols.forEach((s) => {
        if (!shortlistedSymbols.includes(s)) toggleShortlist(s);
      });
    }
  };

  const formatNumber = (num: number, decimals: number = 2): string => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatCompact = (num: number): string => {
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e7) return (num / 1e7).toFixed(2) + 'Cr';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return String(num);
  };

  const renderSortIcon = (colId: string) => {
    if (sortField !== colId) {
      return <ChevronsUpDown size={11} className="sort-icon inactive" />;
    }
    return sortOrder === 'asc' ? (
      <ChevronUp size={11} className="sort-icon active" />
    ) : (
      <ChevronDown size={11} className="sort-icon active" />
    );
  };

  const renderCellContent = (colId: string, inst: Instrument) => {
    const isUp = inst.changePercent >= 0;
    const sign = isUp ? '+' : '';

    switch (colId) {
      case 'symbol':
        const avatarBg = ['#2962ff', '#089981', '#7b1fa2', '#f57c00', '#0097a7', '#455a64'][
          inst.symbol.charCodeAt(0) % 6
        ];
        return (
          <div className="symbol-cell-content">
            <input
              type="checkbox"
              className="row-checkbox"
              checked={shortlistedSymbols.includes(inst.symbol)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleShortlist(inst.symbol)}
            />
            <div className="company-avatar" style={{ backgroundColor: avatarBg }}>
              {inst.symbol.slice(0, 2)}
            </div>
            <div className="symbol-text-group">
              <div className="symbol-name-row">
                <span className="symbol-ticker">{inst.symbol}</span>
                <span className="symbol-exch-badge">{inst.exchange}</span>
              </div>
              <div className="company-fullname" title={inst.name}>
                {inst.name}
              </div>
            </div>
          </div>
        );

      case 'price':
        return (
          <div className="num-cell-wrapper">
            <span className="currency-prefix">{market.currencySymbol}</span>
            <span className="price-value">{formatNumber(inst.price)}</span>
          </div>
        );

      case 'changePercent':
        return (
          <span className={`badge-pill ${isUp ? 'pill-bullish' : 'pill-bearish'}`}>
            {sign}{inst.changePercent.toFixed(2)}%
          </span>
        );

      case 'change':
        return (
          <span className={`num-val ${isUp ? 'val-bullish' : 'val-bearish'}`}>
            {sign}{formatNumber(inst.change)}
          </span>
        );

      case 'volume':
        return <span className="num-val">{formatCompact(inst.volume)}</span>;

      case 'sparkline':
        return (
          <Sparkline
            points={inst.sparkline || [inst.price * 0.98, inst.price]}
            isUp={isUp}
            symbol={inst.symbol}
          />
        );

      case 'technicalRating':
        return (
          <span className={`rating-pill rating-${inst.technicalRating.toLowerCase().replace(' ', '-')}`}>
            {inst.technicalRating}
          </span>
        );

      case 'marketCap':
        return (
          <span className="num-val">
            {market.currencySymbol}{formatCompact(inst.marketCap)}
          </span>
        );

      case 'pe':
        return <span className="num-val">{inst.pe ? inst.pe.toFixed(2) : '-'}</span>;

      case 'forwardPe':
        return <span className="num-val">{inst.forwardPe ? inst.forwardPe.toFixed(2) : '-'}</span>;

      case 'eps':
        return <span className="num-val">{inst.eps ? market.currencySymbol + inst.eps.toFixed(2) : '-'}</span>;

      case 'pb':
        return <span className="num-val">{inst.pb ? inst.pb.toFixed(2) : '-'}</span>;

      case 'dividendYield':
        return (
          <span className="num-val">
            {inst.dividendYield ? inst.dividendYield.toFixed(2) + '%' : '0.00%'}
          </span>
        );

      case 'range52':
        return <RangeBar current={inst.price} low={inst.low52} high={inst.high52} />;

      case 'high52':
        return <span className="num-val">{market.currencySymbol}{formatNumber(inst.high52)}</span>;

      case 'low52':
        return <span className="num-val">{market.currencySymbol}{formatNumber(inst.low52)}</span>;

      case 'rsi14':
        return (
          <span className={`num-val ${inst.rsi14 > 70 ? 'val-bearish' : inst.rsi14 < 35 ? 'val-bullish' : ''}`}>
            {inst.rsi14.toFixed(1)}
          </span>
        );

      case 'sma200':
        return <span className="num-val">{market.currencySymbol}{formatNumber(inst.sma200)}</span>;

      case 'perf1W':
        return (
          <span className={`num-val ${(inst.perf1W ?? 0) >= 0 ? 'val-bullish' : 'val-bearish'}`}>
            {(inst.perf1W ?? 0) >= 0 ? '+' : ''}{(inst.perf1W ?? 0).toFixed(2)}%
          </span>
        );

      case 'perf1M':
        return (
          <span className={`num-val ${(inst.perf1M ?? 0) >= 0 ? 'val-bullish' : 'val-bearish'}`}>
            {(inst.perf1M ?? 0) >= 0 ? '+' : ''}{(inst.perf1M ?? 0).toFixed(2)}%
          </span>
        );

      case 'perf1Y':
        return (
          <span className={`num-val ${(inst.perf1Y ?? 0) >= 0 ? 'val-bullish' : 'val-bearish'}`}>
            {(inst.perf1Y ?? 0) >= 0 ? '+' : ''}{(inst.perf1Y ?? 0).toFixed(2)}%
          </span>
        );

      case 'revenueGrowth':
        return (
          <span className={`num-val ${(inst.revenueGrowth ?? 0) >= 0 ? 'val-bullish' : 'val-bearish'}`}>
            {(inst.revenueGrowth ?? 0) >= 0 ? '+' : ''}{(inst.revenueGrowth ?? 0).toFixed(1)}%
          </span>
        );

      case 'netMargin':
        return <span className="num-val">{inst.netMargin ? inst.netMargin.toFixed(1) + '%' : '-'}</span>;

      case 'roce':
        return <span className="num-val">{inst.roce.toFixed(1)}%</span>;

      case 'debtToEquity':
        return <span className="num-val">{inst.debtToEquity.toFixed(2)}</span>;

      default:
        return <span>-</span>;
    }
  };

  return (
    <div className="screener-table-container" id="table-scroll-container">
      <table className="tv-screener-table">
        <thead>
          <tr>
            {visibleColumns.map((col) => {
              if (col.id === 'symbol') {
                return (
                  <th key={col.id} className="sticky-col sortable" onClick={() => setSort('symbol')}>
                    <div className="header-cell-inner">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = isSomeSelected;
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={handleMasterCheckboxChange}
                        style={{ marginRight: 8, cursor: 'pointer' }}
                        title="Select All on Page"
                      />
                      <span>{col.label}</span>
                      {renderSortIcon('symbol')}
                    </div>
                  </th>
                );
              }

              return (
                <th
                  key={col.id}
                  className={`sortable ${['price', 'changePercent', 'change', 'volume', 'marketCap', 'pe', 'rsi14', 'roce'].includes(col.id) ? 'num' : ''}`}
                  onClick={() => setSort(col.id)}
                >
                  <div className="header-cell-inner">
                    <span>{col.label}</span>
                    {renderSortIcon(col.id)}
                  </div>
                </th>
              );
            })}

            {/* Trailing Column to add more */}
            <th className="action-col" style={{ width: 44, textAlign: 'center' }}>
              <button
                className="nav-icon-btn table-add-col-btn"
                onClick={() => setColumnModalOpen(true)}
                title="Add / Remove Columns"
              >
                <Plus size={13} />
              </button>
            </th>
          </tr>
        </thead>

        <tbody>
          {paginatedInstruments.length === 0 ? (
            <tr>
              <td colSpan={visibleColumns.length + 1} style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No matching instruments found</div>
                <div style={{ fontSize: 13 }}>Try clearing some of your search queries or filter constraints.</div>
              </td>
            </tr>
          ) : (
            paginatedInstruments.map((inst) => {
              const isSelected = activeSymbol === inst.symbol;
              const isShortlisted = shortlistedSymbols.includes(inst.symbol);

              return (
                <tr
                  key={inst.symbol}
                  className={`table-row ${isSelected ? 'row-selected' : ''} ${isShortlisted ? 'row-shortlisted' : ''}`}
                  onClick={() => setActiveSymbol(inst.symbol)}
                >
                  {visibleColumns.map((col) => (
                    <td
                      key={col.id}
                      className={`${col.id === 'symbol' ? 'sticky-col' : ''} ${['price', 'changePercent', 'change', 'volume', 'marketCap', 'pe', 'forwardPe', 'eps', 'pb', 'dividendYield', 'high52', 'low52', 'rsi14', 'sma200', 'perf1W', 'perf1M', 'perf1Y', 'revenueGrowth', 'netMargin', 'roce', 'debtToEquity'].includes(col.id) ? 'num' : ''}`}
                    >
                      {renderCellContent(col.id, inst)}
                    </td>
                  ))}
                  <td className="action-col" />
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Pagination Footer */}
      <div className="table-pagination-footer">
        <div className="pagination-info">
          Page <strong>{validPage}</strong> of <strong>{maxPage}</strong> ({totalItems} total)
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
    </div>
  );
};
