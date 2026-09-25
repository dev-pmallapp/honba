import React, { useState, useEffect } from 'react';
import { useScreenerStore } from '../../../core/store/use-screener-store';
import { AdvancedFilterState, DEFAULT_ADVANCED_FILTERS } from '../../tradingview-filters-modal';
import { X, RotateCcw, Check } from 'lucide-react';

export const FiltersModal: React.FC = () => {
  const isOpen = useScreenerStore((state) => state.isFilterModalOpen);
  const setOpen = useScreenerStore((state) => state.setFilterModalOpen);
  const advancedFilters = useScreenerStore((state) => state.advancedFilters);
  const setAdvancedFilters = useScreenerStore((state) => state.setAdvancedFilters);

  const [activeCat, setActiveCat] = useState<'descriptive' | 'financials' | 'technicals'>('descriptive');
  const [localFilters, setLocalFilters] = useState<AdvancedFilterState>(advancedFilters);

  useEffect(() => {
    if (isOpen) {
      setLocalFilters({ ...advancedFilters });
    }
  }, [isOpen, advancedFilters]);

  if (!isOpen) return null;

  const countActive = (filters: AdvancedFilterState): number => {
    let count = 0;
    if (filters.sector !== 'all') count++;
    if (filters.marketCapTier !== 'all') count++;
    if (filters.exchange !== 'all') count++;
    if (filters.indices && filters.indices.length > 0) count++;
    if (filters.minPrice !== null || filters.maxPrice !== null) count++;
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
  };

  const activeCount = countActive(localFilters);

  const handleReset = () => {
    setLocalFilters({ ...DEFAULT_ADVANCED_FILTERS });
  };

  const handleApply = () => {
    setAdvancedFilters(localFilters);
    setOpen(false);
  };

  return (
    <div className="modal-overlay open" onClick={() => setOpen(false)}>
      <div
        className="modal-dialog tv-filters-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="modal-title">Filters</div>
            {activeCount > 0 && (
              <span className="tv-filter-count-badge">{activeCount} active</span>
            )}
          </div>
          <button
            className="nav-icon-btn modal-close-btn"
            style={{ border: 'none' }}
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body Split */}
        <div className="tv-filters-body">
          {/* Sidebar */}
          <aside className="tv-filters-sidebar">
            <button
              className={`tv-filter-cat-btn ${activeCat === 'descriptive' ? 'active' : ''}`}
              onClick={() => setActiveCat('descriptive')}
            >
              <span>Descriptive</span>
              <div className="cat-badges-group">
                <span className="cat-pill">4</span>
              </div>
            </button>
            <button
              className={`tv-filter-cat-btn ${activeCat === 'financials' ? 'active' : ''}`}
              onClick={() => setActiveCat('financials')}
            >
              <span>Financials & Valuation</span>
              <div className="cat-badges-group">
                <span className="cat-pill">4</span>
              </div>
            </button>
            <button
              className={`tv-filter-cat-btn ${activeCat === 'technicals' ? 'active' : ''}`}
              onClick={() => setActiveCat('technicals')}
            >
              <span>Technicals & Momentum</span>
              <div className="cat-badges-group">
                <span className="cat-pill">5</span>
              </div>
            </button>
          </aside>

          {/* Content Area */}
          <main className="tv-filters-content-area" style={{ maxHeight: 420, overflowY: 'auto' }}>
            {activeCat === 'descriptive' && (
              <div className="filter-category-panel">
                <div className="filter-field-row">
                  <div className="filter-field-label">Sector</div>
                  <select
                    className="filter-select-input"
                    value={localFilters.sector}
                    onChange={(e) => setLocalFilters({ ...localFilters, sector: e.target.value })}
                  >
                    <option value="all">All Sectors</option>
                    <option value="Information Technology">Information Technology</option>
                    <option value="Financial Services">Financial Services</option>
                    <option value="Energy">Energy</option>
                    <option value="Automobile">Automobile</option>
                    <option value="Consumer Goods">Consumer Goods</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Telecommunication">Telecommunication</option>
                    <option value="Metals & Mining">Metals & Mining</option>
                  </select>
                </div>

                <div className="filter-field-row">
                  <div className="filter-field-label">Market Capitalization</div>
                  <select
                    className="filter-select-input"
                    value={localFilters.marketCapTier}
                    onChange={(e) => setLocalFilters({ ...localFilters, marketCapTier: e.target.value })}
                  >
                    <option value="all">Any Market Cap</option>
                    <option value="mega">Mega Cap (&gt; ₹2 Lakh Cr)</option>
                    <option value="large">Large Cap (&gt; ₹50,000 Cr)</option>
                    <option value="mid">Mid Cap (₹10,000 - ₹50,000 Cr)</option>
                    <option value="small">Small Cap (&lt; ₹10,000 Cr)</option>
                  </select>
                </div>

                <div className="filter-field-row">
                  <div className="filter-field-label">Primary Exchange</div>
                  <select
                    className="filter-select-input"
                    value={localFilters.exchange}
                    onChange={(e) => setLocalFilters({ ...localFilters, exchange: e.target.value })}
                  >
                    <option value="all">All Exchanges</option>
                    <option value="NSE">NSE (National Stock Exchange)</option>
                    <option value="BSE">BSE (Bombay Stock Exchange)</option>
                    <option value="NASDAQ">NASDAQ</option>
                    <option value="NYSE">NYSE</option>
                  </select>
                </div>

                <div className="filter-field-row">
                  <div className="filter-field-label">Price Range</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="number"
                      placeholder="Min Price"
                      className="filter-number-input"
                      value={localFilters.minPrice ?? ''}
                      onChange={(e) =>
                        setLocalFilters({
                          ...localFilters,
                          minPrice: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                    <input
                      type="number"
                      placeholder="Max Price"
                      className="filter-number-input"
                      value={localFilters.maxPrice ?? ''}
                      onChange={(e) =>
                        setLocalFilters({
                          ...localFilters,
                          maxPrice: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {activeCat === 'financials' && (
              <div className="filter-category-panel">
                <div className="filter-field-row">
                  <div className="filter-field-label">P/E Ratio (TTM)</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="number"
                      placeholder="Min P/E"
                      className="filter-number-input"
                      value={localFilters.peMin ?? ''}
                      onChange={(e) =>
                        setLocalFilters({
                          ...localFilters,
                          peMin: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                    <input
                      type="number"
                      placeholder="Max P/E"
                      className="filter-number-input"
                      value={localFilters.peMax ?? ''}
                      onChange={(e) =>
                        setLocalFilters({
                          ...localFilters,
                          peMax: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="filter-field-row">
                  <div className="filter-field-label">Minimum Dividend Yield %</div>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 1.5%"
                    className="filter-number-input"
                    value={localFilters.minDividendYield ?? ''}
                    onChange={(e) =>
                      setLocalFilters({
                        ...localFilters,
                        minDividendYield: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>

                <div className="filter-field-row">
                  <div className="filter-field-label">Minimum ROCE %</div>
                  <input
                    type="number"
                    step="1"
                    placeholder="e.g. 15%"
                    className="filter-number-input"
                    value={localFilters.minRoce ?? ''}
                    onChange={(e) =>
                      setLocalFilters({
                        ...localFilters,
                        minRoce: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>

                <div className="filter-field-row">
                  <div className="filter-field-label">Minimum Net Margin %</div>
                  <input
                    type="number"
                    step="1"
                    placeholder="e.g. 10%"
                    className="filter-number-input"
                    value={localFilters.minNetMargin ?? ''}
                    onChange={(e) =>
                      setLocalFilters({
                        ...localFilters,
                        minNetMargin: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
              </div>
            )}

            {activeCat === 'technicals' && (
              <div className="filter-category-panel">
                <div className="filter-field-row">
                  <div className="filter-field-label">Technical Rating</div>
                  <select
                    className="filter-select-input"
                    value={localFilters.technicalRating}
                    onChange={(e) =>
                      setLocalFilters({ ...localFilters, technicalRating: e.target.value })
                    }
                  >
                    <option value="all">Any Rating</option>
                    <option value="Strong Buy">Strong Buy</option>
                    <option value="Buy">Buy or Strong Buy</option>
                    <option value="Neutral">Neutral</option>
                    <option value="Sell">Sell or Strong Sell</option>
                    <option value="Strong Sell">Strong Sell</option>
                  </select>
                </div>

                <div className="filter-field-row">
                  <div className="filter-field-label">RSI (14) Range</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="number"
                      placeholder="Min RSI"
                      className="filter-number-input"
                      value={localFilters.rsiMin ?? ''}
                      onChange={(e) =>
                        setLocalFilters({
                          ...localFilters,
                          rsiMin: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                    <input
                      type="number"
                      placeholder="Max RSI"
                      className="filter-number-input"
                      value={localFilters.rsiMax ?? ''}
                      onChange={(e) =>
                        setLocalFilters({
                          ...localFilters,
                          rsiMax: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="filter-field-row">
                  <label className="checkbox-item" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={localFilters.priceAbove200Sma}
                      onChange={(e) =>
                        setLocalFilters({ ...localFilters, priceAbove200Sma: e.target.checked })
                      }
                    />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Price &gt; 200 SMA (Bullish Trend)</span>
                  </label>
                </div>

                <div className="filter-field-row">
                  <label className="checkbox-item" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={localFilters.priceAbove50Sma}
                      onChange={(e) =>
                        setLocalFilters({ ...localFilters, priceAbove50Sma: e.target.checked })
                      }
                    />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Price &gt; 50 SMA (Short Term Trend)</span>
                  </label>
                </div>

                <div className="filter-field-row">
                  <label className="checkbox-item" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={localFilters.near52WeekHigh}
                      onChange={(e) =>
                        setLocalFilters({ ...localFilters, near52WeekHigh: e.target.checked })
                      }
                    />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Within 5% of 52-Week High</span>
                  </label>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Footer */}
        <div
          className="modal-footer"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <button className="shortlist-btn reset-all-filters-btn" onClick={handleReset}>
            <RotateCcw size={12} style={{ marginRight: 4 }} />
            <span>Reset All</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="nav-icon-btn cancel-filters-btn" onClick={() => setOpen(false)}>
              Close
            </button>
            <button className="shortlist-btn shortlist-btn-primary apply-tv-filters-btn" onClick={handleApply}>
              <Check size={14} style={{ marginRight: 4 }} />
              <span>Apply Filters {activeCount > 0 ? `(${activeCount})` : ''}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
