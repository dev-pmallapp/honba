import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Instrument } from '../../../core/market-data';
import { useScreenerStore } from '../../../core/store/use-screener-store';
import { useLayoutStore } from '../../../layouts/use-layout-store';
import { dataLayer } from '../../../core/data-layer';
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
    const colDef = columns.find((c) => c.id === colId);
    if (colDef && colDef.render) {
      return colDef.render(inst, { market });
    }
    return <span>—</span>;
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
                  onDoubleClick={() => {
                    window.location.href = `/instrument.html?symbol=${encodeURIComponent(inst.symbol)}`;
                  }}
                  title="Click to preview drawer, double-click for dedicated Instrument page"
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

