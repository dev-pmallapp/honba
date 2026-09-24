/**
 * Honba Screener Table Component
 * TradingView look-and-feel multi-column sortable table with sticky headers,
 * sparklines, tick animations, row shortlisting, and floating action bar.
 */

import { Instrument } from '../core/market-data';
import { dataLayer } from '../core/data-layer';
import { ColumnDef } from './column-modal';

export type SortField = keyof Instrument;
export type SortOrder = 'asc' | 'desc' | null;

export class ScreenerTable {
  private container: HTMLElement;
  private floatingActionBar: HTMLElement;
  private instruments: Instrument[] = [];
  private columns: ColumnDef[] = [];
  private sortField: SortField = 'marketCap';
  private sortOrder: SortOrder = 'desc';
  private onSelectSymbol: (symbol: string) => void;
  private unsubscribeTick: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    floatingActionBar: HTMLElement,
    columns: ColumnDef[],
    onSelectSymbol: (symbol: string) => void
  ) {
    this.container = container;
    this.floatingActionBar = floatingActionBar;
    this.columns = columns;
    this.onSelectSymbol = onSelectSymbol;

    this.setupTickListener();
    this.setupFloatingActionBarListeners();
  }

  public setColumns(columns: ColumnDef[]) {
    this.columns = columns;
    this.render();
  }

  public setData(instruments: Instrument[]) {
    this.instruments = [...instruments];
    this.sortData();
    this.render();
    this.updateFloatingActionBar();
  }

  private sortData() {
    if (!this.sortField || !this.sortOrder) return;
    this.instruments.sort((a, b) => {
      const valA = a[this.sortField];
      const valB = b[this.sortField];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return this.sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (typeof valA === 'number' && typeof valB === 'number') {
        return this.sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      return 0;
    });
  }

  private setupTickListener() {
    this.unsubscribeTick = dataLayer.onTick((tick) => {
      const row = this.container.querySelector<HTMLTableRowElement>(`tr[data-symbol="${tick.symbol}"]`);
      if (row) {
        const priceCell = row.querySelector<HTMLElement>('.cell-price');
        const changeCell = row.querySelector<HTMLElement>('.cell-change');

        if (priceCell) {
          const currencySymbol = dataLayer.getCurrentMarketInfo().currencySymbol;
          priceCell.textContent = `${currencySymbol}${this.formatNumber(tick.price)}`;
          priceCell.classList.remove('tick-flash-up', 'tick-flash-down');
          void priceCell.offsetWidth; // trigger reflow
          priceCell.classList.add(tick.change >= 0 ? 'tick-flash-up' : 'tick-flash-down');
        }

        if (changeCell) {
          const sign = tick.changePercent > 0 ? '+' : '';
          changeCell.textContent = `${sign}${tick.changePercent.toFixed(2)}%`;
          changeCell.className = `cell-change num ${tick.changePercent >= 0 ? 'val-up' : 'val-down'}`;
        }
      }
    });
  }

  public render() {
    const activeState = dataLayer.getState();
    const market = dataLayer.getCurrentMarketInfo();
    const visibleCols = this.columns.filter((c) => c.visible);

    if (this.instruments.length === 0) {
      this.container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); gap: 12px;">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <div style="font-size: 14px; font-weight: 500;">No instruments match the current filter criteria</div>
          <div style="font-size: 12px;">Try adjusting search terms or clearing sector filters</div>
        </div>
      `;
      return;
    }

    const allSelected = this.instruments.every((i) => activeState.shortlistedSymbols.includes(i.symbol));

    let html = `
      <table class="screener-table">
        <thead>
          <tr>
            <th class="col-symbol" style="width: 240px;">
              <div class="th-content">
                <input type="checkbox" id="master-checkbox" class="symbol-checkbox" ${allSelected ? 'checked' : ''} />
                <span>Symbol / Company</span>
              </div>
            </th>
    `;

    visibleCols.forEach((col) => {
      if (col.id === 'symbol') return;
      const isSorted = this.sortField === col.id;
      const sortIcon = isSorted ? (this.sortOrder === 'asc' ? '▲' : '▼') : '⇅';
      html += `
        <th class="sortable ${isSorted ? 'sorted' : ''}" data-col-id="${col.id}">
          <div class="th-content">
            <span>${col.label}</span>
            <span class="th-sort-icon">${sortIcon}</span>
          </div>
        </th>
      `;
    });

    html += `</tr></thead><tbody>`;

    this.instruments.forEach((inst) => {
      const isSelected = activeState.shortlistedSymbols.includes(inst.symbol);
      const isWatchlisted = activeState.watchlist.includes(inst.symbol);
      const isActive = activeState.activeSymbol === inst.symbol;
      const isUp = inst.changePercent >= 0;
      const sign = isUp ? '+' : '';

      html += `
        <tr data-symbol="${inst.symbol}" class="${isActive ? 'active-row' : ''}">
          <td class="col-symbol">
            <div class="symbol-cell">
              <input type="checkbox" class="symbol-checkbox row-select-checkbox" data-symbol="${inst.symbol}" ${isSelected ? 'checked' : ''} />
              <button class="star-btn ${isWatchlisted ? 'active' : ''}" data-symbol="${inst.symbol}" title="Add to Watchlist">★</button>
              <div class="symbol-badge-box">
                <span class="symbol-ticker">${inst.symbol}</span>
                <span class="symbol-name">${inst.name}</span>
              </div>
            </div>
          </td>
      `;

      visibleCols.forEach((col) => {
        if (col.id === 'symbol') return;
        html += this.renderTableCell(col.id, inst, market.currencySymbol, isUp, sign);
      });

      html += `</tr>`;
    });

    html += `</tbody></table>`;
    this.container.innerHTML = html;

    this.attachTableListeners();
  }

  private renderTableCell(
    colId: string,
    inst: Instrument,
    currencySymbol: string,
    isUp: boolean,
    sign: string
  ): string {
    switch (colId) {
      case 'price':
        return `<td class="cell-price num" style="font-weight: 600;">${currencySymbol}${this.formatNumber(inst.price)}</td>`;
      case 'changePercent':
        return `<td class="cell-change num ${isUp ? 'val-up' : 'val-down'}">${sign}${inst.changePercent.toFixed(2)}%</td>`;
      case 'volume':
        return `<td class="num val-neutral">${this.formatCompact(inst.volume)}</td>`;
      case 'sparkline':
        return `<td>${this.renderSparklineSvg(inst.sparkline, isUp)}</td>`;
      case 'marketCap':
        return `<td class="num val-neutral">${currencySymbol}${this.formatCompact(inst.marketCap)}</td>`;
      case 'pe':
        return `<td class="num val-neutral">${inst.pe ? inst.pe.toFixed(1) : '-'}</td>`;
      case 'forwardPe':
        return `<td class="num val-neutral">${inst.forwardPe ? inst.forwardPe.toFixed(1) : '-'}</td>`;
      case 'pb':
        return `<td class="num val-neutral">${inst.pb ? inst.pb.toFixed(2) : '-'}</td>`;
      case 'dividendYield':
        return `<td class="num val-neutral">${inst.dividendYield ? inst.dividendYield.toFixed(2) + '%' : '0.00%'}</td>`;
      case 'high52':
        return `<td class="num val-neutral">${currencySymbol}${this.formatNumber(inst.high52)}</td>`;
      case 'low52':
        return `<td class="num val-neutral">${currencySymbol}${this.formatNumber(inst.low52)}</td>`;
      case 'rsi14':
        return `<td class="num" style="color: ${inst.rsi14 > 70 ? 'var(--bearish)' : inst.rsi14 < 35 ? 'var(--bullish)' : 'var(--text-primary)'};">${inst.rsi14.toFixed(1)}</td>`;
      case 'sma200':
        return `<td class="num val-neutral">${currencySymbol}${this.formatNumber(inst.sma200)}</td>`;
      case 'technicalRating':
        return `<td><span class="rating-pill rating-${inst.technicalRating.toLowerCase().replace(' ', '-')}">${inst.technicalRating}</span></td>`;
      case 'revenueGrowth':
        return `<td class="num ${inst.revenueGrowth >= 0 ? 'val-up' : 'val-down'}">${inst.revenueGrowth >= 0 ? '+' : ''}${inst.revenueGrowth.toFixed(1)}%</td>`;
      case 'netMargin':
        return `<td class="num val-neutral">${inst.netMargin.toFixed(1)}%</td>`;
      case 'roce':
        return `<td class="num val-neutral">${inst.roce.toFixed(1)}%</td>`;
      case 'debtToEquity':
        return `<td class="num val-neutral">${inst.debtToEquity.toFixed(2)}</td>`;
      default:
        return `<td>-</td>`;
    }
  }

  private renderSparklineSvg(points: number[], isUp: boolean): string {
    if (!points || points.length < 2) return '';
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const w = 70;
    const h = 20;

    const pathData = points
      .map((val, idx) => {
        const x = (idx / (points.length - 1)) * w;
        const y = h - ((val - min) / range) * (h - 4) - 2;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');

    const lineClass = isUp ? 'sparkline-line-up' : 'sparkline-line-down';
    return `
      <svg width="${w}" height="${h}" class="sparkline-svg">
        <path d="${pathData}" class="${lineClass}" />
      </svg>
    `;
  }

  private attachTableListeners() {
    // Header sorting
    this.container.querySelectorAll('th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const colId = th.getAttribute('data-col-id') as SortField;
        if (this.sortField === colId) {
          this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortField = colId;
          this.sortOrder = 'desc';
        }
        this.sortData();
        this.render();
      });
    });

    // Master checkbox
    const masterCheckbox = this.container.querySelector<HTMLInputElement>('#master-checkbox');
    masterCheckbox?.addEventListener('change', () => {
      const allSymbols = this.instruments.map((i) => i.symbol);
      dataLayer.setAllShortlisted(allSymbols, masterCheckbox.checked);
      this.render();
      this.updateFloatingActionBar();
    });

    // Row selection checkbox
    this.container.querySelectorAll('.row-select-checkbox').forEach((cb) => {
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        const symbol = cb.getAttribute('data-symbol');
        if (symbol) {
          dataLayer.toggleShortlist(symbol);
          this.render();
          this.updateFloatingActionBar();
        }
      });
    });

    // Star watchlist button
    this.container.querySelectorAll('.star-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const symbol = btn.getAttribute('data-symbol');
        if (symbol) {
          dataLayer.toggleWatchlist(symbol);
          this.render();
        }
      });
    });

    // Row click
    this.container.querySelectorAll('tbody tr').forEach((row) => {
      row.addEventListener('click', () => {
        const symbol = row.getAttribute('data-symbol');
        if (symbol) {
          dataLayer.setActiveSymbol(symbol);
          this.onSelectSymbol(symbol);
          this.render();
        }
      });
    });
  }

  private setupFloatingActionBarListeners() {
    this.floatingActionBar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="shortlist-count-badge" id="bar-selected-count">0</span>
        <span style="font-size: 12px; font-weight: 600;">Instruments Shortlisted</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button class="shortlist-btn shortlist-btn-primary" id="bar-open-workbench-btn">
          <span>Open in WorkBench</span>
          <span>→</span>
        </button>
        <button class="shortlist-btn shortlist-btn-secondary" id="bar-open-sim-btn">
          <span>Simulate Strategy</span>
        </button>
        <button class="shortlist-btn shortlist-btn-secondary shortlist-btn-danger" id="bar-clear-btn">
          <span>Clear</span>
        </button>
      </div>
    `;

    this.floatingActionBar.querySelector('#bar-open-workbench-btn')?.addEventListener('click', () => {
      const symbols = dataLayer.getState().shortlistedSymbols;
      if (symbols.length > 0) {
        window.location.href = `/workbench.html?symbols=${encodeURIComponent(symbols.join(','))}`;
      }
    });

    this.floatingActionBar.querySelector('#bar-open-sim-btn')?.addEventListener('click', () => {
      const symbols = dataLayer.getState().shortlistedSymbols;
      const target = symbols.length > 0 ? symbols[0] : dataLayer.getState().activeSymbol;
      window.location.href = `/simulator.html?symbol=${encodeURIComponent(target)}`;
    });

    this.floatingActionBar.querySelector('#bar-clear-btn')?.addEventListener('click', () => {
      dataLayer.clearShortlist();
      this.render();
      this.updateFloatingActionBar();
    });
  }

  public updateFloatingActionBar() {
    const count = dataLayer.getState().shortlistedSymbols.length;
    const badge = this.floatingActionBar.querySelector('#bar-selected-count');
    if (badge) badge.textContent = String(count);

    if (count > 0) {
      this.floatingActionBar.classList.add('visible');
    } else {
      this.floatingActionBar.classList.remove('visible');
    }
  }

  private formatNumber(val: number): string {
    return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private formatCompact(num: number): string {
    if (!num) return '0';
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e7) return (num / 1e7).toFixed(2) + 'Cr';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
  }

  public destroy() {
    this.unsubscribeTick?.();
  }
}
