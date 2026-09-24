/**
 * TradingView Symbol Detail & Technical Analysis Drawer
 * Exact replica of TradingView's right-hand detail pane with mini candlestick/area chart,
 * technical rating speedometer gauge, performance bars, and key statistics.
 */

import { Instrument, CandleData } from '../core/market-data';
import { dataLayer } from '../core/data-layer';

export class SymbolDetailDrawer {
  private container: HTMLElement;
  private currentInstrument: Instrument | null = null;
  private isCollapsed: boolean = false;
  private chartMode: 'area' | 'candles' = 'area';
  private chartRange: '1D' | '5D' | '1M' | '3M' | '1Y' | 'ALL' = '1M';
  private onToggleCollapse?: (collapsed: boolean) => void;

  constructor(container: HTMLElement, onToggleCollapse?: (collapsed: boolean) => void) {
    this.container = container;
    this.onToggleCollapse = onToggleCollapse;
    this.setupTickListener();
  }

  public setInstrument(inst: Instrument | null) {
    this.currentInstrument = inst;
    this.render();
  }

  public toggleCollapse(force?: boolean) {
    this.isCollapsed = force !== undefined ? force : !this.isCollapsed;
    if (this.isCollapsed) {
      this.container.classList.add('collapsed');
    } else {
      this.container.classList.remove('collapsed');
    }
    this.onToggleCollapse?.(this.isCollapsed);
  }

  public isDrawerCollapsed(): boolean {
    return this.isCollapsed;
  }

  private setupTickListener() {
    dataLayer.onTick((tick) => {
      if (this.currentInstrument && this.currentInstrument.symbol === tick.symbol) {
        this.currentInstrument.price = tick.price;
        this.currentInstrument.change = tick.change;
        this.currentInstrument.changePercent = tick.changePercent;
        this.updateLiveQuote();
      }
    });
  }

  private updateLiveQuote() {
    if (!this.currentInstrument) return;
    const priceEl = this.container.querySelector('.drawer-quote-price');
    const changeEl = this.container.querySelector('.drawer-quote-change');
    const currency = dataLayer.getCurrentMarketInfo().currencySymbol;

    if (priceEl) {
      priceEl.textContent = `${currency}${this.formatNumber(this.currentInstrument.price)}`;
    }
    if (changeEl) {
      const isUp = this.currentInstrument.changePercent >= 0;
      const sign = isUp ? '+' : '';
      changeEl.textContent = `${sign}${this.formatNumber(this.currentInstrument.change)} (${sign}${this.currentInstrument.changePercent.toFixed(2)}%)`;
      changeEl.className = `drawer-quote-change ${isUp ? 'val-up' : 'val-down'}`;
    }
  }

  public render() {
    if (!this.currentInstrument) {
      this.container.innerHTML = `
        <div class="drawer-empty-state">
          <div class="drawer-empty-icon">📊</div>
          <div style="font-weight: 600; font-size: 13px; color: var(--text-primary);">No Symbol Selected</div>
          <div style="font-size: 11px; color: var(--text-muted); text-align: center; max-width: 220px;">
            Click on any stock row in the screener to inspect charts, technical gauges, and statistics.
          </div>
        </div>
      `;
      return;
    }

    const inst = this.currentInstrument;
    const market = dataLayer.getCurrentMarketInfo();
    const isUp = inst.changePercent >= 0;
    const sign = isUp ? '+' : '';
    const isWatchlisted = dataLayer.getState().watchlist.includes(inst.symbol);

    // Calculate rating score for speedometer
    const ratingAngle = this.getRatingAngle(inst.technicalRating);

    this.container.innerHTML = `
      <div class="drawer-inner">
        <!-- Drawer Header -->
        <div class="drawer-header">
          <div class="drawer-header-left">
            <div class="drawer-logo-avatar">${inst.symbol.slice(0, 3)}</div>
            <div class="drawer-title-box">
              <div class="drawer-ticker-row">
                <span class="drawer-ticker">${inst.symbol}</span>
                <span class="drawer-exchange-tag">${inst.exchange}</span>
                <span class="drawer-country-flag">${market.flag}</span>
              </div>
              <div class="drawer-company-name" title="${inst.name}">${inst.name}</div>
            </div>
          </div>
          <div class="drawer-header-actions">
            <button class="drawer-action-btn star-btn ${isWatchlisted ? 'active' : ''}" id="drawer-star-btn" title="Add to Watchlist">
              ${isWatchlisted ? '★' : '☆'}
            </button>
            <button class="drawer-action-btn" id="drawer-workbench-btn" title="Open in WorkBench">
              ↗
            </button>
            <button class="drawer-action-btn" id="drawer-close-btn" title="Close Panel">
              ✕
            </button>
          </div>
        </div>

        <!-- Real-Time Quote Banner -->
        <div class="drawer-quote-banner">
          <div class="drawer-quote-price">${market.currencySymbol}${this.formatNumber(inst.price)}</div>
          <div class="drawer-quote-change ${isUp ? 'val-up' : 'val-down'}">
            ${sign}${this.formatNumber(inst.change)} (${sign}${inst.changePercent.toFixed(2)}%)
          </div>
          <div class="drawer-quote-sub">
            <span>Vol: ${this.formatCompact(inst.volume)}</span>
            <span>•</span>
            <span>Day Range: ${market.currencySymbol}${this.formatNumber(inst.low52 * 1.02)} - ${market.currencySymbol}${this.formatNumber(inst.high52 * 0.98)}</span>
          </div>
        </div>

        <!-- Scrollable Content Area -->
        <div class="drawer-scroll-body">
          <!-- Mini Interactive Chart Preview -->
          <div class="drawer-section">
            <div class="drawer-section-header">
              <div class="drawer-section-title">Chart Preview</div>
              <div class="drawer-chart-controls">
                <div class="drawer-chart-type-toggle">
                  <button class="chart-toggle-btn ${this.chartMode === 'area' ? 'active' : ''}" data-chart-mode="area" title="Area Chart">📈</button>
                  <button class="chart-toggle-btn ${this.chartMode === 'candles' ? 'active' : ''}" data-chart-mode="candles" title="Candlestick Chart">🕯️</button>
                </div>
                <div class="drawer-range-pills">
                  <button class="range-pill ${this.chartRange === '1D' ? 'active' : ''}" data-range="1D">1D</button>
                  <button class="range-pill ${this.chartRange === '5D' ? 'active' : ''}" data-range="5D">5D</button>
                  <button class="range-pill ${this.chartRange === '1M' ? 'active' : ''}" data-range="1M">1M</button>
                  <button class="range-pill ${this.chartRange === '1Y' ? 'active' : ''}" data-range="1Y">1Y</button>
                </div>
              </div>
            </div>

            <!-- Chart Canvas / Visual Container -->
            <div class="drawer-chart-container" id="drawer-chart-box">
              ${this.renderChartSvg(inst, isUp)}
            </div>
          </div>

          <!-- TradingView Technical Rating Speedometer Gauge -->
          <div class="drawer-section">
            <div class="drawer-section-header">
              <div class="drawer-section-title">Technical Analysis</div>
              <span class="rating-pill rating-${inst.technicalRating.toLowerCase().replace(' ', '-')}">${inst.technicalRating}</span>
            </div>

            <div class="gauge-card">
              <div class="speedometer-wrapper">
                <svg viewBox="0 0 200 110" class="speedometer-svg">
                  <!-- Speedometer Background Arcs -->
                  <!-- Strong Sell (Red) -->
                  <path d="M 20 100 A 80 80 0 0 1 45 43" fill="none" stroke="#f23645" stroke-width="12" stroke-linecap="round" />
                  <!-- Sell (Coral) -->
                  <path d="M 48 40 A 80 80 0 0 1 85 22" fill="none" stroke="#ff7987" stroke-width="12" />
                  <!-- Neutral (Gray) -->
                  <path d="M 88 21 A 80 80 0 0 1 112 21" fill="none" stroke="#787b86" stroke-width="12" />
                  <!-- Buy (Light Green) -->
                  <path d="M 115 22 A 80 80 0 0 1 152 40" fill="none" stroke="#26a69a" stroke-width="12" />
                  <!-- Strong Buy (Dark Green) -->
                  <path d="M 155 43 A 80 80 0 0 1 180 100" fill="none" stroke="#089981" stroke-width="12" stroke-linecap="round" />

                  <!-- Center Pivot and Needle -->
                  <g transform="rotate(${ratingAngle}, 100, 100)" class="speedometer-needle-group">
                    <line x1="100" y1="100" x2="100" y2="30" stroke="var(--text-primary)" stroke-width="3" stroke-linecap="round" />
                    <circle cx="100" cy="100" r="6" fill="var(--text-primary)" />
                  </g>
                </svg>

                <div class="gauge-labels-row">
                  <span style="color: #f23645;">Strong Sell</span>
                  <span style="color: #787b86;">Neutral</span>
                  <span style="color: #089981;">Strong Buy</span>
                </div>
              </div>

              <!-- Indicators breakdown pills -->
              <div class="indicators-breakdown-row">
                <div class="indicator-group-card">
                  <div class="ind-title">Oscillators</div>
                  <div class="ind-badge-row">
                    <span class="ind-count ind-sell">${inst.rsi14 > 70 ? 2 : 0} Sell</span>
                    <span class="ind-count ind-neutral">${inst.rsi14 >= 40 && inst.rsi14 <= 70 ? 8 : 4} Neutral</span>
                    <span class="ind-count ind-buy">${inst.rsi14 < 40 ? 3 : 1} Buy</span>
                  </div>
                </div>
                <div class="indicator-group-card">
                  <div class="ind-title">Moving Averages</div>
                  <div class="ind-badge-row">
                    <span class="ind-count ind-sell">${inst.price < inst.sma200 ? 5 : 1} Sell</span>
                    <span class="ind-count ind-neutral">1 Neutral</span>
                    <span class="ind-count ind-buy">${inst.price >= inst.sma200 ? 10 : 2} Buy</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 52-Week Range Bar -->
          <div class="drawer-section">
            <div class="drawer-section-header">
              <div class="drawer-section-title">52-Week Range</div>
            </div>
            ${this.render52WeekBar(inst, market.currencySymbol)}
          </div>

          <!-- Key Financials & Valuation -->
          <div class="drawer-section">
            <div class="drawer-section-header">
              <div class="drawer-section-title">Key Statistics</div>
            </div>
            <div class="stats-keyval-grid">
              <div class="stat-cell">
                <div class="stat-label">Market Cap</div>
                <div class="stat-value">${market.currencySymbol}${this.formatCompact(inst.marketCap)}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">P/E (TTM)</div>
                <div class="stat-value">${inst.pe ? inst.pe.toFixed(2) : '-'}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">Forward P/E</div>
                <div class="stat-value">${inst.forwardPe ? inst.forwardPe.toFixed(2) : '-'}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">Price to Book (P/B)</div>
                <div class="stat-value">${inst.pb ? inst.pb.toFixed(2) : '-'}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">EPS (TTM)</div>
                <div class="stat-value">${market.currencySymbol}${inst.eps ? inst.eps.toFixed(2) : '-'}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">Dividend Yield</div>
                <div class="stat-value">${inst.dividendYield ? inst.dividendYield.toFixed(2) + '%' : '0.00%'}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">RSI (14)</div>
                <div class="stat-value ${inst.rsi14 > 70 ? 'val-down' : inst.rsi14 < 35 ? 'val-up' : ''}">${inst.rsi14.toFixed(1)}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">200 SMA</div>
                <div class="stat-value">${market.currencySymbol}${this.formatNumber(inst.sma200)}</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">ROCE %</div>
                <div class="stat-value">${inst.roce.toFixed(1)}%</div>
              </div>
              <div class="stat-cell">
                <div class="stat-label">Debt / Equity</div>
                <div class="stat-value">${inst.debtToEquity.toFixed(2)}</div>
              </div>
            </div>
          </div>

          <!-- Historical Performance Bars -->
          <div class="drawer-section">
            <div class="drawer-section-header">
              <div class="drawer-section-title">Performance</div>
            </div>
            <div class="perf-bars-container">
              ${this.renderPerfRow('1 Week', inst.perf1W)}
              ${this.renderPerfRow('1 Month', inst.perf1M)}
              ${this.renderPerfRow('3 Months', inst.perf3M)}
              ${this.renderPerfRow('1 Year', inst.perf1Y)}
            </div>
          </div>

          <!-- Bottom Action Buttons -->
          <div class="drawer-action-footer">
            <button class="shortlist-btn shortlist-btn-primary" id="drawer-btn-superchart" style="width: 100%; justify-content: center;">
              <span>Open in Supercharts</span>
              <span>↗</span>
            </button>
            <div style="display: flex; gap: 8px; width: 100%;">
              <button class="shortlist-btn shortlist-btn-secondary" id="drawer-btn-sim" style="flex: 1; justify-content: center;">
                Simulate
              </button>
              <button class="shortlist-btn shortlist-btn-secondary" id="drawer-btn-algo" style="flex: 1; justify-content: center;">
                Algo Test
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private renderChartSvg(inst: Instrument, isUp: boolean): string {
    const candles: CandleData[] = inst.history && inst.history.length > 0 ? inst.history : [];
    if (candles.length === 0) {
      return `<div style="height: 140px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 11px;">No historical candles available</div>`;
    }

    const w = 310;
    const h = 130;
    const padding = 10;
    const chartW = w - padding * 2;
    const chartH = h - padding * 2;

    const prices = candles.map((c) => c.close);
    const min = Math.min(...candles.map((c) => c.low));
    const max = Math.max(...candles.map((c) => c.high));
    const range = max - min || 1;

    if (this.chartMode === 'candles') {
      const candleWidth = Math.max(2, Math.floor(chartW / candles.length) - 2);
      const elements: string[] = [];

      candles.forEach((c, i) => {
        const x = padding + (i / (candles.length - 1)) * chartW;
        const yOpen = padding + chartH - ((c.open - min) / range) * chartH;
        const yClose = padding + chartH - ((c.close - min) / range) * chartH;
        const yHigh = padding + chartH - ((c.high - min) / range) * chartH;
        const yLow = padding + chartH - ((c.low - min) / range) * chartH;
        const candleIsUp = c.close >= c.open;
        const color = candleIsUp ? 'var(--bullish)' : 'var(--bearish)';

        // Wick
        elements.push(`<line x1="${x}" y1="${yHigh}" x2="${x}" y2="${yLow}" stroke="${color}" stroke-width="1"/>`);
        // Body
        const top = Math.min(yOpen, yClose);
        const height = Math.max(2, Math.abs(yClose - yOpen));
        elements.push(`<rect x="${x - candleWidth / 2}" y="${top}" width="${candleWidth}" height="${height}" fill="${color}" rx="1"/>`);
      });

      return `
        <svg viewBox="0 0 ${w} ${h}" class="mini-chart-svg">
          <line x1="${padding}" y1="${padding + chartH / 2}" x2="${w - padding}" y2="${padding + chartH / 2}" stroke="var(--border-subtle)" stroke-dasharray="3,3"/>
          ${elements.join('')}
        </svg>
      `;
    }

    // Area Chart mode
    const pathPoints = prices.map((p, idx) => {
      const x = padding + (idx / (prices.length - 1)) * chartW;
      const y = padding + chartH - ((p - min) / range) * chartH;
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    });

    const linePath = pathPoints.join(' ');
    const areaPath = `${linePath} L ${w - padding} ${h - padding} L ${padding} ${h - padding} Z`;
    const color = isUp ? 'var(--bullish)' : 'var(--bearish)';
    const gradId = `chartGrad_${inst.symbol}`;

    return `
      <svg viewBox="0 0 ${w} ${h}" class="mini-chart-svg">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <line x1="${padding}" y1="${padding + chartH / 2}" x2="${w - padding}" y2="${padding + chartH / 2}" stroke="var(--border-subtle)" stroke-dasharray="3,3"/>
        <path d="${areaPath}" fill="url(#${gradId})"/>
        <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  }

  private render52WeekBar(inst: Instrument, currency: string): string {
    const min = inst.low52;
    const max = inst.high52;
    const curr = inst.price;
    const range = max - min || 1;
    const pct = Math.max(0, Math.min(100, ((curr - min) / range) * 100));

    return `
      <div class="range52-wrapper">
        <div class="range52-endpoints">
          <span>${currency}${this.formatNumber(min)}</span>
          <span style="font-size: 10px; color: var(--text-muted);">Current: ${currency}${this.formatNumber(curr)}</span>
          <span>${currency}${this.formatNumber(max)}</span>
        </div>
        <div class="range52-track">
          <div class="range52-fill" style="width: ${pct}%;"></div>
          <div class="range52-pip" style="left: ${pct}%;"></div>
        </div>
      </div>
    `;
  }

  private renderPerfRow(label: string, val: number): string {
    const isUp = val >= 0;
    const sign = isUp ? '+' : '';
    const absVal = Math.min(100, Math.abs(val) * 2.5); // visual scale

    return `
      <div class="perf-row">
        <div class="perf-row-label">${label}</div>
        <div class="perf-bar-track">
          <div class="perf-bar-fill ${isUp ? 'bg-up' : 'bg-down'}" style="width: ${absVal}%;"></div>
        </div>
        <div class="perf-row-val ${isUp ? 'val-up' : 'val-down'}">${sign}${val.toFixed(2)}%</div>
      </div>
    `;
  }

  private getRatingAngle(rating: string): number {
    switch (rating) {
      case 'Strong Sell':
        return -70;
      case 'Sell':
        return -35;
      case 'Neutral':
        return 0;
      case 'Buy':
        return 35;
      case 'Strong Buy':
        return 70;
      default:
        return 0;
    }
  }

  private attachEventListeners() {
    // Star Watchlist button
    this.container.querySelector('#drawer-star-btn')?.addEventListener('click', () => {
      if (this.currentInstrument) {
        dataLayer.toggleWatchlist(this.currentInstrument.symbol);
        this.render();
      }
    });

    // Close button
    this.container.querySelector('#drawer-close-btn')?.addEventListener('click', () => {
      this.toggleCollapse(true);
    });

    // Chart mode toggle
    this.container.querySelectorAll('.chart-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-chart-mode') as 'area' | 'candles';
        if (mode) {
          this.chartMode = mode;
          this.render();
        }
      });
    });

    // Chart range pills
    this.container.querySelectorAll('.range-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const range = btn.getAttribute('data-range') as typeof this.chartRange;
        if (range) {
          this.chartRange = range;
          this.render();
        }
      });
    });

    // WorkBench Navigation
    this.container.querySelector('#drawer-workbench-btn')?.addEventListener('click', () => {
      if (this.currentInstrument) {
        window.location.href = `/workbench.html?symbol=${encodeURIComponent(this.currentInstrument.symbol)}`;
      }
    });

    this.container.querySelector('#drawer-btn-superchart')?.addEventListener('click', () => {
      if (this.currentInstrument) {
        window.location.href = `/workbench.html?symbol=${encodeURIComponent(this.currentInstrument.symbol)}`;
      }
    });

    this.container.querySelector('#drawer-btn-sim')?.addEventListener('click', () => {
      if (this.currentInstrument) {
        window.location.href = `/simulator.html?symbol=${encodeURIComponent(this.currentInstrument.symbol)}`;
      }
    });

    this.container.querySelector('#drawer-btn-algo')?.addEventListener('click', () => {
      if (this.currentInstrument) {
        window.location.href = `/algodesigner.html?symbol=${encodeURIComponent(this.currentInstrument.symbol)}`;
      }
    });
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
}
