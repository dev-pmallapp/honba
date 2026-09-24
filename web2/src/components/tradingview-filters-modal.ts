/**
 * TradingView Comprehensive Filters Modal
 * Multi-category filter dialog matching TradingView's screener filter panel:
 * Descriptive, Financials, and Technical indicators with min/max bounds and quick selectors.
 */

export interface AdvancedFilterState {
  sector: string;
  marketCapTier: string;
  peMin: number | null;
  peMax: number | null;
  rsiMin: number | null;
  rsiMax: number | null;
  technicalRating: string;
  minDividendYield: number | null;
  priceAbove200Sma: boolean;
  near52WeekHigh: boolean;
  minRoce: number | null;
}

export const DEFAULT_ADVANCED_FILTERS: AdvancedFilterState = {
  sector: 'all',
  marketCapTier: 'all',
  peMin: null,
  peMax: null,
  rsiMin: null,
  rsiMax: null,
  technicalRating: 'all',
  minDividendYield: null,
  priceAbove200Sma: false,
  near52WeekHigh: false,
  minRoce: null,
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

  public getActiveFilterCount(): number {
    let count = 0;
    if (this.state.sector !== 'all') count++;
    if (this.state.marketCapTier !== 'all') count++;
    if (this.state.peMin !== null || this.state.peMax !== null) count++;
    if (this.state.rsiMin !== null || this.state.rsiMax !== null) count++;
    if (this.state.technicalRating !== 'all') count++;
    if (this.state.minDividendYield !== null) count++;
    if (this.state.priceAbove200Sma) count++;
    if (this.state.near52WeekHigh) count++;
    if (this.state.minRoce !== null) count++;
    return count;
  }

  private createModalDOM(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'tv-filters-modal';
    return overlay;
  }

  private render() {
    const filterCount = this.getActiveFilterCount();

    this.overlay.innerHTML = `
      <div class="modal-dialog tv-filters-dialog">
        <!-- Modal Top Bar -->
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="modal-title">Filters</div>
            ${filterCount > 0 ? `<span class="tv-filter-count-badge">${filterCount} active</span>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <button class="tv-text-btn reset-all-filters-btn" style="color: var(--text-muted); font-size: 11px;">Reset All</button>
            <button class="nav-icon-btn modal-close-btn" style="border:none;">✕</button>
          </div>
        </div>

        <!-- Filter Content Split Layout: Category Tabs on Left, Knobs on Right -->
        <div class="tv-filters-body">
          <aside class="tv-filters-sidebar">
            <button class="tv-filter-cat-btn ${this.activeCategory === 'descriptive' ? 'active' : ''}" data-cat="descriptive">
              <span>Descriptive</span>
              <span class="cat-pill">${this.getCatCount('descriptive')}</span>
            </button>
            <button class="tv-filter-cat-btn ${this.activeCategory === 'financials' ? 'active' : ''}" data-cat="financials">
              <span>Financials & Valuation</span>
              <span class="cat-pill">${this.getCatCount('financials')}</span>
            </button>
            <button class="tv-filter-cat-btn ${this.activeCategory === 'technicals' ? 'active' : ''}" data-cat="technicals">
              <span>Technicals & Momentum</span>
              <span class="cat-pill">${this.getCatCount('technicals')}</span>
            </button>
          </aside>

          <main class="tv-filters-content-area">
            ${this.renderCategoryFields()}
          </main>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer">
          <button class="nav-icon-btn cancel-filters-btn">Cancel</button>
          <button class="shortlist-btn shortlist-btn-primary apply-tv-filters-btn">
            Apply Filters ${filterCount > 0 ? `(${filterCount})` : ''}
          </button>
        </div>
      </div>
    `;

    this.attachListeners();
  }

  private getCatCount(cat: 'descriptive' | 'financials' | 'technicals'): number {
    let c = 0;
    if (cat === 'descriptive') {
      if (this.state.sector !== 'all') c++;
      if (this.state.marketCapTier !== 'all') c++;
    } else if (cat === 'financials') {
      if (this.state.peMin !== null || this.state.peMax !== null) c++;
      if (this.state.minDividendYield !== null) c++;
      if (this.state.minRoce !== null) c++;
    } else if (cat === 'technicals') {
      if (this.state.rsiMin !== null || this.state.rsiMax !== null) c++;
      if (this.state.technicalRating !== 'all') c++;
      if (this.state.priceAbove200Sma) c++;
      if (this.state.near52WeekHigh) c++;
    }
    return c;
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
            <button class="tv-chip-select ${this.state.marketCapTier === 'mega' ? 'active' : ''}" data-field="marketCapTier" data-val="mega">Mega (>₹10T / >$200B)</button>
            <button class="tv-chip-select ${this.state.marketCapTier === 'large' ? 'active' : ''}" data-field="marketCapTier" data-val="large">Large (>₹500B / >$10B)</button>
            <button class="tv-chip-select ${this.state.marketCapTier === 'mid' ? 'active' : ''}" data-field="marketCapTier" data-val="mid">Mid Cap</button>
            <button class="tv-chip-select ${this.state.marketCapTier === 'small' ? 'active' : ''}" data-field="marketCapTier" data-val="small">Small Cap</button>
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

    // Reset all
    this.overlay.querySelector('.reset-all-filters-btn')?.addEventListener('click', () => {
      this.state = { ...DEFAULT_ADVANCED_FILTERS };
      this.render();
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

    // Rating
    const ratingEl = this.overlay.querySelector<HTMLSelectElement>('#filter-field-rating');
    if (ratingEl) this.state.technicalRating = ratingEl.value;

    // RSI
    const rsiMinEl = this.overlay.querySelector<HTMLInputElement>('#filter-field-rsi-min');
    const rsiMaxEl = this.overlay.querySelector<HTMLInputElement>('#filter-field-rsi-max');
    if (rsiMinEl) this.state.rsiMin = rsiMinEl.value ? parseFloat(rsiMinEl.value) : null;
    if (rsiMaxEl) this.state.rsiMax = rsiMaxEl.value ? parseFloat(rsiMaxEl.value) : null;

    // Checkboxes
    const smaEl = this.overlay.querySelector<HTMLInputElement>('#filter-field-sma200');
    if (smaEl) this.state.priceAbove200Sma = smaEl.checked;

    const high52El = this.overlay.querySelector<HTMLInputElement>('#filter-field-high52');
    if (high52El) this.state.near52WeekHigh = high52El.checked;
  }
}
