/**
 * TradingView Screener Column Customizer Modal
 * Categorized metric selector for customizing table columns.
 */

export interface ColumnDef {
  id: string;
  label: string;
  category: 'overview' | 'performance' | 'valuation' | 'technicals' | 'fundamentals';
  visible: boolean;
}

export const ALL_COLUMNS: ColumnDef[] = [
  // Overview
  { id: 'symbol', label: 'Symbol & Name', category: 'overview', visible: true },
  { id: 'price', label: 'Price', category: 'overview', visible: true },
  { id: 'changePercent', label: 'Change %', category: 'overview', visible: true },
  { id: 'change', label: 'Change (Pts)', category: 'overview', visible: true },
  { id: 'volume', label: 'Volume', category: 'overview', visible: true },
  { id: 'sparkline', label: '7D Trend', category: 'overview', visible: true },
  { id: 'technicalRating', label: 'Technical Rating', category: 'overview', visible: true },

  // Valuation
  { id: 'marketCap', label: 'Market Cap', category: 'valuation', visible: true },
  { id: 'pe', label: 'P/E (TTM)', category: 'valuation', visible: true },
  { id: 'forwardPe', label: 'Forward P/E', category: 'valuation', visible: false },
  { id: 'eps', label: 'EPS (TTM)', category: 'valuation', visible: false },
  { id: 'pb', label: 'Price to Book', category: 'valuation', visible: false },
  { id: 'dividendYield', label: 'Div Yield %', category: 'valuation', visible: true },

  // Technicals
  { id: 'range52', label: '52W Range Bar', category: 'technicals', visible: true },
  { id: 'high52', label: '52W High', category: 'technicals', visible: false },
  { id: 'low52', label: '52W Low', category: 'technicals', visible: false },
  { id: 'rsi14', label: 'RSI (14)', category: 'technicals', visible: true },
  { id: 'sma200', label: '200 SMA', category: 'technicals', visible: false },

  // Performance
  { id: 'perf1W', label: 'Perf 1W %', category: 'performance', visible: false },
  { id: 'perf1M', label: 'Perf 1M %', category: 'performance', visible: false },
  { id: 'perf1Y', label: 'Perf 1Y %', category: 'performance', visible: false },

  // Fundamentals
  { id: 'revenueGrowth', label: 'Rev Growth %', category: 'fundamentals', visible: true },
  { id: 'netMargin', label: 'Net Margin %', category: 'fundamentals', visible: false },
  { id: 'roce', label: 'ROCE %', category: 'fundamentals', visible: true },
  { id: 'debtToEquity', label: 'Debt / Equity', category: 'fundamentals', visible: false },
];

export class ColumnModal {
  private overlay: HTMLElement;
  private columns: ColumnDef[];
  private onUpdate: (columns: ColumnDef[]) => void;
  private selectedCategory: string = 'all';

  constructor(onUpdate: (columns: ColumnDef[]) => void) {
    this.columns = this.loadColumns();
    this.onUpdate = onUpdate;
    this.overlay = this.createModalDOM();
    document.body.appendChild(this.overlay);
  }

  private loadColumns(): ColumnDef[] {
    try {
      const saved = localStorage.getItem('honba_tv_columns_v2');
      if (saved) {
        const savedIds: string[] = JSON.parse(saved);
        return ALL_COLUMNS.map((col) => ({
          ...col,
          visible: col.id === 'symbol' ? true : savedIds.includes(col.id),
        }));
      }
    } catch {
      // Fallback
    }
    return [...ALL_COLUMNS];
  }

  private saveColumns() {
    try {
      const visibleIds = this.columns.filter((c) => c.visible).map((c) => c.id);
      localStorage.setItem('honba_tv_columns_v2', JSON.stringify(visibleIds));
    } catch {
      // Ignore
    }
  }

  private createModalDOM(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'column-customizer-modal';
    return overlay;
  }

  private render() {
    const filteredCols =
      this.selectedCategory === 'all'
        ? this.columns
        : this.columns.filter((c) => c.category === this.selectedCategory);

    this.overlay.innerHTML = `
      <div class="modal-dialog" style="width: 580px;">
        <div class="modal-header">
          <div class="modal-title">Customize Screener Columns</div>
          <button class="nav-icon-btn modal-close-btn" style="border:none;">✕</button>
        </div>

        <div style="padding: 10px 18px 0; display: flex; gap: 6px; overflow-x: auto; border-bottom: 1px solid var(--border-subtle);">
          <button class="view-tab-btn ${this.selectedCategory === 'all' ? 'active' : ''}" data-cat="all">All (${this.columns.length})</button>
          <button class="view-tab-btn ${this.selectedCategory === 'overview' ? 'active' : ''}" data-cat="overview">Overview</button>
          <button class="view-tab-btn ${this.selectedCategory === 'valuation' ? 'active' : ''}" data-cat="valuation">Valuation</button>
          <button class="view-tab-btn ${this.selectedCategory === 'technicals' ? 'active' : ''}" data-cat="technicals">Technicals</button>
          <button class="view-tab-btn ${this.selectedCategory === 'performance' ? 'active' : ''}" data-cat="performance">Performance</button>
          <button class="view-tab-btn ${this.selectedCategory === 'fundamentals' ? 'active' : ''}" data-cat="fundamentals">Fundamentals</button>
        </div>

        <div class="modal-body">
          <div class="columns-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
            ${filteredCols
              .map(
                (col) => `
              <label class="checkbox-item">
                <input type="checkbox" data-col-id="${col.id}" ${col.visible ? 'checked' : ''} ${col.id === 'symbol' ? 'disabled' : ''}/>
                <span style="font-size: 12px; font-weight: 500;">${col.label}</span>
                <span style="margin-left: auto; font-size: 10px; color: var(--text-muted); text-transform: uppercase;">${col.category}</span>
              </label>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="modal-footer">
          <button class="nav-icon-btn reset-columns-btn">Reset Defaults</button>
          <button class="shortlist-btn shortlist-btn-primary apply-columns-btn">Apply Columns</button>
        </div>
      </div>
    `;

    this.attachListeners();
  }

  private attachListeners() {
    this.overlay.querySelector('.modal-close-btn')?.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    this.overlay.querySelectorAll('.view-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        if (cat) {
          this.selectedCategory = cat;
          this.render();
        }
      });
    });

    this.overlay.querySelector('.reset-columns-btn')?.addEventListener('click', () => {
      this.columns = ALL_COLUMNS.map((c) => ({ ...c }));
      this.saveColumns();
      this.onUpdate(this.columns);
      this.render();
    });

    this.overlay.querySelector('.apply-columns-btn')?.addEventListener('click', () => {
      const inputs = this.overlay.querySelectorAll<HTMLInputElement>('input[data-col-id]');
      inputs.forEach((input) => {
        const id = input.getAttribute('data-col-id');
        const col = this.columns.find((c) => c.id === id);
        if (col && col.id !== 'symbol') {
          col.visible = input.checked;
        }
      });
      this.saveColumns();
      this.onUpdate(this.columns);
      this.close();
    });
  }

  public open() {
    this.render();
    this.overlay.classList.add('open');
  }

  public close() {
    this.overlay.classList.remove('open');
  }

  public getColumns(): ColumnDef[] {
    return this.columns;
  }
}
