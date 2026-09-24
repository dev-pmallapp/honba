import React, { useState, useMemo } from 'react';
import { useScreenerStore } from '../../../core/store/use-screener-store';
import { dataLayer } from '../../../core/data-layer';
import { TechnicalsGauge } from '../../ui/technicals-gauge';
import {
  X,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

export const SymbolDetailDrawer: React.FC = () => {
  const isOpen = useScreenerStore((state) => state.detailDrawerOpen);
  const setOpen = useScreenerStore((state) => state.setDetailDrawerOpen);
  const activeSymbol = useScreenerStore((state) => state.activeSymbol);
  const shortlistedSymbols = useScreenerStore((state) => state.shortlistedSymbols);
  const toggleShortlist = useScreenerStore((state) => state.toggleShortlist);

  const [chartRange, setChartRange] = useState<'1D' | '5D' | '1M' | '1Y'>('1D');
  const [chartMode, setChartMode] = useState<'area' | 'candles'>('area');

  const inst = useMemo(() => {
    return dataLayer.getInstrument(activeSymbol) || dataLayer.getInstruments()[0];
  }, [activeSymbol]);

  if (!isOpen || !inst) return null;

  const market = dataLayer.getCurrentMarketInfo();
  const isShortlisted = shortlistedSymbols.includes(inst.symbol);
  const isUp = inst.changePercent >= 0;

  const formatNumber = (num: number, decimals: number = 2): string => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatCompact = (num: number): string => {
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e7) return (num / 1e7).toFixed(2) + 'Cr';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return String(num);
  };

  // Generate synthetic chart data
  const chartData = useMemo(() => {
    const points: number[] = [];
    const base = inst.price * (isUp ? 0.98 : 1.02);
    const count = chartRange === '1D' ? 24 : chartRange === '5D' ? 30 : 40;
    let curr = base;
    for (let i = 0; i < count; i++) {
      const progress = i / (count - 1);
      const trend = (inst.price - base) * progress;
      const noise = (Math.sin(i * 1.5) * 0.005) * inst.price;
      curr = base + trend + noise;
      points.push(curr);
    }
    points[points.length - 1] = inst.price;
    return points;
  }, [inst, chartRange, isUp]);

  const minPrice = Math.min(...chartData);
  const maxPrice = Math.max(...chartData);
  const priceRange = maxPrice - minPrice || 1;
  const w = 310;
  const h = 120;
  const paddingX = 8;
  const paddingY = 10;
  const chartW = w - paddingX * 2;
  const chartH = h - paddingY * 2;

  const linePath = chartData
    .map((val, idx) => {
      const x = paddingX + (idx / (chartData.length - 1)) * chartW;
      const y = paddingY + chartH - ((val - minPrice) / priceRange) * chartH;
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const areaPath = `${linePath} L ${(paddingX + chartW).toFixed(1)} ${(h - paddingY).toFixed(1)} L ${paddingX} ${(h - paddingY).toFixed(1)} Z`;
  const strokeColor = isUp ? 'var(--bullish)' : 'var(--bearish)';
  const gradId = `drawerChartGrad_${inst.symbol}`;

  const renderPerfRow = (label: string, val?: number) => {
    if (val === undefined || val === null) return null;
    const isRowUp = val >= 0;
    const absVal = Math.min(100, Math.abs(val) * 2.5);

    return (
      <div className="perf-row" key={label}>
        <div className="perf-row-label">{label}</div>
        <div className="perf-bar-track">
          <div
            className={`perf-bar-fill ${isRowUp ? 'bg-up' : 'bg-down'}`}
            style={{ width: `${Math.max(4, absVal)}%` }}
          />
        </div>
        <div className={`perf-row-val ${isRowUp ? 'val-up' : 'val-down'}`}>
          {isRowUp ? '+' : ''}{val.toFixed(2)}%
        </div>
      </div>
    );
  };

  const avatarBg = ['#2962ff', '#089981', '#7b1fa2', '#f57c00', '#0097a7', '#455a64'][
    inst.symbol.charCodeAt(0) % 6
  ];

  return (
    <aside className="detail-drawer" id="detail-drawer">
      {/* Header */}
      <div className="drawer-header">
        <div className="drawer-company-row">
          <div className="company-avatar" style={{ backgroundColor: avatarBg }}>
            {inst.symbol.slice(0, 2)}
          </div>
          <div>
            <div className="drawer-symbol-title">
              <span>{inst.symbol}</span>
              <span className="symbol-exch-badge">{inst.exchange}</span>
            </div>
            <div className="drawer-company-sub">{inst.name}</div>
          </div>
        </div>

        <div className="drawer-actions-row">
          <button
            className={`nav-icon-btn ${isShortlisted ? 'active' : ''}`}
            onClick={() => toggleShortlist(inst.symbol)}
            title={isShortlisted ? 'Remove from Shortlist' : 'Add to Shortlist'}
          >
            {isShortlisted ? <BookmarkCheck size={14} color="var(--primary)" /> : <Bookmark size={14} />}
          </button>
          <a
            href={`/workbench.html?symbol=${encodeURIComponent(inst.symbol)}`}
            className="nav-icon-btn"
            title="Open in WorkBench Terminal"
          >
            <ExternalLink size={14} />
          </a>
          <button
            className="nav-icon-btn"
            onClick={() => setOpen(false)}
            title="Close Drawer"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="drawer-scroll-body">
        {/* Price & Change Banner */}
        <div className="drawer-price-card">
          <div className="drawer-price-val">
            {market.currencySymbol}{formatNumber(inst.price)}
          </div>
          <div className="drawer-change-row">
            <span className={`badge-pill ${isUp ? 'pill-bullish' : 'pill-bearish'}`}>
              {isUp ? <TrendingUp size={11} style={{ marginRight: 3 }} /> : <TrendingDown size={11} style={{ marginRight: 3 }} />}
              {isUp ? '+' : ''}{inst.changePercent.toFixed(2)}% ({isUp ? '+' : ''}{formatNumber(inst.change)})
            </span>
            <span className="drawer-vol-sub">Vol: {formatCompact(inst.volume)}</span>
          </div>
        </div>

        {/* Mini Chart Section */}
        <div className="drawer-section">
          <div className="drawer-section-header">
            <div className="drawer-section-title">Overview Chart</div>
            <div className="range-pills-row">
              {(['1D', '5D', '1M', '1Y'] as const).map((r) => (
                <button
                  key={r}
                  className={`range-pill ${chartRange === r ? 'active' : ''}`}
                  onClick={() => setChartRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="drawer-chart-container">
            <svg viewBox={`0 0 ${w} ${h}`} className="mini-chart-svg">
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity="0.32" />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill={`url(#${gradId})`} />
              <path
                d={linePath}
                fill="none"
                stroke={strokeColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line
                x1={paddingX}
                y1={paddingY + chartH / 2}
                x2={w - paddingX}
                y2={paddingY + chartH / 2}
                stroke="var(--border-subtle)"
                strokeDasharray="3,3"
                opacity="0.6"
              />
            </svg>
          </div>
        </div>

        {/* Technical Rating Speedometer Gauge */}
        <div className="drawer-section">
          <div className="drawer-section-header">
            <div className="drawer-section-title">Technical Analysis</div>
            <span className={`rating-pill rating-${inst.technicalRating.toLowerCase().replace(' ', '-')}`}>
              {inst.technicalRating}
            </span>
          </div>

          <div className="gauge-card">
            <TechnicalsGauge rating={inst.technicalRating} />

            <div className="indicators-breakdown-row" style={{ marginTop: 12 }}>
              <div className="indicator-group-card">
                <div className="ind-title">Oscillators</div>
                <div className="ind-badge-row">
                  <span className="ind-count ind-sell">{inst.rsi14 > 70 ? 2 : 0} Sell</span>
                  <span className="ind-count ind-neutral">{inst.rsi14 >= 40 && inst.rsi14 <= 70 ? 8 : 4} Neutral</span>
                  <span className="ind-count ind-buy">{inst.rsi14 < 40 ? 3 : 1} Buy</span>
                </div>
              </div>

              <div className="indicator-group-card">
                <div className="ind-title">Moving Averages</div>
                <div className="ind-badge-row">
                  <span className="ind-count ind-sell">{inst.price < inst.sma200 ? 5 : 1} Sell</span>
                  <span className="ind-count ind-neutral">1 Neutral</span>
                  <span className="ind-count ind-buy">{inst.price >= inst.sma200 ? 9 : 4} Buy</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Key Statistics Grid */}
        <div className="drawer-section">
          <div className="drawer-section-header">
            <div className="drawer-section-title">Key Statistics</div>
          </div>
          <div className="stats-keyval-grid">
            <div className="stat-cell">
              <div className="stat-label">Market Cap</div>
              <div className="stat-value">{market.currencySymbol}{formatCompact(inst.marketCap)}</div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">P/E (TTM)</div>
              <div className="stat-value">{inst.pe ? inst.pe.toFixed(2) : '-'}</div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">Forward P/E</div>
              <div className="stat-value">{inst.forwardPe ? inst.forwardPe.toFixed(2) : '-'}</div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">Price to Book</div>
              <div className="stat-value">{inst.pb ? inst.pb.toFixed(2) : '-'}</div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">EPS (TTM)</div>
              <div className="stat-value">{market.currencySymbol}{inst.eps ? inst.eps.toFixed(2) : '-'}</div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">Dividend Yield</div>
              <div className="stat-value">{inst.dividendYield ? inst.dividendYield.toFixed(2) + '%' : '0.00%'}</div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">RSI (14)</div>
              <div className={`stat-value ${inst.rsi14 > 70 ? 'val-down' : inst.rsi14 < 35 ? 'val-up' : ''}`}>
                {inst.rsi14.toFixed(1)}
              </div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">200 SMA</div>
              <div className="stat-value">{market.currencySymbol}{formatNumber(inst.sma200)}</div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">ROCE %</div>
              <div className="stat-value">{inst.roce.toFixed(1)}%</div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">Debt / Equity</div>
              <div className="stat-value">{inst.debtToEquity.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Historical Performance */}
        <div className="drawer-section">
          <div className="drawer-section-header">
            <div className="drawer-section-title">Performance</div>
          </div>
          <div className="perf-bars-container">
            {renderPerfRow('1 Week', inst.perf1W)}
            {renderPerfRow('1 Month', inst.perf1M)}
            {renderPerfRow('3 Months', inst.perf3M)}
            {renderPerfRow('1 Year', inst.perf1Y)}
          </div>
        </div>
      </div>
    </aside>
  );
};
