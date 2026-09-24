import React, { useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

import '../styles/theme.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/screener.css';

import { themeEngine } from '../core/theme-engine';
import { useScreenerStore } from '../core/store/use-screener-store';
import { Instrument } from '../core/market-data';
import { AppShell } from '../layouts/app-shell';
import { DockableWorkspace } from '../layouts/dockable-workspace';
import { FilterBar } from '../components/features/screener/filter-bar';
import { ScreenerTable } from '../components/features/screener/screener-table';
import { SymbolDetailDrawer } from '../components/features/screener/symbol-detail-drawer';
import { ColumnModal } from '../components/features/screener/column-modal';
import { FiltersModal } from '../components/features/screener/filters-modal';

export const ScreenerApp: React.FC = () => {
  const instruments = useScreenerStore((state) => state.instruments);
  const searchQuery = useScreenerStore((state) => state.searchQuery);
  const quickPreset = useScreenerStore((state) => state.quickPreset);
  const advanced = useScreenerStore((state) => state.advancedFilters);

  useEffect(() => {
    themeEngine.applyToDOM();
  }, []);

  // Filter instruments
  const filteredInstruments = useMemo(() => {
    return instruments.filter((inst) => {
      // 1. Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          inst.symbol.toLowerCase().includes(q) ||
          inst.name.toLowerCase().includes(q) ||
          inst.sector.toLowerCase().includes(q);
        if (!match) return false;
      }

      // 2. Quick Presets
      if (quickPreset === 'gainers' && inst.changePercent <= 0) return false;
      if (quickPreset === 'losers' && inst.changePercent >= 0) return false;
      if (quickPreset === 'most_active' && inst.volume < 2000000) return false;
      if (quickPreset === 'high52' && inst.price < inst.high52 * 0.95) return false;
      if (quickPreset === 'oversold' && inst.rsi14 >= 35) return false;
      if (quickPreset === 'overbought' && inst.rsi14 <= 70) return false;
      if (quickPreset === 'dividend' && (!inst.dividendYield || inst.dividendYield < 1.5)) return false;
      if (quickPreset === 'value' && (!inst.pe || inst.pe > 25 || inst.pe <= 0)) return false;
      if (quickPreset === 'momentum' && (inst.technicalRating !== 'Strong Buy' && inst.technicalRating !== 'Buy')) return false;

      // 3. Advanced Filters
      if (advanced.sector !== 'all' && inst.sector !== advanced.sector) return false;
      if (advanced.exchange !== 'all' && inst.exchange !== advanced.exchange) return false;

      if (advanced.marketCapTier !== 'all') {
        const cap = inst.marketCap;
        if (advanced.marketCapTier === 'mega' && cap < 2000000000000) return false;
        if (advanced.marketCapTier === 'large' && cap < 500000000000) return false;
        if (advanced.marketCapTier === 'mid' && (cap < 100000000000 || cap > 500000000000)) return false;
        if (advanced.marketCapTier === 'small' && cap >= 100000000000) return false;
      }

      if (advanced.minPrice !== null && inst.price < advanced.minPrice) return false;
      if (advanced.maxPrice !== null && inst.price > advanced.maxPrice) return false;
      if (advanced.peMin !== null && (!inst.pe || inst.pe < advanced.peMin)) return false;
      if (advanced.peMax !== null && (!inst.pe || inst.pe > advanced.peMax)) return false;
      if (advanced.minDividendYield !== null && (!inst.dividendYield || inst.dividendYield < advanced.minDividendYield)) return false;
      if (advanced.minRoce !== null && (!inst.roce || inst.roce < advanced.minRoce)) return false;
      if (advanced.minNetMargin !== null && (!inst.netMargin || inst.netMargin < advanced.minNetMargin)) return false;

      if (advanced.technicalRating !== 'all') {
        if (advanced.technicalRating === 'Buy') {
          if (inst.technicalRating !== 'Buy' && inst.technicalRating !== 'Strong Buy') return false;
        } else if (advanced.technicalRating === 'Sell') {
          if (inst.technicalRating !== 'Sell' && inst.technicalRating !== 'Strong Sell') return false;
        } else if (inst.technicalRating !== advanced.technicalRating) {
          return false;
        }
      }

      if (advanced.rsiMin !== null && inst.rsi14 < advanced.rsiMin) return false;
      if (advanced.rsiMax !== null && inst.rsi14 > advanced.rsiMax) return false;
      if (advanced.priceAbove200Sma && inst.price <= inst.sma200) return false;
      if (advanced.near52WeekHigh && inst.price < inst.high52 * 0.95) return false;

      return true;
    });
  }, [instruments, searchQuery, quickPreset, advanced]);

  const handleExportCSV = () => {
    const headers = ['Symbol', 'Name', 'Exchange', 'Price', 'Change%', 'Volume', 'MarketCap', 'PE', 'RSI14', 'Rating'];
    const rows = filteredInstruments.map((i) => [
      i.symbol,
      `"${i.name.replace(/"/g, '""')}"`,
      i.exchange,
      i.price,
      i.changePercent,
      i.volume,
      i.marketCap,
      i.pe ?? '',
      i.rsi14,
      `"${i.technicalRating}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `honba_screener_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell currentAppId="screener">
      {/* Filter Bar with Presets, Categories, Search, Filters Modal Trigger */}
      <FilterBar
        totalCount={instruments.length}
        filteredCount={filteredInstruments.length}
        onExportCSV={handleExportCSV}
      />

      {/* Main Dockable Workspace: Resizable Split View with Screener Table & Symbol Detail Drawer */}
      <DockableWorkspace
        primaryContent={<ScreenerTable instruments={filteredInstruments} />}
        secondaryContent={<SymbolDetailDrawer />}
      />

      {/* Modals */}
      <ColumnModal />
      <FiltersModal />
    </AppShell>
  );
};

// Mount to DOM
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<ScreenerApp />);
}
