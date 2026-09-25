/**
 * Screener Reactive State Store (Zustand)
 * Unifies market instruments, filter criteria, active selections, column definitions,
 * drawer state, and real-time tick integration.
 */

import { create } from 'zustand';
import { Instrument, CountryCode } from '../market-data';
import { dataLayer } from '../data-layer';
import { ALL_COLUMNS, ColumnDef, TAB_COLUMN_PRESETS } from '../columns';
import { AdvancedFilterState, DEFAULT_ADVANCED_FILTERS } from '../filters';

export interface ScreenerState {
  // Market & Instruments
  currentMarket: CountryCode;
  instruments: Instrument[];
  activeSymbol: string;
  shortlistedSymbols: string[];
  searchQuery: string;
  isLive: boolean;

  // Tabs & Filters
  activeTab: string; // 'overview' | 'performance' | 'valuation' | 'technicals' | 'fundamentals'
  quickPreset: string; // 'all' | 'gainers' | 'losers' | 'most_active' | etc.
  advancedFilters: AdvancedFilterState;

  // Table Configuration & Pagination
  columns: ColumnDef[];
  sortField: string;
  sortOrder: 'asc' | 'desc' | null;
  currentPage: number;
  pageSize: number;

  // Modals & Panels
  detailDrawerOpen: boolean;
  activeDetailTab: 'overview' | 'technicals' | 'financials';
  isFilterModalOpen: boolean;
  isColumnModalOpen: boolean;

  // Actions
  setMarket: (market: CountryCode) => void;
  setActiveSymbol: (symbol: string) => void;
  toggleShortlist: (symbol: string) => void;
  clearShortlist: () => void;
  setSearchQuery: (query: string) => void;
  setActiveTab: (tab: string) => void;
  setQuickPreset: (preset: string) => void;
  setAdvancedFilters: (filters: Partial<AdvancedFilterState>) => void;
  resetFilters: () => void;
  setColumns: (columns: ColumnDef[]) => void;
  setSort: (field: string) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  toggleDetailDrawer: () => void;
  setDetailDrawerOpen: (open: boolean) => void;
  setActiveDetailTab: (tab: 'overview' | 'technicals' | 'financials') => void;
  setFilterModalOpen: (open: boolean) => void;
  setColumnModalOpen: (open: boolean) => void;
  toggleLiveTicks: () => void;
  updateTick: (tick: { symbol: string; price: number; change: number; changePercent: number }) => void;
  refreshFromDataLayer: () => void;
}

const getStoredColumns = (): ColumnDef[] => {
  try {
    const raw = localStorage.getItem('honba_screener_columns_v3');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [...ALL_COLUMNS];
};

export const useScreenerStore = create<ScreenerState>((set, get) => {
  const initialDataLayerState = dataLayer.getState();
  const initialInstruments = dataLayer.getInstruments(initialDataLayerState.currentMarket);

  return {
    currentMarket: initialDataLayerState.currentMarket,
    instruments: initialInstruments,
    activeSymbol: initialDataLayerState.activeSymbol,
    shortlistedSymbols: initialDataLayerState.shortlistedSymbols,
    searchQuery: initialDataLayerState.searchQuery || '',
    isLive: dataLayer.isLiveSimulationActive(),

    activeTab: 'overview',
    quickPreset: 'all',
    advancedFilters: { ...DEFAULT_ADVANCED_FILTERS },

    columns: getStoredColumns(),
    sortField: 'marketCap',
    sortOrder: 'desc',
    currentPage: 1,
    pageSize: 100,

    detailDrawerOpen: false,
    activeDetailTab: 'overview',
    isFilterModalOpen: false,
    isColumnModalOpen: false,

    setMarket: (market: CountryCode) => {
      dataLayer.setMarket(market);
      const instruments = dataLayer.getInstruments(market);
      const active = instruments[0]?.symbol || '';
      if (active) dataLayer.setActiveSymbol(active);
      set({
        currentMarket: market,
        instruments,
        activeSymbol: active,
        currentPage: 1,
      });
    },

    setActiveSymbol: (symbol: string) => {
      dataLayer.setActiveSymbol(symbol);
      set({ activeSymbol: symbol });
    },

    toggleShortlist: (symbol: string) => {
      dataLayer.toggleShortlist(symbol);
      set({ shortlistedSymbols: dataLayer.getState().shortlistedSymbols });
    },

    clearShortlist: () => {
      const current = get().shortlistedSymbols;
      current.forEach((s) => dataLayer.toggleShortlist(s));
      set({ shortlistedSymbols: [] });
    },

    setSearchQuery: (searchQuery: string) => {
      dataLayer.setSearchQuery(searchQuery);
      set({ searchQuery, currentPage: 1 });
    },

    setActiveTab: (activeTab: string) => {
      const preset = TAB_COLUMN_PRESETS[activeTab];
      if (preset) {
        const updated = ALL_COLUMNS.map((c) => ({
          ...c,
          visible: preset.includes(c.id),
        }));
        set({ activeTab, columns: updated, currentPage: 1 });
      } else {
        set({ activeTab });
      }
    },

    setQuickPreset: (quickPreset: string) => {
      set({ quickPreset, currentPage: 1 });
    },

    setAdvancedFilters: (filters: Partial<AdvancedFilterState>) => {
      set((state) => ({
        advancedFilters: { ...state.advancedFilters, ...filters },
        currentPage: 1,
      }));
    },

    resetFilters: () => {
      set({
        quickPreset: 'all',
        searchQuery: '',
        advancedFilters: { ...DEFAULT_ADVANCED_FILTERS },
        currentPage: 1,
      });
      dataLayer.setSearchQuery('');
    },

    setColumns: (columns: ColumnDef[]) => {
      try {
        localStorage.setItem('honba_screener_columns_v2', JSON.stringify(columns));
      } catch {}
      set({ columns });
    },

    setSort: (field: string) => {
      const { sortField, sortOrder } = get();
      if (sortField === field) {
        if (sortOrder === 'desc') set({ sortOrder: 'asc' });
        else if (sortOrder === 'asc') set({ sortOrder: null, sortField: '' });
        else set({ sortOrder: 'desc' });
      } else {
        set({ sortField: field, sortOrder: 'desc' });
      }
    },

    setPage: (currentPage: number) => set({ currentPage }),
    setPageSize: (pageSize: number) => set({ pageSize, currentPage: 1 }),

    toggleDetailDrawer: () => set((state) => ({ detailDrawerOpen: !state.detailDrawerOpen })),
    setDetailDrawerOpen: (detailDrawerOpen: boolean) => set({ detailDrawerOpen }),
    setActiveDetailTab: (activeDetailTab) => set({ activeDetailTab }),

    setFilterModalOpen: (isFilterModalOpen: boolean) => set({ isFilterModalOpen }),
    setColumnModalOpen: (isColumnModalOpen: boolean) => set({ isColumnModalOpen }),

    toggleLiveTicks: () => {
      if (dataLayer.isLiveSimulationActive()) {
        dataLayer.stopLiveTickSimulation();
      } else {
        dataLayer.startLiveTickSimulation();
      }
      set({ isLive: dataLayer.isLiveSimulationActive() });
    },

    updateTick: (tick) => {
      set((state) => {
        const next = state.instruments.map((inst) => {
          if (inst.symbol === tick.symbol) {
            return {
              ...inst,
              price: tick.price,
              change: tick.change,
              changePercent: tick.changePercent,
            };
          }
          return inst;
        });
        return { instruments: next };
      });
    },

    refreshFromDataLayer: () => {
      const state = dataLayer.getState();
      const instruments = dataLayer.getInstruments(state.currentMarket);
      set({
        currentMarket: state.currentMarket,
        instruments,
        activeSymbol: state.activeSymbol,
        shortlistedSymbols: state.shortlistedSymbols,
        isLive: dataLayer.isLiveSimulationActive(),
      });
    },
  };
});

// Setup continuous synchronization with dataLayer pub/sub and live tick events
dataLayer.subscribe(() => {
  useScreenerStore.getState().refreshFromDataLayer();
});

dataLayer.onTick((tick) => {
  useScreenerStore.getState().updateTick(tick);
});
