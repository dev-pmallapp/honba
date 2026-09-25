import React, { useMemo, useState } from 'react';
import { Instrument } from '../../../core/market-data';
import { useScreenerStore } from '../../../core/store/use-screener-store';
import { useLayoutStore } from '../../../layouts/use-layout-store';
import { dataLayer } from '../../../core/data-layer';
import { Layers, TrendingUp, TrendingDown, ArrowUpRight } from 'lucide-react';

interface ScreenerHeatmapProps {
  instruments: Instrument[];
}

export const ScreenerHeatmap: React.FC<ScreenerHeatmapProps> = ({ instruments }) => {
  const activeSymbol = useScreenerStore((state) => state.activeSymbol);
  const setActiveSymbol = useScreenerStore((state) => state.setActiveSymbol);
  const setDrawerOpen = useLayoutStore((state) => state.setDrawerOpen);
  const market = dataLayer.getCurrentMarketInfo();

  const [groupBySector, setGroupBySector] = useState(true);

  // Group by sector
  const sectorGroups = useMemo(() => {
    if (!groupBySector) {
      return [{ sector: 'All Markets', items: [...instruments].sort((a, b) => b.marketCap - a.marketCap) }];
    }

    const map: Record<string, Instrument[]> = {};
    instruments.forEach((inst) => {
      const sec = inst.sector || 'Broad Market';
      if (!map[sec]) map[sec] = [];
      map[sec].push(inst);
    });

    return Object.entries(map)
      .map(([sector, items]) => ({
        sector,
        items: items.sort((a, b) => b.marketCap - a.marketCap),
        totalCap: items.reduce((acc, curr) => acc + curr.marketCap, 0),
      }))
      .sort((a, b) => b.totalCap - a.totalCap);
  }, [instruments, groupBySector]);

  const getColor = (chg: number) => {
    if (chg >= 3) return '#089981'; // bright green
    if (chg >= 1.5) return '#0e7a63'; // medium green
    if (chg > 0) return '#105949'; // subtle green
    if (chg === 0) return '#2a2e39'; // neutral gray
    if (chg > -1.5) return '#6b2029'; // subtle red
    if (chg > -3) return '#992430'; // medium red
    return '#f23645'; // bright red
  };

  const formatNumber = (num: number, decimals: number = 2): string => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const handleTileClick = (inst: Instrument) => {
    setActiveSymbol(inst.symbol);
    setDrawerOpen(true);
  };

  return (
    <div className="tv-heatmap-container">
      {/* Heatmap Toolbar Controls */}
      <div className="tv-heatmap-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Market Heatmap ({instruments.length} Stocks)
          </div>
          <button
            className={`tv-heatmap-toggle-btn ${groupBySector ? 'active' : ''}`}
            onClick={() => setGroupBySector(!groupBySector)}
            title="Toggle Group By Sector"
          >
            <Layers size={13} style={{ marginRight: 5 }} />
            Group by Sector
          </button>
        </div>

        {/* Legend */}
        <div className="tv-heatmap-legend">
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Performance:</span>
          <div className="tv-legend-bar">
            <span style={{ background: '#f23645' }}>&lt; -3%</span>
            <span style={{ background: '#992430' }}>-1.5%</span>
            <span style={{ background: '#2a2e39' }}>0%</span>
            <span style={{ background: '#0e7a63' }}>+1.5%</span>
            <span style={{ background: '#089981' }}>&gt; +3%</span>
          </div>
        </div>
      </div>

      {/* Heatmap Grid Content */}
      <div className="tv-heatmap-scroll-area">
        {sectorGroups.map((group) => (
          <div key={group.sector} className="tv-heatmap-sector-card">
            {groupBySector && (
              <div className="tv-heatmap-sector-header">
                <span className="tv-heatmap-sector-title">{group.sector}</span>
                <span className="tv-heatmap-sector-count">{group.items.length} stocks</span>
              </div>
            )}
            <div className="tv-heatmap-tiles-grid">
              {group.items.map((inst) => {
                const isSelected = activeSymbol === inst.symbol;
                const isUp = inst.changePercent >= 0;
                const bg = getColor(inst.changePercent);

                // Tier size based on relative market cap
                const isLarge = inst.marketCap > 500000000000;
                const isMedium = inst.marketCap > 100000000000 && !isLarge;

                return (
                  <div
                    key={inst.symbol}
                    className={`tv-heatmap-tile ${isLarge ? 'tile-large' : isMedium ? 'tile-medium' : 'tile-small'} ${
                      isSelected ? 'tile-selected' : ''
                    }`}
                    style={{ backgroundColor: bg }}
                    onClick={() => handleTileClick(inst)}
                    title={`${inst.symbol} - ${inst.name}\nPrice: ${market.currency} ${formatNumber(inst.price)}\nChange: ${isUp ? '+' : ''}${inst.changePercent.toFixed(2)}%`}
                  >
                    <div className="tv-tile-symbol">{inst.symbol}</div>
                    <div className="tv-tile-price">
                      {market.currencySymbol}
                      {formatNumber(inst.price)}
                    </div>
                    <div className="tv-tile-change">
                      {isUp ? '+' : ''}
                      {inst.changePercent.toFixed(2)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const HbScreenerHeatmap = ScreenerHeatmap;

