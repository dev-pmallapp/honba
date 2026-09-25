import React, { useState, useMemo, useRef } from 'react';
import { useScreenerStore } from '../../../core/store/use-screener-store';
import { useLayoutStore } from '../../../layouts/use-layout-store';
import { dataLayer } from '../../../core/data-layer';
import { Instrument } from '../../../core/market-data';
import { TechnicalsGauge } from '../../ui/technicals-gauge';
import {
  X,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  TrendingUp,
  TrendingDown,
  Play,
} from 'lucide-react';

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function createRng(seed: number): () => number {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function generateCandles(inst: Instrument, range: '1D' | '5D' | '1M' | '1Y'): CandleData[] {
  const rng = createRng(hashString(`${inst.symbol}_${range}`));
  const currentPrice = inst.price;
  const candles: CandleData[] = [];
  const now = new Date();

  if (range === '1D') {
    const count = 26;
    const isUp = inst.changePercent >= 0;
    const dayDelta = inst.change;
    const startPrice = Number((currentPrice - dayDelta).toFixed(2));
    let prevClose = startPrice;

    for (let i = 0; i < count; i++) {
      const progress = i / (count - 1);
      const totalMinutes = 9 * 60 + 15 + i * 15;
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

      const expected = startPrice + dayDelta * progress;
      const noise = (rng() - 0.49) * (currentPrice * 0.005);
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
      const timeStr = `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

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
    // 1Y
    const count = 36;
    const pct = (inst.perf1Y ?? ((inst.high52 - inst.low52) / (inst.low52 || 1)) * 50) / 100;
    const startPrice = Number((currentPrice / (1 + pct)).toFixed(2));
    const totalDelta = currentPrice - startPrice;
    let prevClose = startPrice;

    for (let i = 0; i < count; i++) {
      const progress = i / (count - 1);
      const d = new Date(now);
      d.setDate(d.getDate() - (count - 1 - i) * 7);
      const timeStr = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });

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

export const SymbolDetailDrawer: React.FC = () => {
  const isDrawerOpen = useLayoutStore((state) => state.isDrawerOpen);
  const setDrawerOpen = useLayoutStore((state) => state.setDrawerOpen);
  const activeSymbol = useScreenerStore((state) => state.activeSymbol);
  const instruments = useScreenerStore((state) => state.instruments);
  const shortlistedSymbols = useScreenerStore((state) => state.shortlistedSymbols);
  const toggleShortlist = useScreenerStore((state) => state.toggleShortlist);

  const [chartRange, setChartRange] = useState<'1D' | '5D' | '1M' | '1Y'>('1D');
  const [chartMode, setChartMode] = useState<'area' | 'candles'>('candles');

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartBoxRef = useRef<HTMLDivElement>(null);

  const inst = useMemo(() => {
    return (
      instruments.find((i) => i.symbol === activeSymbol) ||
      dataLayer.getInstrument(activeSymbol) ||
      instruments[0] ||
      dataLayer.getInstruments()[0]
    );
  }, [instruments, activeSymbol]);

  if (!isDrawerOpen) return null;

  if (!inst) {
    return (
      <aside className="detail-drawer" id="detail-drawer">
        <div className="drawer-empty-state" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
          <div style={{ fontSize: 32 }}>📊</div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>No Symbol Selected</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 220 }}>
            Click on any stock row in the screener table to inspect charts, technical gauges, and statistics.
          </div>
        </div>
      </aside>
    );
  }

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

  // Candles data
  const candles = useMemo(() => {
    return generateCandles(inst, chartRange);
  }, [inst, chartRange]);

  const minPrice = useMemo(() => Math.min(...candles.map((c) => c.low)), [candles]);
  const maxPrice = useMemo(() => Math.max(...candles.map((c) => c.high)), [candles]);
  const priceRange = maxPrice - minPrice || 1;

  // Range performance metrics
  const rangePerf = useMemo(() => {
    if (!candles || candles.length === 0) return { changeVal: 0, changePct: 0, isUp: true };
    const firstClose = candles[0].open;
    const lastClose = candles[candles.length - 1].close;
    const changeVal = lastClose - firstClose;
    const changePct = firstClose !== 0 ? (changeVal / firstClose) * 100 : 0;
    return {
      changeVal,
      changePct,
      isUp: changeVal >= 0,
    };
  }, [candles]);

  // Chart dimensions in SVG coordinates
  const svgWidth = 380;
  const svgHeight = 135;
  const paddingX = 12;
  const paddingY = 14;
  const chartW = svgWidth - paddingX * 2;
  const chartH = svgHeight - paddingY * 2;

  // Path data for Area chart mode
  const linePath = useMemo(() => {
    return candles
      .map((c, idx) => {
        const x = paddingX + (idx / (candles.length - 1)) * chartW;
        const y = paddingY + chartH - ((c.close - minPrice) / priceRange) * chartH;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [candles, minPrice, priceRange, chartW, chartH, paddingX, paddingY]);

  const areaPath = `${linePath} L ${(paddingX + chartW).toFixed(1)} ${(svgHeight - paddingY).toFixed(1)} L ${paddingX} ${(svgHeight - paddingY).toFixed(1)} Z`;
  const strokeColor = rangePerf.isUp ? 'var(--bullish)' : 'var(--bearish)';
  const gradId = `drawerChartGrad_${inst.symbol}_${chartRange}`;

  // Interactive mouse handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartBoxRef.current || candles.length === 0) return;
    const rect = chartBoxRef.current.getBoundingClientRect();
    const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const fraction = relX / rect.width;
    const idx = Math.min(candles.length - 1, Math.max(0, Math.round(fraction * (candles.length - 1))));
    setHoverIndex(idx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activeCandle = hoverIndex !== null ? candles[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? paddingX + (hoverIndex / (candles.length - 1)) * chartW : null;
  const hoverY =
    activeCandle !== null
      ? paddingY + chartH - ((activeCandle.close - minPrice) / priceRange) * chartH
      : null;

  // Range calculation based on selected chart timeline (1D, 5D, 1M, 1Y)
  const rangeData = useMemo(() => {
    let title = '52-Week Range';
    let min = inst.low52;
    let max = inst.high52;

    if (chartRange === '1D') {
      title = "Day's Range";
      min = minPrice;
      max = maxPrice;
    } else if (chartRange === '5D') {
      title = '5-Day Range';
      min = minPrice;
      max = maxPrice;
    } else if (chartRange === '1M') {
      title = '1-Month Range';
      min = minPrice;
      max = maxPrice;
    } else {
      title = '52-Week Range';
      min = inst.low52 ? Math.min(inst.low52, minPrice) : minPrice;
      max = inst.high52 ? Math.max(inst.high52, maxPrice) : maxPrice;
    }

    const effectiveMin = Math.min(min, inst.price);
    const effectiveMax = Math.max(max, inst.price);
    const delta = effectiveMax - effectiveMin || 1;
    const pct = Math.max(0, Math.min(100, ((inst.price - effectiveMin) / delta) * 100));

    return {
      title,
      min: effectiveMin,
      max: effectiveMax,
      pct,
    };
  }, [chartRange, minPrice, maxPrice, inst.low52, inst.high52, inst.price]);

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
        <div className="drawer-header-left">
          <div className="drawer-logo-avatar" style={{ backgroundColor: avatarBg }}>
            {inst.symbol.slice(0, 3)}
          </div>
          <div className="drawer-title-box">
            <div className="drawer-ticker-row">
              <span className="drawer-ticker">{inst.symbol}</span>
              <span className="drawer-exchange-tag">{inst.exchange}</span>
              <span className="drawer-country-flag">{market.flag}</span>
            </div>
            <div className="drawer-company-name" title={inst.name}>{inst.name}</div>
          </div>
        </div>

        <div className="drawer-header-actions">
          <button
            className={`drawer-action-btn star-btn ${isShortlisted ? 'active' : ''}`}
            onClick={() => toggleShortlist(inst.symbol)}
            title={isShortlisted ? 'Remove from Shortlist' : 'Add to Shortlist'}
          >
            {isShortlisted ? <BookmarkCheck size={14} color="var(--primary)" /> : <Bookmark size={14} />}
          </button>
          <a
            href={`/workbench.html?symbol=${encodeURIComponent(inst.symbol)}`}
            className="drawer-action-btn"
            title="Open in WorkBench Terminal"
          >
            <ExternalLink size={14} />
          </a>
          <button
            className="drawer-action-btn"
            onClick={() => setDrawerOpen(false)}
            title="Close Panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="drawer-scroll-body">
        {/* Real-Time Quote Banner */}
        <div className="drawer-quote-banner">
          <div className="drawer-quote-price">
            {market.currencySymbol}{formatNumber(inst.price)}
          </div>
          <div className={`drawer-quote-change ${isUp ? 'val-up' : 'val-down'}`}>
            <span className={`badge-pill ${isUp ? 'pill-bullish' : 'pill-bearish'}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {isUp ? <TrendingUp size={11} style={{ marginRight: 3 }} /> : <TrendingDown size={11} style={{ marginRight: 3 }} />}
              {isUp ? '+' : ''}{formatNumber(inst.change)} ({isUp ? '+' : ''}{inst.changePercent.toFixed(2)}%)
            </span>
          </div>
          <div className="drawer-quote-sub">
            <span>Vol: {formatCompact(inst.volume)}</span>
            <span>•</span>
            <span>Day: {market.currencySymbol}{formatNumber(inst.low52 * 1.01)} - {market.currencySymbol}{formatNumber(inst.high52 * 0.99)}</span>
          </div>
        </div>

        {/* Primary Action Buttons (Top) */}
        <div className="drawer-action-top-group">
          <a
            href={`/workbench.html?symbol=${encodeURIComponent(inst.symbol)}`}
            className="shortlist-btn shortlist-btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '7px 12px', fontSize: 12, textDecoration: 'none' }}
          >
            <span>Open in WorkBench</span>
            <ExternalLink size={12} style={{ marginLeft: 4 }} />
          </a>
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <a
              href={`/simulator.html?symbol=${encodeURIComponent(inst.symbol)}`}
              className="shortlist-btn shortlist-btn-secondary"
              style={{ flex: 1, justifyContent: 'center', padding: '5px 8px', textDecoration: 'none', fontSize: 11 }}
            >
              <Play size={11} style={{ marginRight: 4 }} />
              Simulate
            </a>
            <a
              href={`/simulator.html?symbol=${encodeURIComponent(inst.symbol)}&mode=algo`}
              className="shortlist-btn shortlist-btn-secondary"
              style={{ flex: 1, justifyContent: 'center', padding: '5px 8px', textDecoration: 'none', fontSize: 11 }}
            >
              Algo Test
            </a>
          </div>
        </div>

        {/* Interactive Chart Preview Section */}
        <div className="drawer-section">
          <div className="drawer-section-header">
            <div className="drawer-section-title">Chart Preview</div>
            <div className="drawer-chart-controls">
              <div className="drawer-chart-type-toggle">
                <button
                  className={`chart-toggle-btn ${chartMode === 'area' ? 'active' : ''}`}
                  onClick={() => setChartMode('area')}
                  title="Area Chart"
                >
                  📈
                </button>
                <button
                  className={`chart-toggle-btn ${chartMode === 'candles' ? 'active' : ''}`}
                  onClick={() => setChartMode('candles')}
                  title="Candlestick Chart"
                >
                  🕯️
                </button>
              </div>
              <div className="drawer-range-pills">
                {(['1D', '5D', '1M', '1Y'] as const).map((r) => (
                  <button
                    key={r}
                    className={`range-pill ${chartRange === r ? 'active' : ''}`}
                    onClick={() => {
                      setChartRange(r);
                      setHoverIndex(null);
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Chart Meta Row */}
          <div className="drawer-chart-meta-row">
            <div className="drawer-chart-meta-left">
              <span className={`drawer-chart-meta-change ${rangePerf.isUp ? 'val-up' : 'val-down'}`}>
                {rangePerf.isUp ? '+' : ''}{formatNumber(rangePerf.changeVal)} ({rangePerf.isUp ? '+' : ''}{rangePerf.changePct.toFixed(2)}%)
              </span>
            </div>
            <div className="drawer-chart-meta-scale">
              <span>L: {market.currencySymbol}{formatNumber(minPrice)}</span>
              <span>H: {market.currencySymbol}{formatNumber(maxPrice)}</span>
            </div>
          </div>

          {/* Chart Canvas Box */}
          <div
            className="drawer-chart-container"
            ref={chartBoxRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ width: '100%', boxSizing: 'border-box' }}
          >
            {/* Hover Tooltip Badge */}
            {activeCandle && (
              <div
                className="chart-tooltip-badge"
                style={{
                  display: 'block',
                  position: 'absolute',
                  top: 8,
                  left: 10,
                  zIndex: 10,
                }}
              >
                {activeCandle.time} • {market.currencySymbol}{formatNumber(activeCandle.close)}
              </div>
            )}

            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="mini-chart-svg" style={{ width: '100%', height: 135 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity="0.32" />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Midline Guide */}
              <line
                x1={paddingX}
                y1={paddingY + chartH / 2}
                x2={svgWidth - paddingX}
                y2={paddingY + chartH / 2}
                stroke="var(--border-subtle)"
                strokeDasharray="3,3"
                opacity="0.6"
              />

              {/* High and Low Axis Labels */}
              <text
                x={svgWidth - paddingX}
                y={paddingY + 9}
                textAnchor="end"
                fill="var(--text-muted)"
                fontSize="8.5"
                fontFamily="var(--font-family-mono)"
                opacity="0.85"
              >
                {market.currencySymbol}{formatNumber(maxPrice)}
              </text>
              <text
                x={svgWidth - paddingX}
                y={svgHeight - paddingY - 2}
                textAnchor="end"
                fill="var(--text-muted)"
                fontSize="8.5"
                fontFamily="var(--font-family-mono)"
                opacity="0.85"
              >
                {market.currencySymbol}{formatNumber(minPrice)}
              </text>

              {/* Candlestick Chart Mode */}
              {chartMode === 'candles' && (
                <g>
                  {candles.map((c, i) => {
                    const x = paddingX + (i / (candles.length - 1)) * chartW;
                    const yOpen = paddingY + chartH - ((c.open - minPrice) / priceRange) * chartH;
                    const yClose = paddingY + chartH - ((c.close - minPrice) / priceRange) * chartH;
                    const yHigh = paddingY + chartH - ((c.high - minPrice) / priceRange) * chartH;
                    const yLow = paddingY + chartH - ((c.low - minPrice) / priceRange) * chartH;
                    const candleUp = c.close >= c.open;
                    const cColor = candleUp ? 'var(--bullish)' : 'var(--bearish)';
                    const candleWidth = Math.max(2, Math.min(8, Math.floor(chartW / candles.length) - 2));
                    const top = Math.min(yOpen, yClose);
                    const height = Math.max(2, Math.abs(yClose - yOpen));

                    return (
                      <g key={i}>
                        {/* Wick */}
                        <line
                          x1={x.toFixed(1)}
                          y1={yHigh.toFixed(1)}
                          x2={x.toFixed(1)}
                          y2={yLow.toFixed(1)}
                          stroke={cColor}
                          strokeWidth="1"
                        />
                        {/* Body */}
                        <rect
                          x={(x - candleWidth / 2).toFixed(1)}
                          y={top.toFixed(1)}
                          width={candleWidth}
                          height={height.toFixed(1)}
                          fill={cColor}
                          rx="1"
                        />
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Area Chart Mode */}
              {chartMode === 'area' && (
                <g>
                  <path d={areaPath} fill={`url(#${gradId})`} />
                  <path
                    d={linePath}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              )}

              {/* Interactive Crosshair & Dot */}
              {hoverX !== null && hoverY !== null && (
                <g pointerEvents="none">
                  <line
                    x1={hoverX.toFixed(1)}
                    y1={paddingY}
                    x2={hoverX.toFixed(1)}
                    y2={svgHeight - paddingY}
                    stroke="var(--text-muted)"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                  />
                  <circle
                    cx={hoverX.toFixed(1)}
                    cy={hoverY.toFixed(1)}
                    r="4"
                    fill={strokeColor}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                </g>
              )}
            </svg>
          </div>
        </div>

        {/* Dynamic Range Bar based on chart timeline (1D, 5D, 1M, 1Y) */}
        <div className="drawer-section">
          <div className="drawer-section-header">
            <div className="drawer-section-title">{rangeData.title}</div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
              {chartRange}
            </span>
          </div>
          <div className="range52-wrapper">
            <div className="range52-endpoints">
              <span className="range-endpoint">
                <span className="range-tag range-tag-low">LOW</span>
                <span>{market.currencySymbol}{formatNumber(rangeData.min)}</span>
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Current: {market.currencySymbol}{formatNumber(inst.price)}
              </span>
              <span className="range-endpoint">
                <span className="range-tag range-tag-high">HIGH</span>
                <span>{market.currencySymbol}{formatNumber(rangeData.max)}</span>
              </span>
            </div>
            <div className="range52-track">
              <div className="range52-fill" style={{ width: `${rangeData.pct}%` }} />
              <div className="range52-pip" style={{ left: `${rangeData.pct}%` }} />
            </div>
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

            <div className="indicators-breakdown-row" style={{ marginTop: 12, width: '100%' }}>
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

export const HbSymbolDetailDrawer = SymbolDetailDrawer;

