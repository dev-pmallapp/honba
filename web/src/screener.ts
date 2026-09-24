import { initHeaderNavigation } from "./nav";
import { SCREENER_DATA } from "./data";
import { ScreenerStock } from "./types";

export function initScreener() {
  initHeaderNavigation("screener");

  // State
  let currentPreset: string = "all";
  let currentView: "overview" | "performance" | "technicals" | "valuation" | "dividends" = "overview";
  let currentDisplayMode: "table" | "charts" | "heatmap" = "table";
  let currentTimeframe: string = "1D";
  let currentMarket: string = "NSE";
  let searchKeyword: string = "";
  let sortColumn: string = "marketCapCr";
  let sortDirection: "asc" | "desc" = "desc";

  const shortlistedSymbols = new Set<string>();
  const starredSymbols = new Set<string>(["RELIANCE", "TCS", "INFY"]);

  // Filter state
  const filterState = {
    index: "all",
    price: "all",
    priceMin: null as number | null,
    priceMax: null as number | null,
    chg: "all",
    mktcap: "all",
    pe: "all",
    rvol: "all",
    rating: "all",
    rsi: "all",
    sector: "all",
  };

  // DOM Elements
  const tableHeaderRow = document.getElementById("screener-table-header-row");
  const tableBody = document.getElementById("screener-tbody");
  const tableView = document.getElementById("screener-table-view");
  const chartsView = document.getElementById("screener-charts-view");
  const heatmapView = document.getElementById("screener-heatmap-view");
  const heatmapGrid = document.getElementById("heatmap-grid");

  const visibleCountEl = document.getElementById("visible-count");
  const totalCountEl = document.getElementById("total-count");
  const breadthStatsEl = document.getElementById("market-breadth-stats");
  const footerShortlistEl = document.getElementById("footer-shortlist-status");
  const searchInput = document.getElementById("screener-search") as HTMLInputElement | null;
  const searchClearBtn = document.getElementById("screener-search-clear");

  // Preset Elements
  const screenPresetBtn = document.getElementById("btn-screen-preset");
  const screenPresetMenu = document.getElementById("screen-preset-menu");
  const currentScreenNameEl = document.getElementById("current-screen-name");
  const screenPresetIconEl = document.getElementById("screen-preset-icon");

  // Market & Timeframe Elements
  const marketBtn = document.getElementById("btn-market-select");
  const marketMenu = document.getElementById("market-select-menu");
  const tfBtn = document.getElementById("btn-timeframe-select");
  const tfMenu = document.getElementById("timeframe-select-menu");
  const tfLabel = document.getElementById("current-timeframe-label");

  // AI Drawer Elements
  const aiDrawer = document.getElementById("ai-screener-drawer");
  const btnAiTrigger = document.getElementById("btn-ai-screener");
  const btnCloseAiDrawer = document.getElementById("btn-close-ai-drawer");
  const aiPromptInput = document.getElementById("ai-prompt-input") as HTMLInputElement | null;
  const btnSubmitAi = document.getElementById("btn-submit-ai-prompt");

  // Clear filters
  const btnClearAllFilters = document.getElementById("btn-clear-all-filters");
  const activeFiltersCountEl = document.getElementById("active-filters-count");

  // Shortlist action bar elements
  const actionBar = document.getElementById("shortlist-action-bar");
  const shortlistCountEl = document.getElementById("shortlist-count");
  const shortlistTagsEl = document.getElementById("shortlist-tags");
  const openWorkbenchBtn = document.getElementById("btn-shortlist-workbench");
  const openStockBtn = document.getElementById("btn-shortlist-stock");
  const openSimBtn = document.getElementById("btn-shortlist-simulator");
  const clearShortlistBtn = document.getElementById("btn-clear-shortlist");

  // Total stocks
  if (totalCountEl) totalCountEl.textContent = SCREENER_DATA.length.toString();

  // Preset definitions map
  const presetConfig: Record<string, { name: string; icon: string }> = {
    all: { name: "All stocks", icon: "📋" },
    "most-capitalized": { name: "Most capitalized", icon: "🏛️" },
    "volume-leaders": { name: "Volume leaders", icon: "🔥" },
    "top-gainers": { name: "Top gainers (1D)", icon: "📈" },
    "top-losers": { name: "Top losers (1D)", icon: "📉" },
    "52w-high": { name: "52-week high", icon: "🎯" },
    "52w-low": { name: "52-week low", icon: "⚓" },
    momentum: { name: "High Momentum", icon: "🚀" },
    breakout: { name: "Volume Breakout", icon: "⚡" },
    oversold: { name: "Oversold Bounce", icon: "🔄" },
    overbought: { name: "Overbought", icon: "⚠️" },
    supertrend: { name: "Supertrend Bullish", icon: "🟢" },
    "high-dividend": { name: "High Dividend Yield", icon: "💰" },
    undervalued: { name: "Value Gems", icon: "💎" },
    "high-roe": { name: "High ROE Champions", icon: "👑" },
  };

  // Helper to count active filters
  const countActiveFilters = (): number => {
    let count = 0;
    if (filterState.index !== "all") count++;
    if (filterState.price !== "all" || filterState.priceMin !== null || filterState.priceMax !== null) count++;
    if (filterState.chg !== "all") count++;
    if (filterState.mktcap !== "all") count++;
    if (filterState.pe !== "all") count++;
    if (filterState.rvol !== "all") count++;
    if (filterState.rating !== "all") count++;
    if (filterState.rsi !== "all") count++;
    if (filterState.sector !== "all") count++;
    return count;
  };

  const updateFilterChipsBadges = () => {
    document.querySelectorAll(".filter-chip-wrapper").forEach((wrapper) => {
      const btn = wrapper.querySelector(".filter-chip-btn");
      const badge = wrapper.querySelector(".filter-value-badge");
      if (!btn || !badge) return;

      const fType = btn.getAttribute("data-filter");
      if (fType && (filterState as any)[fType]) {
        const val = (filterState as any)[fType];
        badge.textContent = val === "all" ? "All" : val;
        if (val !== "all") {
          btn.classList.add("border-tv-accent", "bg-tv-tertiary");
        } else {
          btn.classList.remove("border-tv-accent", "bg-tv-tertiary");
        }
      }
    });

    const activeCount = countActiveFilters();
    if (btnClearAllFilters && activeFiltersCountEl) {
      if (activeCount > 0) {
        btnClearAllFilters.classList.remove("hidden");
        activeFiltersCountEl.textContent = activeCount.toString();
      } else {
        btnClearAllFilters.classList.add("hidden");
      }
    }
  };

  // 1. Data Filtering Logic
  const getFilteredData = (): ScreenerStock[] => {
    return SCREENER_DATA.filter((stock) => {
      // Keyword search
      if (searchKeyword) {
        const q = searchKeyword.toLowerCase();
        const matches =
          stock.symbol.toLowerCase().includes(q) ||
          stock.name.toLowerCase().includes(q) ||
          stock.sector.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // Presets
      if (currentPreset === "most-capitalized" && stock.marketCapCr < 500000) return false;
      if (currentPreset === "volume-leaders" && stock.volumeRaw < 10000000) return false;
      if (currentPreset === "top-gainers" && stock.changePercent1D <= 0.5) return false;
      if (currentPreset === "top-losers" && stock.changePercent1D >= 0) return false;
      if (currentPreset === "52w-high" && stock.high52wDiff < -2.0) return false;
      if (currentPreset === "52w-low" && stock.high52wDiff > -15.0) return false;
      if (currentPreset === "momentum" && (stock.rsi < 60 || stock.high52wDiff < -4.0)) return false;
      if (currentPreset === "breakout" && (stock.rvol < 2.0 || stock.changePercent1D <= 0)) return false;
      if (currentPreset === "oversold" && stock.rsi > 35) return false;
      if (currentPreset === "overbought" && stock.rsi < 70) return false;
      if (currentPreset === "supertrend" && stock.supertrend !== "BULLISH") return false;
      if (currentPreset === "high-dividend" && stock.divYield < 1.5) return false;
      if (currentPreset === "undervalued" && (stock.pe > 20 || stock.pe <= 0)) return false;
      if (currentPreset === "high-roe" && stock.roe < 20) return false;

      // Filter Chips
      if (filterState.index !== "all" && stock.index !== filterState.index) return false;

      if (filterState.price === "under500" && stock.price >= 500) return false;
      if (filterState.price === "500to2000" && (stock.price < 500 || stock.price > 2000)) return false;
      if (filterState.price === "above2000" && stock.price <= 2000) return false;
      if (filterState.priceMin !== null && stock.price < filterState.priceMin) return false;
      if (filterState.priceMax !== null && stock.price > filterState.priceMax) return false;

      if (filterState.chg === "up" && stock.changePercent1D <= 0) return false;
      if (filterState.chg === "up2" && stock.changePercent1D < 2.0) return false;
      if (filterState.chg === "up5" && stock.changePercent1D < 5.0) return false;
      if (filterState.chg === "down" && stock.changePercent1D >= 0) return false;
      if (filterState.chg === "down2" && stock.changePercent1D > -2.0) return false;

      if (filterState.mktcap === "mega" && stock.marketCapCr < 500000) return false;
      if (filterState.mktcap === "large" && stock.marketCapCr < 50000) return false;
      if (filterState.mktcap === "mid" && (stock.marketCapCr < 10000 || stock.marketCapCr >= 50000)) return false;

      if (filterState.pe === "deep-value" && stock.pe >= 15) return false;
      if (filterState.pe === "fair" && (stock.pe < 15 || stock.pe > 30)) return false;
      if (filterState.pe === "growth" && stock.pe <= 35) return false;

      if (filterState.rvol === "1.5" && stock.rvol < 1.5) return false;
      if (filterState.rvol === "2.0" && stock.rvol < 2.0) return false;
      if (filterState.rvol === "3.0" && stock.rvol < 3.0) return false;

      if (filterState.rating !== "all" && stock.techRating !== filterState.rating) return false;

      if (filterState.rsi === "oversold" && stock.rsi > 35) return false;
      if (filterState.rsi === "neutral" && (stock.rsi < 40 || stock.rsi > 60)) return false;
      if (filterState.rsi === "overbought" && stock.rsi < 70) return false;

      if (filterState.sector !== "all" && !stock.sector.toLowerCase().includes(filterState.sector.toLowerCase())) {
        return false;
      }

      return true;
    });
  };

  // 2. Data Sorting Logic
  const getSortedData = (data: ScreenerStock[]): ScreenerStock[] => {
    return [...data].sort((a, b) => {
      let valA = (a as any)[sortColumn];
      let valB = (b as any)[sortColumn];

      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  };

  // Format Market Cap in Indian Lakh Crores
  const formatMktCap = (cr: number): string => {
    if (cr >= 100000) {
      return `₹${(cr / 100000).toFixed(2)}L Cr`;
    }
    return `₹${cr.toLocaleString("en-IN")} Cr`;
  };

  // Mini SVG Sparkline generator
  const renderSparklineSvg = (data: number[], isBullish: boolean): string => {
    if (!data || data.length < 2) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const width = 64;
    const height = 22;
    const strokeColor = isBullish ? "#089981" : "#f23645";
    const fillColor = isBullish ? "rgba(8, 153, 129, 0.15)" : "rgba(242, 54, 69, 0.15)";

    const points = data
      .map((val, idx) => {
        const x = (idx / (data.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    const areaPoints = `${points} ${width},${height} 0,${height}`;

    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="overflow-visible inline-block">
        <polygon points="${areaPoints}" fill="${fillColor}" />
        <polyline fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="${points}" />
      </svg>
    `;
  };

  // 3. Render Header Columns based on View Tab
  const renderTableHeaders = () => {
    if (!tableHeaderRow) return;

    const sortIndicator = (col: string) => {
      if (sortColumn !== col) return `<span class="text-tv-muted/40 ml-1">⇅</span>`;
      return sortDirection === "asc" ? `<span class="text-tv-accent ml-1">▲</span>` : `<span class="text-tv-accent ml-1">▼</span>`;
    };

    let colsHtml = `
      <th class="p-3 text-center w-10">
        <input type="checkbox" id="screener-select-all" class="w-4 h-4 rounded border-tv-border bg-tv-primary text-tv-accent focus:ring-0 cursor-pointer" title="Select / Deselect Visible" />
      </th>
      <th class="p-3 text-center w-8 text-tv-muted" title="Watchlist">★</th>
      <th class="p-3 cursor-pointer hover:text-white" data-sort="symbol">
        Symbol & Company ${sortIndicator("symbol")}
      </th>
    `;

    if (currentView === "overview") {
      colsHtml += `
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="price">Price (₹) ${sortIndicator("price")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="changePercent1D">Chg % ${sortIndicator("changePercent1D")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="changePoints1D">Chg ₹ ${sortIndicator("changePoints1D")}</th>
        <th class="p-3 text-center cursor-pointer hover:text-white" data-sort="techRating">Tech Rating ${sortIndicator("techRating")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="volumeRaw">Volume ${sortIndicator("volumeRaw")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="rvol">Rel Vol ${sortIndicator("rvol")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="marketCapCr">Mkt Cap ${sortIndicator("marketCapCr")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="pe">P/E ${sortIndicator("pe")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="eps">EPS (TTM) ${sortIndicator("eps")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="divYield">Div Yield % ${sortIndicator("divYield")}</th>
        <th class="p-3 cursor-pointer hover:text-white" data-sort="sector">Sector ${sortIndicator("sector")}</th>
        <th class="p-3 text-center">Actions</th>
      `;
    } else if (currentView === "performance") {
      colsHtml += `
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="price">Price (₹) ${sortIndicator("price")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="changePercent1D">1D % ${sortIndicator("changePercent1D")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="changePercent1W">1W % ${sortIndicator("changePercent1W")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="changePercent1M">1M % ${sortIndicator("changePercent1M")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="changePercent3M">3M % ${sortIndicator("changePercent3M")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="changePercent6M">6M % ${sortIndicator("changePercent6M")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="changePercent1Y">1Y % ${sortIndicator("changePercent1Y")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="changePercentYTD">YTD % ${sortIndicator("changePercentYTD")}</th>
        <th class="p-3 text-center">52W Range Bar</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="beta">Beta (1Y) ${sortIndicator("beta")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="volatility1M">Volatility % ${sortIndicator("volatility1M")}</th>
        <th class="p-3 text-center">Actions</th>
      `;
    } else if (currentView === "technicals") {
      colsHtml += `
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="price">Price (₹) ${sortIndicator("price")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="changePercent1D">1D % ${sortIndicator("changePercent1D")}</th>
        <th class="p-3 text-center cursor-pointer hover:text-white" data-sort="techRating">Tech Rating ${sortIndicator("techRating")}</th>
        <th class="p-3 text-center cursor-pointer hover:text-white" data-sort="rsi">RSI (14) ${sortIndicator("rsi")}</th>
        <th class="p-3 text-center cursor-pointer hover:text-white" data-sort="supertrend">Supertrend ${sortIndicator("supertrend")}</th>
        <th class="p-3 text-center cursor-pointer hover:text-white" data-sort="emaCross">EMA Cross ${sortIndicator("emaCross")}</th>
        <th class="p-3 text-center cursor-pointer hover:text-white" data-sort="macdSignal">MACD ${sortIndicator("macdSignal")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="bbWidth">BB Width % ${sortIndicator("bbWidth")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="atr">ATR (₹) ${sortIndicator("atr")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="high52wDiff">52W Diff % ${sortIndicator("high52wDiff")}</th>
        <th class="p-3 text-center">Actions</th>
      `;
    } else if (currentView === "valuation") {
      colsHtml += `
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="price">Price (₹) ${sortIndicator("price")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="marketCapCr">Mkt Cap ${sortIndicator("marketCapCr")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="pe">P/E ${sortIndicator("pe")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="forwardPe">Forward P/E ${sortIndicator("forwardPe")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="pb">P/B ${sortIndicator("pb")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="evEbitda">EV/EBITDA ${sortIndicator("evEbitda")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="ps">P/S ${sortIndicator("ps")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="peg">PEG ${sortIndicator("peg")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="divYield">Div Yield % ${sortIndicator("divYield")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="roe">ROE % ${sortIndicator("roe")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="debtToEquity">Debt/Eq ${sortIndicator("debtToEquity")}</th>
        <th class="p-3 text-center">Actions</th>
      `;
    } else if (currentView === "dividends") {
      colsHtml += `
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="price">Price (₹) ${sortIndicator("price")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="divYield">Div Yield % ${sortIndicator("divYield")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="divPerShare">Div / Share (₹) ${sortIndicator("divPerShare")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="netMargin">Net Margin % ${sortIndicator("netMargin")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="roe">ROE % ${sortIndicator("roe")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="roce">ROCE % ${sortIndicator("roce")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="debtToEquity">Debt / Equity ${sortIndicator("debtToEquity")}</th>
        <th class="p-3 text-right cursor-pointer hover:text-white" data-sort="yoyProfitGrowth">YoY Growth % ${sortIndicator("yoyProfitGrowth")}</th>
        <th class="p-3 text-center">Actions</th>
      `;
    }

    tableHeaderRow.innerHTML = colsHtml;

    // Attach sort listeners
    tableHeaderRow.querySelectorAll<HTMLElement>("[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const col = th.getAttribute("data-sort");
        if (!col) return;
        if (sortColumn === col) {
          sortDirection = sortDirection === "asc" ? "desc" : "asc";
        } else {
          sortColumn = col;
          sortDirection = "desc";
        }
        renderTable();
      });
    });

    // Master checkbox listener
    const masterCb = document.getElementById("screener-select-all") as HTMLInputElement | null;
    if (masterCb) {
      masterCb.addEventListener("change", () => {
        const filtered = getFilteredData();
        if (masterCb.checked) {
          filtered.forEach((s) => shortlistedSymbols.add(s.symbol));
        } else {
          filtered.forEach((s) => shortlistedSymbols.delete(s.symbol));
        }
        updateActionBar();
        renderTable();
      });
    }
  };

  // 4. Render Table Rows
  const renderTableRows = (stocks: ScreenerStock[]) => {
    if (!tableBody) return;

    if (stocks.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="15" class="text-center py-16 text-tv-muted">
            <div class="text-4xl mb-3">🔍</div>
            <div class="text-sm font-semibold text-white">No Securities Match the Current Screener Criteria</div>
            <div class="text-xs mt-1 text-tv-muted">Try resetting one of your active filter chips or switching to "All stocks" preset.</div>
            <button id="empty-state-reset-btn" class="mt-3 px-3 py-1.5 rounded-lg bg-tv-accent text-white text-xs font-semibold cursor-pointer">
              Reset All Filters
            </button>
          </td>
        </tr>
      `;
      document.getElementById("empty-state-reset-btn")?.addEventListener("click", resetAllFilters);
      return;
    }

    tableBody.innerHTML = stocks
      .map((stock) => {
        const isChecked = shortlistedSymbols.has(stock.symbol);
        const isStarred = starredSymbols.has(stock.symbol);
        const isBull1D = stock.changePercent1D >= 0;

        // Rating pill style
        let ratingBadge = "";
        if (stock.techRating === "STRONG_BUY") {
          ratingBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Strong Buy</span>`;
        } else if (stock.techRating === "BUY") {
          ratingBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-tv-bullish/20 text-tv-bullish border border-tv-bullish/30">Buy</span>`;
        } else if (stock.techRating === "NEUTRAL") {
          ratingBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-tv-tertiary text-tv-muted border border-tv-border">Neutral</span>`;
        } else if (stock.techRating === "SELL") {
          ratingBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-tv-bearish/20 text-tv-bearish border border-tv-bearish/30">Sell</span>`;
        } else {
          ratingBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/25 text-rose-400 border border-rose-500/40">Strong Sell</span>`;
        }

        // RSI color
        let rsiClass = "bg-tv-tertiary text-tv-text";
        if (stock.rsi >= 70) rsiClass = "bg-tv-bearish/20 text-tv-bearish border border-tv-bearish/30";
        else if (stock.rsi <= 35) rsiClass = "bg-tv-bullish/20 text-tv-bullish border border-tv-bullish/30";

        // 52W visual range bar calculation
        const range52 = stock.high52w - stock.low52w || 1;
        const pos52 = Math.min(Math.max(((stock.price - stock.low52w) / range52) * 100, 0), 100);

        let rowHtml = `
          <tr class="border-b border-tv-border/40 hover:bg-tv-tertiary/40 transition group ${
            isChecked ? "bg-tv-accent/10" : ""
          }">
            <!-- Checkbox -->
            <td class="p-3 text-center w-10">
              <input type="checkbox" data-stock-select="${stock.symbol}" class="w-4 h-4 rounded border-tv-border bg-tv-primary text-tv-accent focus:ring-0 cursor-pointer" ${
                isChecked ? "checked" : ""
              } />
            </td>

            <!-- Watchlist Star -->
            <td class="p-3 text-center w-8">
              <button data-stock-star="${stock.symbol}" class="hover:scale-125 transition-transform text-sm cursor-pointer ${
                isStarred ? "text-amber-400" : "text-tv-muted/40 hover:text-amber-400"
              }">
                ${isStarred ? "★" : "☆"}
              </button>
            </td>

            <!-- Symbol & Sparkline -->
            <td class="p-3">
              <div class="flex items-center space-x-3">
                <div class="flex-shrink-0">
                  ${renderSparklineSvg(stock.sparkline, isBull1D)}
                </div>
                <div>
                  <div class="flex items-center space-x-1.5">
                    <a href="/index.html?symbols=${stock.symbol}" class="font-bold text-white hover:text-tv-accent transition text-sm font-mono flex items-center space-x-1">
                      <span>${stock.symbol}</span>
                      <span class="text-[10px] text-tv-muted">↗</span>
                    </a>
                    <span class="text-[9px] font-mono px-1 rounded bg-tv-tertiary text-tv-muted border border-tv-border/80">NSE</span>
                  </div>
                  <div class="text-[11px] text-tv-muted font-sans truncate max-w-[170px]">${stock.name}</div>
                </div>
              </div>
            </td>
        `;

        // VIEW SPECIFIC COLUMNS
        if (currentView === "overview") {
          rowHtml += `
            <td class="p-3 text-right font-bold text-white">
              ₹${stock.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </td>
            <td class="p-3 text-right">
              <span class="px-1.5 py-0.5 rounded text-[11px] font-bold ${
                isBull1D ? "bg-tv-bullish/20 text-tv-bullish" : "bg-tv-bearish/20 text-tv-bearish"
              }">
                ${isBull1D ? "+" : ""}${stock.changePercent1D.toFixed(2)}%
              </span>
            </td>
            <td class="p-3 text-right font-mono text-[11px] ${isBull1D ? "text-tv-bullish" : "text-tv-bearish"}">
              ${isBull1D ? "+" : ""}${stock.changePoints1D.toFixed(2)}
            </td>
            <td class="p-3 text-center">
              ${ratingBadge}
            </td>
            <td class="p-3 text-right text-white">
              ${stock.volume}
            </td>
            <td class="p-3 text-right">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${
                stock.rvol >= 2.0 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "text-tv-muted"
              }">
                ${stock.rvol >= 2.0 ? "🔥 " : ""}${stock.rvol.toFixed(1)}x
              </span>
            </td>
            <td class="p-3 text-right text-white font-semibold">
              ${formatMktCap(stock.marketCapCr)}
            </td>
            <td class="p-3 text-right text-tv-text">
              ${stock.pe.toFixed(1)}
            </td>
            <td class="p-3 text-right text-tv-text">
              ₹${stock.eps.toFixed(1)}
            </td>
            <td class="p-3 text-right text-tv-text">
              ${stock.divYield.toFixed(2)}%
            </td>
            <td class="p-3 text-tv-muted font-sans text-[11px]">
              ${stock.sector}
            </td>
          `;
        } else if (currentView === "performance") {
          rowHtml += `
            <td class="p-3 text-right font-bold text-white">₹${stock.price.toFixed(2)}</td>
            <td class="p-3 text-right ${stock.changePercent1D >= 0 ? "text-tv-bullish" : "text-tv-bearish"} font-bold">${stock.changePercent1D >= 0 ? "+" : ""}${stock.changePercent1D.toFixed(2)}%</td>
            <td class="p-3 text-right ${stock.changePercent1W >= 0 ? "text-tv-bullish" : "text-tv-bearish"}">${stock.changePercent1W >= 0 ? "+" : ""}${stock.changePercent1W.toFixed(1)}%</td>
            <td class="p-3 text-right ${stock.changePercent1M >= 0 ? "text-tv-bullish" : "text-tv-bearish"} font-semibold">${stock.changePercent1M >= 0 ? "+" : ""}${stock.changePercent1M.toFixed(1)}%</td>
            <td class="p-3 text-right ${stock.changePercent3M >= 0 ? "text-tv-bullish" : "text-tv-bearish"}">${stock.changePercent3M >= 0 ? "+" : ""}${stock.changePercent3M.toFixed(1)}%</td>
            <td class="p-3 text-right ${stock.changePercent6M >= 0 ? "text-tv-bullish" : "text-tv-bearish"}">${stock.changePercent6M >= 0 ? "+" : ""}${stock.changePercent6M.toFixed(1)}%</td>
            <td class="p-3 text-right ${stock.changePercent1Y >= 0 ? "text-tv-bullish font-bold" : "text-tv-bearish font-bold"}">${stock.changePercent1Y >= 0 ? "+" : ""}${stock.changePercent1Y.toFixed(1)}%</td>
            <td class="p-3 text-right ${stock.changePercentYTD >= 0 ? "text-tv-bullish" : "text-tv-bearish"}">${stock.changePercentYTD >= 0 ? "+" : ""}${stock.changePercentYTD.toFixed(1)}%</td>
            <td class="p-3 text-center">
              <div class="flex items-center space-x-1.5 w-36 mx-auto">
                <span class="text-[9px] text-tv-muted font-mono">₹${stock.low52w.toFixed(0)}</span>
                <div class="flex-1 h-1.5 bg-tv-tertiary rounded-full relative overflow-hidden">
                  <div class="h-full bg-tv-accent rounded-full" style="width: ${pos52}%"></div>
                </div>
                <span class="text-[9px] text-tv-muted font-mono">₹${stock.high52w.toFixed(0)}</span>
              </div>
            </td>
            <td class="p-3 text-right text-tv-text">${stock.beta.toFixed(2)}</td>
            <td class="p-3 text-right text-tv-muted">${stock.volatility1M.toFixed(1)}%</td>
          `;
        } else if (currentView === "technicals") {
          rowHtml += `
            <td class="p-3 text-right font-bold text-white">₹${stock.price.toFixed(2)}</td>
            <td class="p-3 text-right ${stock.changePercent1D >= 0 ? "text-tv-bullish font-bold" : "text-tv-bearish font-bold"}">${stock.changePercent1D >= 0 ? "+" : ""}${stock.changePercent1D.toFixed(2)}%</td>
            <td class="p-3 text-center">${ratingBadge}</td>
            <td class="p-3 text-center">
              <span class="px-2 py-0.5 rounded font-mono text-xs font-bold ${rsiClass}">
                ${stock.rsi.toFixed(1)}
              </span>
            </td>
            <td class="p-3 text-center">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                stock.supertrend === "BULLISH"
                  ? "bg-tv-bullish/20 text-tv-bullish border border-tv-bullish/30"
                  : "bg-tv-bearish/20 text-tv-bearish border border-tv-bearish/30"
              }">
                ${stock.supertrend === "BULLISH" ? "🟢 Bullish" : "🔴 Bearish"}
              </span>
            </td>
            <td class="p-3 text-center text-[10px] font-mono font-semibold ${
              stock.emaCross.includes("BULLISH") ? "text-tv-bullish" : "text-tv-bearish"
            }">
              ${stock.emaCross.replace("_", " ")}
            </td>
            <td class="p-3 text-center text-[10px] font-mono font-semibold ${
              stock.macdSignal === "BULLISH" ? "text-tv-bullish" : stock.macdSignal === "BEARISH" ? "text-tv-bearish" : "text-tv-muted"
            }">
              ${stock.macdSignal}
            </td>
            <td class="p-3 text-right text-tv-text">${stock.bbWidth.toFixed(1)}%</td>
            <td class="p-3 text-right text-tv-text">₹${stock.atr.toFixed(1)}</td>
            <td class="p-3 text-right font-bold ${stock.high52wDiff >= -2.0 ? "text-tv-bullish" : "text-tv-muted"}">
              ${stock.high52wDiff === 0 ? "🔥 52W High" : `${stock.high52wDiff.toFixed(1)}%`}
            </td>
          `;
        } else if (currentView === "valuation") {
          rowHtml += `
            <td class="p-3 text-right font-bold text-white">₹${stock.price.toFixed(2)}</td>
            <td class="p-3 text-right text-white font-semibold">${formatMktCap(stock.marketCapCr)}</td>
            <td class="p-3 text-right text-white font-bold">${stock.pe.toFixed(1)}</td>
            <td class="p-3 text-right text-tv-muted">${stock.forwardPe.toFixed(1)}</td>
            <td class="p-3 text-right text-tv-text">${stock.pb.toFixed(2)}</td>
            <td class="p-3 text-right text-tv-text">${stock.evEbitda.toFixed(1)}</td>
            <td class="p-3 text-right text-tv-text">${stock.ps.toFixed(2)}</td>
            <td class="p-3 text-right text-tv-text">${stock.peg.toFixed(2)}</td>
            <td class="p-3 text-right text-tv-text">${stock.divYield.toFixed(2)}%</td>
            <td class="p-3 text-right text-emerald-400 font-semibold">${stock.roe.toFixed(1)}%</td>
            <td class="p-3 text-right text-tv-muted">${stock.debtToEquity.toFixed(2)}</td>
          `;
        } else if (currentView === "dividends") {
          rowHtml += `
            <td class="p-3 text-right font-bold text-white">₹${stock.price.toFixed(2)}</td>
            <td class="p-3 text-right text-emerald-400 font-bold">${stock.divYield.toFixed(2)}%</td>
            <td class="p-3 text-right text-white">₹${stock.divPerShare.toFixed(1)}</td>
            <td class="p-3 text-right text-tv-text">${stock.netMargin.toFixed(1)}%</td>
            <td class="p-3 text-right text-tv-text">${stock.roe.toFixed(1)}%</td>
            <td class="p-3 text-right text-tv-text">${stock.roce.toFixed(1)}%</td>
            <td class="p-3 text-right text-tv-muted">${stock.debtToEquity.toFixed(2)}</td>
            <td class="p-3 text-right ${stock.yoyProfitGrowth >= 0 ? "text-tv-bullish" : "text-tv-bearish"} font-bold">
              ${stock.yoyProfitGrowth >= 0 ? "+" : ""}${stock.yoyProfitGrowth.toFixed(1)}%
            </td>
          `;
        }

        // Actions Column
        rowHtml += `
            <td class="p-3 text-center">
              <div class="flex items-center justify-center space-x-1.5">
                <a href="/index.html?symbols=${stock.symbol}" title="Open in Workbench" class="px-2 py-1 rounded bg-tv-tertiary hover:bg-tv-accent hover:text-white text-tv-text text-xs transition flex items-center space-x-1 cursor-pointer">
                  <span>📊</span>
                  <span class="hidden xl:inline text-[11px] font-semibold">Workbench</span>
                </a>
                <a href="/stock.html?symbol=${stock.symbol}" title="Scrip Intel & Screener Financials" class="px-2 py-1 rounded bg-tv-tertiary hover:bg-indigo-500/20 hover:text-indigo-400 text-tv-text text-xs transition cursor-pointer">
                  🔬
                </a>
                <a href="/simulator.html?symbol=${stock.symbol}" title="Simulate Strategy" class="px-2 py-1 rounded bg-tv-tertiary hover:bg-amber-500/20 hover:text-amber-400 text-tv-text text-xs transition cursor-pointer">
                  🧪
                </a>
              </div>
            </td>
          </tr>
        `;

        return rowHtml;
      })
      .join("");

    // Wire up row checkboxes
    tableBody.querySelectorAll<HTMLInputElement>("[data-stock-select]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const sym = cb.getAttribute("data-stock-select");
        if (!sym) return;
        if (cb.checked) shortlistedSymbols.add(sym);
        else shortlistedSymbols.delete(sym);
        updateActionBar();
        renderTable();
      });
    });

    // Wire up star watchlist toggles
    tableBody.querySelectorAll<HTMLButtonElement>("[data-stock-star]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sym = btn.getAttribute("data-stock-star");
        if (!sym) return;
        if (starredSymbols.has(sym)) starredSymbols.delete(sym);
        else starredSymbols.add(sym);
        renderTable();
      });
    });
  };

  // 5. Render Charts / Cards View
  const renderChartsView = (stocks: ScreenerStock[]) => {
    if (!chartsView) return;

    if (stocks.length === 0) {
      chartsView.innerHTML = `<div class="col-span-full py-16 text-center text-tv-muted">No stocks found matching criteria.</div>`;
      return;
    }

    chartsView.innerHTML = stocks
      .map((stock) => {
        const isChecked = shortlistedSymbols.has(stock.symbol);
        const isBull = stock.changePercent1D >= 0;

        return `
          <div class="bg-tv-secondary border border-tv-border rounded-xl p-3.5 space-y-3 hover:border-tv-accent/50 transition shadow-md flex flex-col justify-between ${
            isChecked ? "ring-2 ring-tv-accent" : ""
          }">
            <div>
              <!-- Top Row -->
              <div class="flex items-start justify-between">
                <div>
                  <div class="flex items-center space-x-1.5">
                    <input type="checkbox" data-stock-select="${stock.symbol}" class="w-3.5 h-3.5 rounded border-tv-border bg-tv-primary text-tv-accent cursor-pointer" ${
                      isChecked ? "checked" : ""
                    } />
                    <a href="/index.html?symbols=${stock.symbol}" class="text-sm font-bold text-white font-mono hover:text-tv-accent">${stock.symbol}</a>
                    <span class="text-[9px] px-1 py-0.2 rounded bg-tv-tertiary text-tv-muted font-mono">NSE</span>
                  </div>
                  <div class="text-[11px] text-tv-muted truncate max-w-[180px]">${stock.name}</div>
                </div>

                <div class="text-right font-mono">
                  <div class="text-sm font-bold text-white">₹${stock.price.toFixed(2)}</div>
                  <div class="text-[11px] font-bold ${isBull ? "text-tv-bullish" : "text-tv-bearish"}">
                    ${isBull ? "+" : ""}${stock.changePercent1D.toFixed(2)}%
                  </div>
                </div>
              </div>

              <!-- Sparkline Curve -->
              <div class="my-2.5 py-1 px-2 rounded-lg bg-tv-primary/60 border border-tv-border/50 flex items-center justify-between">
                <div class="text-[10px] text-tv-muted font-mono">1D Trend</div>
                ${renderSparklineSvg(stock.sparkline, isBull)}
              </div>

              <!-- Telemetry Pills Grid -->
              <div class="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                <div class="p-1 rounded bg-tv-primary border border-tv-border/60 flex items-center justify-between">
                  <span class="text-tv-muted">RSI:</span>
                  <span class="font-bold ${stock.rsi <= 35 ? "text-tv-bullish" : stock.rsi >= 70 ? "text-tv-bearish" : "text-white"}">${stock.rsi.toFixed(1)}</span>
                </div>
                <div class="p-1 rounded bg-tv-primary border border-tv-border/60 flex items-center justify-between">
                  <span class="text-tv-muted">RVOL:</span>
                  <span class="font-bold ${stock.rvol >= 2.0 ? "text-amber-400" : "text-white"}">${stock.rvol.toFixed(1)}x</span>
                </div>
                <div class="p-1 rounded bg-tv-primary border border-tv-border/60 flex items-center justify-between">
                  <span class="text-tv-muted">P/E:</span>
                  <span class="font-bold text-white">${stock.pe.toFixed(1)}</span>
                </div>
                <div class="p-1 rounded bg-tv-primary border border-tv-border/60 flex items-center justify-between">
                  <span class="text-tv-muted">MktCap:</span>
                  <span class="font-bold text-white">${formatMktCap(stock.marketCapCr)}</span>
                </div>
              </div>
            </div>

            <!-- Card Bottom Buttons -->
            <div class="pt-2 border-t border-tv-border/60 flex items-center space-x-1.5">
              <a href="/index.html?symbols=${stock.symbol}" class="flex-1 py-1 px-2 rounded-lg bg-tv-tertiary hover:bg-tv-accent hover:text-white text-center text-xs font-semibold text-tv-text transition">
                📊 Workbench
              </a>
              <a href="/stock.html?symbol=${stock.symbol}" class="py-1 px-2.5 rounded-lg bg-tv-tertiary hover:bg-indigo-500/20 hover:text-indigo-400 text-xs transition" title="Scrip Research">
                🔬
              </a>
            </div>
          </div>
        `;
      })
      .join("");

    chartsView.querySelectorAll<HTMLInputElement>("[data-stock-select]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const sym = cb.getAttribute("data-stock-select");
        if (!sym) return;
        if (cb.checked) shortlistedSymbols.add(sym);
        else shortlistedSymbols.delete(sym);
        updateActionBar();
        renderTable();
      });
    });
  };

  // 6. Render Heatmap View (TradingView Treemap)
  const renderHeatmapView = (stocks: ScreenerStock[]) => {
    if (!heatmapGrid) return;

    if (stocks.length === 0) {
      heatmapGrid.innerHTML = `<div class="col-span-12 py-16 text-center text-tv-muted">No stocks found matching current criteria.</div>`;
      return;
    }

    // Color mapper based on % change (-3% to +3%)
    const getHeatmapColor = (pct: number): string => {
      if (pct >= 2.5) return "bg-[#089981] hover:bg-[#0aa88f] text-white";
      if (pct >= 1.5) return "bg-[#0c7c6a] hover:bg-[#0e8a76] text-white";
      if (pct > 0.0) return "bg-[#125845] hover:bg-[#166952] text-white";
      if (pct === 0) return "bg-[#2a2e39] hover:bg-[#363a45] text-white";
      if (pct > -1.5) return "bg-[#642831] hover:bg-[#782833] text-white";
      if (pct > -2.5) return "bg-[#912833] hover:bg-[#a62833] text-white";
      return "bg-[#b22833] hover:bg-[#cc2833] text-white";
    };

    // Calculate span based on market cap rank
    const sortedByCap = [...stocks].sort((a, b) => b.marketCapCr - a.marketCapCr);

    heatmapGrid.innerHTML = sortedByCap
      .map((stock, idx) => {
        let colSpan = "col-span-2 sm:col-span-2 md:col-span-2";
        let rowSpan = "h-24";
        if (idx === 0) {
          colSpan = "col-span-6 sm:col-span-5 md:col-span-4";
          rowSpan = "h-40";
        } else if (idx === 1 || idx === 2) {
          colSpan = "col-span-6 sm:col-span-4 md:col-span-3";
          rowSpan = "h-36";
        } else if (idx < 6) {
          colSpan = "col-span-4 sm:col-span-3 md:col-span-2";
          rowSpan = "h-28";
        }

        const colorClass = getHeatmapColor(stock.changePercent1D);

        return `
          <div data-heatmap-stock="${stock.symbol}" class="${colSpan} ${rowSpan} ${colorClass} rounded-xl p-2.5 flex flex-col justify-between cursor-pointer transition transform hover:scale-[1.02] shadow-sm select-none" title="${stock.name} | ${stock.sector} | P/E: ${stock.pe}">
            <div class="flex items-start justify-between">
              <span class="font-mono font-bold text-sm leading-tight">${stock.symbol}</span>
              <span class="text-[10px] font-mono opacity-80">${stock.sector.split("/")[0]}</span>
            </div>
            <div>
              <div class="text-xs font-mono font-bold">₹${stock.price.toFixed(1)}</div>
              <div class="text-xs font-mono font-bold mt-0.5">
                ${stock.changePercent1D >= 0 ? "+" : ""}${stock.changePercent1D.toFixed(2)}%
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    heatmapGrid.querySelectorAll<HTMLElement>("[data-heatmap-stock]").forEach((tile) => {
      tile.addEventListener("click", () => {
        const sym = tile.getAttribute("data-heatmap-stock");
        if (!sym) return;
        window.location.href = `/index.html?symbols=${sym}`;
      });
    });
  };

  // 7. Update Shortlist Action Drawer
  const updateActionBar = () => {
    if (!actionBar || !shortlistCountEl || !shortlistTagsEl) return;

    const count = shortlistedSymbols.size;
    if (footerShortlistEl) {
      footerShortlistEl.textContent = `${count} Shortlisted`;
    }

    if (count > 0) {
      actionBar.classList.remove("translate-y-28", "opacity-0", "pointer-events-none");
      actionBar.classList.add("translate-y-0", "opacity-100");
      shortlistCountEl.textContent = `${count} ${count === 1 ? "Stock" : "Stocks"} Shortlisted`;

      shortlistTagsEl.innerHTML = Array.from(shortlistedSymbols)
        .map(
          (sym) =>
            `<span class="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-tv-tertiary text-tv-accent border border-tv-border font-mono text-xs font-bold flex-shrink-0">
              <span>${sym}</span>
              <button data-remove-tag="${sym}" class="hover:text-tv-bearish text-tv-muted ml-1 cursor-pointer">✕</button>
            </span>`
        )
        .join("");

      shortlistTagsEl.querySelectorAll<HTMLButtonElement>("[data-remove-tag]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const sym = btn.getAttribute("data-remove-tag");
          if (sym) {
            shortlistedSymbols.delete(sym);
            updateActionBar();
            renderTable();
          }
        });
      });
    } else {
      actionBar.classList.add("translate-y-28", "opacity-0", "pointer-events-none");
      actionBar.classList.remove("translate-y-0", "opacity-100");
    }
  };

  // 8. Main Render Function
  const renderTable = () => {
    const filtered = getFilteredData();
    const sorted = getSortedData(filtered);

    // Update Counts
    if (visibleCountEl) visibleCountEl.textContent = sorted.length.toString();

    // Update Breadth stats
    if (breadthStatsEl) {
      const adv = filtered.filter((s) => s.changePercent1D > 0).length;
      const dec = filtered.filter((s) => s.changePercent1D < 0).length;
      breadthStatsEl.textContent = `${adv} Adv / ${dec} Dec`;
    }

    // Render based on current display mode
    if (currentDisplayMode === "table") {
      tableView?.classList.remove("hidden");
      chartsView?.classList.add("hidden");
      heatmapView?.classList.add("hidden");
      renderTableHeaders();
      renderTableRows(sorted);
    } else if (currentDisplayMode === "charts") {
      tableView?.classList.add("hidden");
      chartsView?.classList.remove("hidden");
      heatmapView?.classList.add("hidden");
      renderChartsView(sorted);
    } else if (currentDisplayMode === "heatmap") {
      tableView?.classList.add("hidden");
      chartsView?.classList.add("hidden");
      heatmapView?.classList.remove("hidden");
      renderHeatmapView(sorted);
    }

    // Update master checkbox
    const masterCb = document.getElementById("screener-select-all") as HTMLInputElement | null;
    if (masterCb) {
      masterCb.checked = filtered.length > 0 && filtered.every((s) => shortlistedSymbols.has(s.symbol));
    }

    updateFilterChipsBadges();
  };

  // Reset all filters
  const resetAllFilters = () => {
    currentPreset = "all";
    filterState.index = "all";
    filterState.price = "all";
    filterState.priceMin = null;
    filterState.priceMax = null;
    filterState.chg = "all";
    filterState.mktcap = "all";
    filterState.pe = "all";
    filterState.rvol = "all";
    filterState.rating = "all";
    filterState.rsi = "all";
    filterState.sector = "all";
    searchKeyword = "";

    if (searchInput) searchInput.value = "";
    if (searchClearBtn) searchClearBtn.classList.add("hidden");
    if (currentScreenNameEl) currentScreenNameEl.textContent = "All stocks";
    if (screenPresetIconEl) screenPresetIconEl.textContent = "📋";

    // Reset radio inputs
    document.querySelectorAll<HTMLInputElement>(".filter-popover input[type='radio']").forEach((r) => {
      if (r.value === "all") r.checked = true;
    });

    renderTable();
  };

  // Helper to close all floating menus and popovers
  const closeAllMenus = () => {
    screenPresetMenu?.classList.add("hidden");
    marketMenu?.classList.add("hidden");
    tfMenu?.classList.add("hidden");
    document.getElementById("subapp-launcher-menu")?.classList.add("hidden");
    document.querySelectorAll(".filter-popover").forEach((p) => p.classList.add("hidden"));
  };

  // 9. Attach Event Listeners
  // Screen Preset popover trigger
  screenPresetBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = screenPresetMenu?.classList.contains("hidden");
    closeAllMenus();
    if (isHidden) {
      screenPresetMenu?.classList.remove("hidden");
    }
  });

  // Screen preset options selection
  screenPresetMenu?.querySelectorAll<HTMLButtonElement>("[data-screen-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = btn.getAttribute("data-screen-preset") || "all";
      currentPreset = preset;
      if (presetConfig[preset]) {
        if (currentScreenNameEl) currentScreenNameEl.textContent = presetConfig[preset].name;
        if (screenPresetIconEl) screenPresetIconEl.textContent = presetConfig[preset].icon;
      }
      screenPresetMenu?.classList.add("hidden");
      renderTable();
    });
  });

  // Market selector
  marketBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = marketMenu?.classList.contains("hidden");
    closeAllMenus();
    if (isHidden) {
      marketMenu?.classList.remove("hidden");
    }
  });
  marketMenu?.querySelectorAll<HTMLButtonElement>("[data-market]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentMarket = btn.getAttribute("data-market") || "NSE";
      const marketLabel = marketBtn?.querySelector("span:nth-child(2)");
      if (marketLabel) marketLabel.textContent = currentMarket === "US" ? "US Equities" : `India (${currentMarket})`;
      marketMenu?.classList.add("hidden");
      renderTable();
    });
  });

  // Timeframe selector
  tfBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = tfMenu?.classList.contains("hidden");
    closeAllMenus();
    if (isHidden) {
      tfMenu?.classList.remove("hidden");
    }
  });
  tfMenu?.querySelectorAll<HTMLButtonElement>("[data-tf]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTimeframe = btn.getAttribute("data-tf") || "1D";
      if (tfLabel) tfLabel.textContent = currentTimeframe;
      tfMenu?.classList.add("hidden");
    });
  });

  // View tabs selection
  document.querySelectorAll<HTMLButtonElement>(".view-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-screener-view") as any;
      if (!view) return;
      currentView = view;
      document.querySelectorAll(".view-tab-btn").forEach((b) => {
        b.classList.remove("bg-tv-tertiary", "text-white", "border", "border-tv-border");
        b.classList.add("text-tv-muted");
      });
      btn.classList.add("bg-tv-tertiary", "text-white", "border", "border-tv-border");
      btn.classList.remove("text-tv-muted");
      renderTable();
    });
  });

  // Display mode switcher (Table / Charts / Heatmap)
  document.querySelectorAll<HTMLButtonElement>(".display-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-display-mode") as any;
      if (!mode) return;
      currentDisplayMode = mode;
      document.querySelectorAll(".display-mode-btn").forEach((b) => {
        b.classList.remove("bg-tv-tertiary", "text-white", "font-semibold");
        b.classList.add("text-tv-muted");
      });
      btn.classList.add("bg-tv-tertiary", "text-white", "font-semibold");
      btn.classList.remove("text-tv-muted");
      renderTable();
    });
  });

  // Filter chips popovers
  document.querySelectorAll(".filter-chip-wrapper").forEach((wrapper) => {
    const btn = wrapper.querySelector(".filter-chip-btn");
    const popover = wrapper.querySelector(".filter-popover");

    btn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = popover?.classList.contains("hidden");
      closeAllMenus();
      if (isHidden) {
        popover?.classList.remove("hidden");
      }
    });

    // Handle radio changes inside popover
    popover?.querySelectorAll<HTMLInputElement>("input[type='radio']").forEach((radio) => {
      radio.addEventListener("change", () => {
        const filterType = btn?.getAttribute("data-filter");
        if (filterType && radio.checked) {
          (filterState as any)[filterType] = radio.value;
          popover.classList.add("hidden");
          renderTable();
        }
      });
    });
  });

  // Clear all filters button
  btnClearAllFilters?.addEventListener("click", resetAllFilters);

  // Search input
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchKeyword = (e.target as HTMLInputElement).value;
      if (searchClearBtn) {
        if (searchKeyword) searchClearBtn.classList.remove("hidden");
        else searchClearBtn.classList.add("hidden");
      }
      renderTable();
    });

    searchClearBtn?.addEventListener("click", () => {
      searchInput.value = "";
      searchKeyword = "";
      searchClearBtn.classList.add("hidden");
      renderTable();
    });
  }

  // Keyboard shortcut Ctrl+K
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      searchInput?.focus();
    }
    if (e.key === "Escape") {
      screenPresetMenu?.classList.add("hidden");
      marketMenu?.classList.add("hidden");
      tfMenu?.classList.add("hidden");
      document.querySelectorAll(".filter-popover").forEach((p) => p.classList.add("hidden"));
    }
  });

  // Global click outside popovers
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest("#screen-preset-container")) screenPresetMenu?.classList.add("hidden");
    if (!target.closest("#market-select-container")) marketMenu?.classList.add("hidden");
    if (!target.closest("#timeframe-select-container")) tfMenu?.classList.add("hidden");
    if (!target.closest(".filter-chip-wrapper")) {
      document.querySelectorAll(".filter-popover").forEach((p) => p.classList.add("hidden"));
    }
  });

  // AI Screener Assistant Logic
  btnAiTrigger?.addEventListener("click", () => {
    aiDrawer?.classList.toggle("hidden");
    if (!aiDrawer?.classList.contains("hidden")) {
      aiPromptInput?.focus();
    }
  });

  btnCloseAiDrawer?.addEventListener("click", () => {
    aiDrawer?.classList.add("hidden");
  });

  const runAiPrompt = (promptText: string) => {
    const p = promptText.toLowerCase();
    resetAllFilters();

    if (p.includes("breakout") || p.includes("rvol")) {
      currentPreset = "breakout";
      filterState.rvol = "2.0";
      if (currentScreenNameEl) currentScreenNameEl.textContent = "Volume Breakout";
    } else if (p.includes("momentum") || p.includes("52w") || p.includes("runners")) {
      currentPreset = "momentum";
      if (currentScreenNameEl) currentScreenNameEl.textContent = "High Momentum";
    } else if (p.includes("oversold") || p.includes("bounce")) {
      currentPreset = "oversold";
      filterState.rsi = "oversold";
      if (currentScreenNameEl) currentScreenNameEl.textContent = "Oversold Bounce";
    } else if (p.includes("dividend")) {
      currentPreset = "high-dividend";
      if (currentScreenNameEl) currentScreenNameEl.textContent = "High Dividend Yield";
    } else if (p.includes("value") || p.includes("pe")) {
      currentPreset = "undervalued";
      filterState.pe = "deep-value";
      if (currentScreenNameEl) currentScreenNameEl.textContent = "Value Gems";
    }

    if (p.includes("nifty 50")) filterState.index = "NIFTY 50";
    if (p.includes("bank")) filterState.sector = "Banking";
    if (p.includes("it") || p.includes("tech")) filterState.sector = "Information Tech";

    aiDrawer?.classList.add("hidden");
    renderTable();
  };

  btnSubmitAi?.addEventListener("click", () => {
    if (aiPromptInput?.value) runAiPrompt(aiPromptInput.value);
  });
  aiPromptInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && aiPromptInput.value) {
      runAiPrompt(aiPromptInput.value);
    }
  });

  document.querySelectorAll(".ai-suggestion-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const text = chip.textContent || "";
      if (aiPromptInput) aiPromptInput.value = text;
      runAiPrompt(text);
    });
  });

  // Shortlist Action Buttons
  openWorkbenchBtn?.addEventListener("click", () => {
    const syms = Array.from(shortlistedSymbols);
    if (syms.length > 0) {
      window.location.href = `/index.html?symbols=${encodeURIComponent(syms.join(","))}`;
    }
  });

  openStockBtn?.addEventListener("click", () => {
    const syms = Array.from(shortlistedSymbols);
    if (syms.length > 0) {
      window.location.href = `/stock.html?symbol=${encodeURIComponent(syms[0])}`;
    }
  });

  openSimBtn?.addEventListener("click", () => {
    const syms = Array.from(shortlistedSymbols);
    if (syms.length > 0) {
      window.location.href = `/simulator.html?symbol=${encodeURIComponent(syms[0])}`;
    }
  });

  clearShortlistBtn?.addEventListener("click", () => {
    shortlistedSymbols.clear();
    updateActionBar();
    renderTable();
  });

  // Export to CSV
  document.getElementById("btn-export-csv")?.addEventListener("click", () => {
    const filtered = getFilteredData();
    const headers = [
      "Symbol",
      "Name",
      "Sector",
      "Price",
      "Change1D%",
      "Volume",
      "RVOL",
      "RSI",
      "MarketCapCr",
      "PE",
      "DivYield%",
      "TechRating",
    ];
    const rows = filtered.map((s) => [
      s.symbol,
      `"${s.name}"`,
      `"${s.sector}"`,
      s.price,
      s.changePercent1D,
      s.volume,
      s.rvol,
      s.rsi,
      s.marketCapCr,
      s.pe,
      s.divYield,
      s.techRating,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `honba_screener_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Initial render
  renderTable();
  updateActionBar();
}

// Auto-run if entry point
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    initScreener();
  });
}
