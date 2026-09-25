/**
 * TradingView Comprehensive Filters Modal
 * Multi-category filter dialog matching TradingView's screener filter panel:
 * Descriptive, Financials, and Technical indicators with min/max bounds and quick selectors.
 */

export interface AdvancedFilterState {
  sector: string;
  marketCapTier: string;
  exchange: string;
  minPrice: number | null;
  maxPrice: number | null;
  minChangePercent?: number | null;
  maxChangePercent?: number | null;
  minVolume?: number | null;
  peMin: number | null;
  peMax: number | null;
  minDividendYield: number | null;
  minRoce: number | null;
  minNetMargin: number | null;
  technicalRating: string;
  rsiMin: number | null;
  rsiMax: number | null;
  priceAbove200Sma: boolean;
  priceAbove50Sma: boolean;
  near52WeekHigh: boolean;
}

export const DEFAULT_ADVANCED_FILTERS: AdvancedFilterState = {
  sector: 'all',
  marketCapTier: 'all',
  exchange: 'all',
  minPrice: null,
  maxPrice: null,
  minChangePercent: null,
  maxChangePercent: null,
  minVolume: null,
  peMin: null,
  peMax: null,
  minDividendYield: null,
  minRoce: null,
  minNetMargin: null,
  technicalRating: 'all',
  rsiMin: null,
  rsiMax: null,
  priceAbove200Sma: false,
  priceAbove50Sma: false,
  near52WeekHigh: false,
};

export class TradingViewFiltersModal {
  private overlay: HTMLElement;
  private state: AdvancedFilterState;
  private onApply: (state: AdvancedFilterState) => void;
  private activeCategory: 'descriptive' | 'financials' | 'technicals' = 'descriptive';

  constructor(onApply: (state: AdvancedFilterState) => void) {
    this.state = { ...DEFAULT_ADVANCED_FILTERS };
    this.onApply = onApply;
    this.overlay = this.createModalDOM();
    document.body.appendChild(this.overlay);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay.classList.contains('open')) {
        this.close();
      }
    });
  }

  public open(currentState?: AdvancedFilterState) {
    if (currentState) {
      this.state = { ...currentState };
    }
    this.render();
    this.overlay.classList.add('open');
  }

  public close() {
    this.overlay.classList.remove('open');
  }

  public getCatTotal(cat: 'descriptive' | 'financials' | 'technicals'): number {
    switch (cat) {
      case 'descriptive':
        return 4;
      case 'financials':
        return 4;
      case 'technicals':
        return 5;
    }
  }

  public getCatActiveCount(cat: 'descriptive' | 'financials' | 'technicals'): number {
    let c = 0;
    if (cat === 'descriptive') {
      if (this.state.sector !== 'all') c++;
      if (this.state.marketCapTier !== 'all') c++;
      if (this.state.exchange !== 'all') c++;
      if (this.state.minPrice !== null || this.state.maxPrice !== null) c++;
    } else if (cat === 'financials') {
      if (this.state.peMin !== null || this.state.peMax !== null) c++;
      if (this.state.minDividendYield !== null) c++;
      if (this.state.minRoce !== null) c++;
      if (this.state.minNetMargin !== null) c++;
    } else if (cat === 'technicals') {
      if (this.state.rsiMin !== null || this.state.rsiMax !== null) c++;
      if (this.state.technicalRating !== 'all') c++;
      if (this.state.priceAbove200Sma) c++;
      if (this.state.priceAbove50Sma) c++;
      if (this.state.near52WeekHigh) c++;
    }
    return c;
  }

  public getActiveFilterCount(): number {
    return (
      this.getCatActiveCount('descriptive') +
      this.getCatActiveCount('financials') +
      this.getCatActiveCount('technicals')
    );
  }

  private createModalDOM(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'tv-filters-modal';
    return overlay;
  }

  private render() {
    const filterCount = this.getActiveFilterCount();
    const activeDesc = this.getCatActiveCount('descriptive');
    const totalDesc = this.getCatTotal('descriptive');
    const activeFin = this.getCatActiveCount('financials');
    const totalFin = this.getCatTotal('financials');
    const activeTech = this.getCatActiveCount('technicals');
    const totalTech = this.getCatTotal('technicals');

    this.overlay.innerHTML = `
      <div class="modal-dialog tv-filters-dialog">
        <!-- Modal Top Bar -->
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="modal-title">Filters</div>
            ${filterCount > 0 ? `<span class="tv-filter-count-badge">${filterCount} active</span>` : ''}
          </div>
          <button class="nav-icon-btn modal-close-btn" style="border:none;" title="Close" aria-label="Close">✕</button>
        </div>

        <!-- Filter Content Split Layout: Category Tabs on Left, Knobs on Right -->
        <div class="tv-filters-body">
          <aside class="tv-filters-sidebar">
            <button class="tv-filter-cat-btn ${this.activeCategory === 'descriptive' ? 'active' : ''}" data-cat="descriptive">
              <span>Descriptive</span>
              <div class="cat-badges-group">
                ${activeDesc > 0 ? `<span class="cat-pill active">${activeDesc} active</span>` : ''}
                <span class="cat-pill">${totalDesc}</span>
              </div>
            </button>
            <button class="tv-filter-cat-btn ${this.activeCategory === 'financials' ? 'active' : ''}" data-cat="financials">
              <span>Financials & Valuation</span>
              <div class="cat-badges-group">
                ${activeFin > 0 ? `<span class="cat-pill active">${activeFin} active</span>` : ''}
                <span class="cat-pill">${totalFin}</span>
              </div>
            </button>
            <button class="tv-filter-cat-btn ${this.activeCategory === 'technicals' ? 'active' : ''}" data-cat="technicals">
              <span>Technicals & Momentum</span>
              <div class="cat-badges-group">
                ${activeTech > 0 ? `<span class="cat-pill active">${activeTech} active</span>` : ''}
                <span class="cat-pill">${totalTech}</span>
              </div>
            </button>
          </aside>

          <main class="tv-filters-content-area">
            ${this.renderCategoryFields()}
          </main>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
          <button class="shortlist-btn reset-all-filters-btn" title="Reset all filters to default">Reset All</button>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="nav-icon-btn cancel-filters-btn" title="Close dialog">Close</button>
            <button class="shortlist-btn shortlist-btn-primary apply-tv-filters-btn">
              Apply Filters ${filterCount > 0 ? `(${filterCount})` : ''}
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachListeners();
  }

  private updateCountersOnly() {
    const filterCount = this.getActiveFilterCount();
    const badgeEl = this.overlay.querySelector('.modal-header .tv-filter-count-badge');
    const headerTitleWrapper = this.overlay.querySelector('.modal-header > div:first-child');
    if (badgeEl) {
      if (filterCount > 0) {
        badgeEl.textContent = `${filterCount} active`;
      } else {
        badgeEl.remove();
      }
    } else if (filterCount > 0 && headerTitleWrapper) {
      const newBadge = document.createElement('span');
      newBadge.className = 'tv-filter-count-badge';
      newBadge.textContent = `${filterCount} active`;
      headerTitleWrapper.appendChild(newBadge);
    }

    const applyBtn = this.overlay.querySelector('.apply-tv-filters-btn');
    if (applyBtn) {
      applyBtn.textContent = `Apply Filters ${filterCount > 0 ? `(${filterCount})` : ''}`;
    }

    (['descriptive', 'financials', 'technicals'] as const).forEach((cat) => {
      const btn = this.overlay.querySelector(`.tv-filter-cat-btn[data-cat="${cat}"]`);
      if (btn) {
        const active = this.getCatActiveCount(cat);
        const total = this.getCatTotal(cat);
        const group = btn.querySelector('.cat-badges-group');
        if (group) {
          group.innerHTML = `
            ${active > 0 ? `<span class="cat-pill active">${active} active</span>` : ''}
            <span class="cat-pill">${total}</span>
          `;
        }
      }
    });
  }

  private renderCategoryFields(): string {
    if (this.activeCategory === 'descriptive') {
      return `
        <div class="tv-field-group">
          <label class="tv-field-label">Sector</label>
          <select class="filter-select" id="filter-field-sector" style="width: 100%;">
            <option value="all" ${this.state.sector === 'all' ? 'selected' : ''}>All Sectors</option>
            <option value="Technology" ${this.state.sector === 'Technology' ? 'selected' : ''}>Technology</option>
            <option value="Financials" ${this.state.sector === 'Financials' ? 'selected' : ''}>Financials</option>
            <option value="Energy" ${this.state.sector === 'Energy' ? 'selected' : ''}>Energy</option>
            <option value="Healthcare" ${this.state.sector === 'Healthcare' ? 'selected' : ''}>Healthcare</option>
            <option value="Automobile" ${this.state.sector === 'Automobile' ? 'selected' : ''}>Automobile</option>
            <option value="Consumer Goods" ${this.state.sector === 'Consumer Goods' ? 'selected' : ''}>Consumer Goods</option>
            <option value="Materials" ${this.state.sector === 'Materials' ? 'selected' : ''}>Materials</option>
            <option value="Telecom" ${this.state.sector === 'Telecom' ? 'selected' : ''}>Telecom</option>
            <option value="Industrials" ${this.state.sector === 'Industrials' ? 'selected' : ''}>Industrials</option>
          </select>
        </div>

        <div class="tv-field-group">
          <label class="tv-field-label">Market Capitalization</label>
          <div class="tv-radio-chips">
            <button class="tv-chip-select ${this.state.marketCapTier === 'all' ? 'active' : ''}" data-field="marketCapTier" data-val="all">All Tiers</button>
            <button class="tv-chip-select ${this.state.marketCapTier === 'mega' ? 'active' : ''}" data-field="marketCapTier" data-val="mega">Mega Cap (>₹10T / >$200B)</button>
            <button class="tv-chip-select ${this.state.marketCapTier === 'large' ? 'active' : ''}" data-field="marketCapTier" data-val="large">Large Cap (>₹500B / >$10B)</button>
            <button class="tv-chip-select ${this.state.marketCapTier === 'mid' ? 'active' : ''}" data-field="marketCapTier" data-val="mid">Mid Cap</button>
            <button class="tv-chip-select ${this.state.marketCapTier === 'small' ? 'active' : ''}" data-field="marketCapTier" data-val="small">Small Cap</button>
          </div>
        </div>

        <div class="tv-field-group">
          <label class="tv-field-label">Primary Exchange</label>
          <select class="filter-select" id="filter-field-exchange" style="width: 100%;">
            <option value="all" ${this.state.exchange === 'all' ? 'selected' : ''}>All Exchanges</option>
            <option value="NSE" ${this.state.exchange === 'NSE' ? 'selected' : ''}>NSE (National Stock Exchange)</option>
            <option value="BSE" ${this.state.exchange === 'BSE' ? 'selected' : ''}>BSE (Bombay Stock Exchange)</option>
            <option value="NASDAQ" ${this.state.exchange === 'NASDAQ' ? 'selected' : ''}>NASDAQ (US)</option>
            <option value="NYSE" ${this.state.exchange === 'NYSE' ? 'selected' : ''}>NYSE (US)</option>
            <option value="TSE" ${this.state.exchange === 'TSE' ? 'selected' : ''}>TSE (Tokyo Stock Exchange)</option>
            <option value="LSE" ${this.state.exchange === 'LSE' ? 'selected' : ''}>LSE (London Stock Exchange)</option>
          </select>
        </div>

        <div class="tv-field-group">
          <label class="tv-field-label">Price Range</label>
          <div class="tv-range-inputs">
            <input type="number" class="search-input" id="filter-field-price-min" placeholder="Min Price" value="${this.state.minPrice ?? ''}"/>
            <span style="color: var(--text-muted); font-size: 11px;">to</span>
            <input type="number" class="search-input" id="filter-field-price-max" placeholder="Max Price" value="${this.state.maxPrice ?? ''}"/>
          </div>
        </div>
      `;
    }

    if (this.activeCategory === 'financials') {
      return `
        <div class="tv-field-group">
          <label class="tv-field-label">Price-to-Earnings Ratio (P/E)</label>
          <div class="tv-range-inputs">
            <input type="number" class="search-input" id="filter-field-pe-min" placeholder="Min P/E (e.g. 5)" value="${this.state.peMin ?? ''}"/>
            <span style="color: var(--text-muted); font-size: 11px;">to</span>
            <input type="number" class="search-input" id="filter-field-pe-max" placeholder="Max P/E (e.g. 30)" value="${this.state.peMax ?? ''}"/>
          </div>
        </div>

        <div class="tv-field-group">
          <label class="tv-field-label">Dividend Yield (%)</label>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="number" step="0.1" class="search-input" id="filter-field-div" placeholder="Min % (e.g. 1.5)" value="${this.state.minDividendYield ?? ''}" style="width: 140px;"/>
            <span style="font-size: 11px; color: var(--text-muted);">or higher</span>
          </div>
        </div>

        <div class="tv-field-group">
          <label class="tv-field-label">Return on Capital Employed (ROCE %)</label>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="number" step="0.5" class="search-input" id="filter-field-roce" placeholder="Min % (e.g. 15)" value="${this.state.minRoce ?? ''}" style="width: 140px;"/>
            <span style="font-size: 11px; color: var(--text-muted);">or higher</span>
          </div>
        </div>

        <div class="tv-field-group">
          <label class="tv-field-label">Net Profit Margin (%)</label>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="number" step="1" class="search-input" id="filter-field-margin" placeholder="Min % (e.g. 10)" value="${this.state.minNetMargin ?? ''}" style="width: 140px;"/>
            <span style="font-size: 11px; color: var(--text-muted);">or higher</span>
          </div>
        </div>
      `;
    }

    // Technicals
    return `
      <div class="tv-field-group">
        <label class="tv-field-label">TradingView Technical Rating</label>
        <select class="filter-select" id="filter-field-rating" style="width: 100%;">
          <option value="all" ${this.state.technicalRating === 'all' ? 'selected' : ''}>All Ratings</option>
          <option value="Strong Buy" ${this.state.technicalRating === 'Strong Buy' ? 'selected' : ''}>Strong Buy</option>
          <option value="Buy" ${this.state.technicalRating === 'Buy' ? 'selected' : ''}>Buy & Strong Buy</option>
          <option value="Neutral" ${this.state.technicalRating === 'Neutral' ? 'selected' : ''}>Neutral</option>
          <option value="Sell" ${this.state.technicalRating === 'Sell' ? 'selected' : ''}>Sell</option>
          <option value="Strong Sell" ${this.state.technicalRating === 'Strong Sell' ? 'selected' : ''}>Strong Sell</option>
        </select>
      </div>

      <div class="tv-field-group">
        <label class="tv-field-label">Relative Strength Index (RSI 14)</label>
        <div class="tv-range-inputs">
          <input type="number" class="search-input" id="filter-field-rsi-min" placeholder="Min RSI (e.g. 30)" value="${this.state.rsiMin ?? ''}"/>
          <span style="color: var(--text-muted); font-size: 11px;">to</span>
          <input type="number" class="search-input" id="filter-field-rsi-max" placeholder="Max RSI (e.g. 70)" value="${this.state.rsiMax ?? ''}"/>
        </div>
      </div>

      <div class="tv-field-group">
        <label class="tv-field-label">Trend & Moving Averages</label>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <label class="checkbox-item">
            <input type="checkbox" id="filter-field-sma200" ${this.state.priceAbove200Sma ? 'checked' : ''}/>
            <span style="font-size: 12px;">Price Above 200-day Simple Moving Average (SMA 200)</span>
          </label>
          <label class="checkbox-item">
            <input type="checkbox" id="filter-field-sma50" ${this.state.priceAbove50Sma ? 'checked' : ''}/>
            <span style="font-size: 12px;">Price Above 50-day Simple Moving Average (SMA 50)</span>
          </label>
          <label class="checkbox-item">
            <input type="checkbox" id="filter-field-high52" ${this.state.near52WeekHigh ? 'checked' : ''}/>
            <span style="font-size: 12px;">Trading within 5% of 52-Week High</span>
          </label>
        </div>
      </div>
    `;
  }

  private attachListeners() {
    this.overlay.querySelector('.modal-close-btn')?.addEventListener('click', () => this.close());
    this.overlay.querySelector('.cancel-filters-btn')?.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Switch categories
    this.overlay.querySelectorAll('.tv-filter-cat-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.saveCurrentInputs();
        const cat = btn.getAttribute('data-cat') as typeof this.activeCategory;
        if (cat) {
          this.activeCategory = cat;
          this.render();
        }
      });
    });

    // Real-time counter updates on input/change
    const contentArea = this.overlay.querySelector('.tv-filters-content-area');
    contentArea?.addEventListener('input', () => {
      this.saveCurrentInputs();
      this.updateCountersOnly();
    });
    contentArea?.addEventListener('change', () => {
      this.saveCurrentInputs();
      this.updateCountersOnly();
    });

    // Reset all
    this.overlay.querySelectorAll('.reset-all-filters-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.state = { ...DEFAULT_ADVANCED_FILTERS };
        this.onApply(this.state);
        this.render();
      });
    });

    // Market cap chips
    this.overlay.querySelectorAll('.tv-chip-select[data-field="marketCapTier"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-val');
        if (val) {
          this.state.marketCapTier = val;
          this.render();
        }
      });
    });

    // Apply
    this.overlay.querySelector('.apply-tv-filters-btn')?.addEventListener('click', () => {
      this.saveCurrentInputs();
      this.onApply(this.state);
      this.close();
    });
  }

  private saveCurrentInputs() {
    // Sector
    const sectorEl = this.overlay.querySelector<HTMLSelectElement>('#filter-field-sector');
    if (sectorEl) this.state.sector = sectorEl.value;

    // Exchange
    const exchangeEl = this.overlay.querySelector<HTMLSelectElement>('#filter-field-exchange');
    if (exchangeEl) this.state.exchange = exchangeEl.value;

    // Price
    const priceMinEl = this.overlay.querySelector<HTMLInputElement>('#filter-field-price-min');
    const priceMaxEl = this.overlay.querySelector<HTMLInputElement>('#filter-field-price-max');
    if (priceMinEl) this.state.minPrice = priceMinEl.value ? parseFloat(priceMinEl.value) : null;
    if (priceMaxEl) this.state.maxPrice = priceMaxEl.value ? parseFloat(priceMaxEl.value) : null;

    // PE
    const peMinEl = this.overlay.querySelector<HTMLInputElement>('#filter-field-pe-min');
    const peMaxEl = this.overlay.querySelector<HTMLInputElement>('#filter-field-pe-max');
    if (peMinEl) this.state.peMin = peMinEl.value ? parseFloat(peMinEl.value) : null;
    if (peMaxEl) this.state.peMax = peMaxEl.value ? parseFloat(peMaxEl.value) : null;

    // Div
    const divEl = this.overlay.querySelector<HTMLInputElement>('#filter-field-div');
    if (divEl) this.state.minDividendYield = divEl.value ? parseFloat(divEl.value) : null;

    // ROCE
    const roceEl = this.overlay.querySelector<HTMLInputElement>('#filter-field-roce');
    if (roceEl) this.state.minRoce = roceEl.value ? parseFloat(roceEl.value) : null;

    // Net Margin
    const marginEl = this.overlay.querySelector<HTMLInputElement>('#filter-field-margin');
    if (marginEl) this.state.minNetMargin = marginEl.value ? parseFloat(marginEl.value) : null;

    // Rating
    const ratingEl = this.overlay.querySelector<HTMLSelectElement>('#filter-field-rating');
    if (ratingEl) this.state.technicalRating = ratingEl.value;

    // RSI
    const rsiMinEl = this.overlay.querySelector<HTMLInputElement>('#filter-field-rsi-min');
    const rsiMaxEl = this.overlay.querySelector<HTMLInputElement>('#filter-field-rsi-max');
    if (rsiMinEl) this.state.rsiMin = rsiMinEl.value ? parseFloat(rsiMinEl.value) : null;
    if (rsiMaxEl) this.state.rsiMax = rsiMaxEl.value ? parseFloat(rsiMaxEl.value) : null;

    // Checkboxes
    const sma200El = this.overlay.querySelector<HTMLInputElement>('#filter-field-sma200');
    if (sma200El) this.state.priceAbove200Sma = sma200El.checked;

    const sma50El = this.overlay.querySelector<HTMLInputElement>('#filter-field-sma50');
    if (sma50El) this.state.priceAbove50Sma = sma50El.checked;

    const high52El = this.overlay.querySelector<HTMLInputElement>('#filter-field-high52');
    if (high52El) this.state.near52WeekHigh = high52El.checked;
  }
}
