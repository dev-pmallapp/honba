import { createChart, darkTheme, type Chart, type SeriesApi } from "openalgo-charts";
import { WATCHLIST_DATA, SAMPLE_OPTIONS_CHAIN, DEFAULT_TEARSHEET, generateSampleBars } from "./data";
import { initHeaderNavigation } from "./nav";

export interface ChartPane {
  id: string;
  symbol: string;
  timeframe: string;
  chart: Chart;
  series: SeriesApi;
}

let activeSymbols: string[] = ["NIFTY ALPHA 50"];
let chartPanes: ChartPane[] = [];
let currentSymbol = localStorage.getItem("honba_symbol") || "NIFTY ALPHA 50";
let currentTimeframe = "5m";
let candleSeries: SeriesApi | null = null;
let indicatorStates = { ema9: true, ema21: true, volume: true, supertrend: false };

export function initWorkbench() {
  initHeaderNavigation("workbench");

  // 1. Read URL query parameters for ?symbols=RELIANCE,TCS (e.g. from Screener)
  const urlParams = new URLSearchParams(window.location.search);
  const symbolsParam = urlParams.get("symbols");
  if (symbolsParam) {
    const list = symbolsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length > 0) {
      activeSymbols = list.slice(0, 4);
      currentSymbol = activeSymbols[0];
    }
  }

  // 2. Initialize Canvas Charts (Multi-Pane Side-by-Side aware)
  renderCharts();

  // 3. Initialize Multi-Chart Layout Switcher
  initLayoutSwitcher();

  // 4. Initialize Drawing Tool Rail
  initDrawingToolbar();

  // 5. Initialize Right Sidebar (Watchlist, Order Ticket, Options)
  initSidebar();

  // 6. Initialize Bottom Strategy Dock
  initStrategyDock();

  // Listen for global symbol changes
  window.addEventListener("honba:symbol-change", (e: any) => {
    switchSymbol(e.detail);
  });

  // Listen for theme changes
  window.addEventListener("honba:theme-change", () => {
    renderEquityCurveCanvas();
    renderCharts();
  });

  // Timeframe selector buttons
  const tfButtons = document.querySelectorAll<HTMLButtonElement>("[data-tf]");
  tfButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tfButtons.forEach((b) => b.classList.remove("bg-tv-tertiary", "text-white", "font-semibold"));
      btn.classList.add("bg-tv-tertiary", "text-white", "font-semibold");
      currentTimeframe = btn.getAttribute("data-tf") || "5m";
      chartPanes.forEach((pane) => {
        const bars = generateSampleBars(pane.symbol, currentTimeframe);
        pane.series.setData(bars);
      });
      if (chartPanes.length === 1) {
        const bars = generateSampleBars(currentSymbol, currentTimeframe);
        if (bars.length > 0) updateLegend(bars[bars.length - 1]);
      }
    });
  });

  // Indicator dropdown / toggles
  setupIndicatorToggles();

  // Run Backtest action
  setupBacktestButton();

  // Window resize handler (openalgo-charts handles container resize automatically via ResizeObserver)
  window.addEventListener("resize", () => {
    // resize observer handles panes
  });
}

function initLayoutSwitcher() {
  const layoutBtns = document.querySelectorAll<HTMLButtonElement>("[data-layout]");
  layoutBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const layoutNum = parseInt(btn.getAttribute("data-layout") || "1", 10);
      setLayout(layoutNum);
    });
  });

  const resetBtn = document.getElementById("btn-reset-single-chart");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      setLayout(1);
    });
  }
}

function setLayout(count: number) {
  if (count === 1) {
    activeSymbols = [currentSymbol];
  } else if (count === 2) {
    const second = activeSymbols[1] || (currentSymbol === "RELIANCE" ? "TCS" : "RELIANCE");
    activeSymbols = [currentSymbol, second];
  } else if (count === 3) {
    activeSymbols = [currentSymbol, "RELIANCE", "TCS"].slice(0, 3);
  } else if (count === 4) {
    activeSymbols = [currentSymbol, "RELIANCE", "TCS", "INFY"].slice(0, 4);
  }
  renderCharts();
}

export function addSymbolSideBySide(sym: string) {
  if (!activeSymbols.includes(sym)) {
    if (activeSymbols.length >= 4) {
      activeSymbols[activeSymbols.length - 1] = sym;
    } else {
      activeSymbols.push(sym);
    }
    renderCharts();
  }
}

function renderCharts() {
  const wrapper = document.getElementById("charts-wrapper");
  if (!wrapper) return;

  // Cleanup existing charts
  chartPanes = [];
  wrapper.innerHTML = "";

  const count = activeSymbols.length;

  // Multi-pane grid classes
  wrapper.className = `flex-1 w-full h-full relative grid gap-1.5 p-1 overflow-hidden ${
    count === 1
      ? "grid-cols-1 grid-rows-1"
      : count === 2
      ? "grid-cols-1 md:grid-cols-2 grid-rows-1"
      : count === 3
      ? "grid-cols-1 md:grid-cols-3 grid-rows-1"
      : "grid-cols-2 grid-rows-2"
  }`;

  // Update layout switcher buttons active states
  const layoutBtns = document.querySelectorAll<HTMLButtonElement>("[data-layout]");
  layoutBtns.forEach((b) => {
    const l = parseInt(b.getAttribute("data-layout") || "1", 10);
    if (l === count) {
      b.classList.add("bg-tv-tertiary", "text-white", "font-semibold");
      b.classList.remove("text-tv-muted");
    } else {
      b.classList.remove("bg-tv-tertiary", "text-white", "font-semibold");
      b.classList.add("text-tv-muted");
    }
  });

  // Multi-chart status bar vs Single legend
  const statusBar = document.getElementById("multi-chart-status-bar");
  const singleLegend = document.getElementById("single-chart-legend");
  const summaryEl = document.getElementById("active-symbols-summary");

  if (count > 1) {
    if (statusBar) statusBar.classList.remove("hidden");
    if (singleLegend) singleLegend.classList.add("hidden");
    if (summaryEl) summaryEl.textContent = activeSymbols.join(" vs ");
  } else {
    if (statusBar) statusBar.classList.add("hidden");
    if (singleLegend) singleLegend.classList.remove("hidden");
  }

  // Theme tokens
  const style = getComputedStyle(document.documentElement);
  const bullish = style.getPropertyValue("--tv-bullish").trim() || "#089981";
  const bearish = style.getPropertyValue("--tv-bearish").trim() || "#f23645";
  const accent = style.getPropertyValue("--tv-accent").trim() || "#2962ff";
  const border = style.getPropertyValue("--tv-border").trim() || "#2a2e39";

  activeSymbols.forEach((symbol, index) => {
    const paneDiv = document.createElement("div");
    paneDiv.className =
      "flex flex-col bg-tv-primary border border-tv-border rounded-lg overflow-hidden h-full relative group shadow-sm";

    const quote = WATCHLIST_DATA.find((w) => w.symbol === symbol) || {
      price: symbol === "RELIANCE" ? 2984.75 : 4280.0,
      changePercent: 1.2,
      change: 25.0,
    };
    const isBull = quote.changePercent >= 0;

    paneDiv.innerHTML = `
      <!-- Pane Header -->
      <div class="h-7 bg-tv-secondary border-b border-tv-border px-2.5 flex items-center justify-between z-10 flex-shrink-0 select-none">
        <div class="flex items-center space-x-2">
          <span class="font-bold text-xs text-white font-mono tracking-wide">${symbol}</span>
          <span class="text-[10px] text-tv-muted font-mono font-medium">₹${quote.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          <span class="text-[10px] font-mono font-semibold ${isBull ? "text-tv-bullish" : "text-tv-bearish"}">
            ${isBull ? "+" : ""}${quote.changePercent.toFixed(2)}%
          </span>
        </div>
        <div class="flex items-center space-x-1.5 text-[10px]">
          <span class="px-1.5 py-0.2 rounded bg-tv-tertiary text-tv-accent font-mono font-semibold">${currentTimeframe}</span>
          ${
            count > 1
              ? `<button data-remove-pane="${symbol}" title="Close pane" class="w-5 h-5 rounded flex items-center justify-center text-tv-muted hover:text-white hover:bg-tv-bearish/30 transition cursor-pointer text-xs">✕</button>`
              : ""
          }
        </div>
      </div>

      <!-- Canvas container -->
      <div id="chart-canvas-${index}" class="flex-1 w-full h-full relative"></div>
    `;

    wrapper.appendChild(paneDiv);

    const canvasContainer = paneDiv.querySelector(`#chart-canvas-${index}`) as HTMLDivElement;
    if (!canvasContainer) return;

    try {
      const paneChart = createChart(canvasContainer, {
        theme: darkTheme,
        crosshairMode: "normal",
        animZoom: true,
        animAutoscale: true,
      });

      const paneSeries = paneChart.addSeries("candlestick", {
        style: {
          upColor: bullish,
          downColor: bearish,
          borderUpColor: bullish,
          borderDownColor: bearish,
          wickUpColor: bullish,
          wickDownColor: bearish,
        },
      });

      // Indicators
      try {
        if (indicatorStates.ema9) {
          paneChart.addIndicator("ema", { length: 9, color: accent });
        }
        if (indicatorStates.ema21) {
          paneChart.addIndicator("ema", { length: 21, color: "#f59e0b" });
        }
        if (indicatorStates.volume) {
          paneChart.addIndicator("volume", {
            color: border,
            colorByDirection: true,
            upColor: bullish,
            downColor: bearish,
          });
        }
        if (indicatorStates.supertrend) {
          paneChart.addIndicator("supertrend", {
            period: 10,
            multiplier: 3,
            upColor: bullish,
            downColor: bearish,
          });
        }
      } catch (err) {
        // ignore indicator error
      }

      // Populate candlestick data
      const bars = generateSampleBars(symbol, currentTimeframe);
      paneSeries.setData(bars);

      chartPanes.push({
        id: `pane-${index}`,
        symbol,
        timeframe: currentTimeframe,
        chart: paneChart,
        series: paneSeries,
      });

      if (index === 0) {
        candleSeries = paneSeries;
        if (count === 1) {
          paneChart.subscribeCrosshairMove((param: any) => {
            if (param && param.bar) {
              updateLegend(param.bar);
            }
          });
          if (bars.length > 0) {
            updateLegend(bars[bars.length - 1]);
          }
        }
      }
    } catch (e) {
      console.error("Failed to initialize chart for", symbol, e);
    }
  });

  // Wire up remove pane buttons
  wrapper.querySelectorAll<HTMLButtonElement>("[data-remove-pane]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sym = btn.getAttribute("data-remove-pane");
      if (sym && activeSymbols.length > 1) {
        activeSymbols = activeSymbols.filter((s) => s !== sym);
        currentSymbol = activeSymbols[0];
        renderCharts();
      }
    });
  });
}

export function loadChartData() {
  if (chartPanes.length > 0) {
    chartPanes.forEach((pane) => {
      const bars = generateSampleBars(pane.symbol, currentTimeframe);
      pane.series.setData(bars);
    });
  } else if (candleSeries) {
    const bars = generateSampleBars(currentSymbol, currentTimeframe);
    candleSeries.setData(bars);
    if (bars.length > 0) updateLegend(bars[bars.length - 1]);
  }
}

function updateLegend(bar: any) {
  const oEl = document.getElementById("legend-o");
  const hEl = document.getElementById("legend-h");
  const lEl = document.getElementById("legend-l");
  const cEl = document.getElementById("legend-c");
  const chgEl = document.getElementById("legend-change");
  const symEl = document.getElementById("legend-symbol");

  if (symEl) symEl.textContent = currentSymbol;
  if (oEl) oEl.textContent = bar.open.toFixed(2);
  if (hEl) hEl.textContent = bar.high.toFixed(2);
  if (lEl) lEl.textContent = bar.low.toFixed(2);
  if (cEl) cEl.textContent = bar.close.toFixed(2);

  if (chgEl) {
    const diff = bar.close - bar.open;
    const pct = (diff / bar.open) * 100;
    const sign = diff >= 0 ? "+" : "";
    chgEl.textContent = `${sign}${diff.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
    chgEl.className = `font-mono text-xs ${diff >= 0 ? "text-tv-bullish" : "text-tv-bearish"}`;
  }
}

function switchSymbol(symbol: string) {
  currentSymbol = symbol;
  const symbolSelect = document.getElementById("symbol-select") as HTMLSelectElement | null;
  if (symbolSelect) symbolSelect.value = symbol;

  const headerLtp = document.getElementById("header-ltp");
  const item = WATCHLIST_DATA.find((w) => w.symbol === symbol);
  if (headerLtp && item) {
    headerLtp.innerHTML = `LTP: <span class="text-white font-semibold">₹${item.price.toFixed(2)}</span> <span class="${item.change >= 0 ? "text-tv-bullish" : "text-tv-bearish"}">${item.change >= 0 ? "+" : ""}${item.change.toFixed(2)} (${item.changePercent > 0 ? "+" : ""}${item.changePercent.toFixed(2)}%)</span>`;
  }

  if (activeSymbols.length <= 1) {
    activeSymbols = [symbol];
  } else {
    activeSymbols[0] = symbol;
  }
  renderCharts();
}

function initDrawingToolbar() {
  const tools = document.querySelectorAll<HTMLButtonElement>("[data-draw-tool]");
  tools.forEach((btn) => {
    btn.addEventListener("click", () => {
      tools.forEach((b) => b.classList.remove("bg-tv-accent", "text-white"));
      btn.classList.add("bg-tv-accent", "text-white");
    });
  });
}

function setupIndicatorToggles() {
  const menuBtn = document.getElementById("btn-indicators");
  const dropdown = document.getElementById("dropdown-indicators");

  if (menuBtn && dropdown) {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("hidden");
    });

    document.addEventListener("click", () => {
      dropdown.classList.add("hidden");
    });

    dropdown.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    const checkboxes = dropdown.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    checkboxes.forEach((cb) => {
      const key = cb.name as keyof typeof indicatorStates;
      cb.checked = indicatorStates[key];
      cb.addEventListener("change", () => {
        indicatorStates[key] = cb.checked;
        renderCharts();
      });
    });
  }
}

function initSidebar() {
  const tabBtns = document.querySelectorAll<HTMLButtonElement>("[data-side-tab]");
  const tabContents = document.querySelectorAll<HTMLDivElement>("[data-tab-content]");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-side-tab");
      tabBtns.forEach((b) => {
        b.classList.remove("text-white", "border-b-2", "border-tv-accent", "bg-tv-secondary");
        b.classList.add("text-tv-muted");
      });
      btn.classList.add("text-white", "border-b-2", "border-tv-accent", "bg-tv-secondary");
      btn.classList.remove("text-tv-muted");

      tabContents.forEach((content) => {
        if (content.getAttribute("data-tab-content") === targetTab) {
          content.classList.remove("hidden");
        } else {
          content.classList.add("hidden");
        }
      });
    });
  });

  // Render Watchlist rows
  renderWatchlist(WATCHLIST_DATA);

  // Watchlist search filter
  const searchInput = document.getElementById("watchlist-search") as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const val = (e.target as HTMLInputElement).value.toUpperCase();
      const filtered = WATCHLIST_DATA.filter((w) => w.symbol.toUpperCase().includes(val) || w.name.toUpperCase().includes(val));
      renderWatchlist(filtered);
    });
  }

  // Order Ticket setup
  initOrderTicket();

  // Options Quick Chain setup
  renderOptionsTable();
}

function renderWatchlist(list: typeof WATCHLIST_DATA) {
  const container = document.getElementById("watchlist-items");
  if (!container) return;

  container.innerHTML = "";
  list.forEach((item) => {
    const isSelected = activeSymbols.includes(item.symbol);
    const row = document.createElement("div");
    row.className = `flex items-center justify-between p-2.5 hover:bg-tv-tertiary cursor-pointer border-b border-tv-border/50 transition ${
      isSelected ? "bg-tv-tertiary/60 border-l-2 border-l-tv-accent" : ""
    }`;
    const isBull = item.change >= 0;
    row.innerHTML = `
      <div class="flex items-center space-x-2">
        <button data-compare-sym="${item.symbol}" title="Add Side-by-Side in Workbench" class="w-5 h-5 rounded flex items-center justify-center bg-tv-primary hover:bg-tv-accent text-tv-muted hover:text-white text-[9px] font-mono transition flex-shrink-0 cursor-pointer border border-tv-border">
          ▌▌
        </button>
        <div>
          <div class="font-semibold text-xs text-white">${item.symbol}</div>
          <div class="text-[10px] text-tv-muted truncate max-w-[100px]">${item.name}</div>
        </div>
      </div>
      <div class="text-right">
        <div class="font-mono text-xs font-medium text-white">₹${item.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
        <div class="font-mono text-[11px] ${isBull ? "text-tv-bullish" : "text-tv-bearish"}">
          ${isBull ? "▲" : "▼"} ${Math.abs(item.change).toFixed(2)} (${isBull ? "+" : ""}${item.changePercent.toFixed(2)}%)
        </div>
      </div>
    `;

    const compareBtn = row.querySelector(`[data-compare-sym="${item.symbol}"]`);
    compareBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      addSymbolSideBySide(item.symbol);
      renderWatchlist(list);
    });

    row.addEventListener("click", () => {
      switchSymbol(item.symbol);
      renderWatchlist(list);
    });
    container.appendChild(row);
  });
}

function initOrderTicket() {
  const buyBtn = document.getElementById("ot-buy-btn");
  const sellBtn = document.getElementById("ot-sell-btn");
  const submitBtn = document.getElementById("ot-submit-btn");
  const qtyInput = document.getElementById("ot-qty") as HTMLInputElement | null;
  const priceInput = document.getElementById("ot-price") as HTMLInputElement | null;
  const estMarginEl = document.getElementById("ot-est-margin");

  let orderSide: "BUY" | "SELL" = "BUY";

  if (buyBtn && sellBtn && submitBtn) {
    buyBtn.addEventListener("click", () => {
      orderSide = "BUY";
      buyBtn.className = "flex-1 py-1.5 text-xs font-semibold rounded bg-tv-bullish text-white";
      sellBtn.className = "flex-1 py-1.5 text-xs font-semibold rounded bg-tv-tertiary text-tv-muted hover:text-white";
      submitBtn.className = "w-full py-2.5 rounded font-semibold text-xs tracking-wide uppercase bg-tv-bullish hover:opacity-90 text-white transition shadow";
      submitBtn.textContent = `Place Buy Order (${currentSymbol})`;
    });

    sellBtn.addEventListener("click", () => {
      orderSide = "SELL";
      sellBtn.className = "flex-1 py-1.5 text-xs font-semibold rounded bg-tv-bearish text-white";
      buyBtn.className = "flex-1 py-1.5 text-xs font-semibold rounded bg-tv-tertiary text-tv-muted hover:text-white";
      submitBtn.className = "w-full py-2.5 rounded font-semibold text-xs tracking-wide uppercase bg-tv-bearish hover:opacity-90 text-white transition shadow";
      submitBtn.textContent = `Place Sell Order (${currentSymbol})`;
    });

    const updateCalculations = () => {
      const q = parseInt(qtyInput?.value || "25", 10);
      const p = parseFloat(priceInput?.value || "8124.60");
      const margin = (q * p).toFixed(2);
      if (estMarginEl) estMarginEl.textContent = `₹${parseFloat(margin).toLocaleString("en-IN")}`;
    };

    qtyInput?.addEventListener("input", updateCalculations);
    priceInput?.addEventListener("input", updateCalculations);

    submitBtn.addEventListener("click", () => {
      const originalText = submitBtn.textContent;
      submitBtn.textContent = `${orderSide} Order Placed via OpenAlgo / Dhan Gateway ✓`;
      submitBtn.classList.add("opacity-90");
      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.classList.remove("opacity-90");
      }, 2000);
    });
  }
}

function renderOptionsTable() {
  const container = document.getElementById("options-quick-tbody");
  if (!container) return;

  container.innerHTML = "";
  SAMPLE_OPTIONS_CHAIN.forEach((strike) => {
    const isAtm = strike.strikePrice === 24850;
    const tr = document.createElement("tr");
    tr.className = `border-b border-tv-border/60 hover:bg-tv-tertiary/50 font-mono text-[11px] ${isAtm ? "bg-tv-tertiary/80 font-bold" : ""}`;
    tr.innerHTML = `
      <td class="p-1.5 text-right text-tv-bullish">${strike.callLtp.toFixed(1)}</td>
      <td class="p-1.5 text-center text-white bg-tv-primary/80 border-x border-tv-border">${strike.strikePrice}</td>
      <td class="p-1.5 text-left text-tv-bearish">${strike.putLtp.toFixed(1)}</td>
    `;
    container.appendChild(tr);
  });
}

function initStrategyDock() {
  const collapseBtn = document.getElementById("dock-collapse-btn");
  const dock = document.getElementById("strategy-dock");

  let isCollapsed = false;
  if (collapseBtn && dock) {
    collapseBtn.addEventListener("click", () => {
      isCollapsed = !isCollapsed;
      if (isCollapsed) {
        dock.classList.add("h-9");
        dock.classList.remove("h-72");
        collapseBtn.innerHTML = `▲`;
        collapseBtn.title = "Expand Strategy Dock";
      } else {
        dock.classList.remove("h-9");
        dock.classList.add("h-72");
        collapseBtn.innerHTML = `▼`;
        collapseBtn.title = "Collapse Strategy Dock";
      }
    });
  }

  // Dock Tabs
  const dockTabs = document.querySelectorAll<HTMLButtonElement>("[data-dock-tab]");
  const dockPanels = document.querySelectorAll<HTMLDivElement>("[data-dock-panel]");

  dockTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-dock-tab");
      dockTabs.forEach((t) => {
        t.classList.remove("text-white", "border-b-2", "border-tv-accent", "bg-tv-tertiary/40");
        t.classList.add("text-tv-muted");
      });
      tab.classList.add("text-white", "border-b-2", "border-tv-accent", "bg-tv-tertiary/40");
      tab.classList.remove("text-tv-muted");

      dockPanels.forEach((p) => {
        if (p.getAttribute("data-dock-panel") === target) {
          p.classList.remove("hidden");
        } else {
          p.classList.add("hidden");
        }
      });
    });
  });

  // Render Cumulative Equity Curve canvas
  renderEquityCurveCanvas();

  // Re-render canvases and chart when theme changes
  window.addEventListener("honba:theme-change", () => {
    renderEquityCurveCanvas();
    renderCharts();
  });
}

function renderEquityCurveCanvas() {
  const canvas = document.getElementById("equity-curve-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const style = getComputedStyle(document.documentElement);
  const bullish = style.getPropertyValue("--tv-bullish").trim() || "#089981";
  const border = style.getPropertyValue("--tv-border").trim() || "#2a2e39";
  const muted = style.getPropertyValue("--tv-text-muted").trim() || "#787b86";

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  // Background subtle grid
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  for (let y = 15; y < height; y += 25) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Benchmark curve (Nifty 50 TR)
  ctx.strokeStyle = muted;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, height - 10);
  const benchPoints = [
    { x: 0, y: height - 10 },
    { x: width * 0.25, y: height - 25 },
    { x: width * 0.5, y: height - 32 },
    { x: width * 0.75, y: height - 42 },
    { x: width, y: height - 52 },
  ];
  benchPoints.forEach((pt) => ctx.lineTo(pt.x, pt.y));
  ctx.stroke();

  // Strategy curve (Honba Alpha 50)
  ctx.strokeStyle = bullish;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const stratPoints = [
    { x: 0, y: height - 10 },
    { x: width * 0.15, y: height - 20 },
    { x: width * 0.3, y: height - 18 },
    { x: width * 0.45, y: height - 45 },
    { x: width * 0.6, y: height - 55 },
    { x: width * 0.75, y: height - 52 },
    { x: width * 0.88, y: height - 72 },
    { x: width, y: 15 },
  ];
  stratPoints.forEach((pt, idx) => {
    if (idx === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.stroke();

  // Gradient fill under strategy curve
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, "rgba(8, 153, 129, 0.25)");
  grad.addColorStop(1, "rgba(8, 153, 129, 0.0)");
  ctx.fillStyle = grad;
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();
}

function setupBacktestButton() {
  const btn = document.getElementById("btn-run-backtest");
  if (!btn) return;

  btn.addEventListener("click", () => {
    btn.innerHTML = `<span class="animate-spin inline-block mr-1">⚙</span> Simulating...`;
    btn.classList.add("opacity-80");

    setTimeout(() => {
      btn.innerHTML = `<span>▶</span> Run Backtest`;
      btn.classList.remove("opacity-80");

      // Flash tearsheet values
      const profitEl = document.getElementById("metric-profit");
      if (profitEl) {
        const randProfit = (DEFAULT_TEARSHEET.netProfit + Math.floor(Math.random() * 8000 - 4000)).toLocaleString("en-IN");
        profitEl.innerHTML = `₹${randProfit} <span class="text-xs text-tv-bullish ml-1">(+29.1%)</span>`;
      }
      renderEquityCurveCanvas();
    }, 900);
  });
}
