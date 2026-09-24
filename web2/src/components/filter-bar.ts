/**
 * TradingView Screener Secondary Filter Bar Component
 * Screener header with Saved Screens preset selector, Currency, Auto-Refresh,
 * Action tools (Columns, Export CSV, Panel Drawer), Category view tabs,
 * prominent Filters (N) button, quick knobs, filter chips, and active tags.
 */

import { AdvancedFilterState, DEFAULT_ADVANCED_FILTERS } from './tradingview-filters-modal';
import { dataLayer } from '../core/data-layer';

export interface ScreenerFilterCriteria {
  tab: string;
  search: string;
  quickPreset: string;
  advanced: AdvancedFilterState;
}

export const SCREEN_PRESETS = [
  { id: 'all', name: 'All Instruments', icon: '📋' },
  { id: 'gainers', name: 'Top Gainers', icon: '▲' },
  { id: 'losers', name: 'Top Losers', icon: '▼' },
  { id: 'most_active', name: 'Most Active (Volume)', icon: '🔥' },
  { id: 'high52', name: '52-Week High', icon: '📈' },
  { id: 'oversold', name: 'Oversold RSI (<35)', icon: '📉' },
  { id: 'overbought', name: 'Overbought RSI (>70)', icon: '⚡' },
  { id: 'dividend', name: 'High Dividend Yield (>1.5%)', icon: '💰' },
  { id: 'value', name: 'Value Stocks (P/E < 25)', icon: '💎' },
  { id: 'momentum', name: 'Bullish Momentum', icon: '🚀' },
];

export class FilterBar {
  private container: HTMLElement;
  private onFilterChange: (criteria: ScreenerFilterCriteria) => void;
  private onOpenFiltersModal: () => void;
  private onOpenColumnsModal: () => void;
  private onToggleDrawer?: () => void;
  private onExportCSV?: () => void;

  private criteria: ScreenerFilterCriteria = {
    tab: 'overview',
    search: '',
    quickPreset: 'all',
    advanced: { ...DEFAULT_ADVANCED_FILTERS },
  };

  private totalCount: number = 0;
  private filteredCount: number = 0;

  // Auto-refresh control state
  private autoRefreshInterval: number | null = null;
  private autoRefreshSeconds: number = 10;
  private isAutoRefreshActive: boolean = true;

  constructor(
    container: HTMLElement,
    onFilterChange: (criteria: ScreenerFilterCriteria) => void,
    onOpenFiltersModal: () => void,
    onOpenColumnsModal: () => void,
    onToggleDrawer?: () => void,
    onExportCSV?: () => void
  ) {
    this.container = container;
    this.onFilterChange = onFilterChange;
    this.onOpenFiltersModal = onOpenFiltersModal;
    this.onOpenColumnsModal = onOpenColumnsModal;
    this.onToggleDrawer = onToggleDrawer;
    this.onExportCSV = onExportCSV;

    this.render();
    this.setupListeners();
    this.startAutoRefresh();
  }

  public setCounts(filtered: number, total: number) {
    this.filteredCount = filtered;
    this.totalCount = total;
    const countEl = this.container.querySelector('#tv-results-counter');
    if (countEl) {
      countEl.textContent = `Showing ${filtered} of ${total} stocks`;
    }
  }

  public getCriteria(): ScreenerFilterCriteria {
    return this.criteria;
  }

  public setSearch(search: string) {
    this.criteria.search = search;
    const input = this.container.querySelector<HTMLInputElement>('#screener-inline-search');
    if (input) input.value = search;
    this.onFilterChange(this.criteria);
  }

  public setQuickPreset(presetId: string) {
    this.criteria.quickPreset = presetId;
    this.render();
    this.setupListeners();
    this.onFilterChange(this.criteria);
  }

  public setCurrentScreen(presetId: string) {
    this.setQuickPreset(presetId);
  }

  public setAdvancedFilters(advanced: AdvancedFilterState) {
    this.criteria.advanced = { ...advanced };
    this.render();
    this.setupListeners();
    this.onFilterChange(this.criteria);
  }

  public getActiveFilterCount(): number {
    let count = 0;
    const a = this.criteria.advanced;
    if (a.sector !== 'all') count++;
    if (a.marketCapTier !== 'all') count++;
    if (a.peMin !== null || a.peMax !== null) count++;
    if (a.rsiMin !== null || a.rsiMax !== null) count++;
    if (a.technicalRating !== 'all') count++;
    if (a.minDividendYield !== null) count++;
    if (a.priceAbove200Sma) count++;
    if (a.near52WeekHigh) count++;
    if (a.minRoce !== null) count++;
    if (this.criteria.quickPreset !== 'all') count++;
    if (this.criteria.search) count++;
    return count;
  }

  public render() {
    const activeCount = this.getActiveFilterCount();
    const market = dataLayer.getCurrentMarketInfo();
    const currentScreen = SCREEN_PRESETS.find((p) => p.id === this.criteria.quickPreset) || SCREEN_PRESETS[0];

    this.container.innerHTML = `
      <div class="screener-filter-bar tv-filter-bar">
        <!-- Row 1: Screener Header with Screen Presets Selector, Currency, Live Refresh & Actions -->
        <div class="screener-header-toolbar">
          <div class="screener-header-left">
            <!-- Screener Title & Popular Presets Dropdown -->
            <div class="tv-screen-heading-wrapper">
              <div class="tv-screen-breadcrumb">STOCK SCREENER</div>
              <div class="dropdown-wrapper" id="screener-preset-dropdown-container">
                <button class="tv-screen-main-btn" id="screener-preset-btn" title="Saved Screens & Popular Presets">
                  <span class="preset-icon" style="font-size: 13px;">${currentScreen.icon}</span>
                  <span id="active-screen-label">${currentScreen.name}</span>
                  <span class="app-caret" style="font-size: 8px;">▼</span>
                </button>
                <div class="honba-dropdown-menu" id="screener-preset-menu" style="width: 250px;">
                  <div class="app-menu-header">Popular Screener Presets</div>
                  ${SCREEN_PRESETS.map(
                    (preset) => `
                    <div class="market-item ${preset.id === this.criteria.quickPreset ? 'active' : ''}" data-screen-id="${preset.id}">
                      <div class="market-item-left">
                        <span>${preset.icon}</span>
                        <span style="font-weight: 500;">${preset.name}</span>
                      </div>
                    </div>
                  `
                  ).join('')}
                </div>
              </div>
            </div>

            <div class="tv-toolbar-divider"></div>

            <!-- Currency Indicator Pill -->
            <div class="tv-currency-pill" title="Active Base Currency: ${market.name}">
              <span>${market.currencySymbol}</span>
              <span>${market.currency}</span>
            </div>

            <!-- Screener Symbol / Company Search Box (Next to INR Currency Label) -->
            <div class="screener-search-wrapper" id="screener-search-container">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="screener-search-icon">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input 
                type="text" 
                class="screener-search-input" 
                id="screener-inline-search" 
                placeholder="Search symbol, company... (/)" 
                value="${this.criteria.search}"
                autocomplete="off"
              />
              <span class="kbd-shortcut" style="margin-right: 4px;">/</span>
              <button class="search-clear-btn" id="search-clear-btn" style="${this.criteria.search ? 'display: block;' : 'display: none;'}">✕</button>
            </div>

            <div class="tv-toolbar-divider"></div>

            <!-- Real-Time Auto-Refresh Control -->
            <div class="tv-refresh-control" id="screener-refresh-control" title="Toggle Auto-Refresh (Click to toggle live feed / manual refresh)">
              <span class="status-dot ${this.isAutoRefreshActive ? '' : 'paused'}"></span>
              <span id="screener-refresh-label" style="font-size: 11px; font-weight: 500;">
                ${this.isAutoRefreshActive ? `Live (${this.autoRefreshSeconds}s)` : 'Manual'}
              </span>
            </div>
          </div>

          <!-- Screener Specific Action Buttons: Columns, Export CSV, Panel -->
          <div class="screener-header-right">
            <!-- Columns Customizer -->
            <button class="screener-action-btn" id="screener-columns-btn" title="Customize Screener Columns">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="18"></rect>
                <rect x="14" y="3" width="7" height="18"></rect>
              </svg>
              <span>Columns</span>
            </button>

            <!-- Export CSV -->
            <button class="screener-action-btn" id="screener-export-btn" title="Export Screener to CSV">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Export</span>
            </button>

            <!-- Split View / Detail Drawer Toggle -->
            <button class="screener-action-btn" id="screener-panel-btn" title="Toggle Symbol Detail Preview Drawer">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="15" y1="3" x2="15" y2="21"/>
              </svg>
              <span>Panel</span>
            </button>
          </div>
        </div>

        <!-- Row 2: View Tabs & Controls Bar -->
        <div class="filter-bar-top-row tv-tabs-bar-row">
          <div style="display: flex; align-items: center; gap: 8px;">
            <!-- TradingView View Mode Icons: Table, Chart Preview, Matrix -->
            <div class="tv-view-icons-group">
              <button class="tv-view-icon-btn active" id="layout-view-table-btn" title="Table View">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="3" y1="15" x2="21" y2="15"/>
                  <line x1="9" y1="3" x2="9" y2="21"/>
                  <line x1="15" y1="3" x2="15" y2="21"/>
                </svg>
              </button>
              <button class="tv-view-icon-btn" id="layout-view-chart-btn" title="Toggle Detail & Chart Preview">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
              </button>
              <button class="tv-view-icon-btn" id="layout-view-matrix-btn" title="Heatmap Matrix Layout">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="7" height="7"/>
                  <rect x="14" y="3" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/>
                </svg>
              </button>
            </div>

            <!-- View Tabs -->
            <div class="view-tabs" id="view-tabs">
              <button class="view-tab-btn ${this.criteria.tab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</button>
              <button class="view-tab-btn ${this.criteria.tab === 'performance' ? 'active' : ''}" data-tab="performance">Performance</button>
              <button class="view-tab-btn ${this.criteria.tab === 'technicals' ? 'active' : ''}" data-tab="technicals">Technicals</button>
              <button class="view-tab-btn ${this.criteria.tab === 'valuation' ? 'active' : ''}" data-tab="valuation">Valuation</button>
              <button class="view-tab-btn ${this.criteria.tab === 'dividends' ? 'active' : ''}" data-tab="dividends">Dividends</button>
              <button class="view-tab-btn ${this.criteria.tab === 'margins' ? 'active' : ''}" data-tab="margins">Margins</button>
              <button class="view-tab-btn ${this.criteria.tab === 'oscillators' ? 'active' : ''}" data-tab="oscillators">Oscillators</button>
              <button class="view-tab-btn" id="tab-add-custom-btn" title="Add / Customize Columns" style="color: var(--accent-primary);">+ Custom</button>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <!-- Prominent Filters Dialog Button -->
            <button class="tv-filter-btn ${activeCount > 0 ? 'active' : ''}" id="open-filters-modal-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
              </svg>
              <span>Filters</span>
              ${activeCount > 0 ? `<span class="tv-filter-badge">${activeCount}</span>` : ''}
            </button>

            <!-- Results Counter -->
            <div id="tv-results-counter" class="tv-results-text">
              Showing ${this.filteredCount || 50} of ${this.totalCount || 50} stocks
            </div>
          </div>
        </div>

        <!-- Row 3: TradingView Signature Filter Pills Bar -->
        <div class="filter-pills-row tv-pills-row">
          <button class="tv-ai-pill-btn" id="ai-screener-pill-btn" title="AI Screener Search">
            <span class="ai-sparkle">✦</span>
            <span>AI</span>
          </button>

          <!-- Sector Filter Pill -->
          <div class="tv-pill-dropdown-wrapper">
            <button class="tv-pill-btn ${this.criteria.advanced.sector !== 'all' ? 'active' : ''}" id="pill-sector-btn">
              <span>Sector: ${this.criteria.advanced.sector === 'all' ? 'All' : this.criteria.advanced.sector}</span>
              <span class="pill-caret">▼</span>
            </button>
            <select class="tv-hidden-select" id="quick-sector-select">
              <option value="all" ${this.criteria.advanced.sector === 'all' ? 'selected' : ''}>All Sectors</option>
              <option value="Technology" ${this.criteria.advanced.sector === 'Technology' ? 'selected' : ''}>Technology</option>
              <option value="Financials" ${this.criteria.advanced.sector === 'Financials' ? 'selected' : ''}>Financials</option>
              <option value="Energy" ${this.criteria.advanced.sector === 'Energy' ? 'selected' : ''}>Energy</option>
              <option value="Healthcare" ${this.criteria.advanced.sector === 'Healthcare' ? 'selected' : ''}>Healthcare</option>
              <option value="Automobile" ${this.criteria.advanced.sector === 'Automobile' ? 'selected' : ''}>Automobile</option>
              <option value="Consumer Goods" ${this.criteria.advanced.sector === 'Consumer Goods' ? 'selected' : ''}>Consumer Goods</option>
              <option value="Materials" ${this.criteria.advanced.sector === 'Materials' ? 'selected' : ''}>Materials</option>
              <option value="Telecom" ${this.criteria.advanced.sector === 'Telecom' ? 'selected' : ''}>Telecom</option>
              <option value="Industrials" ${this.criteria.advanced.sector === 'Industrials' ? 'selected' : ''}>Industrials</option>
            </select>
          </div>

          <!-- Market Cap Filter Pill -->
          <div class="tv-pill-dropdown-wrapper">
            <button class="tv-pill-btn ${this.criteria.advanced.marketCapTier !== 'all' ? 'active' : ''}" id="pill-cap-btn">
              <span>Mkt cap: ${this.criteria.advanced.marketCapTier === 'all' ? 'All' : this.criteria.advanced.marketCapTier}</span>
              <span class="pill-caret">▼</span>
            </button>
            <select class="tv-hidden-select" id="quick-cap-select">
              <option value="all" ${this.criteria.advanced.marketCapTier === 'all' ? 'selected' : ''}>Market Cap: All</option>
              <option value="mega" ${this.criteria.advanced.marketCapTier === 'mega' ? 'selected' : ''}>Mega Cap (>₹10T)</option>
              <option value="large" ${this.criteria.advanced.marketCapTier === 'large' ? 'selected' : ''}>Large Cap (>₹500B)</option>
              <option value="mid" ${this.criteria.advanced.marketCapTier === 'mid' ? 'selected' : ''}>Mid Cap</option>
              <option value="small" ${this.criteria.advanced.marketCapTier === 'small' ? 'selected' : ''}>Small Cap</option>
            </select>
          </div>

          <!-- Technical Rating Filter Pill -->
          <div class="tv-pill-dropdown-wrapper">
            <button class="tv-pill-btn ${this.criteria.advanced.technicalRating !== 'all' ? 'active' : ''}" id="pill-rating-btn">
              <span>Rating: ${this.criteria.advanced.technicalRating === 'all' ? 'All' : this.criteria.advanced.technicalRating}</span>
              <span class="pill-caret">▼</span>
            </button>
            <select class="tv-hidden-select" id="quick-rating-select">
              <option value="all" ${this.criteria.advanced.technicalRating === 'all' ? 'selected' : ''}>Tech Rating: All</option>
              <option value="Strong Buy" ${this.criteria.advanced.technicalRating === 'Strong Buy' ? 'selected' : ''}>Strong Buy</option>
              <option value="Buy" ${this.criteria.advanced.technicalRating === 'Buy' ? 'selected' : ''}>Buy & Strong Buy</option>
              <option value="Neutral" ${this.criteria.advanced.technicalRating === 'Neutral' ? 'selected' : ''}>Neutral</option>
              <option value="Sell" ${this.criteria.advanced.technicalRating === 'Sell' ? 'selected' : ''}>Sell</option>
              <option value="Strong Sell" ${this.criteria.advanced.technicalRating === 'Strong Sell' ? 'selected' : ''}>Strong Sell</option>
            </select>
          </div>

          <!-- Quick Presets -->
          <button class="tv-pill-btn filter-pill ${this.criteria.quickPreset === 'gainers' ? 'active' : ''}" data-preset="gainers">Chg %: Gainers</button>
          <button class="tv-pill-btn filter-pill ${this.criteria.quickPreset === 'losers' ? 'active' : ''}" data-preset="losers">Chg %: Losers</button>
          <button class="tv-pill-btn filter-pill ${this.criteria.quickPreset === 'high52' ? 'active' : ''}" data-preset="high52">52W High</button>
          <button class="tv-pill-btn filter-pill ${this.criteria.quickPreset === 'value' ? 'active' : ''}" data-preset="value">P/E &lt; 25</button>
          <button class="tv-pill-btn filter-pill ${this.criteria.quickPreset === 'dividend' ? 'active' : ''}" data-preset="dividend">Div yield &gt; 1.5%</button>
          <button class="tv-pill-btn filter-pill ${this.criteria.quickPreset === 'momentum' ? 'active' : ''}" data-preset="momentum">RSI &gt; 60</button>
          <button class="tv-pill-btn filter-pill ${this.criteria.quickPreset === 'oversold' ? 'active' : ''}" data-preset="oversold">RSI &lt; 40</button>

          <!-- Add Filter Button -->
          <button class="tv-pill-btn tv-add-filter-pill-btn" id="open-filters-modal-pill-btn" title="Add Filter">
            <span style="font-weight: 700; font-size: 13px;">+</span>
            <span>Add Filter</span>
          </button>

          ${
            activeCount > 0
              ? `<button class="tv-clear-all-pill" id="clear-all-filters-btn">Clear All (${activeCount})</button>`
              : ''
          }
        </div>
      </div>
    `;
  }

  private setupListeners() {
    // Screen Presets dropdown in Screener Header
    const presetContainer = this.container.querySelector('#screener-preset-dropdown-container');
    this.container.querySelector('#screener-preset-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      presetContainer?.classList.toggle('open');
    });

    this.container.querySelectorAll('#screener-preset-menu .market-item[data-screen-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-screen-id');
        if (id) {
          presetContainer?.classList.remove('open');
          this.setQuickPreset(id);
        }
      });
    });

    // Auto-refresh control (toggle or trigger tick)
    this.container.querySelector('#screener-refresh-control')?.addEventListener('click', () => {
      this.isAutoRefreshActive = !this.isAutoRefreshActive;
      const label = this.container.querySelector('#screener-refresh-label');
      const dot = this.container.querySelector('#screener-refresh-control .status-dot');
      if (this.isAutoRefreshActive) {
        if (label) label.textContent = `Live (${this.autoRefreshSeconds}s)`;
        dot?.classList.remove('paused');
        this.startAutoRefresh();
      } else {
        if (label) label.textContent = 'Manual';
        dot?.classList.add('paused');
        if (this.autoRefreshInterval) clearInterval(this.autoRefreshInterval);
      }
    });

    // Columns Button
    this.container.querySelector('#screener-columns-btn')?.addEventListener('click', () => {
      this.onOpenColumnsModal();
    });

    // Export CSV Button
    this.container.querySelector('#screener-export-btn')?.addEventListener('click', () => {
      this.onExportCSV?.();
    });

    // Panel Drawer Toggle Button
    this.container.querySelector('#screener-panel-btn')?.addEventListener('click', () => {
      this.onToggleDrawer?.();
    });

    // View Tabs click
    this.container.querySelectorAll('.view-tab-btn[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) {
          this.criteria.tab = tab;
          this.container.querySelectorAll('.view-tab-btn[data-tab]').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.onFilterChange(this.criteria);
        }
      });
    });

    // Custom tab opens columns modal
    this.container.querySelector('#tab-add-custom-btn')?.addEventListener('click', () => {
      this.onOpenColumnsModal();
    });

    // Filters dialog open
    this.container.querySelector('#open-filters-modal-btn')?.addEventListener('click', () => {
      this.onOpenFiltersModal();
    });
    this.container.querySelector('#open-filters-modal-pill-btn')?.addEventListener('click', () => {
      this.onOpenFiltersModal();
    });

    // AI Screener button
    this.container.querySelector('#ai-screener-pill-btn')?.addEventListener('click', () => {
      this.onOpenFiltersModal();
    });

    // Inline search input
    const searchInput = this.container.querySelector<HTMLInputElement>('#screener-inline-search');
    const searchClear = this.container.querySelector<HTMLButtonElement>('#search-clear-btn');

    searchInput?.addEventListener('input', () => {
      this.criteria.search = searchInput.value.trim().toLowerCase();
      if (searchClear) {
        searchClear.style.display = this.criteria.search ? 'block' : 'none';
      }
      this.onFilterChange(this.criteria);
    });

    // Shortcut '/' for search
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput?.focus();
      }
    });

    searchClear?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      this.criteria.search = '';
      searchClear.style.display = 'none';
      this.onFilterChange(this.criteria);
    });

    // Quick select dropdowns (Sector, Cap, Rating)
    const sectorSelect = this.container.querySelector<HTMLSelectElement>('#quick-sector-select');
    sectorSelect?.addEventListener('change', () => {
      this.criteria.advanced.sector = sectorSelect.value;
      this.render();
      this.setupListeners();
      this.onFilterChange(this.criteria);
    });

    const capSelect = this.container.querySelector<HTMLSelectElement>('#quick-cap-select');
    capSelect?.addEventListener('change', () => {
      this.criteria.advanced.marketCapTier = capSelect.value;
      this.render();
      this.setupListeners();
      this.onFilterChange(this.criteria);
    });

    const ratingSelect = this.container.querySelector<HTMLSelectElement>('#quick-rating-select');
    ratingSelect?.addEventListener('change', () => {
      this.criteria.advanced.technicalRating = ratingSelect.value;
      this.render();
      this.setupListeners();
      this.onFilterChange(this.criteria);
    });

    // Preset chips
    this.container.querySelectorAll('.filter-pill[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset');
        if (preset) {
          if (this.criteria.quickPreset === preset) {
            this.criteria.quickPreset = 'all';
          } else {
            this.criteria.quickPreset = preset;
          }
          this.render();
          this.setupListeners();
          this.onFilterChange(this.criteria);
        }
      });
    });

    // Clear all filters
    this.container.querySelector('#clear-all-filters-btn')?.addEventListener('click', () => {
      this.criteria = {
        tab: this.criteria.tab,
        search: '',
        quickPreset: 'all',
        advanced: { ...DEFAULT_ADVANCED_FILTERS },
      };
      this.render();
      this.setupListeners();
      this.onFilterChange(this.criteria);
    });

    // Layout view buttons
    const layoutTableBtn = this.container.querySelector('#layout-view-table-btn');
    const layoutChartBtn = this.container.querySelector('#layout-view-chart-btn');
    const layoutMatrixBtn = this.container.querySelector('#layout-view-matrix-btn');

    layoutTableBtn?.addEventListener('click', () => {
      this.container.querySelectorAll('.tv-view-icon-btn').forEach((b) => b.classList.remove('active'));
      layoutTableBtn.classList.add('active');
    });

    layoutChartBtn?.addEventListener('click', () => {
      this.onToggleDrawer?.();
    });

    layoutMatrixBtn?.addEventListener('click', () => {
      this.criteria.tab = 'performance';
      this.render();
      this.setupListeners();
      this.onFilterChange(this.criteria);
    });

    // Global click outside to close dropdowns
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!presetContainer?.contains(target)) {
        presetContainer?.classList.remove('open');
      }
    });
  }

  private startAutoRefresh() {
    if (this.autoRefreshInterval) clearInterval(this.autoRefreshInterval);
    if (!this.isAutoRefreshActive) return;

    this.autoRefreshInterval = window.setInterval(() => {
      // Simulate real-time tick injection via dataLayer
      const instruments = dataLayer.getInstruments();
      if (instruments.length > 0) {
        const randomInst = instruments[Math.floor(Math.random() * instruments.length)];
        const delta = (Math.random() - 0.48) * (randomInst.price * 0.006);
        const newPrice = Math.max(1, randomInst.price + delta);
        const change = newPrice - (randomInst.price - randomInst.change);
        const changePercent = (change / (newPrice - change)) * 100;

        dataLayer.emitTick({
          symbol: randomInst.symbol,
          price: newPrice,
          change: change,
          changePercent: changePercent,
          volume: randomInst.volume + Math.floor(Math.random() * 5000),
          timestamp: Date.now(),
        });
      }
    }, 1500);
  }

  public destroy() {
    if (this.autoRefreshInterval) clearInterval(this.autoRefreshInterval);
  }
}
