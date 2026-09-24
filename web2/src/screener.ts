/**
 * TradingView Screener Main Controller
 * Orchestrates top navigation, secondary filter bar, comprehensive TradingView filters modal,
 * screener data table, right-hand symbol detail & technicals drawer, and bottom dock bar.
 */

import './styles/theme.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screener.css';

import { dataLayer } from './core/data-layer';
import { themeEngine } from './core/theme-engine';
import { Instrument } from './core/market-data';
import { AppNav } from './components/app-nav';
import { FilterBar, ScreenerFilterCriteria } from './components/filter-bar';
import { ScreenerTable } from './components/screener-table';
import { ColumnModal, ALL_COLUMNS, ColumnDef } from './components/column-modal';
import { SymbolDetailDrawer } from './components/symbol-detail-drawer';
import { TradingViewFiltersModal, AdvancedFilterState } from './components/tradingview-filters-modal';
import { BottomBar } from './components/bottom-bar';

class ScreenerApp {
  private nav: AppNav | null = null;
  private filterBar: FilterBar | null = null;
  private table: ScreenerTable | null = null;
  private columnModal: ColumnModal | null = null;
  private filtersModal: TradingViewFiltersModal | null = null;
  private detailDrawer: SymbolDetailDrawer | null = null;
  private bottomBar: BottomBar | null = null;
  private columns: ColumnDef[] = [...ALL_COLUMNS];

  constructor() {
    this.init();
  }

  private init() {
    themeEngine.applyToDOM();

    // DOM Containers
    const navContainer = document.getElementById('app-nav-container')!;
    const filterContainer = document.getElementById('filter-bar-container')!;
    const tableContainer = document.getElementById('table-scroll-container')!;
    const detailDrawerContainer = document.getElementById('detail-drawer')!;
    const bottomBarContainer = document.getElementById('bottom-bar-container')!;
    const floatingActionBar = document.getElementById('floating-action-bar')!;

    // 1. Column Customizer Modal
    this.columnModal = new ColumnModal((newCols) => {
      this.columns = newCols;
      this.table?.setColumns(this.columns);
    });
    this.columns = this.columnModal.getColumns();

    // 2. Comprehensive TradingView Filters Modal
    this.filtersModal = new TradingViewFiltersModal((advancedState: AdvancedFilterState) => {
      this.filterBar?.setAdvancedFilters(advancedState);
    });

    // 3. Right-hand Symbol Detail & Technical Analysis Drawer
    this.detailDrawer = new SymbolDetailDrawer(detailDrawerContainer, (collapsed) => {
      const workspace = document.getElementById('workspace-container');
      if (collapsed) {
        workspace?.classList.add('drawer-closed');
      } else {
        workspace?.classList.remove('drawer-closed');
      }
    });

    // 4. Screener Data Table
    this.table = new ScreenerTable(
      tableContainer,
      floatingActionBar,
      this.columns,
      (symbol) => {
        dataLayer.setActiveSymbol(symbol);
        const inst = dataLayer.getInstrument(symbol);
        if (inst) {
          this.detailDrawer?.setInstrument(inst);
          this.detailDrawer?.toggleCollapse(false);
        }
      },
      () => this.columnModal?.open()
    );

    // 5. Top Navigation Bar (Global Platform Nav)
    this.nav = new AppNav(navContainer, 'screener');

    // 6. Screener Filter & Action Toolbar (Header, Presets, Columns, Export, Drawer, Filters)
    this.filterBar = new FilterBar(
      filterContainer,
      (criteria) => this.handleFilterChange(criteria),
      () => this.filtersModal?.open(this.filterBar?.getCriteria().advanced),
      () => this.columnModal?.open(),
      () => this.detailDrawer?.toggleCollapse(),
      () => this.exportCSV()
    );

    // 7. Signature TradingView Bottom Dock Bar
    this.bottomBar = new BottomBar(bottomBarContainer);

    // 8. Subscribe to shared Data Layer updates (market region changes, ticks)
    dataLayer.subscribe(() => {
      this.refreshData();
    });

    // Initial load
    this.refreshData();

    // Select initial active instrument for drawer
    const initialInstruments = dataLayer.getInstruments();
    if (initialInstruments.length > 0) {
      const activeSym = dataLayer.getState().activeSymbol || initialInstruments[0].symbol;
      const initialInst = dataLayer.getInstrument(activeSym) || initialInstruments[0];
      dataLayer.setActiveSymbol(initialInst.symbol);
      this.detailDrawer.setInstrument(initialInst);
    }
  }

  private handleFilterChange(criteria: ScreenerFilterCriteria) {

    // Adapt visible columns based on category tab
    if (criteria.tab === 'valuation') {
      this.setCategoryColumns(['symbol', 'price', 'marketCap', 'pe', 'forwardPe', 'eps', 'pb', 'dividendYield']);
    } else if (criteria.tab === 'performance') {
      this.setCategoryColumns(['symbol', 'price', 'changePercent', 'change', 'range52', 'perf1W', 'perf1M', 'perf1Y', 'sparkline']);
    } else if (criteria.tab === 'dividends') {
      this.setCategoryColumns(['symbol', 'price', 'dividendYield', 'pe', 'roce', 'netMargin', 'debtToEquity']);
    } else if (criteria.tab === 'margins') {
      this.setCategoryColumns(['symbol', 'price', 'revenueGrowth', 'netMargin', 'roce', 'debtToEquity', 'marketCap']);
    } else if (criteria.tab === 'technicals') {
      this.setCategoryColumns(['symbol', 'price', 'changePercent', 'range52', 'rsi14', 'sma200', 'technicalRating', 'sparkline']);
    } else if (criteria.tab === 'oscillators') {
      this.setCategoryColumns(['symbol', 'price', 'rsi14', 'technicalRating', 'changePercent', 'sparkline']);
    } else {
      // Default: Overview
      this.setCategoryColumns([
        'symbol',
        'price',
        'changePercent',
        'change',
        'volume',
        'range52',
        'sparkline',
        'technicalRating',
        'marketCap',
        'pe',
        'dividendYield',
        'rsi14',
      ]);
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
      this.filterBar?.setCounts(raw.length, raw.length);
      return;
    }

    const adv = criteria.advanced;

    const filtered = raw.filter((inst: Instrument) => {
      // 1. Text Search
      if (criteria.search) {
        const q = criteria.search;
        const matches =
          inst.symbol.toLowerCase().includes(q) ||
          inst.name.toLowerCase().includes(q) ||
          inst.industry.toLowerCase().includes(q) ||
          inst.sector.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // 2. Sector Filter
      if (adv.sector !== 'all' && inst.sector !== adv.sector) {
        return false;
      }

      // 3. Market Cap Tier
      if (adv.marketCapTier !== 'all' && inst.marketCapTier !== adv.marketCapTier) {
        return false;
      }

      // 4. Valuation: P/E bounds
      if (adv.peMin !== null && (inst.pe <= 0 || inst.pe < adv.peMin)) return false;
      if (adv.peMax !== null && (inst.pe <= 0 || inst.pe > adv.peMax)) return false;

      // 5. Valuation: Dividend Yield
      if (adv.minDividendYield !== null && inst.dividendYield < adv.minDividendYield) return false;

      // 6. Fundamentals: ROCE
      if (adv.minRoce !== null && inst.roce < adv.minRoce) return false;

      // 7. Technical Rating
      if (adv.technicalRating !== 'all') {
        if (adv.technicalRating === 'Buy') {
          if (inst.technicalRating !== 'Buy' && inst.technicalRating !== 'Strong Buy') return false;
        } else if (inst.technicalRating !== adv.technicalRating) {
          return false;
        }
      }

      // 8. Technicals: RSI bounds
      if (adv.rsiMin !== null && inst.rsi14 < adv.rsiMin) return false;
      if (adv.rsiMax !== null && inst.rsi14 > adv.rsiMax) return false;

      // 9. Trend: 200 SMA
      if (adv.priceAbove200Sma && inst.price < inst.sma200) return false;

      // 10. 52-Week High Proximity
      if (adv.near52WeekHigh && (inst.high52 - inst.price) / inst.high52 > 0.05) return false;

      // 11. Quick Presets
      if (criteria.quickPreset === 'gainers' && inst.changePercent <= 0) return false;
      if (criteria.quickPreset === 'losers' && inst.changePercent >= 0) return false;
      if (criteria.quickPreset === 'most_active' && inst.volume < 1000000) return false;
      if (criteria.quickPreset === 'high52' && (inst.high52 - inst.price) / inst.high52 > 0.05) return false;
      if (criteria.quickPreset === 'oversold' && inst.rsi14 >= 40) return false;
      if (criteria.quickPreset === 'overbought' && inst.rsi14 <= 70) return false;
      if (criteria.quickPreset === 'dividend' && inst.dividendYield < 1.5) return false;
      if (criteria.quickPreset === 'value' && (inst.pe <= 0 || inst.pe > 25)) return false;
      if (criteria.quickPreset === 'momentum' && inst.rsi14 <= 60) return false;

      return true;
    });

    this.table?.setData(filtered);
    this.filterBar?.setCounts(filtered.length, raw.length);

    // If currently active symbol is not in filtered list, keep drawer or show first match
    const currentActive = dataLayer.getState().activeSymbol;
    const stillPresent = filtered.find((i) => i.symbol === currentActive);
    if (!stillPresent && filtered.length > 0) {
      dataLayer.setActiveSymbol(filtered[0].symbol);
      this.detailDrawer?.setInstrument(filtered[0]);
    } else if (stillPresent) {
      this.detailDrawer?.setInstrument(stillPresent);
    }
  }

  private exportCSV() {
    const raw = dataLayer.getInstruments();
    const criteria = this.filterBar?.getCriteria();
    const visibleCols = this.columns.filter((c) => c.visible);

    const headers = visibleCols.map((c) => `"${c.label}"`).join(',');
    const rows = raw.map((inst) => {
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
    link.setAttribute(
      'download',
      `tradingview_screener_${dataLayer.getState().currentMarket}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new ScreenerApp();
});
