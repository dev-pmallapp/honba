import React, { useState, useEffect, useRef } from 'react';
import { useScreenerStore } from '../../../core/store/use-screener-store';
import { useLayoutStore } from '../../../layouts/use-layout-store';
import { dataLayer } from '../../../core/data-layer';
import { CountryCode } from '../../../core/market-data';
import { PillDropdown } from '../../ui/pill-dropdown';
import {
  Download,
  RotateCcw,
  Search,
  ChevronDown,
  RotateCw,
  Maximize2,
  Minimize2,
  Table as TableIcon,
  LineChart,
  LayoutGrid,
  Sparkles,
  Undo2,
  Redo2,
  Check,
  X,
} from 'lucide-react';
import { IndexDrawer } from './index-drawer';
import { getIndicesForMarket } from '../../../core/indices';

export const SCREEN_PRESETS = [
  { id: 'all', name: 'All stocks', icon: '📋' },
  { id: 'most_capitalized', name: 'Most capitalized', icon: '👑' },
  { id: 'most_active', name: 'Volume leaders', icon: '🔥' },
  { id: 'gainers', name: 'Top gainers', icon: '📈' },
  { id: 'losers', name: 'Top losers', icon: '📉' },
  { id: 'momentum', name: 'Bullish momentum', icon: '🚀' },
  { id: 'value', name: 'Value stocks (P/E < 25)', icon: '💎' },
  { id: 'dividend', name: 'High dividend yield', icon: '💰' },
  { id: 'high52', name: '52-week high', icon: '⚡' },
  { id: 'oversold', name: 'Oversold RSI (<35)', icon: '📉' },
  { id: 'overbought', name: 'Overbought RSI (>70)', icon: '⚡' },
];

export const TRADINGVIEW_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'performance', label: 'Performance' },
  { id: 'technicals', label: 'Technicals' },
  { id: 'extended_hours', label: 'Extended hours' },
  { id: 'forecasts', label: 'Forecasts' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'dividends', label: 'Dividends' },
  { id: 'profitability', label: 'Profitability' },
  { id: 'income_statement', label: 'Income statement' },
  { id: 'balance_sheet', label: 'Balance sheet' },
  { id: 'cash_flow', label: 'Cash flow' },
  { id: 'per_share', label: 'Per share' },
];

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
  const advanced = useScreenerStore((state) => state.advancedFilters);
  const setAdvanced = useScreenerStore((state) => state.setAdvancedFilters);
  const resetFilters = useScreenerStore((state) => state.resetFilters);

  const currentMarket = useScreenerStore((state) => state.currentMarket);
  const setMarket = useScreenerStore((state) => state.setMarket);
  const shortlistedSymbols = useScreenerStore((state) => state.shortlistedSymbols);

  const isDrawerOpen = useLayoutStore((state) => state.isDrawerOpen);
  const viewMode = useLayoutStore((state) => state.viewMode);
  const setViewMode = useLayoutStore((state) => state.setViewMode);
  const setFilterModalOpen = useScreenerStore((state) => state.setFilterModalOpen);
  const setColumnModalOpen = useScreenerStore((state) => state.setColumnModalOpen);

  // Active Dropdown Pill
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAiSearch, setShowAiSearch] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);

  // Button refs for anchoring floating dropdowns
  const presetsBtnRef = useRef<HTMLButtonElement>(null);
  const marketBtnRef = useRef<HTMLButtonElement>(null);
  const watchlistBtnRef = useRef<HTMLButtonElement>(null);
  const indexBtnRef = useRef<HTMLButtonElement>(null);
  const priceBtnRef = useRef<HTMLButtonElement>(null);
  const chgBtnRef = useRef<HTMLButtonElement>(null);
  const mktCapBtnRef = useRef<HTMLButtonElement>(null);
  const peBtnRef = useRef<HTMLButtonElement>(null);
  const dividendBtnRef = useRef<HTMLButtonElement>(null);
  const sectorBtnRef = useRef<HTMLButtonElement>(null);
  const ratingBtnRef = useRef<HTMLButtonElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.('.tv-pill-dropdown')) {
        return;
      }
      if (containerRef.current && !containerRef.current.contains(target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const marketInfo = dataLayer.getCurrentMarketInfo();
  const allMarkets = dataLayer.getSupportedMarkets();
  const currentPresetObj = SCREEN_PRESETS.find((p) => p.id === quickPreset) || SCREEN_PRESETS[0];



  const toggleDropdown = (id: string) => {
    setActiveDropdown((prev) => (prev === id ? null : id));
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    const q = aiPrompt.toLowerCase();
    if (q.includes('high dividend') || q.includes('dividend')) {
      setQuickPreset('dividend');
    } else if (q.includes('gain') || q.includes('bullish') || q.includes('top gainers')) {
      setQuickPreset('gainers');
    } else if (q.includes('value') || q.includes('low pe')) {
      setQuickPreset('value');
    } else if (q.includes('tech') || q.includes('it')) {
      setAdvanced({ sector: 'Technology' });
    } else if (q.includes('bank') || q.includes('finance')) {
      setAdvanced({ sector: 'Financials' });
    } else {
      setSearchQuery(aiPrompt);
    }
    setShowAiSearch(false);
    setAiPrompt('');
  };

  return (
    <div className="tv-screener-header-container" ref={containerRef}>
      {/* Row 1: Stock Screener Breadcrumb, All stocks ⌵, Undo/Redo & Settings */}
      <div className="tv-header-title-row">
        <div className="tv-title-left">
          <div
            className="tv-screen-breadcrumb"
            onClick={() => toggleDropdown('presets')}
            title="Stock Screener Presets"
          >
            <span>Stock Screener</span>
            <ChevronDown size={11} style={{ opacity: 0.7 }} />
          </div>

          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              ref={presetsBtnRef}
              className="tv-screen-title-btn"
              onClick={() => toggleDropdown('presets')}
              title="Click to switch saved screen"
            >
              <span>{currentPresetObj.name}</span>
              <ChevronDown size={18} style={{ opacity: 0.8 }} />
            </button>

            <PillDropdown
              isOpen={activeDropdown === 'presets'}
              onClose={() => setActiveDropdown(null)}
              triggerRef={presetsBtnRef}
              width={280}
            >
              <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Popular Screens
              </div>
              {SCREEN_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  className={`tv-pill-option ${preset.id === quickPreset ? 'selected' : ''}`}
                  onClick={() => {
                    setQuickPreset(preset.id);
                    setActiveDropdown(null);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13 }}>{preset.icon}</span>
                    <span style={{ fontWeight: preset.id === quickPreset ? 600 : 400 }}>{preset.name}</span>
                  </div>
                  {preset.id === quickPreset && <Check size={14} />}
                </div>
              ))}
            </PillDropdown>
          </div>
        </div>

        {/* Right toolbar icons: Undo, Redo */}
        <div className="tv-header-actions">
          <button className="tv-icon-circle-btn" title="Undo (Ctrl+Z)" disabled>
            <Undo2 size={14} />
          </button>
          <button className="tv-icon-circle-btn" title="Redo (Ctrl+Y)" disabled>
            <Redo2 size={14} />
          </button>
        </div>
      </div>

      {/* Row 2: Signature Filter Pills (✦ AI, IN, Watchlist, Index, Price, Chg%, Mkt cap, P/E, etc.) */}
      <div className="tv-filter-pills-row">
        {/* ✦ AI Filter Pill */}
        <button
          className="tv-ai-pill"
          onClick={() => setShowAiSearch(!showAiSearch)}
          title="Filter stocks using AI prompt"
        >
          <Sparkles size={13} style={{ color: '#c084fc' }} />
          <span>AI</span>
        </button>

        {/* Market Country Selector Pill */}
        <div className="tv-filter-pill-wrapper">
          <button
            ref={marketBtnRef}
            className="tv-filter-pill"
            onClick={() => toggleDropdown('market')}
            title="Select Country & Market"
          >
            <span style={{ fontSize: 13 }}>{marketInfo.flag}</span>
            <span>{marketInfo.code}</span>
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>

          <PillDropdown
            isOpen={activeDropdown === 'market'}
            onClose={() => setActiveDropdown(null)}
            triggerRef={marketBtnRef}
            width={220}
          >
            <div style={{ padding: '6px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
              Select Market Region
            </div>
            {allMarkets.map((m) => (
              <div
                key={m.code}
                className={`tv-pill-option ${m.code === currentMarket ? 'selected' : ''}`}
                onClick={() => {
                  setMarket(m.code as CountryCode);
                  setActiveDropdown(null);
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{m.flag}</span>
                  <span>{m.name}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.primaryExchanges[0]}</span>
              </div>
            ))}
          </PillDropdown>
        </div>

        {/* Watchlist Pill */}
        <div className="tv-filter-pill-wrapper">
          <button
            ref={watchlistBtnRef}
            className={`tv-filter-pill ${shortlistedSymbols.length > 0 && quickPreset === 'watchlist' ? 'active' : ''}`}
            onClick={() => toggleDropdown('watchlist')}
            title="Watchlist filter options"
          >
            <span>Watchlist</span>
            {shortlistedSymbols.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 2 }}>({shortlistedSymbols.length})</span>
            )}
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>

          <PillDropdown
            isOpen={activeDropdown === 'watchlist'}
            onClose={() => setActiveDropdown(null)}
            triggerRef={watchlistBtnRef}
            width={220}
          >
            <div style={{ padding: '6px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
              Watchlist Filter
            </div>
            <div
              className={`tv-pill-option ${quickPreset !== 'watchlist' ? 'selected' : ''}`}
              onClick={() => {
                setQuickPreset('all');
                setActiveDropdown(null);
              }}
            >
              <span>All Stocks ({totalCount})</span>
              {quickPreset !== 'watchlist' && <Check size={13} />}
            </div>
            <div
              className={`tv-pill-option ${quickPreset === 'watchlist' ? 'selected' : ''}`}
              onClick={() => {
                setQuickPreset('watchlist');
                setActiveDropdown(null);
              }}
            >
              <span>Watchlist Only ({shortlistedSymbols.length})</span>
              {quickPreset === 'watchlist' && <Check size={13} />}
            </div>
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
            <div
              className="tv-pill-option"
              style={{
                color: shortlistedSymbols.length > 0 ? '#f23645' : 'var(--text-muted)',
                opacity: shortlistedSymbols.length > 0 ? 1 : 0.5,
                cursor: shortlistedSymbols.length > 0 ? 'pointer' : 'default',
              }}
              onClick={() => {
                if (shortlistedSymbols.length > 0) {
                  useScreenerStore.getState().clearShortlist();
                  if (quickPreset === 'watchlist') {
                    setQuickPreset('all');
                  }
                  setActiveDropdown(null);
                }
              }}
            >
              <span>Clear Watchlist</span>
            </div>
          </PillDropdown>
        </div>

        {/* Index Pill (TradingView Index Drawer) */}
        <div className="tv-filter-pill-wrapper">
          <button
            ref={indexBtnRef}
            className={`tv-filter-pill ${advanced.indices && advanced.indices.length > 0 ? 'active' : ''}`}
            onClick={() => toggleDropdown('index')}
          >
            <span>
              {advanced.indices && advanced.indices.length === 1
                ? `Index: ${getIndicesForMarket(currentMarket).find((i) => i.code === advanced.indices[0])?.name || advanced.indices[0]}`
                : advanced.indices && advanced.indices.length > 1
                ? `Index: ${advanced.indices.length} selected`
                : 'Index: All'}
            </span>
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>
          <IndexDrawer
            isOpen={activeDropdown === 'index'}
            onClose={() => setActiveDropdown(null)}
            triggerRef={indexBtnRef}
            selectedIndices={advanced.indices || []}
            onSelectIndices={(indices) => setAdvanced({ indices })}
            country={currentMarket}
          />
        </div>

        {/* Price Pill */}
        <div className="tv-filter-pill-wrapper">
          <button
            ref={priceBtnRef}
            className={`tv-filter-pill ${advanced.minPrice !== null || advanced.maxPrice !== null ? 'active' : ''}`}
            onClick={() => toggleDropdown('price')}
          >
            <span>
              Price
              {advanced.minPrice !== null || advanced.maxPrice !== null ? ` (${advanced.minPrice || 0}-${advanced.maxPrice || '∞'})` : ''}
            </span>
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>
          <PillDropdown
            isOpen={activeDropdown === 'price'}
            onClose={() => setActiveDropdown(null)}
            triggerRef={priceBtnRef}
            width={200}
          >
            <div
              className="tv-pill-option"
              onClick={() => {
                setAdvanced({ minPrice: null, maxPrice: null });
                setActiveDropdown(null);
              }}
            >
              <span>Any Price</span>
            </div>
            <div
              className="tv-pill-option"
              onClick={() => {
                setAdvanced({ minPrice: null, maxPrice: 100 });
                setActiveDropdown(null);
              }}
            >
              <span>Under ₹100</span>
            </div>
            <div
              className="tv-pill-option"
              onClick={() => {
                setAdvanced({ minPrice: 100, maxPrice: 500 });
                setActiveDropdown(null);
              }}
            >
              <span>₹100 – ₹500</span>
            </div>
            <div
              className="tv-pill-option"
              onClick={() => {
                setAdvanced({ minPrice: 500, maxPrice: 2000 });
                setActiveDropdown(null);
              }}
            >
              <span>₹500 – ₹2,000</span>
            </div>
            <div
              className="tv-pill-option"
              onClick={() => {
                setAdvanced({ minPrice: 2000, maxPrice: null });
                setActiveDropdown(null);
              }}
            >
              <span>Over ₹2,000</span>
            </div>
          </PillDropdown>
        </div>

        {/* Chg % Pill */}
        <div className="tv-filter-pill-wrapper">
          <button
            ref={chgBtnRef}
            className={`tv-filter-pill ${quickPreset === 'gainers' || quickPreset === 'losers' ? 'active' : ''}`}
            onClick={() => toggleDropdown('chg')}
          >
            <span>Chg %</span>
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>
          <PillDropdown
            isOpen={activeDropdown === 'chg'}
            onClose={() => setActiveDropdown(null)}
            triggerRef={chgBtnRef}
            width={180}
          >
            <div
              className="tv-pill-option"
              onClick={() => {
                setQuickPreset('all');
                setActiveDropdown(null);
              }}
            >
              <span>All Changes</span>
            </div>
            <div
              className="tv-pill-option"
              onClick={() => {
                setQuickPreset('gainers');
                setActiveDropdown(null);
              }}
            >
              <span style={{ color: '#089981', fontWeight: 600 }}>▲ Gainers (&gt; 0%)</span>
            </div>
            <div
              className="tv-pill-option"
              onClick={() => {
                setQuickPreset('losers');
                setActiveDropdown(null);
              }}
            >
              <span style={{ color: '#f23645', fontWeight: 600 }}>▼ Losers (&lt; 0%)</span>
            </div>
          </PillDropdown>
        </div>

        {/* Mkt cap Pill */}
        <div className="tv-filter-pill-wrapper">
          <button
            ref={mktCapBtnRef}
            className={`tv-filter-pill ${advanced.marketCapTier !== 'all' ? 'active' : ''}`}
            onClick={() => toggleDropdown('mktCap')}
          >
            <span>Mkt cap: {advanced.marketCapTier === 'all' ? 'All' : advanced.marketCapTier}</span>
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>
          <PillDropdown
            isOpen={activeDropdown === 'mktCap'}
            onClose={() => setActiveDropdown(null)}
            triggerRef={mktCapBtnRef}
            width={220}
          >
            {[
              { id: 'all', label: 'All Market Caps' },
              { id: 'mega', label: 'Mega Cap (> ₹2T)' },
              { id: 'large', label: 'Large Cap (> ₹500B)' },
              { id: 'mid', label: 'Mid Cap (₹100B–₹500B)' },
              { id: 'small', label: 'Small Cap (< ₹100B)' },
            ].map((tier) => (
              <div
                key={tier.id}
                className={`tv-pill-option ${advanced.marketCapTier === tier.id ? 'selected' : ''}`}
                onClick={() => {
                  setAdvanced({ marketCapTier: tier.id as any });
                  setActiveDropdown(null);
                }}
              >
                <span>{tier.label}</span>
                {advanced.marketCapTier === tier.id && <Check size={13} />}
              </div>
            ))}
          </PillDropdown>
        </div>

        {/* P/E Pill */}
        <div className="tv-filter-pill-wrapper">
          <button
            ref={peBtnRef}
            className={`tv-filter-pill ${advanced.peMin !== null || advanced.peMax !== null ? 'active' : ''}`}
            onClick={() => toggleDropdown('pe')}
          >
            <span>P/E</span>
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>
          <PillDropdown
            isOpen={activeDropdown === 'pe'}
            onClose={() => setActiveDropdown(null)}
            triggerRef={peBtnRef}
            width={190}
          >
            <div
              className="tv-pill-option"
              onClick={() => {
                setAdvanced({ peMin: null, peMax: null });
                setActiveDropdown(null);
              }}
            >
              <span>Any P/E</span>
            </div>
            <div
              className="tv-pill-option"
              onClick={() => {
                setAdvanced({ peMin: 0, peMax: 15 });
                setActiveDropdown(null);
              }}
            >
              <span>Value (&lt; 15)</span>
            </div>
            <div
              className="tv-pill-option"
              onClick={() => {
                setAdvanced({ peMin: 15, peMax: 25 });
                setActiveDropdown(null);
              }}
            >
              <span>Reasonable (15 – 25)</span>
            </div>
            <div
              className="tv-pill-option"
              onClick={() => {
                setAdvanced({ peMin: 25, peMax: 50 });
                setActiveDropdown(null);
              }}
            >
              <span>Growth (25 – 50)</span>
            </div>
          </PillDropdown>
        </div>

        {/* Div yield % Pill */}
        <div className="tv-filter-pill-wrapper">
          <button
            ref={dividendBtnRef}
            className={`tv-filter-pill ${advanced.minDividendYield !== null ? 'active' : ''}`}
            onClick={() => toggleDropdown('dividend')}
          >
            <span>Div yield %</span>
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>
          <PillDropdown
            isOpen={activeDropdown === 'dividend'}
            onClose={() => setActiveDropdown(null)}
            triggerRef={dividendBtnRef}
            width={190}
          >
            <div
              className="tv-pill-option"
              onClick={() => {
                setAdvanced({ minDividendYield: null });
                setActiveDropdown(null);
              }}
            >
              <span>Any Yield</span>
            </div>
            <div
              className="tv-pill-option"
              onClick={() => {
                setAdvanced({ minDividendYield: 1.0 });
                setActiveDropdown(null);
              }}
            >
              <span>Over 1%</span>
            </div>
            <div
              className="tv-pill-option"
              onClick={() => {
                setAdvanced({ minDividendYield: 2.0 });
                setActiveDropdown(null);
              }}
            >
              <span>Over 2%</span>
            </div>
            <div
              className="tv-pill-option"
              onClick={() => {
                setAdvanced({ minDividendYield: 4.0 });
                setActiveDropdown(null);
              }}
            >
              <span>High Yield (&gt; 4%)</span>
            </div>
          </PillDropdown>
        </div>

        {/* Sector Pill */}
        <div className="tv-filter-pill-wrapper">
          <button
            ref={sectorBtnRef}
            className={`tv-filter-pill ${advanced.sector !== 'all' ? 'active' : ''}`}
            onClick={() => toggleDropdown('sector')}
          >
            <span>Sector: {advanced.sector === 'all' ? 'All' : advanced.sector}</span>
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>
          <PillDropdown
            isOpen={activeDropdown === 'sector'}
            onClose={() => setActiveDropdown(null)}
            triggerRef={sectorBtnRef}
            width={220}
            maxHeight={320}
          >
            {[
              'all',
              'Financials',
              'Technology',
              'Energy',
              'Healthcare',
              'Automobile',
              'Consumer Goods',
              'Materials',
              'Telecom',
              'Industrials',
            ].map((sec) => (
              <div
                key={sec}
                className={`tv-pill-option ${advanced.sector === sec ? 'selected' : ''}`}
                onClick={() => {
                  setAdvanced({ sector: sec });
                  setActiveDropdown(null);
                }}
              >
                <span>{sec === 'all' ? 'All Sectors' : sec}</span>
                {advanced.sector === sec && <Check size={13} />}
              </div>
            ))}
          </PillDropdown>
        </div>

        {/* Analyst Rating Pill */}
        <div className="tv-filter-pill-wrapper">
          <button
            ref={ratingBtnRef}
            className={`tv-filter-pill ${advanced.technicalRating !== 'all' ? 'active' : ''}`}
            onClick={() => toggleDropdown('rating')}
          >
            <span>Analyst rating: {advanced.technicalRating === 'all' ? 'All' : advanced.technicalRating}</span>
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>
          <PillDropdown
            isOpen={activeDropdown === 'rating'}
            onClose={() => setActiveDropdown(null)}
            triggerRef={ratingBtnRef}
            width={200}
          >
            {[
              { id: 'all', label: 'All Ratings' },
              { id: 'Strong Buy', label: 'Strong Buy', color: '#089981', bold: true },
              { id: 'Buy', label: 'Buy', color: '#089981' },
              { id: 'Neutral', label: 'Neutral', color: 'var(--text-secondary)' },
              { id: 'Sell', label: 'Sell', color: '#f23645' },
              { id: 'Strong Sell', label: 'Strong Sell', color: '#f23645', bold: true },
            ].map((r) => (
              <div
                key={r.id}
                className={`tv-pill-option ${advanced.technicalRating === r.id ? 'selected' : ''}`}
                onClick={() => {
                  setAdvanced({ technicalRating: r.id as any });
                  setActiveDropdown(null);
                }}
              >
                <span style={{ color: r.color, fontWeight: r.bold ? 700 : r.id !== 'all' ? 500 : 400 }}>{r.label}</span>
                {advanced.technicalRating === r.id && <Check size={13} />}
              </div>
            ))}
          </PillDropdown>
        </div>

        {/* Add Filter (+) Button */}
        <button
          className="tv-filter-pill"
          onClick={() => setFilterModalOpen(true)}
          title="Add filter parameter"
          style={{ width: 30, height: 30, padding: 0, justifyContent: 'center' }}
        >
          <span style={{ fontSize: 15, fontWeight: 600 }}>+</span>
        </button>

        {/* Reset / Actions (•••) */}
        <div className="tv-filter-pill-wrapper">
          <button
            ref={moreBtnRef}
            className="tv-filter-pill"
            onClick={() => toggleDropdown('more')}
            title="More filter actions"
            style={{ width: 30, height: 30, padding: 0, justifyContent: 'center' }}
          >
            <span style={{ fontSize: 13, letterSpacing: 1 }}>•••</span>
          </button>
          <PillDropdown
            isOpen={activeDropdown === 'more'}
            onClose={() => setActiveDropdown(null)}
            triggerRef={moreBtnRef}
            width={180}
            align="right"
          >
            <div
              className="tv-pill-option"
              onClick={() => {
                resetFilters();
                setActiveDropdown(null);
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f23645' }}>
                <RotateCcw size={13} />
                <span>Reset All Filters</span>
              </div>
            </div>
            <div
              className="tv-pill-option"
              onClick={() => {
                onExportCSV();
                setActiveDropdown(null);
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Download size={13} />
                <span>Export to CSV</span>
              </div>
            </div>
          </PillDropdown>
        </div>
      </div>

      {/* Optional AI Natural Language Search Prompt Bar */}
      {showAiSearch && (
        <form
          onSubmit={handleAiSubmit}
          style={{
            padding: '4px 20px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--bg-app)',
          }}
        >
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--bg-surface-elevated)',
              border: '1px solid #c084fc',
              borderRadius: 'var(--radius-full)',
              padding: '0 14px',
              height: 34,
            }}
          >
            <Sparkles size={14} style={{ color: '#c084fc' }} />
            <input
              type="text"
              autoFocus
              placeholder="Ask AI: e.g. 'Show me large cap tech stocks with low P/E and high dividend'"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            />
            {aiPrompt && (
              <button
                type="button"
                onClick={() => setAiPrompt('')}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={13} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="tv-prominent-filters-btn active"
            style={{ height: 34, padding: '0 14px', borderRadius: 'var(--radius-full)' }}
          >
            Apply
          </button>
        </form>
      )}

      {/* Row 3: Views Toggle, Category Tabs Strip, and Action Toolbar */}
      <div className="tv-tabs-bar-row">
        <div className="tv-tabs-left">
          {/* View Mode Icons: [Table] [Chart Preview] [Heatmap] */}
          <div className="tv-views-group">
            <button
              className={`tv-view-btn ${viewMode === 'table' && !isDrawerOpen ? 'active' : ''}`}
              onClick={() => {
                setViewMode('table');
              }}
              title="Table View (Full Screen)"
            >
              <TableIcon size={14} />
            </button>
            <button
              className={`tv-view-btn ${isDrawerOpen ? 'active' : ''}`}
              onClick={() => {
                if (isDrawerOpen) {
                  useLayoutStore.getState().setDrawerOpen(false);
                } else {
                  setViewMode('chart');
                }
              }}
              title="Split View / Symbol Details & Chart Preview"
            >
              <LineChart size={14} />
            </button>
            <button
              className={`tv-view-btn ${viewMode === 'matrix' ? 'active' : ''}`}
              onClick={() => setViewMode(viewMode === 'matrix' ? 'table' : 'matrix')}
              title="Stock Heatmap View"
            >
              <LayoutGrid size={14} />
            </button>
          </div>

          {/* View Category Tabs */}
          <div className="tv-tabs-group">
            {TRADINGVIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                className={`tv-category-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right Toolbar: Export, Refresh, Fullscreen */}
        <div className="tv-tabs-right">
          {/* Export CSV */}
          <button
            className="tv-icon-circle-btn"
            onClick={onExportCSV}
            title="Export Screen to CSV"
            style={{ width: 28, height: 28 }}
          >
            <Download size={13} />
          </button>

          {/* Refresh Button */}
          <button
            className="tv-icon-circle-btn"
            onClick={() => useScreenerStore.getState().refreshFromDataLayer()}
            title="Refresh Market Data"
            style={{ width: 28, height: 28 }}
          >
            <RotateCw size={13} />
          </button>

          {/* Fullscreen Toggle */}
          <button
            className="tv-icon-circle-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Screener'}
            style={{ width: 28, height: 28 }}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
};
