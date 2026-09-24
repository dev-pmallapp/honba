import React, { useState } from 'react';
import { useScreenerStore } from '../../../core/store/use-screener-store';
import { SCREEN_PRESETS } from '../../filter-bar';
import {
  SlidersHorizontal,
  Columns3,
  PanelRightClose,
  PanelRightOpen,
  Download,
  RotateCcw,
  Search,
  ChevronDown,
  X,
} from 'lucide-react';

interface FilterBarProps {
  totalCount: number;
  filteredCount: number;
  onExportCSV: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  totalCount,
  filteredCount,
  onExportCSV,
}) => {
  const activeTab = useScreenerStore((state) => state.activeTab);
  const setActiveTab = useScreenerStore((state) => state.setActiveTab);
  const quickPreset = useScreenerStore((state) => state.quickPreset);
  const setQuickPreset = useScreenerStore((state) => state.setQuickPreset);
  const searchQuery = useScreenerStore((state) => state.searchQuery);
  const setSearchQuery = useScreenerStore((state) => state.setSearchQuery);
  const advancedFilters = useScreenerStore((state) => state.advancedFilters);
  const resetFilters = useScreenerStore((state) => state.resetFilters);

  const detailDrawerOpen = useScreenerStore((state) => state.detailDrawerOpen);
  const toggleDetailDrawer = useScreenerStore((state) => state.toggleDetailDrawer);
  const setFilterModalOpen = useScreenerStore((state) => state.setFilterModalOpen);
  const setColumnModalOpen = useScreenerStore((state) => state.setColumnModalOpen);

  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);

  // Compute active filters count
  const countActiveFilters = (): number => {
    let count = 0;
    if (quickPreset !== 'all') count++;
    if (searchQuery.trim() !== '') count++;
    if (advancedFilters.sector !== 'all') count++;
    if (advancedFilters.marketCapTier !== 'all') count++;
    if (advancedFilters.exchange !== 'all') count++;
    if (advancedFilters.minPrice !== null || advancedFilters.maxPrice !== null) count++;
    if (advancedFilters.peMin !== null || advancedFilters.peMax !== null) count++;
    if (advancedFilters.minDividendYield !== null) count++;
    if (advancedFilters.minRoce !== null) count++;
    if (advancedFilters.minNetMargin !== null) count++;
    if (advancedFilters.technicalRating !== 'all') count++;
    if (advancedFilters.rsiMin !== null || advancedFilters.rsiMax !== null) count++;
    if (advancedFilters.priceAbove200Sma) count++;
    if (advancedFilters.priceAbove50Sma) count++;
    if (advancedFilters.near52WeekHigh) count++;
    return count;
  };

  const activeCount = countActiveFilters();
  const currentPresetObj = SCREEN_PRESETS.find((p) => p.id === quickPreset) || SCREEN_PRESETS[0];

  return (
    <div className="filter-bar-wrapper" id="filter-bar-container">
      {/* Upper Control Strip */}
      <div className="filter-bar-top-row">
        {/* Left: Saved Screens Preset Selector & Category Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Preset Selector */}
          <div className="preset-selector-wrapper" style={{ position: 'relative' }}>
            <button
              className="tv-preset-pill-btn"
              onClick={() => setPresetDropdownOpen(!presetDropdownOpen)}
              title="Select Screener Preset"
            >
              <span>{currentPresetObj.icon}</span>
              <span>{currentPresetObj.name}</span>
              <ChevronDown size={11} style={{ opacity: 0.7 }} />
            </button>

            {presetDropdownOpen && (
              <div
                className="honba-dropdown-menu"
                style={{ width: 220, top: '100%', left: 0, marginTop: 4, display: 'block' }}
              >
                <div className="app-menu-header">TradingView Screen Presets</div>
                {SCREEN_PRESETS.map((p) => (
                  <div
                    key={p.id}
                    className={`market-item ${p.id === quickPreset ? 'active' : ''}`}
                    onClick={() => {
                      setQuickPreset(p.id);
                      setPresetDropdownOpen(false);
                    }}
                  >
                    <span>{p.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* View Category Tabs */}
          <div className="view-tabs-strip">
            {['overview', 'performance', 'valuation', 'technicals', 'fundamentals'].map((tab) => (
              <button
                key={tab}
                className={`view-tab-btn ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Search, Filter Modal Trigger, Columns, Drawer Toggle, Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Search Box */}
          <div className="screener-search-wrapper">
            <Search size={13} className="search-icon" />
            <input
              type="text"
              placeholder="Search ticker or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="screener-search-input"
            />
            {searchQuery && (
              <button
                className="clear-search-btn"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Prominent Filters Modal Trigger */}
          <button
            className={`tv-filters-btn ${activeCount > 0 ? 'active' : ''}`}
            onClick={() => setFilterModalOpen(true)}
            title="Open Detailed Filters Dialog"
          >
            <SlidersHorizontal size={13} />
            <span>Filters</span>
            {activeCount > 0 && <span className="filter-count-badge">{activeCount}</span>}
          </button>

          {/* Column Customizer */}
          <button
            className="nav-icon-btn"
            onClick={() => setColumnModalOpen(true)}
            title="Customize Visible Columns"
          >
            <Columns3 size={14} />
          </button>

          {/* Export CSV */}
          <button
            className="nav-icon-btn"
            onClick={onExportCSV}
            title="Export Screened Stocks to CSV"
          >
            <Download size={14} />
          </button>

          {/* Detail Drawer Toggle */}
          <button
            className={`nav-icon-btn ${detailDrawerOpen ? 'active' : ''}`}
            onClick={toggleDetailDrawer}
            title={detailDrawerOpen ? 'Collapse Symbol Details' : 'Expand Symbol Details'}
          >
            {detailDrawerOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          </button>
        </div>
      </div>

      {/* Active Filter Chips & Match Count Bar */}
      <div className="filter-chips-row">
        <div className="filter-matches-count">
          Showing <strong>{filteredCount}</strong> of <strong>{totalCount}</strong> instruments
        </div>

        {activeCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {quickPreset !== 'all' && (
              <span className="filter-chip">
                <span>Preset: {currentPresetObj.name}</span>
                <button onClick={() => setQuickPreset('all')}>✕</button>
              </span>
            )}
            {searchQuery && (
              <span className="filter-chip">
                <span>Search: "{searchQuery}"</span>
                <button onClick={() => setSearchQuery('')}>✕</button>
              </span>
            )}
            {advancedFilters.sector !== 'all' && (
              <span className="filter-chip">
                <span>Sector: {advancedFilters.sector}</span>
                <button onClick={() => useScreenerStore.getState().setAdvancedFilters({ sector: 'all' })}>✕</button>
              </span>
            )}
            {advancedFilters.technicalRating !== 'all' && (
              <span className="filter-chip">
                <span>Rating: {advancedFilters.technicalRating}</span>
                <button onClick={() => useScreenerStore.getState().setAdvancedFilters({ technicalRating: 'all' })}>✕</button>
              </span>
            )}

            <button className="reset-filters-btn" onClick={resetFilters}>
              <RotateCcw size={11} style={{ marginRight: 3 }} />
              <span>Reset All</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
