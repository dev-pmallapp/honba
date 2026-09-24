/**
 * Honba Column Customizer Modal
 * Allows showing/hiding table columns dynamically.
 */

export interface ColumnDef {
  id: string;
  label: string;
  category: 'overview' | 'valuation' | 'technicals' | 'fundamentals';
  visible: boolean;
}

export const ALL_COLUMNS: ColumnDef[] = [
  { id: 'symbol', label: 'Symbol & Company', category: 'overview', visible: true },
  { id: 'price', label: 'Price', category: 'overview', visible: true },
  { id: 'changePercent', label: 'Change %', category: 'overview', visible: true },
  { id: 'volume', label: 'Volume', category: 'overview', visible: true },
  { id: 'sparkline', label: '7D Trend', category: 'overview', visible: true },
  { id: 'marketCap', label: 'Market Cap', category: 'valuation', visible: true },
  { id: 'pe', label: 'P/E', category: 'valuation', visible: true },
  { id: 'forwardPe', label: 'Forward P/E', category: 'valuation', visible: false },
  { id: 'pb', label: 'P/B', category: 'valuation', visible: false },
  { id: 'dividendYield', label: 'Div Yield %', category: 'valuation', visible: true },
  { id: 'high52', label: '52W High', category: 'technicals', visible: true },
  { id: 'low52', label: '52W Low', category: 'technicals', visible: false },
  { id: 'rsi14', label: 'RSI (14)', category: 'technicals', visible: true },
  { id: 'sma200', label: '200 SMA', category: 'technicals', visible: false },
  { id: 'technicalRating', label: 'Tech Rating', category: 'technicals', visible: true },
  { id: 'revenueGrowth', label: 'Rev Growth %', category: 'fundamentals', visible: true },
  { id: 'netMargin', label: 'Net Margin %', category: 'fundamentals', visible: false },
  { id: 'roce', label: 'ROCE %', category: 'fundamentals', visible: true },
  { id: 'debtToEquity', label: 'Debt / Equity', category: 'fundamentals', visible: false },
];

export class ColumnModal {
  private overlay: HTMLElement;
  private columns: ColumnDef[];
  private onUpdate: (columns: ColumnDef[]) => void;

  constructor(onUpdate: (columns: ColumnDef[]) => void) {
    this.columns = this.loadColumns();
    this.onUpdate = onUpdate;
    this.overlay = this.createModalDOM();
    document.body.appendChild(this.overlay);
  }

  private loadColumns(): ColumnDef[] {
    try {
      const saved = localStorage.getItem('honba_visible_columns_v1');
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
      localStorage.setItem('honba_visible_columns_v1', JSON.stringify(visibleIds));
    } catch {
      // Ignore
    }
  }

  private createModalDOM(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'column-customizer-modal';

    overlay.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="modal-title">Customize Table Columns</div>
          <button class="nav-icon-btn modal-close-btn" style="border:none;">✕</button>
        </div>
        <div class="modal-body">
          <div style="font-size: 11px; color: var(--text-muted);">
            Select which metrics and indicators to display in the screener table:
          </div>
          <div class="columns-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
            ${this.columns
              .map(
                (col) => `
              <label class="checkbox-item">
                <input type="checkbox" data-col-id="${col.id}" ${col.visible ? 'checked' : ''} ${col.id === 'symbol' ? 'disabled' : ''}/>
                <span style="font-size: 12px;">${col.label}</span>
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

    // Listeners
    overlay.querySelector('.modal-close-btn')?.addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    overlay.querySelector('.reset-columns-btn')?.addEventListener('click', () => {
      this.columns = ALL_COLUMNS.map((c) => ({ ...c }));
      this.refreshCheckboxes();
      this.saveColumns();
      this.onUpdate(this.columns);
    });

    overlay.querySelector('.apply-columns-btn')?.addEventListener('click', () => {
      const inputs = overlay.querySelectorAll<HTMLInputElement>('input[data-col-id]');
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

    return overlay;
  }

  private refreshCheckboxes() {
    this.columns.forEach((c) => {
      const el = this.overlay.querySelector<HTMLInputElement>(`input[data-col-id="${c.id}"]`);
      if (el) el.checked = c.visible;
    });
  }

  public open() {
    this.refreshCheckboxes();
    this.overlay.classList.add('open');
  }

  public close() {
    this.overlay.classList.remove('open');
  }

  public getColumns(): ColumnDef[] {
    return this.columns;
  }
}
