export interface WidgetDefinition {
  id: string;
  title: string;
  description: string;
  category: "General" | "Trading" | "Analytics" | "Derivatives" | "Algo & Code";
  icon: string;
  availablePages: string[]; // '*' for all pages, or specific page names
  defaultVisible: boolean;
}

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  // 1. General & Navigation
  {
    id: "widget-chart",
    title: "Interactive Market Chart",
    description: "Canvas candlestick chart with technical indicators (EMA, SuperTrend, Volume) and signals",
    category: "General",
    icon: "📈",
    availablePages: ["workbench", "stock", "designer"],
    defaultVisible: true,
  },
  {
    id: "widget-drawing-toolbar",
    title: "Drawing Toolbar Rail",
    description: "Tools for trendlines, horizontal levels, Fibonacci retracements, and measurement",
    category: "General",
    icon: "✏️",
    availablePages: ["workbench", "designer"],
    defaultVisible: true,
  },
  {
    id: "widget-watchlist",
    title: "Live Scrip Watchlist",
    description: "Real-time NSE/BSE quote feeds, price tracking, and quick search",
    category: "Trading",
    icon: "📋",
    availablePages: ["*"],
    defaultVisible: true,
  },
  {
    id: "widget-order-ticket",
    title: "Dhan / OpenAlgo Order Ticket",
    description: "MIS/CNC order placement with lot sizing, broker routing, and STT estimation",
    category: "Trading",
    icon: "⚡",
    availablePages: ["*"],
    defaultVisible: true,
  },
  {
    id: "widget-market-depth",
    title: "5-Depth LOB Market Depth",
    description: "Real-time Level 2 order book with best 5 bids and asks",
    category: "Trading",
    icon: "📊",
    availablePages: ["stock", "workbench"],
    defaultVisible: true,
  },
  {
    id: "widget-quick-options",
    title: "Quick Options Chain",
    description: "Compact strike ladder with Call/Put LTPs and weekly expiry selector",
    category: "Derivatives",
    icon: "⛓️",
    availablePages: ["workbench", "options"],
    defaultVisible: true,
  },
  {
    id: "widget-strategy-dock",
    title: "Strategy Research Dock",
    description: "Bottom dock containing strategy tearsheet, trade ledger, and equity curve",
    category: "Analytics",
    icon: "📉",
    availablePages: ["workbench", "designer", "simulator"],
    defaultVisible: true,
  },
  // 2. Algo Designer Widgets
  {
    id: "widget-designer-profile",
    title: "Strategy Profile & Broker Route",
    description: "Strategy identification, timeframe, universe, and OpenAlgo gateway selection",
    category: "Algo & Code",
    icon: "🛠️",
    availablePages: ["designer"],
    defaultVisible: true,
  },
  {
    id: "widget-designer-indicators",
    title: "Quantitative Indicators Matrix",
    description: "Fast EMA, Slow EMA, RSI momentum floor, and SuperTrend filter parameters",
    category: "Algo & Code",
    icon: "🧮",
    availablePages: ["designer"],
    defaultVisible: true,
  },
  {
    id: "widget-designer-rules",
    title: "Entry & Exit Execution Rules",
    description: "Jesse-style should_long() and should_short() rule builder cards",
    category: "Algo & Code",
    icon: "🚦",
    availablePages: ["designer"],
    defaultVisible: true,
  },
  {
    id: "widget-designer-risk",
    title: "Position Sizing & Risk Brackets",
    description: "Lot multiplier, Stop Loss %, Risk:Reward target, and MIS 15:15 auto-square-off",
    category: "Algo & Code",
    icon: "🛡️",
    availablePages: ["designer"],
    defaultVisible: true,
  },
  {
    id: "widget-code-preview",
    title: "Tri-Language Code Generator",
    description: "Live synchronization of Python (Jesse/Honba), OpenAlgo JSON, and Rust Nautilus code",
    category: "Algo & Code",
    icon: "💻",
    availablePages: ["designer", "simulator"],
    defaultVisible: true,
  },
  // 3. Simulator Widgets
  {
    id: "widget-sim-params",
    title: "Simulation Parameters Bar",
    description: "Starting capital, backtest date range, slippage multiplier, and run trigger",
    category: "Analytics",
    icon: "⚙️",
    availablePages: ["simulator"],
    defaultVisible: true,
  },
  {
    id: "widget-sim-metrics",
    title: "Jesse Executive Scorecard",
    description: "Ten core metrics: Ending Capital, CAGR Alpha, Sharpe, Sortino, Calmar, Max DD, Win Rate",
    category: "Analytics",
    icon: "🏆",
    availablePages: ["simulator", "workbench"],
    defaultVisible: true,
  },
  {
    id: "widget-sim-equity-curves",
    title: "Equity & Underwater Drawdown Canvases",
    description: "Dual canvas rendering cumulative returns against Nifty TR and drawdown area",
    category: "Analytics",
    icon: "📈",
    availablePages: ["simulator"],
    defaultVisible: true,
  },
  {
    id: "widget-monte-carlo",
    title: "Jesse Monte Carlo 1,000 Resamples",
    description: "Fan chart of 1,000 reshuffled paths, 95% Confidence Interval, VaR, and Ruin Probability",
    category: "Analytics",
    icon: "🎲",
    availablePages: ["simulator", "backtest"],
    defaultVisible: true,
  },
  {
    id: "widget-sim-trades",
    title: "Simulation Trade Ledger",
    description: "Detailed tabular breakdown of all closed trades with entry/exit tags",
    category: "Analytics",
    icon: "📜",
    availablePages: ["simulator"],
    defaultVisible: true,
  },
  {
    id: "widget-tax-breakdown",
    title: "Indian Taxes & Real-World Friction",
    description: "Detailed breakdown of Budget 2024 STT, NSE turnover fees, and GST deductions",
    category: "Analytics",
    icon: "🏛️",
    availablePages: ["simulator", "backtest"],
    defaultVisible: true,
  },
  // 4. Scrip Research Widgets
  {
    id: "widget-stock-header",
    title: "Scrip Profile & 52W High/Low",
    description: "ISIN details, index weight, LTP, and valuation multiples",
    category: "General",
    icon: "🏷️",
    availablePages: ["stock"],
    defaultVisible: true,
  },
  {
    id: "widget-stock-ratios",
    title: "ROCE, ROE & Delivery Volume",
    description: "Institutional delivery %, capital efficiency, debt/equity, and earnings growth",
    category: "Analytics",
    icon: "💎",
    availablePages: ["stock"],
    defaultVisible: true,
  },
  {
    id: "widget-stock-financials",
    title: "Screener.in Quarterly Financials",
    description: "Quarterly sales, EBITDA, OPM %, Net PAT, and EPS statement",
    category: "Analytics",
    icon: "📑",
    availablePages: ["stock"],
    defaultVisible: true,
  },
  // 5. Options & Anti-Overfit
  {
    id: "widget-options-full",
    title: "Full Strike Ladder & Greeks Matrix",
    description: "Full call/put options chain with Delta, Gamma, Theta, Vega, IV, and PCR",
    category: "Derivatives",
    icon: "📐",
    availablePages: ["options"],
    defaultVisible: true,
  },
  {
    id: "widget-cpcv-fan",
    title: "CPCV Distribution Fan Chart",
    description: "16-slice Combinatorial Purged Cross-Validation fan chart and PBO risk meter",
    category: "Analytics",
    icon: "🛡️",
    availablePages: ["backtest", "simulator"],
    defaultVisible: true,
  },
];

export function getWidgetsForPage(pageId: string): WidgetDefinition[] {
  return WIDGET_REGISTRY.filter(
    (w) => w.availablePages.includes("*") || w.availablePages.includes(pageId)
  );
}

const STORAGE_PREFIX = "honba_widget_view_";

export function getUserWidgetState(pageId: string): Record<string, boolean> {
  const pageWidgets = getWidgetsForPage(pageId);
  const defaultState: Record<string, boolean> = {};
  pageWidgets.forEach((w) => {
    defaultState[w.id] = w.defaultVisible;
  });

  const stored = localStorage.getItem(`${STORAGE_PREFIX}${pageId}`);
  if (!stored) return defaultState;

  try {
    const parsed = JSON.parse(stored);
    return { ...defaultState, ...parsed };
  } catch {
    return defaultState;
  }
}

export function saveUserWidgetState(pageId: string, state: Record<string, boolean>): void {
  localStorage.setItem(`${STORAGE_PREFIX}${pageId}`, JSON.stringify(state));
  applyWidgetVisibility(pageId);
}

export function resetUserWidgetState(pageId: string): Record<string, boolean> {
  localStorage.removeItem(`${STORAGE_PREFIX}${pageId}`);
  const state = getUserWidgetState(pageId);
  applyWidgetVisibility(pageId);
  return state;
}

export function applyWidgetVisibility(pageId: string): void {
  const state = getUserWidgetState(pageId);
  Object.entries(state).forEach(([widgetId, isVisible]) => {
    const elements = document.querySelectorAll<HTMLElement>(`[data-widget="${widgetId}"]`);
    elements.forEach((el) => {
      if (isVisible) {
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    });
  });
}
