/**
 * Honba Screener App Entry Point
 * Multi-page quantitative scanner integrating shared data layer, TradingView UI,
 * real-time ticks, and customizable Shibui themes.
 */

import './styles/theme.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screener.css';

import { dataLayer } from './core/data-layer';
import { themeEngine } from './core/theme-engine';
import { AppNav } from './components/app-nav';
import { FilterBar, FilterCriteria } from './components/filter-bar';
import { ScreenerTable } from './components/screener-table';
import { ColumnModal, ALL_COLUMNS, ColumnDef } from './components/column-modal';

class ScreenerApp {
  private nav: AppNav | null = null;
  private filterBar: FilterBar | null = null;
  private table: ScreenerTable | null = null;
  private columnModal: ColumnModal | null = null;
  private columns: ColumnDef[] = [...ALL_COLUMNS];

  constructor() {
    this.init();
  }

  private init() {
    themeEngine.applyToDOM();

    // Containers
    const navContainer = document.getElementById('app-nav-container')!;
    const filterContainer = document.getElementById('filter-bar-container')!;
    const tableContainer = document.getElementById('table-scroll-container')!;
    const floatingActionBar = document.getElementById('floating-action-bar')!;

    // 1. Column modal
    this.columnModal = new ColumnModal((newCols) => {
      this.columns = newCols;
      this.table?.setColumns(this.columns);
    });
    this.columns = this.columnModal.getColumns();

    // 2. Navigation
    this.nav = new AppNav(navContainer, 'screener');

    // 3. Filter Bar
    this.filterBar = new FilterBar(
      filterContainer,
      (criteria) => this.handleFilterChange(criteria),
      () => this.columnModal?.open(),
      () => this.exportCSV()
    );

    // 4. Table
    this.table = new ScreenerTable(
      tableContainer,
      floatingActionBar,
      this.columns,
      (symbol) => {
        dataLayer.setActiveSymbol(symbol);
      }
    );

    // 5. Subscribe to Data Layer events (e.g. Market change)
    dataLayer.subscribe(() => {
      this.refreshData();
    });

    // Initial data load
    this.refreshData();
  }

  private handleFilterChange(criteria: FilterCriteria) {
    // If category tab changes, automatically adapt visible columns
    if (criteria.tab === 'valuation') {
      this.setCategoryColumns(['symbol', 'price', 'marketCap', 'pe', 'forwardPe', 'pb', 'dividendYield']);
    } else if (criteria.tab === 'performance') {
      this.setCategoryColumns(['symbol', 'price', 'changePercent', 'volume', 'sparkline', 'high52', 'low52']);
    } else if (criteria.tab === 'technicals') {
      this.setCategoryColumns(['symbol', 'price', 'changePercent', 'rsi14', 'sma200', 'technicalRating', 'sparkline']);
    } else if (criteria.tab === 'dividends') {
      this.setCategoryColumns(['symbol', 'price', 'dividendYield', 'pe', 'roce', 'netMargin']);
    } else if (criteria.tab === 'financials') {
      this.setCategoryColumns(['symbol', 'price', 'revenueGrowth', 'netMargin', 'roce', 'debtToEquity', 'marketCap']);
    } else {
      // Default overview
      this.setCategoryColumns(['symbol', 'price', 'changePercent', 'volume', 'sparkline', 'marketCap', 'pe', 'rsi14', 'technicalRating']);
    }

    this.refreshData();
  }

  private setCategoryColumns(colIds: string[]) {
    this.columns = this.columns.map((c) => ({
      ...c,
      visible: colIds.includes(c.id),
    }));
    this.table?.setColumns(this.columns);
  }

  private refreshData() {
    const raw = dataLayer.getInstruments();
    const criteria = this.filterBar?.getCriteria();
    if (!criteria) {
      this.table?.setData(raw);
      return;
    }

    const filtered = raw.filter((inst) => {
      // Search
      if (criteria.search) {
        const query = criteria.search;
        const matches =
          inst.symbol.toLowerCase().includes(query) ||
          inst.name.toLowerCase().includes(query) ||
          inst.industry.toLowerCase().includes(query) ||
          inst.sector.toLowerCase().includes(query);
        if (!matches) return false;
      }

      // Sector
      if (criteria.sector !== 'all' && inst.sector !== criteria.sector) {
        return false;
      }

      // Market Cap Tier
      if (criteria.marketCapTier !== 'all' && inst.marketCapTier !== criteria.marketCapTier) {
        return false;
      }

      // Quick presets
      if (criteria.quickPreset === 'gainers' && inst.changePercent <= 0) return false;
      if (criteria.quickPreset === 'losers' && inst.changePercent >= 0) return false;
      if (criteria.quickPreset === 'momentum' && inst.rsi14 <= 60) return false;
      if (criteria.quickPreset === 'oversold' && inst.rsi14 >= 45) return false;
      if (criteria.quickPreset === 'high52' && (inst.high52 - inst.price) / inst.high52 > 0.06) return false;
      if (criteria.quickPreset === 'value' && (inst.pe <= 0 || inst.pe > 25)) return false;
      if (criteria.quickPreset === 'dividend' && inst.dividendYield < 1.5) return false;

      return true;
    });

    this.table?.setData(filtered);
  }

  private exportCSV() {
    const instruments = dataLayer.getInstruments();
    const visibleCols = this.columns.filter((c) => c.visible);

    const headers = visibleCols.map((c) => `"${c.label}"`).join(',');
    const rows = instruments.map((inst) => {
      return visibleCols
        .map((col) => {
          const val = (inst as unknown as Record<string, unknown>)[col.id];
          if (typeof val === 'number') return val;
          if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
          return '""';
        })
        .join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `honba_screener_${dataLayer.getState().currentMarket}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new ScreenerApp();
});
