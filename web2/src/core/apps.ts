/**
 * Honba Ecosystem Application Registry & Navigation Configuration
 * Single source of truth for all suite micro-frontends and workbench modules.
 */

export interface AppMetadata {
  id: string;
  name: string;
  jpName?: string;
  tagline: string;
  url: string;
  icon: string;
}

export const HONBA_APPS = [
  {
    id: 'screener',
    name: 'Screener',
    tagline: 'Multi-Market Quantitative Scanner & Filter',
    url: '/index.html',
    icon: 'filter',
  },
  {
    id: 'instrument',
    name: 'Instruments',
    tagline: 'Deep Asset Pages: Equities, Indices, Mutual Funds & IPOs',
    url: '/instrument.html',
    icon: 'activity',
  },
  {
    id: 'workbench',
    name: 'WorkBench',
    tagline: 'Multi-chart Analysis & Tactical Orderbook',
    url: '/workbench.html',
    icon: 'layout',
  },
  {
    id: 'algodesigner',
    name: 'AlgoDesigner',
    tagline: 'Visual Flow & Python Strategy Composer',
    url: '/algodesigner.html',
    icon: 'cpu',
  },
  {
    id: 'simulator',
    name: 'Simulator',
    tagline: 'Nautilus Event-driven Tick Backtester',
    url: '/simulator.html',
    icon: 'play-circle',
  },
  {
    id: 'researcher',
    name: 'Researcher',
    tagline: 'Jesse AI Hypothesis & Robustness Lab',
    url: '/researcher.html',
    icon: 'book-open',
  },
] as const;

export type AppId = (typeof HONBA_APPS)[number]['id'];

export function getAppMetadata(appId: AppId): AppMetadata {
  return HONBA_APPS.find((app) => app.id === appId) || HONBA_APPS[0];
}
