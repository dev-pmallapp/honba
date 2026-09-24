/**
 * Honba Filter Bar Component
 * TradingView-inspired screener tabs, live search input, filter knobs, and presets.
 */

import { dataLayer } from '../core/data-layer';
import { themeEngine } from '../core/theme-engine';

export interface FilterCriteria {
  tab: string;
  search: string;
  sector: string;
  marketCapTier: string;
  quickPreset: string;
}

export class FilterBar {
  private container: HTMLElement;
  private onFilterChange: (criteria: FilterCriteria) => void;
  private onOpenColumnsModal: () => void;
  private onExportCSV: () => void;

  private criteria: FilterCriteria = {
    tab: 'overview',
    search: '',
    sector: 'all',
    marketCapTier: 'all',
    quickPreset: 'all',
  };

  constructor(
    container: HTMLElement,
    onFilterChange: (criteria: FilterCriteria) => void,
    onOpenColumnsModal: () => void,
    onExportCSV: () => void
  ) {
    this.container = container;
    this.onFilterChange = onFilterChange;
    this.onOpenColumnsModal = onOpenColumnsModal;
    this.onExportCSV = onExportCSV;

    this.render();
    this.setupListeners();
  }

  public render() {
    this.container.innerHTML = `
      <div class="screener-filter-bar">
        <!-- Top Row: Category Tabs & Search & Quick Tools -->
        <div class="filter-bar-top-row">
          <div class="view-tabs" id="view-tabs">
            <button class="view-tab-btn ${this.criteria.tab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</button>
            <button class="view-tab-btn ${this.criteria.tab === 'performance' ? 'active' : ''}" data-tab="performance">Performance</button>
            <button class="view-tab-btn ${this.criteria.tab === 'valuation' ? 'active' : ''}" data-tab="valuation">Valuation</button>
            <button class="view-tab-btn ${this.criteria.tab === 'technicals' ? 'active' : ''}" data-tab="technicals">Technicals</button>
            <button class="view-tab-btn ${this.criteria.tab === 'dividends' ? 'active' : ''}" data-tab="dividends">Dividends</button>
            <button class="view-tab-btn ${this.criteria.tab === 'financials' ? 'active' : ''}" data-tab="financials">Financials</button>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="search-box-wrapper">
              <input 
                type="text" 
                class="search-input" 
                id="screener-search-input" 
                placeholder="Search symbol, company, industry..." 
                value="${this.criteria.search}"
                autocomplete="off"
              />
              <span class="search-icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <button class="search-clear-btn" id="search-clear-btn">✕</button>
            </div>

            <button class="nav-icon-btn" id="open-columns-btn" title="Customize Columns">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="18"></rect>
                <rect x="14" y="3" width="7" height="18"></rect>
              </svg>
              <span>Columns</span>
            </button>

            <button class="nav-icon-btn" id="export-csv-btn" title="Export Filtered CSV">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Export</span>
            </button>
          </div>
        </div>

        <!-- Bottom Row: Filter Knobs & Presets -->
        <div class="filter-bar-bottom-row">
          <!-- Sector Filter -->
          <select class="filter-select" id="sector-filter-select">
            <option value="all">All Sectors</option>
            <option value="Technology">Technology</option>
            <option value="Financials">Financials</option>
            <option value="Energy">Energy</option>
            <option value="Automobile">Automobile</option>
            <option value="Healthcare">Healthcare</option>
            <option value="Consumer Goods">Consumer Goods</option>
            <option value="Materials">Materials</option>
            <option value="Telecom">Telecom</option>
            <option value="Industrials">Industrials</option>
          </select>

          <!-- Market Cap Filter -->
          <select class="filter-select" id="cap-filter-select">
            <option value="all">Market Cap: All</option>
            <option value="mega">Mega Cap (Top Tier)</option>
            <option value="large">Large Cap</option>
            <option value="mid">Mid Cap</option>
          </select>

          <div style="width: 1px; height: 16px; background: var(--border-subtle); margin: 0 4px;"></div>

          <!-- Quick Filter Pills -->
          <div style="display: flex; align-items: center; gap: 6px;" id="quick-preset-pills">
            <button class="filter-pill ${this.criteria.quickPreset === 'all' ? 'active' : ''}" data-preset="all">All</button>
            <button class="filter-pill ${this.criteria.quickPreset === 'gainers' ? 'active' : ''}" data-preset="gainers">▲ Top Gainers</button>
            <button class="filter-pill ${this.criteria.quickPreset === 'losers' ? 'active' : ''}" data-preset="losers">▼ Top Losers</button>
            <button class="filter-pill ${this.criteria.quickPreset === 'momentum' ? 'active' : ''}" data-preset="momentum">RSI Momentum (>60)</button>
            <button class="filter-pill ${this.criteria.quickPreset === 'oversold' ? 'active' : ''}" data-preset="oversold">Oversold (<45)</button>
            <button class="filter-pill ${this.criteria.quickPreset === 'high52' ? 'active' : ''}" data-preset="high52">Near 52W High</button>
            <button class="filter-pill ${this.criteria.quickPreset === 'value' ? 'active' : ''}" data-preset="value">Value (P/E < 25)</button>
            <button class="filter-pill ${this.criteria.quickPreset === 'dividend' ? 'active' : ''}" data-preset="dividend">High Yield (>1.5%)</button>
          </div>
        </div>
      </div>
    `;
  }

  private setupListeners() {
    // View tabs
    this.container.querySelectorAll('.view-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') || 'overview';
        this.criteria.tab = tab;
        this.container.querySelectorAll('.view-tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        dataLayer.setActiveTab(tab);
        this.onFilterChange(this.criteria);
      });
    });

    // Search input
    const searchInput = this.container.querySelector<HTMLInputElement>('#screener-search-input');
    const clearBtn = this.container.querySelector<HTMLButtonElement>('#search-clear-btn');

    searchInput?.addEventListener('input', () => {
      this.criteria.search = searchInput.value.trim().toLowerCase();
      dataLayer.setSearchQuery(this.criteria.search);
      this.onFilterChange(this.criteria);
    });

    clearBtn?.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        this.criteria.search = '';
        dataLayer.setSearchQuery('');
        this.onFilterChange(this.criteria);
      }
    });

    // Global keyboard shortcut '/' to focus search
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchInput?.focus();
        searchInput?.select();
      }
    });

    // Sector select
    const sectorSelect = this.container.querySelector<HTMLSelectElement>('#sector-filter-select');
    sectorSelect?.addEventListener('change', () => {
      this.criteria.sector = sectorSelect.value;
      this.onFilterChange(this.criteria);
    });

    // Cap select
    const capSelect = this.container.querySelector<HTMLSelectElement>('#cap-filter-select');
    capSelect?.addEventListener('change', () => {
      this.criteria.marketCapTier = capSelect.value;
      this.onFilterChange(this.criteria);
    });

    // Preset pills
    this.container.querySelectorAll('.filter-pill[data-preset]').forEach((pill) => {
      pill.addEventListener('click', () => {
        const preset = pill.getAttribute('data-preset') || 'all';
        this.criteria.quickPreset = preset;
        this.container.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        this.onFilterChange(this.criteria);
      });
    });

    // Column modal button
    this.container.querySelector('#open-columns-btn')?.addEventListener('click', () => {
      this.onOpenColumnsModal();
    });

    // Export CSV
    this.container.querySelector('#export-csv-btn')?.addEventListener('click', () => {
      this.onExportCSV();
    });
  }

  public getCriteria(): FilterCriteria {
    return { ...this.criteria };
  }
}
