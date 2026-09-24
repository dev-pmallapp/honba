/**
 * TradingView Screener Secondary Filter Bar Component
 * Category view tabs, prominent Filters (N) button, quick knobs, filter chips, and active tags.
 */

import { AdvancedFilterState, DEFAULT_ADVANCED_FILTERS } from './tradingview-filters-modal';

export interface ScreenerFilterCriteria {
  tab: string;
  search: string;
  quickPreset: string;
  advanced: AdvancedFilterState;
}

export class FilterBar {
  private container: HTMLElement;
  private onFilterChange: (criteria: ScreenerFilterCriteria) => void;
  private onOpenFiltersModal: () => void;
  private onOpenColumnsModal: () => void;

  private criteria: ScreenerFilterCriteria = {
    tab: 'overview',
    search: '',
    quickPreset: 'all',
    advanced: { ...DEFAULT_ADVANCED_FILTERS },
  };

  private totalCount: number = 0;
  private filteredCount: number = 0;

  constructor(
    container: HTMLElement,
    onFilterChange: (criteria: ScreenerFilterCriteria) => void,
    onOpenFiltersModal: () => void,
    onOpenColumnsModal: () => void
  ) {
    this.container = container;
    this.onFilterChange = onFilterChange;
    this.onOpenFiltersModal = onOpenFiltersModal;
    this.onOpenColumnsModal = onOpenColumnsModal;

    this.render();
    this.setupListeners();
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

    this.container.innerHTML = `
      <div class="screener-filter-bar tv-filter-bar">
        <!-- Top Row: TradingView View Tabs + Filters Modal Button + Quick Search + Columns -->
        <div class="filter-bar-top-row">
          <div class="view-tabs" id="view-tabs">
            <button class="view-tab-btn ${this.criteria.tab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</button>
            <button class="view-tab-btn ${this.criteria.tab === 'performance' ? 'active' : ''}" data-tab="performance">Performance</button>
            <button class="view-tab-btn ${this.criteria.tab === 'valuation' ? 'active' : ''}" data-tab="valuation">Valuation</button>
            <button class="view-tab-btn ${this.criteria.tab === 'dividends' ? 'active' : ''}" data-tab="dividends">Dividends</button>
            <button class="view-tab-btn ${this.criteria.tab === 'margins' ? 'active' : ''}" data-tab="margins">Margins</button>
            <button class="view-tab-btn ${this.criteria.tab === 'technicals' ? 'active' : ''}" data-tab="technicals">Technicals</button>
            <button class="view-tab-btn ${this.criteria.tab === 'oscillators' ? 'active' : ''}" data-tab="oscillators">Oscillators</button>
            <button class="view-tab-btn" id="tab-add-custom-btn" title="Add / Customize Columns" style="color: var(--accent-primary);">+ Custom</button>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <!-- Prominent TradingView Filters Dialog Button -->
            <button class="tv-filter-btn ${activeCount > 0 ? 'active' : ''}" id="open-filters-modal-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
              </svg>
              <span>Filters</span>
              ${activeCount > 0 ? `<span class="tv-filter-badge">${activeCount}</span>` : ''}
            </button>

            <!-- Inline Search Box -->
            <div class="search-box-wrapper">
              <input 
                type="text" 
                class="search-input" 
                id="screener-inline-search" 
                placeholder="Filter table symbols..." 
                value="${this.criteria.search}"
                autocomplete="off"
              />
              <span class="search-icon">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <button class="search-clear-btn" id="search-clear-btn">✕</button>
            </div>

            <!-- Results Counter -->
            <div id="tv-results-counter" class="tv-results-text">
              Showing ${this.filteredCount || 50} of ${this.totalCount || 50} stocks
            </div>
          </div>
        </div>

        <!-- Bottom Row: Quick Knobs & Filter Chips -->
        <div class="filter-bar-bottom-row">
          <!-- Sector Knob -->
          <select class="filter-select" id="quick-sector-select" title="Filter by Sector">
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

          <!-- Market Cap Knob -->
          <select class="filter-select" id="quick-cap-select" title="Filter by Market Cap">
            <option value="all" ${this.criteria.advanced.marketCapTier === 'all' ? 'selected' : ''}>Market Cap: All</option>
            <option value="mega" ${this.criteria.advanced.marketCapTier === 'mega' ? 'selected' : ''}>Mega Cap (>₹10T)</option>
            <option value="large" ${this.criteria.advanced.marketCapTier === 'large' ? 'selected' : ''}>Large Cap (>₹500B)</option>
            <option value="mid" ${this.criteria.advanced.marketCapTier === 'mid' ? 'selected' : ''}>Mid Cap</option>
            <option value="small" ${this.criteria.advanced.marketCapTier === 'small' ? 'selected' : ''}>Small Cap</option>
          </select>

          <!-- Technical Rating Knob -->
          <select class="filter-select" id="quick-rating-select" title="Filter by Technical Rating">
            <option value="all" ${this.criteria.advanced.technicalRating === 'all' ? 'selected' : ''}>Tech Rating: All</option>
            <option value="Strong Buy" ${this.criteria.advanced.technicalRating === 'Strong Buy' ? 'selected' : ''}>Strong Buy</option>
            <option value="Buy" ${this.criteria.advanced.technicalRating === 'Buy' ? 'selected' : ''}>Buy</option>
            <option value="Neutral" ${this.criteria.advanced.technicalRating === 'Neutral' ? 'selected' : ''}>Neutral</option>
            <option value="Sell" ${this.criteria.advanced.technicalRating === 'Sell' ? 'selected' : ''}>Sell</option>
            <option value="Strong Sell" ${this.criteria.advanced.technicalRating === 'Strong Sell' ? 'selected' : ''}>Strong Sell</option>
          </select>

          <div class="tv-bar-vertical-divider"></div>

          <!-- Quick Filter Chips -->
          <div class="filter-chips-scroll" id="quick-preset-chips">
            <button class="filter-pill ${this.criteria.quickPreset === 'all' ? 'active' : ''}" data-preset="all">All</button>
            <button class="filter-pill ${this.criteria.quickPreset === 'gainers' ? 'active' : ''}" data-preset="gainers">▲ Top Gainers</button>
            <button class="filter-pill ${this.criteria.quickPreset === 'losers' ? 'active' : ''}" data-preset="losers">▼ Top Losers</button>
            <button class="filter-pill ${this.criteria.quickPreset === 'high52' ? 'active' : ''}" data-preset="high52">📈 52W High</button>
            <button class="filter-pill ${this.criteria.quickPreset === 'momentum' ? 'active' : ''}" data-preset="momentum">⚡ RSI > 60</button>
            <button class="filter-pill ${this.criteria.quickPreset === 'oversold' ? 'active' : ''}" data-preset="oversold">📉 Oversold (<40)</button>
            <button class="filter-pill ${this.criteria.quickPreset === 'value' ? 'active' : ''}" data-preset="value">💎 P/E &lt; 25</button>
            <button class="filter-pill ${this.criteria.quickPreset === 'dividend' ? 'active' : ''}" data-preset="dividend">💰 Div Yield &gt; 1.5%</button>
          </div>

          ${
            activeCount > 0
              ? `<button class="tv-clear-all-link" id="clear-all-filters-btn">Clear All (${activeCount})</button>`
              : ''
          }
        </div>
      </div>
    `;
  }

  private setupListeners() {
    // Tabs click
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

    // Filters modal button
    this.container.querySelector('#open-filters-modal-btn')?.addEventListener('click', () => {
      this.onOpenFiltersModal();
    });

    // Inline search input
    const searchInput = this.container.querySelector<HTMLInputElement>('#screener-inline-search');
    searchInput?.addEventListener('input', () => {
      this.criteria.search = searchInput.value.trim().toLowerCase();
      this.onFilterChange(this.criteria);
    });

    // Clear search button
    this.container.querySelector('#search-clear-btn')?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      this.criteria.search = '';
      this.onFilterChange(this.criteria);
    });

    // Quick sector select
    const sectorSelect = this.container.querySelector<HTMLSelectElement>('#quick-sector-select');
    sectorSelect?.addEventListener('change', () => {
      this.criteria.advanced.sector = sectorSelect.value;
      this.onFilterChange(this.criteria);
    });

    // Quick cap select
    const capSelect = this.container.querySelector<HTMLSelectElement>('#quick-cap-select');
    capSelect?.addEventListener('change', () => {
      this.criteria.advanced.marketCapTier = capSelect.value;
      this.onFilterChange(this.criteria);
    });

    // Quick rating select
    const ratingSelect = this.container.querySelector<HTMLSelectElement>('#quick-rating-select');
    ratingSelect?.addEventListener('change', () => {
      this.criteria.advanced.technicalRating = ratingSelect.value;
      this.onFilterChange(this.criteria);
    });

    // Quick chips
    this.container.querySelectorAll('.filter-pill[data-preset]').forEach((pill) => {
      pill.addEventListener('click', () => {
        const preset = pill.getAttribute('data-preset');
        if (preset) {
          this.criteria.quickPreset = preset;
          this.container.querySelectorAll('.filter-pill[data-preset]').forEach((p) => p.classList.remove('active'));
          pill.classList.add('active');
          this.onFilterChange(this.criteria);
        }
      });
    });

    // Clear all filters
    this.container.querySelector('#clear-all-filters-btn')?.addEventListener('click', () => {
      this.criteria.quickPreset = 'all';
      this.criteria.search = '';
      this.criteria.advanced = { ...DEFAULT_ADVANCED_FILTERS };
      this.render();
      this.setupListeners();
      this.onFilterChange(this.criteria);
    });
  }
}
