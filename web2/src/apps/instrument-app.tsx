import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';

import '../styles/theme.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/instrument.css';

import { themeEngine } from '../core/theme-engine';
import { dataLayer, InstrumentDetailResponse } from '../core/data-layer';
import { Instrument, CandleData, AssetType } from '../core/market-data';
import { AppNav } from '../layouts/app-nav';
import { TechnicalsGauge } from '../components/ui/technicals-gauge';
import {
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Search,
  Bookmark,
  BookmarkCheck,
  Share2,
  Play,
  Layers,
  PieChart,
  BarChart3,
  Calendar,
  DollarSign,
  Briefcase,
  ShieldCheck,
  CheckCircle2,
  Sliders,
  Cpu,
} from 'lucide-react';

export const InstrumentApp: React.FC = () => {
  // Read initial symbol from URL query or fallback
  const getUrlSymbol = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('symbol') || 'RELIANCE';
    }
    return 'RELIANCE';
  };

  const [activeSymbol, setActiveSymbol] = useState<string>(getUrlSymbol);
  const [detailData, setDetailData] = useState<InstrumentDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');
  const [timeframe, setTimeframe] = useState<string>('1M');
  const [hoverCandle, setHoverCandle] = useState<CandleData | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [priceFlash, setPriceFlash] = useState<'bullish' | 'bearish' | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [lotsCount, setLotsCount] = useState<number>(1);

  // Initialize theme
  useEffect(() => {
    themeEngine.applyToDOM();
  }, []);

  // Fetch instrument details whenever activeSymbol changes
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    dataLayer.fetchInstrumentDetail(activeSymbol).then((data) => {
      if (isMounted) {
        if (data) {
          setDetailData(data);
        }
        setIsLoading(false);
      }
    });

    // Update browser URL without full reload
    const newUrl = `${window.location.pathname}?symbol=${encodeURIComponent(activeSymbol)}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);

    return () => {
      isMounted = false;
    };
  }, [activeSymbol]);

  // Listen to live ticks from dataLayer / backend WebSocket
  useEffect(() => {
    const unsub = dataLayer.onTick((tick) => {
      if (tick.symbol.toUpperCase() === activeSymbol.toUpperCase()) {
        setDetailData((prev) => {
          if (!prev) return prev;
          const oldPrice = prev.instrument.price;
          const flash = tick.price >= oldPrice ? 'bullish' : 'bearish';
          setPriceFlash(flash);
          setTimeout(() => setPriceFlash(null), 600);

          return {
            ...prev,
            instrument: {
              ...prev.instrument,
              price: tick.price,
              change: tick.change,
              changePercent: tick.changePercent,
              volume: tick.volume !== undefined ? tick.volume : prev.instrument.volume,
            },
          };
        });
      }
    });

    return () => unsub();
  }, [activeSymbol]);

  const allInstruments = dataLayer.getAllInstruments();

  // Search filtered results for quick picker
  const filteredSearchList = useMemo(() => {
    if (!searchQuery.trim() && selectedCategory === 'all') return [];
    const q = searchQuery.toLowerCase().trim();
    return allInstruments
      .filter((inst) => {
        if (selectedCategory !== 'all') {
          if (selectedCategory === 'stocks' && inst.assetType !== 'stocks' && inst.assetType !== undefined) return false;
          if (selectedCategory !== 'stocks' && inst.assetType !== selectedCategory) return false;
        }
        if (!q) return true;
        return (
          inst.symbol.toLowerCase().includes(q) ||
          inst.name.toLowerCase().includes(q) ||
          inst.sector.toLowerCase().includes(q)
        );
      })
      .slice(0, 10);
  }, [allInstruments, searchQuery, selectedCategory]);

  const inst = detailData?.instrument || dataLayer.getInstrument(activeSymbol) || allInstruments[0];
  const isUp = inst ? inst.changePercent >= 0 : true;
  const isWatchlisted = inst ? dataLayer.isWatchlisted(inst.symbol) : false;

  const handleSelectSymbol = (sym: string) => {
    setActiveSymbol(sym.toUpperCase());
    setSearchQuery('');
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Format helpers
  const fmt = (n: number | undefined | null, decimals = 2) => {
    if (n === undefined || n === null || isNaN(n)) return '—';
    return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const fmtCompact = (n: number | undefined | null) => {
    if (n === undefined || n === null || isNaN(n)) return '—';
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
    return `₹${n.toFixed(0)}`;
  };

  // Determine tabs based on Asset Type
  const tabs = useMemo(() => {
    if (!inst) return ['overview'];
    const type = inst.assetType || 'stocks';
    if (type === 'index') {
      return ['overview', 'constituents', 'sectors', 'analytics'];
    }
    if (type === 'mf') {
      return ['overview', 'holdings', 'allocation', 'returns', 'facts'];
    }
    if (type === 'ipo') {
      return ['overview', 'gmp', 'subscription', 'timeline', 'calculator'];
    }
    return ['overview', 'technicals', 'financials', 'delivery', 'shareholding', 'peers'];
  }, [inst]);

  // Adjust activeTab if invalid for current asset type
  useEffect(() => {
    if (!tabs.includes(activeTab)) {
      setActiveTab('overview');
    }
  }, [tabs, activeTab]);

  const candles = detailData?.candles || inst?.history || [];

  return (
    <div className="inst-page-container">
      {/* Top Application Navigation */}
      <AppNav currentAppId="instrument" />

      {/* Category Switcher & Search Bar */}
      <div className="inst-top-toolbar">
        <div className="inst-category-pills">
          {[
            { id: 'all', label: 'All Assets' },
            { id: 'stocks', label: 'Equities (3,270+)' },
            { id: 'index', label: 'Indices' },
            { id: 'mf', label: 'Mutual Funds' },
            { id: 'ipo', label: 'IPOs & Listings' },
          ].map((cat) => (
            <button
              key={cat.id}
              className={`inst-cat-btn ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Real-time Ticker Search */}
        <div className="inst-search-wrapper">
          <Search size={14} className="inst-search-icon" />
          <input
            type="text"
            className="inst-search-input"
            placeholder="Search any ticker or company (e.g. RELIANCE, NIFTY50, PPFAS, SWIGGY)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {filteredSearchList.length > 0 && (
            <div className="inst-search-results-dropdown">
              {filteredSearchList.map((item) => (
                <div
                  key={item.symbol}
                  className="inst-search-item"
                  onClick={() => handleSelectSymbol(item.symbol)}
                >
                  <div className="inst-search-item-left">
                    <span className="inst-search-item-ticker">{item.symbol}</span>
                    <span className="inst-search-item-name">{item.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`inst-type-badge badge-${item.assetType || 'equity'}`}>
                      {item.assetType || 'EQUITY'}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-family-mono)',
                        fontSize: 12,
                        fontWeight: 600,
                        color: item.changePercent >= 0 ? 'var(--bullish)' : 'var(--bearish)',
                      }}
                    >
                      ₹{fmt(item.price)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Navigation Chips */}
      <div className="inst-quick-chips">
        <span className="inst-quick-chip-label">Quick Jump:</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>Equities:</span>
        {['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'TATAMOTORS', 'ITC'].map((s) => (
          <button
            key={s}
            className={`inst-chip-btn ${activeSymbol === s ? 'active' : ''}`}
            onClick={() => handleSelectSymbol(s)}
          >
            {s}
          </button>
        ))}
        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 8 }}>Indices:</span>
        {['NIFTY50', 'BANKNIFTY', 'NIFTYIT', 'SENSEX', 'SPX'].map((s) => (
          <button
            key={s}
            className={`inst-chip-btn ${activeSymbol === s ? 'active' : ''}`}
            onClick={() => handleSelectSymbol(s)}
          >
            {s}
          </button>
        ))}
        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 8 }}>Mutual Funds:</span>
        {['PPFAS_FLEXI', 'HDFC_MIDCAP', 'NIPPON_SMALLCAP', 'QUANT_ACTIVE'].map((s) => (
          <button
            key={s}
            className={`inst-chip-btn ${activeSymbol === s ? 'active' : ''}`}
            onClick={() => handleSelectSymbol(s)}
          >
            {s}
          </button>
        ))}
        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 8 }}>IPOs:</span>
        {['SWIGGY', 'WAAREE', 'BAJAJHFL', 'HYUNDAI', 'NTPCGREEN'].map((s) => (
          <button
            key={s}
            className={`inst-chip-btn ${activeSymbol === s ? 'active' : ''}`}
            onClick={() => handleSelectSymbol(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Hero Sticky Symbol Header */}
      {inst && (
        <section className="inst-hero-header">
          <div className="inst-hero-left">
            <div className="inst-hero-breadcrumbs">
              <a href="/index.html">Honba</a>
              <span>/</span>
              <span>{inst.exchange}</span>
              <span>/</span>
              <span style={{ textTransform: 'capitalize' }}>{inst.assetType || 'Equity'}</span>
              <span>/</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{inst.symbol}</span>
            </div>

            <div className="inst-hero-title-row">
              <div
                className="inst-symbol-badge-logo"
                style={{
                  backgroundColor:
                    inst.assetType === 'index'
                      ? '#f7a600'
                      : inst.assetType === 'mf'
                      ? '#089981'
                      : inst.assetType === 'ipo'
                      ? '#a855f7'
                      : '#2962ff',
                }}
              >
                {inst.symbol.substring(0, 2)}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h1 className="inst-hero-symbol">{inst.symbol}</h1>
                  <span className={`inst-type-badge badge-${inst.assetType || 'equity'}`}>
                    {inst.assetType === 'stocks' || !inst.assetType
                      ? `${inst.marketCapTier.toUpperCase()} CAP EQUITY`
                      : inst.assetType.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>• {inst.exchange}</span>
                </div>
                <div className="inst-hero-name">{inst.name}</div>
              </div>
            </div>
          </div>

          {/* Real-time Price & Day Range */}
          <div className="inst-hero-center">
            <div className="inst-price-row">
              <div
                className={`inst-big-price ${
                  priceFlash === 'bullish' ? 'flash-bullish' : priceFlash === 'bearish' ? 'flash-bearish' : ''
                }`}
              >
                ₹{fmt(inst.price)}
              </div>
              <div
                className="inst-change-badge"
                style={{
                  backgroundColor: isUp ? 'var(--bullish-subtle)' : 'var(--bearish-subtle)',
                  color: isUp ? 'var(--bullish)' : 'var(--bearish)',
                }}
              >
                {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span>
                  {isUp ? '+' : ''}
                  {fmt(inst.change)} ({isUp ? '+' : ''}
                  {inst.changePercent.toFixed(2)}%)
                </span>
              </div>
            </div>

            <div className="inst-market-status-pulse">
              <span className="pulse-dot" />
              <span>Live Tick Engine Connected ({inst.exchange})</span>
              <span>•</span>
              <span>Vol: {fmt(inst.volume, 0)}</span>
            </div>

            {/* Day Range Bar */}
            <div className="inst-range-bar-wrapper" style={{ marginTop: 4 }}>
              <div className="inst-range-bar-track">
                <div
                  className="inst-range-bar-progress"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        5,
                        ((inst.price - (inst.low52 * 0.95)) / ((inst.high52 * 1.05) - (inst.low52 * 0.95))) * 100
                      )
                    )}%`,
                  }}
                />
              </div>
              <div className="inst-range-bar-labels">
                <span>52W L: ₹{fmt(inst.low52)}</span>
                <span>Current</span>
                <span>52W H: ₹{fmt(inst.high52)}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="inst-hero-actions">
            <a
              href={`/workbench.html?symbol=${encodeURIComponent(inst.symbol)}`}
              className="inst-action-btn inst-btn-primary"
              title="Open full interactive charting in WorkBench"
            >
              <span>WorkBench</span>
              <ExternalLink size={13} />
            </a>

            <a
              href={`/simulator.html?symbol=${encodeURIComponent(inst.symbol)}`}
              className="inst-action-btn inst-btn-secondary"
              title="Run Nautilus tick-level backtest"
            >
              <Play size={13} />
              <span>Simulate</span>
            </a>

            <a
              href={`/algodesigner.html?symbol=${encodeURIComponent(inst.symbol)}`}
              className="inst-action-btn inst-btn-secondary"
              title="Strategy Composer"
            >
              <Cpu size={13} />
              <span>Strategy</span>
            </a>

            <button
              className="inst-action-btn inst-btn-secondary"
              onClick={() => dataLayer.toggleWatchlist(inst.symbol)}
              title="Add to Watchlist"
            >
              {isWatchlisted ? (
                <>
                  <BookmarkCheck size={13} color="var(--bullish)" />
                  <span style={{ color: 'var(--bullish)' }}>Saved</span>
                </>
              ) : (
                <>
                  <Bookmark size={13} />
                  <span>Watchlist</span>
                </>
              )}
            </button>

            <button
              className="inst-action-btn inst-btn-secondary"
              onClick={handleCopyLink}
              title="Share instrument link"
            >
              <Share2 size={13} />
              <span>{copiedLink ? 'Copied!' : 'Share'}</span>
            </button>
          </div>
        </section>
      )}

      {/* Tab Navigation */}
      <nav className="inst-nav-tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`inst-tab-item ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ')}
          </button>
        ))}
      </nav>

      {/* Main Content Area */}
      <main className="inst-content-body">
        {/* Top Interactive Candlestick / Area Chart */}
        <section className="inst-chart-wrapper">
          <div className="inst-chart-controls">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Interactive Price Chart</span>
              <div className="inst-timeframe-selector">
                {(['candle', 'line'] as const).map((t) => (
                  <button
                    key={t}
                    className={`inst-tf-btn ${chartType === t ? 'active' : ''}`}
                    onClick={() => setChartType(t)}
                  >
                    {t === 'candle' ? 'Candles' : 'Line'}
                  </button>
                ))}
              </div>
            </div>

            <div className="inst-timeframe-selector">
              {['1D', '5D', '1M', '6M', '1Y', '5Y'].map((tf) => (
                <button
                  key={tf}
                  className={`inst-tf-btn ${timeframe === tf ? 'active' : ''}`}
                  onClick={() => setTimeframe(tf)}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive SVG Chart */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 340,
              background: 'var(--bg-app)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
            }}
          >
            {candles.length > 0 ? (
              <InteractiveSvgChart
                candles={candles}
                chartType={chartType}
                hoverCandle={hoverCandle}
                setHoverCandle={setHoverCandle}
              />
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                No historical candle data available
              </div>
            )}
          </div>
        </section>

        {/* Asset-Specific Deep-Dive Content */}
        {inst && (
          <>
            {/* 1. EQUITY VIEW */}
            {(inst.assetType === 'stocks' || !inst.assetType) && (
              <div className="inst-grid-2col">
                {/* Left Column: Key Stats & Financials */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Key Stats Grid */}
                  <div className="inst-card">
                    <div className="inst-card-header">
                      <div className="inst-card-title">
                        <BarChart3 size={16} />
                        <span>Key Valuation & Fundamentals</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>NSE TTM Ratios</span>
                    </div>

                    <div className="inst-stats-grid">
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">Market Cap</span>
                        <span className="inst-stat-value">{fmtCompact(inst.marketCap)}</span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">P/E Ratio</span>
                        <span className="inst-stat-value">{fmt(inst.pe)}</span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">Forward P/E</span>
                        <span className="inst-stat-value">{fmt(inst.forwardPe)}</span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">P/B Ratio</span>
                        <span className="inst-stat-value">{fmt(inst.pb)}</span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">Dividend Yield</span>
                        <span className="inst-stat-value">{inst.dividendYield?.toFixed(2)}%</span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">EPS (TTM)</span>
                        <span className="inst-stat-value">₹{fmt(inst.eps)}</span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">ROCE</span>
                        <span className="inst-stat-value">{inst.roce ? inst.roce.toFixed(1) + '%' : '—'}</span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">ROE</span>
                        <span className="inst-stat-value">{inst.roe ? inst.roe.toFixed(1) + '%' : '—'}</span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">Debt to Equity</span>
                        <span className="inst-stat-value">{fmt(inst.debtToEquity)}</span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">RSI (14)</span>
                        <span
                          className="inst-stat-value"
                          style={{
                            color: inst.rsi14 > 70 ? 'var(--bearish)' : inst.rsi14 < 35 ? 'var(--bullish)' : 'inherit',
                          }}
                        >
                          {inst.rsi14.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* NSE Delivery Analytics */}
                  <div className="inst-card">
                    <div className="inst-card-header">
                      <div className="inst-card-title">
                        <ShieldCheck size={16} />
                        <span>NSE Delivery & Trade Dynamics</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Daily Bhavcopy Metrics</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">Total Traded Qty</span>
                        <span className="inst-stat-value">{fmt(inst.volume, 0)}</span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">Deliverable Quantity</span>
                        <span className="inst-stat-value">{fmt(inst.deliverableQty || inst.volume * 0.48, 0)}</span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">Delivery %</span>
                        <span
                          className="inst-stat-value"
                          style={{
                            color: (inst.deliveryPct || 45) > 50 ? 'var(--bullish)' : 'var(--text-primary)',
                          }}
                        >
                          {(inst.deliveryPct || 48.2).toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    <div className="inst-range-bar-wrapper">
                      <div className="inst-range-bar-track" style={{ height: 8 }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${inst.deliveryPct || 48}%`,
                            background:
                              (inst.deliveryPct || 45) > 50
                                ? 'var(--bullish)'
                                : 'var(--accent-primary)',
                            borderRadius: 'var(--radius-full)',
                          }}
                        />
                      </div>
                      <div className="inst-range-bar-labels">
                        <span>Low Delivery (Speculative)</span>
                        <span>Institutional Delivery Quality ({fmt(inst.deliveryPct || 48, 1)}%)</span>
                        <span>High Delivery (Accumulation)</span>
                      </div>
                    </div>
                  </div>

                  {/* Quarterly Results */}
                  {detailData?.quarterly && detailData.quarterly.length > 0 && (
                    <div className="inst-card">
                      <div className="inst-card-header">
                        <div className="inst-card-title">
                          <DollarSign size={16} />
                          <span>Quarterly Financial Trends</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>₹ in Crores</span>
                      </div>

                      <div className="inst-table-container">
                        <table className="inst-data-table">
                          <thead>
                            <tr>
                              <th>Period</th>
                              <th>Revenue (Cr)</th>
                              <th>Net Profit (Cr)</th>
                              <th>Operating Margin</th>
                              <th>EPS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailData.quarterly.map((q) => (
                              <tr key={q.period}>
                                <td style={{ fontWeight: 600 }}>{q.period}</td>
                                <td>₹{fmt(q.revenue, 1)}</td>
                                <td style={{ color: q.netProfit >= 0 ? 'var(--bullish)' : 'var(--bearish)' }}>
                                  ₹{fmt(q.netProfit, 1)}
                                </td>
                                <td>{q.operatingMargin.toFixed(1)}%</td>
                                <td>₹{fmt(q.eps, 2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Peer Comparisons */}
                  {detailData?.peers && detailData.peers.length > 0 && (
                    <div className="inst-card">
                      <div className="inst-card-header">
                        <div className="inst-card-title">
                          <Layers size={16} />
                          <span>Peers & Sector Competitors</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{inst.sector}</span>
                      </div>

                      <div className="inst-table-container">
                        <table className="inst-data-table">
                          <thead>
                            <tr>
                              <th>Symbol</th>
                              <th>Name</th>
                              <th>Price</th>
                              <th>P/E</th>
                              <th>Market Cap</th>
                              <th>1D Change</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailData.peers.map((peer) => (
                              <tr key={peer.symbol}>
                                <td>
                                  <a
                                    href={`/instrument.html?symbol=${encodeURIComponent(peer.symbol)}`}
                                    className="inst-clickable-ticker"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleSelectSymbol(peer.symbol);
                                    }}
                                  >
                                    {peer.symbol}
                                    <ExternalLink size={10} />
                                  </a>
                                </td>
                                <td style={{ color: 'var(--text-secondary)' }}>{peer.name}</td>
                                <td style={{ fontFamily: 'var(--font-family-mono)' }}>₹{fmt(peer.price)}</td>
                                <td>{fmt(peer.pe)}</td>
                                <td>{fmtCompact(peer.marketCap)}</td>
                                <td
                                  style={{
                                    color: peer.changePercent >= 0 ? 'var(--bullish)' : 'var(--bearish)',
                                    fontWeight: 600,
                                  }}
                                >
                                  {peer.changePercent >= 0 ? '+' : ''}
                                  {peer.changePercent.toFixed(2)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Technicals Gauge & Shareholding */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Technicals Gauge */}
                  <div className="inst-card">
                    <div className="inst-card-header">
                      <div className="inst-card-title">
                        <Sliders size={16} />
                        <span>TradingView Technical Rating</span>
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: inst.technicalRating.includes('Buy')
                            ? 'var(--bullish)'
                            : inst.technicalRating.includes('Sell')
                            ? 'var(--bearish)'
                            : 'var(--text-primary)',
                        }}
                      >
                        {inst.technicalRating}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
                      <TechnicalsGauge rating={inst.technicalRating} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">SMA 20</span>
                        <span className="inst-stat-value">₹{fmt(inst.sma20)}</span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">SMA 200</span>
                        <span className="inst-stat-value">₹{fmt(inst.sma200)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Shareholding Pattern */}
                  {detailData?.shareholding && (
                    <div className="inst-card">
                      <div className="inst-card-header">
                        <div className="inst-card-title">
                          <PieChart size={16} />
                          <span>Shareholding Breakdown</span>
                        </div>
                      </div>

                      <div className="inst-shareholding-bar">
                        <div className="sh-promoter" style={{ width: `${detailData.shareholding.promoter}%` }} title={`Promoters: ${detailData.shareholding.promoter}%`} />
                        <div className="sh-fii" style={{ width: `${detailData.shareholding.fii}%` }} title={`FII: ${detailData.shareholding.fii}%`} />
                        <div className="sh-dii" style={{ width: `${detailData.shareholding.dii}%` }} title={`DII: ${detailData.shareholding.dii}%`} />
                        <div className="sh-public" style={{ width: `${detailData.shareholding.public}%` }} title={`Public: ${detailData.shareholding.public}%`} />
                        <div className="sh-others" style={{ width: `${detailData.shareholding.others}%` }} title={`Others: ${detailData.shareholding.others}%`} />
                      </div>

                      <div className="inst-shareholding-legend">
                        <div className="legend-item">
                          <span className="legend-color sh-promoter" />
                          <span>Promoters ({detailData.shareholding.promoter}%)</span>
                        </div>
                        <div className="legend-item">
                          <span className="legend-color sh-fii" />
                          <span>FII ({detailData.shareholding.fii}%)</span>
                        </div>
                        <div className="legend-item">
                          <span className="legend-color sh-dii" />
                          <span>DII ({detailData.shareholding.dii}%)</span>
                        </div>
                        <div className="legend-item">
                          <span className="legend-color sh-public" />
                          <span>Public ({detailData.shareholding.public}%)</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Company Profile */}
                  <div className="inst-card">
                    <div className="inst-card-header">
                      <div className="inst-card-title">
                        <Briefcase size={16} />
                        <span>About {inst.name}</span>
                      </div>
                    </div>
                    <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                      {detailData?.about || inst.description}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Sector:</span>
                        <span style={{ fontWeight: 600 }}>{inst.sector}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Industry:</span>
                        <span style={{ fontWeight: 600 }}>{inst.industry}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Primary Exchange:</span>
                        <span style={{ fontWeight: 600 }}>{inst.exchange} (India)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. INDEX VIEW */}
            {inst.assetType === 'index' && (
              <div className="inst-grid-2col">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Constituents & Weightages Table */}
                  <div className="inst-card">
                    <div className="inst-card-header">
                      <div className="inst-card-title">
                        <Layers size={16} />
                        <span>Index Constituents & Weightages</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Top Equities in {inst.name}
                      </span>
                    </div>

                    <div className="inst-table-container">
                      <table className="inst-data-table">
                        <thead>
                          <tr>
                            <th>Ticker</th>
                            <th>Company Name</th>
                            <th>Weightage</th>
                            <th>Price</th>
                            <th>Day Change</th>
                            <th>Sector</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detailData?.constituents || []).map((c) => (
                            <tr key={c.symbol}>
                              <td>
                                <a
                                  href={`/instrument.html?symbol=${encodeURIComponent(c.symbol)}`}
                                  className="inst-clickable-ticker"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleSelectSymbol(c.symbol);
                                  }}
                                >
                                  {c.symbol}
                                  <ExternalLink size={10} />
                                </a>
                              </td>
                              <td style={{ color: 'var(--text-secondary)' }}>{c.name}</td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div
                                    style={{
                                      width: 45,
                                      height: 5,
                                      background: 'var(--bg-surface-elevated)',
                                      borderRadius: 2,
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: `${Math.min(100, c.weight * 3.5)}%`,
                                        height: '100%',
                                        background: 'var(--accent-primary)',
                                      }}
                                    />
                                  </div>
                                  <span style={{ fontWeight: 600 }}>{c.weight.toFixed(2)}%</span>
                                </div>
                              </td>
                              <td style={{ fontFamily: 'var(--font-family-mono)' }}>₹{fmt(c.price)}</td>
                              <td
                                style={{
                                  fontWeight: 600,
                                  color: c.changePercent >= 0 ? 'var(--bullish)' : 'var(--bearish)',
                                }}
                              >
                                {c.changePercent >= 0 ? '+' : ''}
                                {c.changePercent.toFixed(2)}%
                              </td>
                              <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{c.sector}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right Column: Index Sector Weights & Advances/Declines */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Advance / Decline Ratio */}
                  <div className="inst-card">
                    <div className="inst-card-header">
                      <div className="inst-card-title">
                        <BarChart3 size={16} />
                        <span>Market Breadth & Sentiment</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Advance / Decline</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                      <span style={{ color: 'var(--bullish)' }}>Advances: {detailData?.advances ?? 34}</span>
                      <span style={{ color: 'var(--bearish)' }}>Declines: {detailData?.declines ?? 16}</span>
                    </div>

                    <div style={{ display: 'flex', height: 10, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
                      <div style={{ width: '68%', background: 'var(--bullish)' }} />
                      <div style={{ width: '32%', background: 'var(--bearish)' }} />
                    </div>
                  </div>

                  {/* Sector Allocation Breakdown */}
                  {detailData?.sectorWeights && (
                    <div className="inst-card">
                      <div className="inst-card-header">
                        <div className="inst-card-title">
                          <PieChart size={16} />
                          <span>Sector Representation</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {Object.entries(detailData.sectorWeights).map(([sec, wt]) => (
                          <div key={sec} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                              <span style={{ color: 'var(--text-secondary)' }}>{sec}</span>
                              <span style={{ fontWeight: 600 }}>{wt.toFixed(1)}%</span>
                            </div>
                            <div style={{ height: 5, background: 'var(--bg-surface-elevated)', borderRadius: 2 }}>
                              <div
                                style={{
                                  width: `${Math.min(100, wt * 2.5)}%`,
                                  height: '100%',
                                  background: 'var(--accent-primary)',
                                  borderRadius: 2,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. MUTUAL FUND VIEW */}
            {inst.assetType === 'mf' && (
              <div className="inst-grid-2col">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Top 10 Portfolio Holdings */}
                  <div className="inst-card">
                    <div className="inst-card-header">
                      <div className="inst-card-title">
                        <Layers size={16} />
                        <span>Top 10 Portfolio Holdings</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>AMFI Portfolio Disclosure</span>
                    </div>

                    <div className="inst-table-container">
                      <table className="inst-data-table">
                        <thead>
                          <tr>
                            <th>Company / Stock</th>
                            <th>Sector</th>
                            <th>Portfolio Weight</th>
                            <th>Asset Class</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detailData?.mfHoldings || []).map((h) => (
                            <tr key={h.symbol}>
                              <td>
                                <a
                                  href={`/instrument.html?symbol=${encodeURIComponent(h.symbol)}`}
                                  className="inst-clickable-ticker"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleSelectSymbol(h.symbol);
                                  }}
                                >
                                  {h.name} ({h.symbol})
                                  <ExternalLink size={10} />
                                </a>
                              </td>
                              <td style={{ color: 'var(--text-secondary)' }}>{h.sector}</td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div
                                    style={{
                                      width: 45,
                                      height: 5,
                                      background: 'var(--bg-surface-elevated)',
                                      borderRadius: 2,
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: `${Math.min(100, h.weight * 5)}%`,
                                        height: '100%',
                                        background: 'var(--bullish)',
                                      }}
                                    />
                                  </div>
                                  <span style={{ fontWeight: 600 }}>{h.weight.toFixed(2)}%</span>
                                </div>
                              </td>
                              <td>{h.assetClass}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Historical Returns CAGR vs Benchmark */}
                  <div className="inst-card">
                    <div className="inst-card-header">
                      <div className="inst-card-title">
                        <TrendingUp size={16} />
                        <span>Historical Performance vs Benchmark</span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">1-Year Return</span>
                        <span className="inst-stat-value" style={{ color: 'var(--bullish)' }}>
                          +{(detailData?.categoryAvgReturn1Y || 24.5).toFixed(1)}%
                        </span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">3-Year CAGR</span>
                        <span className="inst-stat-value" style={{ color: 'var(--bullish)' }}>
                          +{(detailData?.cagr3Y || 19.8).toFixed(1)}%
                        </span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">5-Year CAGR</span>
                        <span className="inst-stat-value" style={{ color: 'var(--bullish)' }}>
                          +{(detailData?.cagr5Y || 22.4).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Fund Overview & Facts */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div className="inst-card">
                    <div className="inst-card-header">
                      <div className="inst-card-title">
                        <Briefcase size={16} />
                        <span>Fund Facts & Metrics</span>
                      </div>
                    </div>

                    <div className="inst-stats-grid">
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">AUM</span>
                        <span className="inst-stat-value">₹{fmt(detailData?.aumCr || 76450, 0)} Cr</span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">Expense Ratio</span>
                        <span className="inst-stat-value">{(detailData?.expenseRatio || 0.65).toFixed(2)}%</span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">Riskometer</span>
                        <span className="inst-stat-value" style={{ color: 'var(--bearish)' }}>
                          Very High
                        </span>
                      </div>
                      <div className="inst-stat-item">
                        <span className="inst-stat-label">Min. SIP</span>
                        <span className="inst-stat-value">₹1,000</span>
                      </div>
                    </div>

                    <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <strong>Fund Manager:</strong> {detailData?.fundManager || 'Rajeev Thakkar & Team'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. IPO VIEW */}
            {inst.assetType === 'ipo' && (
              <div className="inst-grid-2col">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Live Grey Market Premium (GMP) Card */}
                  {detailData?.ipoDetails && (
                    <div className="inst-card">
                      <div className="inst-card-header">
                        <div className="inst-card-title">
                          <DollarSign size={16} />
                          <span>Grey Market Premium (GMP) & Estimated Listing</span>
                        </div>
                        <span className="inst-type-badge badge-ipo">
                          Status: {detailData.ipoDetails.status.toUpperCase()}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                        <div className="inst-stat-item">
                          <span className="inst-stat-label">GMP (Estimated)</span>
                          <span className="inst-stat-value" style={{ color: 'var(--bullish)' }}>
                            +₹{fmt(detailData.ipoDetails.gmpPrice)}
                          </span>
                        </div>
                        <div className="inst-stat-item">
                          <span className="inst-stat-label">Estimated Listing Gain</span>
                          <span className="inst-stat-value" style={{ color: 'var(--bullish)' }}>
                            +{detailData.ipoDetails.gmpPercent.toFixed(1)}%
                          </span>
                        </div>
                        <div className="inst-stat-item">
                          <span className="inst-stat-label">Estimated Listing Price</span>
                          <span className="inst-stat-value">
                            ₹{fmt(inst.price + detailData.ipoDetails.gmpPrice)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Live Subscription Status Meters */}
                  {detailData?.ipoDetails && (
                    <div className="inst-card">
                      <div className="inst-card-header">
                        <div className="inst-card-title">
                          <BarChart3 size={16} />
                          <span>Live Bidding & Subscription Multiples</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Times Subscribed</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div className="inst-sub-meter">
                          <div className="inst-sub-header">
                            <span className="inst-sub-name">Qualified Institutional Buyers (QIB)</span>
                            <span className="inst-sub-times">{detailData.ipoDetails.subscriptionQib.toFixed(2)}x</span>
                          </div>
                          <div className="inst-sub-bar-bg">
                            <div
                              className="inst-sub-bar-fill"
                              style={{ width: `${Math.min(100, detailData.ipoDetails.subscriptionQib * 12)}%` }}
                            />
                          </div>
                        </div>

                        <div className="inst-sub-meter">
                          <div className="inst-sub-header">
                            <span className="inst-sub-name">Non-Institutional Investors (NII / HNI)</span>
                            <span className="inst-sub-times">{detailData.ipoDetails.subscriptionNii.toFixed(2)}x</span>
                          </div>
                          <div className="inst-sub-bar-bg">
                            <div
                              className="inst-sub-bar-fill"
                              style={{ width: `${Math.min(100, detailData.ipoDetails.subscriptionNii * 15)}%` }}
                            />
                          </div>
                        </div>

                        <div className="inst-sub-meter">
                          <div className="inst-sub-header">
                            <span className="inst-sub-name">Retail Individual Investors (RII)</span>
                            <span className="inst-sub-times">{detailData.ipoDetails.subscriptionRetail.toFixed(2)}x</span>
                          </div>
                          <div className="inst-sub-bar-bg">
                            <div
                              className="inst-sub-bar-fill"
                              style={{ width: `${Math.min(100, detailData.ipoDetails.subscriptionRetail * 20)}%` }}
                            />
                          </div>
                        </div>

                        <div className="inst-sub-meter" style={{ background: 'var(--bg-surface-elevated)' }}>
                          <div className="inst-sub-header">
                            <span className="inst-sub-name" style={{ fontWeight: 700 }}>
                              Total Over-Subscription
                            </span>
                            <span
                              className="inst-sub-times"
                              style={{ color: 'var(--bullish)', fontSize: 15 }}
                            >
                              {detailData.ipoDetails.subscriptionTotal.toFixed(2)}x
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Interactive Lot Profit Calculator */}
                  {detailData?.ipoDetails && (
                    <div className="inst-card">
                      <div className="inst-card-header">
                        <div className="inst-card-title">
                          <DollarSign size={16} />
                          <span>IPO Allotment & Profit Calculator</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span style={{ fontSize: 13 }}>Select Number of Lots:</span>
                        {[1, 2, 5, 10].map((l) => (
                          <button
                            key={l}
                            className={`inst-chip-btn ${lotsCount === l ? 'active' : ''}`}
                            onClick={() => setLotsCount(l)}
                          >
                            {l} {l === 1 ? 'Lot' : 'Lots'}
                          </button>
                        ))}
                      </div>

                      <div className="inst-stats-grid" style={{ marginTop: 8 }}>
                        <div className="inst-stat-item">
                          <span className="inst-stat-label">Total Shares</span>
                          <span className="inst-stat-value">{lotsCount * detailData.ipoDetails.lotSize}</span>
                        </div>
                        <div className="inst-stat-item">
                          <span className="inst-stat-label">Application Amount</span>
                          <span className="inst-stat-value">
                            ₹{fmt(lotsCount * detailData.ipoDetails.minInvestment, 0)}
                          </span>
                        </div>
                        <div className="inst-stat-item">
                          <span className="inst-stat-label">Est. Listing Profit</span>
                          <span className="inst-stat-value" style={{ color: 'var(--bullish)' }}>
                            +₹{fmt(lotsCount * detailData.ipoDetails.lotSize * detailData.ipoDetails.gmpPrice, 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Issue Details & Dates */}
                {detailData?.ipoDetails && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div className="inst-card">
                      <div className="inst-card-header">
                        <div className="inst-card-title">
                          <Calendar size={16} />
                          <span>IPO Timeline & Issue Dates</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Issue Opens:</span>
                          <span style={{ fontWeight: 600 }}>{detailData.ipoDetails.openDate}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Issue Closes:</span>
                          <span style={{ fontWeight: 600 }}>{detailData.ipoDetails.closeDate}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Basis of Allotment:</span>
                          <span style={{ fontWeight: 600 }}>{detailData.ipoDetails.allotmentDate}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Listing Date:</span>
                          <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>
                            {detailData.ipoDetails.listingDate}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="inst-card">
                      <div className="inst-card-header">
                        <div className="inst-card-title">
                          <Briefcase size={16} />
                          <span>Issue Structure</span>
                        </div>
                      </div>

                      <div className="inst-stats-grid">
                        <div className="inst-stat-item">
                          <span className="inst-stat-label">Total Issue Size</span>
                          <span className="inst-stat-value">₹{fmt(detailData.ipoDetails.issueSizeCr, 0)} Cr</span>
                        </div>
                        <div className="inst-stat-item">
                          <span className="inst-stat-label">Fresh Issue</span>
                          <span className="inst-stat-value">₹{fmt(detailData.ipoDetails.freshIssueCr, 0)} Cr</span>
                        </div>
                        <div className="inst-stat-item">
                          <span className="inst-stat-label">Offer for Sale (OFS)</span>
                          <span className="inst-stat-value">₹{fmt(detailData.ipoDetails.ofsCr, 0)} Cr</span>
                        </div>
                        <div className="inst-stat-item">
                          <span className="inst-stat-label">Lot Size</span>
                          <span className="inst-stat-value">{detailData.ipoDetails.lotSize} Shares</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

// ================= High Performance SVG Interactive Chart Component =================
interface InteractiveSvgChartProps {
  candles: CandleData[];
  chartType: 'candle' | 'line';
  hoverCandle: CandleData | null;
  setHoverCandle: (c: CandleData | null) => void;
}

const InteractiveSvgChart: React.FC<InteractiveSvgChartProps> = ({
  candles,
  chartType,
  hoverCandle,
  setHoverCandle,
}) => {
  const containerRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 340 });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth || 800,
          height: containerRef.current.clientHeight || 340,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const { width, height } = dimensions;
  const padding = { top: 20, right: 60, bottom: 40, left: 10 };

  const chartWidth = Math.max(100, width - padding.left - padding.right);
  const chartHeight = Math.max(100, height - padding.top - padding.bottom);
  const priceChartHeight = chartHeight * 0.75;
  const volumeChartHeight = chartHeight * 0.22;
  const volumeYOffset = padding.top + priceChartHeight + 8;

  // Calculate scales
  const prices = candles.flatMap((c) => [c.high, c.low]);
  const minPrice = Math.min(...prices) * 0.995;
  const maxPrice = Math.max(...prices) * 1.005;
  const priceRange = maxPrice - minPrice || 1;

  const volumes = candles.map((c) => c.volume);
  const maxVolume = Math.max(...volumes) || 1;

  const getX = (index: number) => padding.left + (index / (candles.length - 1)) * chartWidth;
  const getY = (val: number) => padding.top + priceChartHeight - ((val - minPrice) / priceRange) * priceChartHeight;
  const getVolY = (vol: number) => volumeYOffset + volumeChartHeight - (vol / maxVolume) * volumeChartHeight;

  const candleWidth = Math.max(3, Math.min(14, (chartWidth / candles.length) * 0.7));

  // Area path for line mode
  const linePoints = candles.map((c, i) => `${getX(i)},${getY(c.close)}`).join(' ');
  const areaPoints = `${getX(0)},${padding.top + priceChartHeight} ${linePoints} ${getX(
    candles.length - 1
  )},${padding.top + priceChartHeight}`;

  return (
    <svg
      ref={containerRef}
      style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
      onMouseLeave={() => setHoverCandle(null)}
      onMouseMove={(e) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - padding.left;
        const idx = Math.round((mouseX / chartWidth) * (candles.length - 1));
        if (idx >= 0 && idx < candles.length) {
          setHoverCandle(candles[idx]);
        }
      }}
    >
      <defs>
        <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2962ff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2962ff" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Grid Lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const yVal = padding.top + priceChartHeight * pct;
        const pVal = maxPrice - pct * priceRange;
        return (
          <g key={pct}>
            <line
              x1={padding.left}
              y1={yVal}
              x2={padding.left + chartWidth}
              y2={yVal}
              stroke="var(--border-table-row)"
              strokeDasharray="3 3"
            />
            <text
              x={padding.left + chartWidth + 8}
              y={yVal + 4}
              fill="var(--text-muted)"
              fontSize="10"
              fontFamily="var(--font-family-mono)"
            >
              ₹{pVal.toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* Volume bars */}
      {candles.map((c, i) => {
        const isUp = c.close >= c.open;
        const vx = getX(i) - candleWidth / 2;
        const vy = getVolY(c.volume);
        const vh = volumeYOffset + volumeChartHeight - vy;
        return (
          <rect
            key={`vol-${i}`}
            x={vx}
            y={vy}
            width={candleWidth}
            height={vh}
            fill={isUp ? 'var(--bullish)' : 'var(--bearish)'}
            opacity="0.3"
          />
        );
      })}

      {/* Candlesticks OR Line */}
      {chartType === 'candle' ? (
        candles.map((c, i) => {
          const isUp = c.close >= c.open;
          const color = isUp ? 'var(--bullish)' : 'var(--bearish)';
          const cx = getX(i);
          const openY = getY(c.open);
          const closeY = getY(c.close);
          const highY = getY(c.high);
          const lowY = getY(c.low);
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(2, Math.abs(closeY - openY));

          return (
            <g key={`candle-${i}`}>
              {/* Wick */}
              <line x1={cx} y1={highY} x2={cx} y2={lowY} stroke={color} strokeWidth="1.2" />
              {/* Body */}
              <rect
                x={cx - candleWidth / 2}
                y={bodyY}
                width={candleWidth}
                height={bodyHeight}
                fill={color}
              />
            </g>
          );
        })
      ) : (
        <g>
          <polygon points={areaPoints} fill="url(#chartAreaGrad)" />
          <polyline points={linePoints} fill="none" stroke="var(--accent-primary)" strokeWidth="2" />
        </g>
      )}

      {/* Hover Crosshair & Details Tooltip */}
      {hoverCandle && (
        <g>
          <line
            x1={getX(candles.indexOf(hoverCandle))}
            y1={padding.top}
            x2={getX(candles.indexOf(hoverCandle))}
            y2={padding.top + priceChartHeight}
            stroke="var(--text-secondary)"
            strokeDasharray="2 2"
          />
          <line
            x1={padding.left}
            y1={getY(hoverCandle.close)}
            x2={padding.left + chartWidth}
            y2={getY(hoverCandle.close)}
            stroke="var(--text-secondary)"
            strokeDasharray="2 2"
          />

          {/* Top Info Bar */}
          <text x={padding.left + 8} y={padding.top - 5} fill="var(--text-primary)" fontSize="11" fontFamily="var(--font-family-mono)">
            Date: {hoverCandle.time} | O: ₹{hoverCandle.open} | H: ₹{hoverCandle.high} | L: ₹{hoverCandle.low} | C: ₹
            {hoverCandle.close} | Vol: {hoverCandle.volume.toLocaleString()}
          </text>
        </g>
      )}
    </svg>
  );
};

// Mount Application to root
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<InstrumentApp />);
}
