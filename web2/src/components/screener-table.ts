/**
 * TradingView Screener Table Component
 * Exact replica of TradingView's screener table:
 * Company avatar badges, sticky header & sticky symbol column, right-justified numbers,
 * 52W range bars, gradient sparklines, live tick flash animations, and row selection.
 */

import { Instrument } from '../core/market-data';
import { dataLayer } from '../core/data-layer';
import { ColumnDef } from './column-modal';

export type SortField = keyof Instrument | 'range52';
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

  private onOpenColumnsModal?: () => void;

  constructor(
    container: HTMLElement,
    floatingActionBar: HTMLElement,
    columns: ColumnDef[],
    onSelectSymbol: (symbol: string) => void,
    onOpenColumnsModal?: () => void
  ) {
    this.container = container;
    this.floatingActionBar = floatingActionBar;
    this.columns = columns;
    this.onSelectSymbol = onSelectSymbol;
    this.onOpenColumnsModal = onOpenColumnsModal;

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
      if (this.sortField === 'range52') {
        const pctA = (a.price - a.low52) / (a.high52 - a.low52 || 1);
        const pctB = (b.price - b.low52) / (b.high52 - b.low52 || 1);
        return this.sortOrder === 'asc' ? pctA - pctB : pctB - pctA;
      }

      const valA = a[this.sortField as keyof Instrument];
      const valB = b[this.sortField as keyof Instrument];

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
        const changePctCell = row.querySelector<HTMLElement>('.cell-change-pct');
        const changePtsCell = row.querySelector<HTMLElement>('.cell-change-pts');

        const market = dataLayer.getCurrentMarketInfo();

        if (priceCell) {
          priceCell.innerHTML = `${this.formatNumber(tick.price)} <span class="currency-unit">${market.currency}</span>`;
          priceCell.classList.remove('tick-flash-up', 'tick-flash-down');
          void priceCell.offsetWidth; // trigger reflow
          priceCell.classList.add(tick.change >= 0 ? 'tick-flash-up' : 'tick-flash-down');
        }

        if (changePctCell) {
          const isUp = tick.changePercent >= 0;
          const sign = isUp ? '+' : '';
          changePctCell.textContent = `${sign}${tick.changePercent.toFixed(2)}%`;
          changePctCell.className = `cell-change-pct num ${isUp ? 'val-up' : 'val-down'}`;
        }

        if (changePtsCell) {
          const isUp = tick.change >= 0;
          const sign = isUp ? '+' : '';
          changePtsCell.textContent = `${sign}${this.formatNumber(tick.change)}`;
          changePtsCell.className = `cell-change-pts num ${isUp ? 'val-up' : 'val-down'}`;
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
        <div class="table-empty-view">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <div style="font-size: 13px; font-weight: 600; color: var(--text-primary);">No Instruments Found</div>
          <div style="font-size: 11px; color: var(--text-muted);">Try adjusting your filter criteria or search terms</div>
        </div>
      `;
      return;
    }

    const allSelected =
      this.instruments.length > 0 &&
      this.instruments.every((i) => activeState.shortlistedSymbols.includes(i.symbol));

    let html = `
      <table class="screener-table tv-screener-table">
        <thead>
          <tr>
            <th class="col-symbol">
              <div class="th-content symbol-th-content">
                <input type="checkbox" id="master-checkbox" class="symbol-checkbox" ${allSelected ? 'checked' : ''} title="Select All"/>
                <div class="symbol-th-header-info">
                  <div class="symbol-th-label-row">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="th-search-icon">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <span>Symbol</span>
                  </div>
                  <span class="symbol-th-count">${this.instruments.length}</span>
                </div>
              </div>
            </th>
    `;

    visibleCols.forEach((col) => {
      if (col.id === 'symbol') return;
      const isSorted = this.sortField === col.id;
      const sortIcon = isSorted ? (this.sortOrder === 'asc' ? '↑' : '↓') : '';
      html += `
        <th class="sortable ${isSorted ? 'sorted' : ''}" data-col-id="${col.id}" title="Click to sort by ${col.label}">
          <div class="th-content">
            ${isSorted ? `<span class="th-sort-icon">${sortIcon}</span>` : ''}
            <span>${col.label}</span>
          </div>
        </th>
      `;
    });

    // Custom Column '+' Header
    html += `
        <th class="col-add-custom-th" title="Add / Customize Columns">
          <button class="th-add-col-btn" id="table-add-col-btn" title="Add Column">+</button>
        </th>
      </tr>
    </thead>
    <tbody>
    `;

    this.instruments.forEach((inst, index) => {
      const isSelected = activeState.shortlistedSymbols.includes(inst.symbol);
      const isWatchlisted = activeState.watchlist.includes(inst.symbol);
      const isActive = activeState.activeSymbol === inst.symbol;
      const isUp = inst.changePercent >= 0;
      const sign = isUp ? '+' : '';
      const avatarColor = this.getAvatarColor(inst.symbol, index);

      html += `
        <tr data-symbol="${inst.symbol}" class="${isActive ? 'active-row' : ''}">
          <td class="col-symbol">
            <div class="symbol-cell">
              <input type="checkbox" class="symbol-checkbox row-select-checkbox" data-symbol="${inst.symbol}" ${isSelected ? 'checked' : ''} />
              <button class="star-btn ${isWatchlisted ? 'active' : ''}" data-symbol="${inst.symbol}" title="${isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist'}">
                ${isWatchlisted ? '★' : '☆'}
              </button>
              <div class="company-avatar" style="background: ${avatarColor};">
                ${inst.symbol.slice(0, 3)}
              </div>
              <div class="symbol-badge-box">
                <div class="ticker-line">
                  <span class="symbol-ticker">${inst.symbol}</span>
                  <span class="symbol-name" title="${inst.name}">${inst.name}</span>
                  ${inst.dividendYield > 0 ? `<span class="dividend-tag" title="Dividend Payer (${inst.dividendYield.toFixed(2)}%)">D</span>` : ''}
                </div>
              </div>
            </div>
          </td>
      `;

      visibleCols.forEach((col) => {
        if (col.id === 'symbol') return;
        html += this.renderTableCell(col.id, inst, market.currency, isUp, sign);
      });

      // Quick row menu dots
      html += `
          <td class="col-action" style="text-align: center;">
            <button class="row-menu-btn" data-symbol="${inst.symbol}" title="Actions">•••</button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    this.container.innerHTML = html;

    this.attachTableListeners();
  }

  private renderTableCell(
    colId: string,
    inst: Instrument,
    currencyCode: string,
    isUp: boolean,
    sign: string
  ): string {
    switch (colId) {
      case 'price':
        return `<td class="cell-price num" style="font-weight: 600;">${this.formatNumber(inst.price)} <span class="currency-unit">${currencyCode}</span></td>`;
      case 'changePercent':
        return `<td class="cell-change-pct num ${isUp ? 'val-up' : 'val-down'}">${sign}${inst.changePercent.toFixed(2)}%</td>`;
      case 'change':
        return `<td class="cell-change-pts num ${isUp ? 'val-up' : 'val-down'}">${sign}${this.formatNumber(inst.change)}</td>`;
      case 'volume':
        return `<td class="num val-neutral">${this.formatCompact(inst.volume)}</td>`;
      case 'avgVolume30d':
        return `<td class="num val-neutral">${this.formatCompact(inst.avgVolume30d)}</td>`;
      case 'range52':
        return `<td>${this.render52WeekMiniBar(inst)}</td>`;
      case 'sparkline':
        return `<td>${this.renderSparklineSvg(inst.sparkline, isUp, inst.symbol)}</td>`;
      case 'technicalRating': {
        const rating = inst.technicalRating;
        if (rating === 'Strong Buy') {
          return `<td><span class="tv-rating-badge rating-strong-buy"><span class="chevron">︽</span> Strong buy</span></td>`;
        } else if (rating === 'Buy') {
          return `<td><span class="tv-rating-badge rating-buy"><span class="chevron">︽</span> Buy</span></td>`;
        } else if (rating === 'Neutral') {
          return `<td><span class="tv-rating-badge rating-neutral"><span class="chevron">—</span> Neutral</span></td>`;
        } else if (rating === 'Sell') {
          return `<td><span class="tv-rating-badge rating-sell"><span class="chevron">︾</span> Sell</span></td>`;
        } else {
          return `<td><span class="tv-rating-badge rating-strong-sell"><span class="chevron">︾</span> Strong sell</span></td>`;
        }
      }
      case 'marketCap':
        return `<td class="num val-neutral">${this.formatCompact(inst.marketCap)} <span class="currency-unit">${currencyCode}</span></td>`;
      case 'pe':
        return `<td class="num val-neutral">${inst.pe ? inst.pe.toFixed(2) : '-'}</td>`;
      case 'forwardPe':
        return `<td class="num val-neutral">${inst.forwardPe ? inst.forwardPe.toFixed(2) : '-'}</td>`;
      case 'eps':
        return `<td class="num val-neutral">${inst.eps ? inst.eps.toFixed(2) : '-'} <span class="currency-unit">${currencyCode}</span></td>`;
      case 'pb':
        return `<td class="num val-neutral">${inst.pb ? inst.pb.toFixed(2) : '-'}</td>`;
      case 'dividendYield':
        return `<td class="num val-neutral">${inst.dividendYield ? inst.dividendYield.toFixed(2) + '%' : '0.00%'}</td>`;
      case 'high52':
        return `<td class="num val-neutral">${this.formatNumber(inst.high52)} <span class="currency-unit">${currencyCode}</span></td>`;
      case 'low52':
        return `<td class="num val-neutral">${this.formatNumber(inst.low52)} <span class="currency-unit">${currencyCode}</span></td>`;
      case 'rsi14':
        return `<td class="num" style="color: ${inst.rsi14 > 70 ? 'var(--bearish)' : inst.rsi14 < 35 ? 'var(--bullish)' : 'var(--text-primary)'};">${inst.rsi14.toFixed(1)}</td>`;
      case 'sma200':
        return `<td class="num val-neutral">${this.formatNumber(inst.sma200)} <span class="currency-unit">${currencyCode}</span></td>`;
      case 'perf1W':
        return `<td class="num ${inst.perf1W >= 0 ? 'val-up' : 'val-down'}">${inst.perf1W >= 0 ? '+' : ''}${inst.perf1W.toFixed(2)}%</td>`;
      case 'perf1M':
        return `<td class="num ${inst.perf1M >= 0 ? 'val-up' : 'val-down'}">${inst.perf1M >= 0 ? '+' : ''}${inst.perf1M.toFixed(2)}%</td>`;
      case 'perf1Y':
        return `<td class="num ${inst.perf1Y >= 0 ? 'val-up' : 'val-down'}">${inst.perf1Y >= 0 ? '+' : ''}${inst.perf1Y.toFixed(2)}%</td>`;
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

  private render52WeekMiniBar(inst: Instrument): string {
    const min = inst.low52;
    const max = inst.high52;
    const curr = inst.price;
    const range = max - min || 1;
    const pct = Math.max(0, Math.min(100, ((curr - min) / range) * 100));

    return `
      <div class="mini-52w-track" title="52W Low: ${inst.low52} | Current: ${inst.price} | 52W High: ${inst.high52}">
        <div class="mini-52w-fill" style="width: ${pct}%;"></div>
        <div class="mini-52w-pip" style="left: ${pct}%;"></div>
      </div>
    `;
  }

  private renderSparklineSvg(points: number[], isUp: boolean, symbol: string): string {
    if (!points || points.length < 2) return '';
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const w = 74;
    const h = 22;

    const pathData = points
      .map((val, idx) => {
        const x = (idx / (points.length - 1)) * w;
        const y = h - ((val - min) / range) * (h - 6) - 3;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');

    const strokeColor = isUp ? 'var(--bullish)' : 'var(--bearish)';
    const gradId = `sparkGrad_${symbol}`;
    const areaData = `${pathData} L ${w} ${h} L 0 ${h} Z`;

    return `
      <svg width="${w}" height="${h}" class="sparkline-svg">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <path d="${areaData}" fill="url(#${gradId})" />
        <path d="${pathData}" fill="none" stroke="${strokeColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
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

    // Add Column Button in Header
    this.container.querySelector('#table-add-col-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpenColumnsModal?.();
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

    // Row click -> Selects active symbol and opens detail drawer
    this.container.querySelectorAll('tbody tr').forEach((row) => {
      row.addEventListener('click', (e) => {
        // Prevent click if clicking menu dots
        if ((e.target as HTMLElement).closest('.row-menu-btn')) return;
        const symbol = row.getAttribute('data-symbol');
        if (symbol) {
          dataLayer.setActiveSymbol(symbol);
          this.onSelectSymbol(symbol);
          this.render();
        }
      });
    });

    // Row menu button (Quick action context menu)
    this.container.querySelectorAll('.row-menu-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const symbol = btn.getAttribute('data-symbol');
        if (symbol) {
          this.showRowContextMenu(e as MouseEvent, symbol);
        }
      });
    });
  }

  private showRowContextMenu(e: MouseEvent, symbol: string) {
    const existing = document.getElementById('row-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'row-context-menu';
    menu.className = 'honba-dropdown-menu row-context-dropdown';
    menu.style.position = 'fixed';
    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${Math.min(window.innerWidth - 200, e.clientX)}px`;
    menu.style.display = 'flex';
    menu.style.zIndex = '3000';

    menu.innerHTML = `
      <div class="app-menu-header">${symbol} Actions</div>
      <div class="market-item" id="ctx-workbench">
        <span>Open in WorkBench ↗</span>
      </div>
      <div class="market-item" id="ctx-sim">
        <span>Simulate Strategy</span>
      </div>
      <div class="market-item" id="ctx-algo">
        <span>Algo Designer</span>
      </div>
      <div class="market-item" id="ctx-watchlist">
        <span>Toggle Watchlist ★</span>
      </div>
      <div class="market-item" id="ctx-copy">
        <span>Copy Ticker</span>
      </div>
    `;

    document.body.appendChild(menu);

    menu.querySelector('#ctx-workbench')?.addEventListener('click', () => {
      window.location.href = `/workbench.html?symbol=${encodeURIComponent(symbol)}`;
    });

    menu.querySelector('#ctx-sim')?.addEventListener('click', () => {
      window.location.href = `/simulator.html?symbol=${encodeURIComponent(symbol)}`;
    });

    menu.querySelector('#ctx-algo')?.addEventListener('click', () => {
      window.location.href = `/algodesigner.html?symbol=${encodeURIComponent(symbol)}`;
    });

    menu.querySelector('#ctx-watchlist')?.addEventListener('click', () => {
      dataLayer.toggleWatchlist(symbol);
      this.render();
      menu.remove();
    });

    menu.querySelector('#ctx-copy')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(symbol);
      menu.remove();
    });

    const closeHandler = () => {
      menu.remove();
      document.removeEventListener('click', closeHandler);
    };
    setTimeout(() => {
      document.addEventListener('click', closeHandler);
    }, 10);
  }

  private setupFloatingActionBarListeners() {
    this.floatingActionBar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="shortlist-count-badge" id="bar-selected-count">0</span>
        <span style="font-size: 12px; font-weight: 600;">Selected</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button class="shortlist-btn shortlist-btn-primary" id="bar-open-workbench-btn">
          <span>Open in WorkBench</span>
          <span>↗</span>
        </button>
        <button class="shortlist-btn shortlist-btn-secondary" id="bar-open-sim-btn">
          <span>Simulate</span>
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

  private getAvatarColor(symbol: string, index: number): string {
    const colors = [
      '#2962ff',
      '#089981',
      '#7b1fa2',
      '#e65100',
      '#00838f',
      '#d81b60',
      '#1565c0',
      '#2e7d32',
      '#c2185b',
      '#0277bd',
    ];
    let hash = index;
    for (let i = 0; i < symbol.length; i++) {
      hash = (hash << 5) - hash + symbol.charCodeAt(i);
    }
    return colors[Math.abs(hash) % colors.length];
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
