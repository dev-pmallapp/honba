import React, { useState, useEffect } from 'react';
import { useScreenerStore } from '../core/store/use-screener-store';
import { dataLayer } from '../core/data-layer';
import { SlidersHorizontal, Code2, PlayCircle, BarChart3 } from 'lucide-react';

export const BottomBar: React.FC = () => {
  const shortlistedSymbols = useScreenerStore((state) => state.shortlistedSymbols);
  const currentMarket = useScreenerStore((state) => state.currentMarket);
  const isLive = useScreenerStore((state) => state.isLive);
  const toggleLiveTicks = useScreenerStore((state) => state.toggleLiveTicks);

  const [timeStr, setTimeStr] = useState<string>(() => new Date().toTimeString().split(' ')[0]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeStr(new Date().toTimeString().split(' ')[0]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const market = dataLayer.getCurrentMarketInfo();

  return (
    <footer className="hb-bottom-bar" id="bottom-bar-container">
      <div className="bottom-bar-left">
        <button className="hb-bottom-tab tv-bottom-tab active" data-tab="screener">
          <SlidersHorizontal size={13} style={{ marginRight: 6 }} />
          <span>Stock Screener</span>
        </button>
        <a href="/algodesigner.html" className="hb-bottom-tab tv-bottom-tab" data-tab="algodesigner">
          <Code2 size={13} style={{ marginRight: 6 }} />
          <span>Algo Designer</span>
        </a>
        <a href="/simulator.html" className="hb-bottom-tab tv-bottom-tab" data-tab="simulator">
          <PlayCircle size={13} style={{ marginRight: 6 }} />
          <span>Backtest Simulator</span>
        </a>
        <a href="/workbench.html" className="hb-bottom-tab tv-bottom-tab" data-tab="workbench">
          <BarChart3 size={13} style={{ marginRight: 6 }} />
          <span>WorkBench</span>
        </a>
      </div>

      <div className="bottom-bar-right">
        {shortlistedSymbols.length > 0 && (
          <div className="hb-status-item tv-status-item tv-highlight" style={{ cursor: 'pointer' }}>
            <span>Selected: {shortlistedSymbols.length}</span>
          </div>
        )}
        <div
          className="hb-status-item tv-status-item"
          style={{ cursor: 'pointer' }}
          onClick={toggleLiveTicks}
          title={isLive ? 'Live Ticks Active (Click to Pause)' : 'Paused (Click to Resume)'}
        >
          <span className={`status-dot ${isLive ? 'live-pulsing' : ''}`} style={{ background: isLive ? 'var(--bullish)' : 'var(--text-muted)' }} />
          <span>{isLive ? 'Live Feed' : 'Market Closed'} ({market.primaryExchanges[0]})</span>
        </div>
        <div className="hb-status-item tv-status-item">
          <span>Latency: <strong style={{ color: 'var(--bullish)' }}>12ms</strong></span>
        </div>
        <div className="hb-status-item tv-status-item" id="bottom-clock-display">
          {timeStr}
        </div>
        <div className="hb-status-item tv-status-item" style={{ color: 'var(--text-muted)' }}>
          <span>UTC+5:30</span>
        </div>
      </div>
    </footer>
  );
};

export const HbBottomBar = BottomBar;

