/**
 * TradingView Symbol Detail & Technical Analysis Drawer
 * Exact replica of TradingView's right-hand detail pane with mini candlestick/area chart,
 * technical rating speedometer gauge, performance bars, and key statistics.
 */

import { Instrument, CandleData } from '../core/market-data';
import { dataLayer } from '../core/data-layer';

export type ChartRange = '1D' | '5D' | '1M' | '1Y';

export class SymbolDetailDrawer {
  private container: HTMLElement;
  private currentInstrument: Instrument | null = null;
  private isCollapsed: boolean = false;
  private chartMode: 'area' | 'candles' = 'area';
  private chartRange: ChartRange = '1D';
  private onToggleCollapse?: (collapsed: boolean) => void;
  private rangeCandleCache: Map<string, CandleData[]> = new Map();

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
        this.updateChartOnTick(tick.price);
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

  private updateChartOnTick(newPrice: number) {
    if (!this.currentInstrument) return;
    const cacheKey = `${this.currentInstrument.symbol}_${this.chartRange}`;
    const cached = this.rangeCandleCache.get(cacheKey);
    if (cached && cached.length > 0) {
      const last = cached[cached.length - 1];
      last.close = newPrice;
      last.high = Math.max(last.high, newPrice);
      last.low = Math.min(last.low, newPrice);
    }
    const metaBox = this.container.querySelector('#drawer-chart-meta');
    if (metaBox) {
      metaBox.innerHTML = this.renderChartMeta(this.currentInstrument);
    }
    const chartBox = this.container.querySelector('#drawer-chart-box');
    if (chartBox) {
      chartBox.innerHTML = this.renderChartSvg(this.currentInstrument);
      this.attachChartInteractions();
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
          <!-- Primary Action Buttons (Top) -->
          <div class="drawer-action-top-group">
            <button class="shortlist-btn shortlist-btn-primary" id="drawer-btn-workbench" style="width: 100%; justify-content: center; padding: 7px 12px; font-size: 12px;">
              <span>Open in WorkBench</span>
              <span style="font-size: 11px;">↗</span>
            </button>
            <div style="display: flex; gap: 8px; width: 100%;">
              <button class="shortlist-btn shortlist-btn-secondary" id="drawer-btn-sim" style="flex: 1; justify-content: center; padding: 5px 8px;">
                Simulate
              </button>
              <button class="shortlist-btn shortlist-btn-secondary" id="drawer-btn-algo" style="flex: 1; justify-content: center; padding: 5px 8px;">
                Algo Test
              </button>
            </div>
          </div>

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

            <!-- Chart Range Performance Subtitle -->
            <div class="drawer-chart-meta-row" id="drawer-chart-meta">
              ${this.renderChartMeta(inst)}
            </div>

            <!-- Chart Canvas / Visual Container -->
            <div class="drawer-chart-container" id="drawer-chart-box">
              ${this.renderChartSvg(inst)}
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

          <!-- Range Bar -->
          <div class="drawer-section" id="drawer-range-section">
            <div class="drawer-section-header">
              <div class="drawer-section-title" id="drawer-range-title">${this.getRangeTitle(this.chartRange)}</div>
            </div>
            <div id="drawer-range-container">
              ${this.render52WeekBar(inst, market.currencySymbol)}
            </div>
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
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  public setChartRange(range: ChartRange) {
    this.chartRange = range;
    this.container.querySelectorAll('.range-pill').forEach((btn) => {
      if (btn.getAttribute('data-range') === range) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (this.currentInstrument) {
      const metaBox = this.container.querySelector('#drawer-chart-meta');
      if (metaBox) {
        metaBox.innerHTML = this.renderChartMeta(this.currentInstrument);
      }
      const chartBox = this.container.querySelector('#drawer-chart-box');
      if (chartBox) {
        chartBox.innerHTML = this.renderChartSvg(this.currentInstrument);
        this.attachChartInteractions();
      }
      const rangeTitle = this.container.querySelector('#drawer-range-title');
      if (rangeTitle) {
        rangeTitle.textContent = this.getRangeTitle(range);
      }
      const rangeContainer = this.container.querySelector('#drawer-range-container');
      if (rangeContainer) {
        const market = dataLayer.getCurrentMarketInfo();
        rangeContainer.innerHTML = this.render52WeekBar(this.currentInstrument, market.currencySymbol, range);
      }
    }
  }

  public setChartMode(mode: 'area' | 'candles') {
    this.chartMode = mode;
    this.container.querySelectorAll('.chart-toggle-btn').forEach((btn) => {
      if (btn.getAttribute('data-chart-mode') === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (this.currentInstrument) {
      const chartBox = this.container.querySelector('#drawer-chart-box');
      if (chartBox) {
        chartBox.innerHTML = this.renderChartSvg(this.currentInstrument);
        this.attachChartInteractions();
      }
    }
  }

  private hashString(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    }
    return h >>> 0;
  }

  private createRng(seed: number): () => number {
    let s = seed;
    return function () {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private getCandlesForRange(inst: Instrument, range: ChartRange): CandleData[] {
    const cacheKey = `${inst.symbol}_${range}`;
    let cached = this.rangeCandleCache.get(cacheKey);
    if (cached && cached.length > 0) {
      const last = cached[cached.length - 1];
      last.close = inst.price;
      last.high = Math.max(last.high, inst.price);
      last.low = Math.min(last.low, inst.price);
      return cached;
    }

    const candles = this.generateRangeCandles(inst, range);
    this.rangeCandleCache.set(cacheKey, candles);
    return candles;
  }

  private generateRangeCandles(inst: Instrument, range: ChartRange): CandleData[] {
    const rng = this.createRng(this.hashString(`${inst.symbol}_${range}`));
    const now = new Date();
    const currentPrice = inst.price;
    const candles: CandleData[] = [];

    if (range === '1D') {
      // 26 intraday bars (every 15 min from 09:15 to 15:30)
      const count = 26;
      const startPrice = inst.change !== undefined ? Number((currentPrice - inst.change).toFixed(2)) : currentPrice * 0.99;
      const totalDelta = currentPrice - startPrice;

      let prevClose = startPrice;
      for (let i = 0; i < count; i++) {
        const progress = i / (count - 1);
        const totalMinutes = 9 * 60 + 15 + i * 15;
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

        const expected = startPrice + totalDelta * progress;
        const noiseScale = currentPrice * 0.005 * (1 - Math.pow(progress - 0.5, 2));
        const noise = (rng() - 0.49) * noiseScale;

        const open = Number(prevClose.toFixed(2));
        let close = i === count - 1 ? currentPrice : Number((expected + noise).toFixed(2));
        if (close <= 0) close = open * 0.99;

        const high = Number((Math.max(open, close) + rng() * currentPrice * 0.003).toFixed(2));
        const low = Number((Math.min(open, close) - rng() * currentPrice * 0.003).toFixed(2));
        const volume = Math.floor(15000 + rng() * 60000);

        candles.push({ time: timeStr, open, high, low, close, volume });
        prevClose = close;
      }
    } else if (range === '5D') {
      // 5 trading days, 5 bars per day = 25 bars
      const count = 25;
      const pct = (inst.perf1W ?? inst.changePercent * 2) / 100;
      const startPrice = Number((currentPrice / (1 + pct)).toFixed(2));
      const totalDelta = currentPrice - startPrice;

      let prevClose = startPrice;
      for (let i = 0; i < count; i++) {
        const progress = i / (count - 1);
        const dayOffset = 4 - Math.floor(i / 5);
        const d = new Date(now);
        d.setDate(d.getDate() - dayOffset);
        const sessionHour = 10 + (i % 5) * 1.2;
        const hourInt = Math.floor(sessionHour);
        const minInt = Math.floor((sessionHour - hourInt) * 60);
        const timeStr = `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${String(hourInt).padStart(2, '0')}:${String(minInt).padStart(2, '0')}`;

        const expected = startPrice + totalDelta * progress;
        const noise = (rng() - 0.49) * (currentPrice * 0.012) * Math.sin(progress * Math.PI);
        const open = Number(prevClose.toFixed(2));
        let close = i === count - 1 ? currentPrice : Number((expected + noise).toFixed(2));
        if (close <= 0) close = open * 0.98;

        const high = Number((Math.max(open, close) + rng() * currentPrice * 0.007).toFixed(2));
        const low = Number((Math.min(open, close) - rng() * currentPrice * 0.007).toFixed(2));
        const volume = Math.floor(40000 + rng() * 120000);

        candles.push({ time: timeStr, open, high, low, close, volume });
        prevClose = close;
      }
    } else if (range === '1M') {
      // 22 daily bars
      const count = 22;
      const pct = (inst.perf1M ?? inst.changePercent * 4) / 100;
      const startPrice = Number((currentPrice / (1 + pct)).toFixed(2));
      const totalDelta = currentPrice - startPrice;

      let prevClose = startPrice;
      for (let i = 0; i < count; i++) {
        const progress = i / (count - 1);
        const d = new Date(now);
        d.setDate(d.getDate() - Math.floor((count - 1 - i) * 1.35));
        const timeStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        const expected = startPrice + totalDelta * progress;
        const noise = (rng() - 0.48) * (currentPrice * 0.02) * Math.sin(progress * Math.PI);
        const open = Number(prevClose.toFixed(2));
        let close = i === count - 1 ? currentPrice : Number((expected + noise).toFixed(2));
        if (close <= 0) close = open * 0.97;

        const high = Number((Math.max(open, close) + rng() * currentPrice * 0.012).toFixed(2));
        const low = Number((Math.min(open, close) - rng() * currentPrice * 0.012).toFixed(2));
        const volume = Math.floor(100000 + rng() * 350000);

        candles.push({ time: timeStr, open, high, low, close, volume });
        prevClose = close;
      }
    } else {
      // '1Y' -> 36 weekly bars
      const count = 36;
      const pct = (inst.perf1Y ?? ((inst.high52 - inst.low52) / (inst.low52 || 1)) * 50) / 100;
      const startPrice = Number((currentPrice / (1 + pct)).toFixed(2));
      const totalDelta = currentPrice - startPrice;

      let prevClose = startPrice;
      for (let i = 0; i < count; i++) {
        const progress = i / (count - 1);
        const d = new Date(now);
        d.setDate(d.getDate() - (count - 1 - i) * 7);
        const timeStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });

        const expected = startPrice + totalDelta * progress;
        const swing = Math.sin(progress * Math.PI * 1.5) * (inst.high52 - inst.low52) * 0.15;
        const noise = (rng() - 0.5) * (currentPrice * 0.035);
        const open = Number(prevClose.toFixed(2));
        let close = i === count - 1 ? currentPrice : Number((expected + swing + noise).toFixed(2));

        close = Math.max(inst.low52 * 0.98, Math.min(inst.high52 * 1.02, close));
        const high = Number((Math.max(open, close) + rng() * currentPrice * 0.018).toFixed(2));
        const low = Number((Math.min(open, close) - rng() * currentPrice * 0.018).toFixed(2));
        const volume = Math.floor(250000 + rng() * 800000);

        candles.push({ time: timeStr, open, high, low, close, volume });
        prevClose = close;
      }
    }

    return candles;
  }

  private getRangePerformance(inst: Instrument, range: ChartRange): {
    changePct: number;
    changeVal: number;
    isUp: boolean;
    low: number;
    high: number;
  } {
    const candles = this.getCandlesForRange(inst, range);
    const low = Math.min(...candles.map((c) => c.low));
    const high = Math.max(...candles.map((c) => c.high));

    let changePct: number;
    let changeVal: number;

    if (range === '1D') {
      changePct = inst.changePercent;
      changeVal = inst.change;
    } else if (range === '5D') {
      changePct = inst.perf1W ?? 0;
      const startPrice = inst.price / (1 + changePct / 100);
      changeVal = inst.price - startPrice;
    } else if (range === '1M') {
      changePct = inst.perf1M ?? 0;
      const startPrice = inst.price / (1 + changePct / 100);
      changeVal = inst.price - startPrice;
    } else {
      changePct = inst.perf1Y ?? 0;
      const startPrice = inst.price / (1 + changePct / 100);
      changeVal = inst.price - startPrice;
    }

    return {
      changePct,
      changeVal,
      isUp: changePct >= 0,
      low,
      high,
    };
  }

  private renderChartMeta(inst: Instrument): string {
    const market = dataLayer.getCurrentMarketInfo();
    const perf = this.getRangePerformance(inst, this.chartRange);
    const sign = perf.changePct >= 0 ? '+' : '';

    return `
      <div class="drawer-chart-meta-left">
        <span class="drawer-chart-meta-change ${perf.isUp ? 'val-up' : 'val-down'}">
          ${sign}${this.formatNumber(perf.changeVal)} (${sign}${perf.changePct.toFixed(2)}%)
        </span>
      </div>
      <div class="drawer-chart-meta-scale">
        <span>L: ${market.currencySymbol}${this.formatNumber(perf.low)}</span>
        <span>H: ${market.currencySymbol}${this.formatNumber(perf.high)}</span>
      </div>
    `;
  }

  private renderChartSvg(inst: Instrument): string {
    const candles = this.getCandlesForRange(inst, this.chartRange);
    if (!candles || candles.length === 0) {
      return `<div style="height: 125px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 11px;">No historical candles available</div>`;
    }

    const market = dataLayer.getCurrentMarketInfo();
    const perf = this.getRangePerformance(inst, this.chartRange);
    const isUp = perf.isUp;
    const color = isUp ? 'var(--bullish)' : 'var(--bearish)';
    const gradId = `chartGrad_${inst.symbol}_${this.chartRange}`;

    const w = 310;
    const h = 125;
    const paddingX = 10;
    const paddingY = 12;
    const chartW = w - paddingX * 2;
    const chartH = h - paddingY * 2;

    const min = Math.min(...candles.map((c) => c.low));
    const max = Math.max(...candles.map((c) => c.high));
    const range = max - min || 1;
    const prices = candles.map((c) => c.close);

    let chartContent = '';

    if (this.chartMode === 'candles') {
      const candleWidth = Math.max(2, Math.min(8, Math.floor(chartW / candles.length) - 2));
      const elements: string[] = [];

      candles.forEach((c, i) => {
        const x = paddingX + (i / (candles.length - 1)) * chartW;
        const yOpen = paddingY + chartH - ((c.open - min) / range) * chartH;
        const yClose = paddingY + chartH - ((c.close - min) / range) * chartH;
        const yHigh = paddingY + chartH - ((c.high - min) / range) * chartH;
        const yLow = paddingY + chartH - ((c.low - min) / range) * chartH;
        const candleIsUp = c.close >= c.open;
        const candleColor = candleIsUp ? 'var(--bullish)' : 'var(--bearish)';

        // Wick
        elements.push(`<line x1="${x.toFixed(1)}" y1="${yHigh.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yLow.toFixed(1)}" stroke="${candleColor}" stroke-width="1"/>`);
        // Body
        const top = Math.min(yOpen, yClose);
        const height = Math.max(2, Math.abs(yClose - yOpen));
        elements.push(`<rect x="${(x - candleWidth / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${candleWidth}" height="${height.toFixed(1)}" fill="${candleColor}" rx="1"/>`);
      });

      chartContent = elements.join('');
    } else {
      // Area Chart mode
      const pathPoints = prices.map((p, idx) => {
        const x = paddingX + (idx / (prices.length - 1)) * chartW;
        const y = paddingY + chartH - ((p - min) / range) * chartH;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      });

      const linePath = pathPoints.join(' ');
      const areaPath = `${linePath} L ${(paddingX + chartW).toFixed(1)} ${(h - paddingY).toFixed(1)} L ${paddingX} ${(h - paddingY).toFixed(1)} Z`;

      chartContent = `
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.32"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#${gradId})"/>
        <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    }

    return `
      <div id="chart-tooltip-badge" class="chart-tooltip-badge"></div>
      <svg viewBox="0 0 ${w} ${h}" class="mini-chart-svg">
        <!-- Midline guide -->
        <line x1="${paddingX}" y1="${paddingY + chartH / 2}" x2="${w - paddingX}" y2="${paddingY + chartH / 2}" stroke="var(--border-subtle)" stroke-dasharray="3,3" opacity="0.6"/>
        
        <!-- High and Low Labels -->
        <text x="${w - paddingX}" y="${paddingY + 8}" text-anchor="end" fill="var(--text-muted)" font-size="8.5" font-family="var(--font-family-mono)" opacity="0.8">${market.currencySymbol}${this.formatNumber(max)}</text>
        <text x="${w - paddingX}" y="${h - paddingY - 2}" text-anchor="end" fill="var(--text-muted)" font-size="8.5" font-family="var(--font-family-mono)" opacity="0.8">${market.currencySymbol}${this.formatNumber(min)}</text>

        <!-- Chart visual -->
        ${chartContent}

        <!-- Interactive Crosshair -->
        <line id="svg-crosshair-line" x1="0" y1="${paddingY}" x2="0" y2="${h - paddingY}" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="2,2" style="display: none; pointer-events: none;" />
        <circle id="svg-crosshair-dot" cx="0" cy="0" r="3.5" fill="${color}" stroke="#ffffff" stroke-width="1.5" style="display: none; pointer-events: none;" />
      </svg>
    `;
  }

  private getRangeTitle(range: ChartRange): string {
    switch (range) {
      case '1D':
        return "Day's Range";
      case '5D':
        return '5-Day Range';
      case '1M':
        return '1-Month Range';
      case '1Y':
      default:
        return '52-Week Range';
    }
  }

  private render52WeekBar(inst: Instrument, currency: string, range: ChartRange = this.chartRange): string {
    const candles = this.getCandlesForRange(inst, range);
    const minPrice = Math.min(...candles.map((c) => c.low));
    const maxPrice = Math.max(...candles.map((c) => c.high));

    let min = inst.low52;
    let max = inst.high52;
    if (range === '1D' || range === '5D' || range === '1M') {
      min = minPrice;
      max = maxPrice;
    } else {
      min = inst.low52 ? Math.min(inst.low52, minPrice) : minPrice;
      max = inst.high52 ? Math.max(inst.high52, maxPrice) : maxPrice;
    }

    const effectiveMin = Math.min(min, inst.price);
    const effectiveMax = Math.max(max, inst.price);
    const curr = inst.price;
    const rDelta = effectiveMax - effectiveMin || 1;
    const pct = Math.max(0, Math.min(100, ((curr - effectiveMin) / rDelta) * 100));

    return `
      <div class="range52-wrapper">
        <div class="range52-endpoints">
          <span class="range-endpoint">
            <span class="range-tag range-tag-low">LOW</span>
            <span>${currency}${this.formatNumber(effectiveMin)}</span>
          </span>
          <span style="font-size: 10px; color: var(--text-muted);">Current: ${currency}${this.formatNumber(curr)}</span>
          <span class="range-endpoint">
            <span class="range-tag range-tag-high">HIGH</span>
            <span>${currency}${this.formatNumber(effectiveMax)}</span>
          </span>
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

  private attachChartInteractions() {
    const box = this.container.querySelector('#drawer-chart-box') as HTMLElement;
    if (!box || !this.currentInstrument) return;

    const crosshairLine = box.querySelector('#svg-crosshair-line') as SVGLineElement;
    const crosshairDot = box.querySelector('#svg-crosshair-dot') as SVGCircleElement;
    const tooltip = box.querySelector('#chart-tooltip-badge') as HTMLElement;
    const svg = box.querySelector('.mini-chart-svg') as SVGSVGElement;

    if (!crosshairLine || !crosshairDot || !tooltip || !svg) return;

    const candles = this.getCandlesForRange(this.currentInstrument, this.chartRange);
    if (!candles || candles.length === 0) return;

    const market = dataLayer.getCurrentMarketInfo();
    const w = 310;
    const h = 125;
    const paddingX = 10;
    const paddingY = 12;
    const chartW = w - paddingX * 2;
    const chartH = h - paddingY * 2;
    const min = Math.min(...candles.map((c) => c.low));
    const max = Math.max(...candles.map((c) => c.high));
    const range = max - min || 1;

    box.onmousemove = (e: MouseEvent) => {
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const normalizedX = (mouseX / rect.width) * w;

      const ratio = Math.max(0, Math.min(1, (normalizedX - paddingX) / chartW));
      const idx = Math.round(ratio * (candles.length - 1));
      const c = candles[idx];
      if (!c) return;

      const candleX = paddingX + (idx / (candles.length - 1)) * chartW;
      const candleY = paddingY + chartH - ((c.close - min) / range) * chartH;

      crosshairLine.setAttribute('x1', candleX.toFixed(1));
      crosshairLine.setAttribute('x2', candleX.toFixed(1));
      crosshairLine.style.display = 'block';

      crosshairDot.setAttribute('cx', candleX.toFixed(1));
      crosshairDot.setAttribute('cy', candleY.toFixed(1));
      crosshairDot.style.display = 'block';

      tooltip.style.display = 'block';
      tooltip.textContent = `${c.time} • ${market.currencySymbol}${this.formatNumber(c.close)}`;
    };

    box.onmouseleave = () => {
      crosshairLine.style.display = 'none';
      crosshairDot.style.display = 'none';
      tooltip.style.display = 'none';
    };
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
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = btn.getAttribute('data-chart-mode') as 'area' | 'candles';
        if (mode && mode !== this.chartMode) {
          this.setChartMode(mode);
        }
      });
    });

    // Chart range pills
    this.container.querySelectorAll('.range-pill').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const range = btn.getAttribute('data-range') as ChartRange;
        if (range && range !== this.chartRange) {
          this.setChartRange(range);
        }
      });
    });

    // WorkBench Navigation (Header button & Main action button)
    this.container.querySelector('#drawer-workbench-btn')?.addEventListener('click', () => {
      if (this.currentInstrument) {
        window.location.href = `/workbench.html?symbol=${encodeURIComponent(this.currentInstrument.symbol)}`;
      }
    });

    this.container.querySelector('#drawer-btn-workbench')?.addEventListener('click', () => {
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

    // Attach interactive chart crosshairs
    this.attachChartInteractions();
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
