import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ColumnDef } from '../../../core/columns';
import { useScreenerStore } from '../../../core/store/use-screener-store';
import { AdvancedFilterState } from '../../../core/filters';
import {
  Filter,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  EyeOff,
  RotateCcw,
  Check,
  X,
  HelpCircle,
  Plus,
} from 'lucide-react';

interface ColumnHeaderMenuProps {
  column: ColumnDef;
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
}

export const isColumnFiltered = (colId: string, advanced: AdvancedFilterState): boolean => {
  switch (colId) {
    case 'price':
      return advanced.minPrice !== null || advanced.maxPrice !== null;
    case 'changePercent':
      return (
        (advanced.minChangePercent !== null && advanced.minChangePercent !== undefined) ||
        (advanced.maxChangePercent !== null && advanced.maxChangePercent !== undefined)
      );
    case 'volume':
      return advanced.minVolume !== null && advanced.minVolume !== undefined;
    case 'marketCap':
      return advanced.marketCapTier !== 'all';
    case 'pe':
      return advanced.peMin !== null || advanced.peMax !== null;
    case 'rsi14':
      return advanced.rsiMin !== null || advanced.rsiMax !== null;
    case 'technicalRating':
    case 'analystRating':
      return advanced.technicalRating !== 'all';
    case 'sector':
      return advanced.sector !== 'all';
    case 'dividendYield':
      return advanced.minDividendYield !== null;
    case 'sma200':
      return advanced.priceAbove200Sma === true;
    case 'roce':
      return advanced.minRoce !== null;
    case 'netMargin':
      return advanced.minNetMargin !== null;
    default:
      return false;
  }
};

const SECTOR_OPTIONS = [
  'Energy minerals',
  'Communications',
  'Finance',
  'Technology services',
  'Industrial services',
  'Consumer non-durables',
  'Health technology',
  'Consumer durables',
  'Transportation',
  'Utilities',
  'Retail trade',
  'Process industries',
];

export const ColumnHeaderMenu: React.FC<ColumnHeaderMenuProps> = ({
  column,
  isOpen,
  onClose,
  anchorEl,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const columns = useScreenerStore((state) => state.columns);
  const setColumns = useScreenerStore((state) => state.setColumns);
  const sortField = useScreenerStore((state) => state.sortField);
  const sortOrder = useScreenerStore((state) => state.sortOrder);
  const setSort = useScreenerStore((state) => state.setSort);
  const advanced = useScreenerStore((state) => state.advancedFilters);
  const setAdvanced = useScreenerStore((state) => state.setAdvancedFilters);
  const setColumnModalOpen = useScreenerStore((state) => state.setColumnModalOpen);

  // Local inputs for custom min/max
  const [localMin, setLocalMin] = useState<string>('');
  const [localMax, setLocalMax] = useState<string>('');

  // Sync inputs with current filter state on open
  useEffect(() => {
    if (!isOpen) return;
    switch (column.id) {
      case 'price':
        setLocalMin(advanced.minPrice !== null ? String(advanced.minPrice) : '');
        setLocalMax(advanced.maxPrice !== null ? String(advanced.maxPrice) : '');
        break;
      case 'changePercent':
        setLocalMin(
          advanced.minChangePercent !== null && advanced.minChangePercent !== undefined
            ? String(advanced.minChangePercent)
            : ''
        );
        setLocalMax(
          advanced.maxChangePercent !== null && advanced.maxChangePercent !== undefined
            ? String(advanced.maxChangePercent)
            : ''
        );
        break;
      case 'volume':
        setLocalMin(
          advanced.minVolume !== null && advanced.minVolume !== undefined
            ? String(advanced.minVolume)
            : ''
        );
        setLocalMax('');
        break;
      case 'pe':
        setLocalMin(advanced.peMin !== null ? String(advanced.peMin) : '');
        setLocalMax(advanced.peMax !== null ? String(advanced.peMax) : '');
        break;
      case 'rsi14':
        setLocalMin(advanced.rsiMin !== null ? String(advanced.rsiMin) : '');
        setLocalMax(advanced.rsiMax !== null ? String(advanced.rsiMax) : '');
        break;
      default:
        setLocalMin('');
        setLocalMax('');
    }
  }, [isOpen, column.id, advanced]);

  // Position calculation
  const updatePosition = useCallback(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const menuWidth = 280;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.left;
    if (left + menuWidth > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - menuWidth - 12);
    }
    if (left < 12) left = 12;

    let top = rect.bottom + 4;
    const estimatedHeight = 360;
    if (top + estimatedHeight > viewportHeight && rect.top > estimatedHeight) {
      top = Math.max(8, rect.top - 4 - estimatedHeight);
    }

    setCoords({ top, left });
  }, [anchorEl]);

  useEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }
    updatePosition();

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        anchorEl &&
        !anchorEl.contains(target)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updatePosition, anchorEl, onClose]);

  if (!isOpen || !coords) return null;

  const isSorted = sortField === column.id;
  const isAsc = isSorted && sortOrder === 'asc';
  const isDesc = isSorted && sortOrder === 'desc';
  const hasFilter = isColumnFiltered(column.id, advanced);

  const handleClearFilter = () => {
    switch (column.id) {
      case 'price':
        setAdvanced({ minPrice: null, maxPrice: null });
        break;
      case 'changePercent':
        setAdvanced({ minChangePercent: null, maxChangePercent: null });
        break;
      case 'volume':
        setAdvanced({ minVolume: null });
        break;
      case 'marketCap':
        setAdvanced({ marketCapTier: 'all' });
        break;
      case 'pe':
        setAdvanced({ peMin: null, peMax: null });
        break;
      case 'rsi14':
        setAdvanced({ rsiMin: null, rsiMax: null });
        break;
      case 'technicalRating':
      case 'analystRating':
        setAdvanced({ technicalRating: 'all' });
        break;
      case 'sector':
        setAdvanced({ sector: 'all' });
        break;
      case 'dividendYield':
        setAdvanced({ minDividendYield: null });
        break;
      case 'sma200':
        setAdvanced({ priceAbove200Sma: false });
        break;
      case 'roce':
        setAdvanced({ minRoce: null });
        break;
      case 'netMargin':
        setAdvanced({ minNetMargin: null });
        break;
    }
    setLocalMin('');
    setLocalMax('');
  };

  const handleApplyCustomNumeric = () => {
    const minVal = localMin.trim() !== '' ? parseFloat(localMin) : null;
    const maxVal = localMax.trim() !== '' ? parseFloat(localMax) : null;

    switch (column.id) {
      case 'price':
        setAdvanced({ minPrice: isNaN(minVal as number) ? null : minVal, maxPrice: isNaN(maxVal as number) ? null : maxVal });
        break;
      case 'changePercent':
        setAdvanced({ minChangePercent: isNaN(minVal as number) ? null : minVal, maxChangePercent: isNaN(maxVal as number) ? null : maxVal });
        break;
      case 'volume':
        setAdvanced({ minVolume: isNaN(minVal as number) ? null : minVal });
        break;
      case 'pe':
        setAdvanced({ peMin: isNaN(minVal as number) ? null : minVal, peMax: isNaN(maxVal as number) ? null : maxVal });
        break;
      case 'rsi14':
        setAdvanced({ rsiMin: isNaN(minVal as number) ? null : minVal, rsiMax: isNaN(maxVal as number) ? null : maxVal });
        break;
    }
  };

  const handleMove = (direction: 'left' | 'right') => {
    const visibleCols = columns.filter((c) => c.visible);
    const curIdx = visibleCols.findIndex((c) => c.id === column.id);
    if (curIdx === -1) return;

    const targetIdx = direction === 'left' ? curIdx - 1 : curIdx + 1;
    if (targetIdx < 0 || targetIdx >= visibleCols.length) return;
    if (visibleCols[targetIdx].id === 'symbol') return; // Keep symbol pinned first

    const nextCols = [...columns];
    const fullCur = nextCols.findIndex((c) => c.id === column.id);
    const fullTarget = nextCols.findIndex((c) => c.id === visibleCols[targetIdx].id);
    const temp = nextCols[fullCur];
    nextCols[fullCur] = nextCols[fullTarget];
    nextCols[fullTarget] = temp;
    setColumns(nextCols);
    onClose();
  };

  const handleHideColumn = () => {
    if (column.id === 'symbol') return;
    const updated = columns.map((c) => (c.id === column.id ? { ...c, visible: false } : c));
    setColumns(updated);
    onClose();
  };

  const handleSortAction = (order: 'asc' | 'desc') => {
    if (isSorted && sortOrder === order) {
      setSort(''); // reset sort
    } else {
      useScreenerStore.setState({ sortField: column.id, sortOrder: order });
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      className="tv-col-menu-popover"
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        zIndex: 9999,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header Row */}
      <div className="tv-col-menu-header">
        <div className="tv-col-menu-title-wrap">
          <span className="tv-col-menu-title">{column.label}</span>
          {hasFilter && <span className="tv-col-menu-filter-badge">Filtered</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasFilter && (
            <button
              className="tv-col-menu-clear-btn"
              onClick={handleClearFilter}
              title="Clear filter on this column"
            >
              <RotateCcw size={11} style={{ marginRight: 3 }} />
              Reset
            </button>
          )}
          <button className="tv-col-menu-close-btn" onClick={onClose}>
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Filter Section */}
      <div className="tv-col-menu-section">
        <div className="tv-col-menu-section-label">
          <Filter size={11} />
          <span>Filter Condition</span>
        </div>

        {/* Column-Specific Filter Controls */}
        {column.id === 'price' && (
          <div className="tv-col-filter-body">
            <div className="tv-col-chips-row">
              <button
                className={`tv-col-chip ${advanced.minPrice === null && advanced.maxPrice === null ? 'active' : ''}`}
                onClick={() => setAdvanced({ minPrice: null, maxPrice: null })}
              >
                All
              </button>
              <button
                className={`tv-col-chip ${advanced.minPrice === null && advanced.maxPrice === 100 ? 'active' : ''}`}
                onClick={() => setAdvanced({ minPrice: null, maxPrice: 100 })}
              >
                &lt; ₹100
              </button>
              <button
                className={`tv-col-chip ${advanced.minPrice === 100 && advanced.maxPrice === 500 ? 'active' : ''}`}
                onClick={() => setAdvanced({ minPrice: 100, maxPrice: 500 })}
              >
                ₹100–500
              </button>
              <button
                className={`tv-col-chip ${advanced.minPrice === 500 && advanced.maxPrice === 2000 ? 'active' : ''}`}
                onClick={() => setAdvanced({ minPrice: 500, maxPrice: 2000 })}
              >
                ₹500–2K
              </button>
              <button
                className={`tv-col-chip ${advanced.minPrice === 2000 && advanced.maxPrice === null ? 'active' : ''}`}
                onClick={() => setAdvanced({ minPrice: 2000, maxPrice: null })}
              >
                &gt; ₹2K
              </button>
            </div>
            <div className="tv-col-range-inputs">
              <input
                type="number"
                placeholder="Min ₹"
                value={localMin}
                onChange={(e) => setLocalMin(e.target.value)}
                className="tv-col-num-input"
              />
              <span style={{ color: 'var(--text-muted)' }}>–</span>
              <input
                type="number"
                placeholder="Max ₹"
                value={localMax}
                onChange={(e) => setLocalMax(e.target.value)}
                className="tv-col-num-input"
              />
              <button className="tv-col-apply-btn" onClick={handleApplyCustomNumeric}>
                Apply
              </button>
            </div>
          </div>
        )}

        {column.id === 'changePercent' && (
          <div className="tv-col-filter-body">
            <div className="tv-col-chips-row">
              <button
                className={`tv-col-chip ${advanced.minChangePercent === null && advanced.maxChangePercent === null ? 'active' : ''}`}
                onClick={() => setAdvanced({ minChangePercent: null, maxChangePercent: null })}
              >
                All
              </button>
              <button
                className={`tv-col-chip ${advanced.minChangePercent === 0 && advanced.maxChangePercent === null ? 'active' : ''}`}
                onClick={() => setAdvanced({ minChangePercent: 0, maxChangePercent: null })}
              >
                Gainers (&gt;0%)
              </button>
              <button
                className={`tv-col-chip ${advanced.minChangePercent === null && advanced.maxChangePercent === 0 ? 'active' : ''}`}
                onClick={() => setAdvanced({ minChangePercent: null, maxChangePercent: 0 })}
              >
                Losers (&lt;0%)
              </button>
              <button
                className={`tv-col-chip ${advanced.minChangePercent === 3 ? 'active' : ''}`}
                onClick={() => setAdvanced({ minChangePercent: 3, maxChangePercent: null })}
              >
                &gt; +3%
              </button>
              <button
                className={`tv-col-chip ${advanced.maxChangePercent === -3 ? 'active' : ''}`}
                onClick={() => setAdvanced({ minChangePercent: null, maxChangePercent: -3 })}
              >
                &lt; -3%
              </button>
            </div>
            <div className="tv-col-range-inputs">
              <input
                type="number"
                placeholder="Min %"
                value={localMin}
                onChange={(e) => setLocalMin(e.target.value)}
                className="tv-col-num-input"
              />
              <span style={{ color: 'var(--text-muted)' }}>–</span>
              <input
                type="number"
                placeholder="Max %"
                value={localMax}
                onChange={(e) => setLocalMax(e.target.value)}
                className="tv-col-num-input"
              />
              <button className="tv-col-apply-btn" onClick={handleApplyCustomNumeric}>
                Apply
              </button>
            </div>
          </div>
        )}

        {column.id === 'volume' && (
          <div className="tv-col-filter-body">
            <div className="tv-col-chips-row">
              <button
                className={`tv-col-chip ${advanced.minVolume === null ? 'active' : ''}`}
                onClick={() => setAdvanced({ minVolume: null })}
              >
                All
              </button>
              <button
                className={`tv-col-chip ${advanced.minVolume === 100000 ? 'active' : ''}`}
                onClick={() => setAdvanced({ minVolume: 100000 })}
              >
                &gt; 100K
              </button>
              <button
                className={`tv-col-chip ${advanced.minVolume === 500000 ? 'active' : ''}`}
                onClick={() => setAdvanced({ minVolume: 500000 })}
              >
                &gt; 500K
              </button>
              <button
                className={`tv-col-chip ${advanced.minVolume === 1000000 ? 'active' : ''}`}
                onClick={() => setAdvanced({ minVolume: 1000000 })}
              >
                &gt; 1M
              </button>
              <button
                className={`tv-col-chip ${advanced.minVolume === 5000000 ? 'active' : ''}`}
                onClick={() => setAdvanced({ minVolume: 5000000 })}
              >
                &gt; 5M
              </button>
            </div>
            <div className="tv-col-range-inputs">
              <input
                type="number"
                placeholder="Min Volume"
                value={localMin}
                onChange={(e) => setLocalMin(e.target.value)}
                className="tv-col-num-input"
                style={{ flex: 1 }}
              />
              <button className="tv-col-apply-btn" onClick={handleApplyCustomNumeric}>
                Apply
              </button>
            </div>
          </div>
        )}

        {column.id === 'marketCap' && (
          <div className="tv-col-filter-body">
            <div className="tv-col-options-list">
              {[
                { id: 'all', label: 'All Market Caps' },
                { id: 'mega', label: 'Mega Cap (> ₹2 Trillion)' },
                { id: 'large', label: 'Large Cap (> ₹500 Billion)' },
                { id: 'mid', label: 'Mid Cap (₹100B – ₹500B)' },
                { id: 'small', label: 'Small Cap (< ₹100B)' },
              ].map((tier) => (
                <div
                  key={tier.id}
                  className={`tv-col-option-row ${advanced.marketCapTier === tier.id ? 'selected' : ''}`}
                  onClick={() => setAdvanced({ marketCapTier: tier.id })}
                >
                  <span>{tier.label}</span>
                  {advanced.marketCapTier === tier.id && <Check size={13} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {column.id === 'pe' && (
          <div className="tv-col-filter-body">
            <div className="tv-col-chips-row">
              <button
                className={`tv-col-chip ${advanced.peMin === null && advanced.peMax === null ? 'active' : ''}`}
                onClick={() => setAdvanced({ peMin: null, peMax: null })}
              >
                All
              </button>
              <button
                className={`tv-col-chip ${advanced.peMin === null && advanced.peMax === 15 ? 'active' : ''}`}
                onClick={() => setAdvanced({ peMin: null, peMax: 15 })}
              >
                Value (&lt; 15)
              </button>
              <button
                className={`tv-col-chip ${advanced.peMin === 15 && advanced.peMax === 30 ? 'active' : ''}`}
                onClick={() => setAdvanced({ peMin: 15, peMax: 30 })}
              >
                15–30
              </button>
              <button
                className={`tv-col-chip ${advanced.peMin === 30 && advanced.peMax === null ? 'active' : ''}`}
                onClick={() => setAdvanced({ peMin: 30, peMax: null })}
              >
                Growth (&gt; 30)
              </button>
            </div>
            <div className="tv-col-range-inputs">
              <input
                type="number"
                placeholder="Min P/E"
                value={localMin}
                onChange={(e) => setLocalMin(e.target.value)}
                className="tv-col-num-input"
              />
              <span style={{ color: 'var(--text-muted)' }}>–</span>
              <input
                type="number"
                placeholder="Max P/E"
                value={localMax}
                onChange={(e) => setLocalMax(e.target.value)}
                className="tv-col-num-input"
              />
              <button className="tv-col-apply-btn" onClick={handleApplyCustomNumeric}>
                Apply
              </button>
            </div>
          </div>
        )}

        {column.id === 'rsi14' && (
          <div className="tv-col-filter-body">
            <div className="tv-col-chips-row">
              <button
                className={`tv-col-chip ${advanced.rsiMin === null && advanced.rsiMax === null ? 'active' : ''}`}
                onClick={() => setAdvanced({ rsiMin: null, rsiMax: null })}
              >
                All
              </button>
              <button
                className={`tv-col-chip ${advanced.rsiMax === 30 ? 'active' : ''}`}
                onClick={() => setAdvanced({ rsiMin: null, rsiMax: 30 })}
              >
                Oversold (&lt; 30)
              </button>
              <button
                className={`tv-col-chip ${advanced.rsiMin === 30 && advanced.rsiMax === 70 ? 'active' : ''}`}
                onClick={() => setAdvanced({ rsiMin: 30, rsiMax: 70 })}
              >
                Neutral (30–70)
              </button>
              <button
                className={`tv-col-chip ${advanced.rsiMin === 70 ? 'active' : ''}`}
                onClick={() => setAdvanced({ rsiMin: 70, rsiMax: null })}
              >
                Overbought (&gt; 70)
              </button>
            </div>
            <div className="tv-col-range-inputs">
              <input
                type="number"
                placeholder="Min RSI"
                value={localMin}
                onChange={(e) => setLocalMin(e.target.value)}
                className="tv-col-num-input"
              />
              <span style={{ color: 'var(--text-muted)' }}>–</span>
              <input
                type="number"
                placeholder="Max RSI"
                value={localMax}
                onChange={(e) => setLocalMax(e.target.value)}
                className="tv-col-num-input"
              />
              <button className="tv-col-apply-btn" onClick={handleApplyCustomNumeric}>
                Apply
              </button>
            </div>
          </div>
        )}

        {(column.id === 'technicalRating' || column.id === 'analystRating') && (
          <div className="tv-col-filter-body">
            <div className="tv-col-options-list">
              {['all', 'Strong Buy', 'Buy', 'Neutral', 'Sell', 'Strong Sell'].map((r) => (
                <div
                  key={r}
                  className={`tv-col-option-row ${advanced.technicalRating === r ? 'selected' : ''}`}
                  onClick={() => setAdvanced({ technicalRating: r })}
                >
                  <span>{r === 'all' ? 'All Ratings' : r}</span>
                  {advanced.technicalRating === r && <Check size={13} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {column.id === 'sector' && (
          <div className="tv-col-filter-body" style={{ maxHeight: 180, overflowY: 'auto' }}>
            <div
              className={`tv-col-option-row ${advanced.sector === 'all' ? 'selected' : ''}`}
              onClick={() => setAdvanced({ sector: 'all' })}
            >
              <span>All Sectors</span>
              {advanced.sector === 'all' && <Check size={13} />}
            </div>
            {SECTOR_OPTIONS.map((sec) => (
              <div
                key={sec}
                className={`tv-col-option-row ${advanced.sector === sec ? 'selected' : ''}`}
                onClick={() => setAdvanced({ sector: sec })}
              >
                <span>{sec}</span>
                {advanced.sector === sec && <Check size={13} />}
              </div>
            ))}
          </div>
        )}

        {column.id === 'dividendYield' && (
          <div className="tv-col-filter-body">
            <div className="tv-col-chips-row">
              <button
                className={`tv-col-chip ${advanced.minDividendYield === null ? 'active' : ''}`}
                onClick={() => setAdvanced({ minDividendYield: null })}
              >
                All
              </button>
              <button
                className={`tv-col-chip ${advanced.minDividendYield === 1 ? 'active' : ''}`}
                onClick={() => setAdvanced({ minDividendYield: 1 })}
              >
                &gt; 1%
              </button>
              <button
                className={`tv-col-chip ${advanced.minDividendYield === 2 ? 'active' : ''}`}
                onClick={() => setAdvanced({ minDividendYield: 2 })}
              >
                &gt; 2%
              </button>
              <button
                className={`tv-col-chip ${advanced.minDividendYield === 3 ? 'active' : ''}`}
                onClick={() => setAdvanced({ minDividendYield: 3 })}
              >
                &gt; 3%
              </button>
            </div>
          </div>
        )}

        {column.id === 'sma200' && (
          <div className="tv-col-filter-body">
            <div
              className={`tv-col-option-row ${advanced.priceAbove200Sma ? 'selected' : ''}`}
              onClick={() => setAdvanced({ priceAbove200Sma: !advanced.priceAbove200Sma })}
            >
              <span>Price Above 200 SMA</span>
              {advanced.priceAbove200Sma && <Check size={13} />}
            </div>
          </div>
        )}

        {/* Fallback for other metrics */}
        {![
          'price',
          'changePercent',
          'volume',
          'marketCap',
          'pe',
          'rsi14',
          'technicalRating',
          'analystRating',
          'sector',
          'dividendYield',
          'sma200',
        ].includes(column.id) && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>
            Filter by sorting or range criteria below.
          </div>
        )}
      </div>

      <div className="tv-col-menu-divider" />

      {/* Sorting Section */}
      <div className="tv-col-menu-section">
        <button
          className={`tv-col-menu-action-btn ${isAsc ? 'active' : ''}`}
          onClick={() => handleSortAction('asc')}
        >
          <ArrowUp size={13} />
          <span>Sort ascending</span>
          {isAsc && <Check size={13} style={{ marginLeft: 'auto' }} />}
        </button>
        <button
          className={`tv-col-menu-action-btn ${isDesc ? 'active' : ''}`}
          onClick={() => handleSortAction('desc')}
        >
          <ArrowDown size={13} />
          <span>Sort descending</span>
          {isDesc && <Check size={13} style={{ marginLeft: 'auto' }} />}
        </button>
        {isSorted && (
          <button
            className="tv-col-menu-action-btn"
            onClick={() => setSort('')}
            style={{ color: 'var(--text-muted)' }}
          >
            <RotateCcw size={13} />
            <span>Reset sort</span>
          </button>
        )}
      </div>

      <div className="tv-col-menu-divider" />

      {/* Column Organization Actions */}
      <div className="tv-col-menu-section">
        <button className="tv-col-menu-action-btn" onClick={() => handleMove('left')}>
          <ArrowLeft size={13} />
          <span>Move left</span>
        </button>
        <button className="tv-col-menu-action-btn" onClick={() => handleMove('right')}>
          <ArrowRight size={13} />
          <span>Move right</span>
        </button>
        {column.id !== 'symbol' && (
          <button
            className="tv-col-menu-action-btn"
            onClick={handleHideColumn}
            style={{ color: '#f23645' }}
          >
            <EyeOff size={13} />
            <span>Hide column</span>
          </button>
        )}
        <button
          className="tv-col-menu-action-btn"
          onClick={() => {
            onClose();
            setColumnModalOpen(true);
          }}
        >
          <Plus size={13} />
          <span>Customize columns...</span>
        </button>
      </div>
    </div>,
    document.body
  );
};
