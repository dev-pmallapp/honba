import { initHeaderNavigation } from "./nav";
import { SCREENER_DATA } from "./data";
import { ScreenerStock } from "./types";

export function initScreener() {
  initHeaderNavigation("screener");

  let currentPreset: string = "all";
  let currentSector: string = "all";
  let searchKeyword: string = "";
  const shortlistedSymbols = new Set<string>();

  const tableBody = document.getElementById("screener-tbody");
  const rowCountEl = document.getElementById("screener-count");
  const searchInput = document.getElementById("screener-search") as HTMLInputElement | null;
  const sectorFilter = document.getElementById("screener-sector-filter") as HTMLSelectElement | null;
  const presetButtons = document.querySelectorAll<HTMLButtonElement>("[data-screener-preset]");
  const masterCheckbox = document.getElementById("screener-select-all") as HTMLInputElement | null;

  // Shortlist action bar elements
  const actionBar = document.getElementById("shortlist-action-bar");
  const shortlistCountEl = document.getElementById("shortlist-count");
  const shortlistTagsEl = document.getElementById("shortlist-tags");
  const openWorkbenchBtn = document.getElementById("btn-shortlist-workbench");
  const openSimBtn = document.getElementById("btn-shortlist-simulator");
  const clearShortlistBtn = document.getElementById("btn-clear-shortlist");

  const filterData = (): ScreenerStock[] => {
    return SCREENER_DATA.filter((stock) => {
      // Keyword search
      const q = searchKeyword.toLowerCase();
      const matchesSearch =
        !q ||
        stock.symbol.toLowerCase().includes(q) ||
        stock.name.toLowerCase().includes(q) ||
        stock.sector.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // Sector filter
      if (currentSector !== "all" && !stock.sector.toLowerCase().includes(currentSector.toLowerCase())) {
        return false;
      }

      // Presets
      if (currentPreset === "momentum") {
        return stock.high52wDiff >= -3.0 && stock.rsi >= 60;
      } else if (currentPreset === "breakout") {
        return stock.rvol >= 2.0 && stock.changePercent1D > 0;
      } else if (currentPreset === "oversold") {
        return stock.rsi <= 40;
      } else if (currentPreset === "supertrend") {
        return stock.supertrend === "BULLISH";
      } else if (currentPreset === "volume") {
        return stock.rvol >= 1.8;
      }

      return true;
    });
  };

  const updateActionBar = () => {
    if (!actionBar || !shortlistCountEl || !shortlistTagsEl) return;

    const count = shortlistedSymbols.size;
    if (count > 0) {
      actionBar.classList.remove("translate-y-24", "opacity-0", "pointer-events-none");
      actionBar.classList.add("translate-y-0", "opacity-100");
      shortlistCountEl.textContent = `${count} ${count === 1 ? "Stock" : "Stocks"} Shortlisted`;

      shortlistTagsEl.innerHTML = Array.from(shortlistedSymbols)
        .map(
          (sym) =>
            `<span class="px-2 py-0.5 rounded bg-tv-tertiary text-tv-accent border border-tv-border font-mono text-[11px] font-bold">${sym}</span>`
        )
        .join("");
    } else {
      actionBar.classList.add("translate-y-24", "opacity-0", "pointer-events-none");
      actionBar.classList.remove("translate-y-0", "opacity-100");
    }
  };

  const renderTable = () => {
    if (!tableBody) return;
    const filtered = filterData();

    if (rowCountEl) {
      rowCountEl.textContent = `Showing ${filtered.length} of ${SCREENER_DATA.length} Quantitative Candidates`;
    }

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-12 text-tv-muted">
            <div class="text-3xl mb-2">🔍</div>
            <div class="text-sm font-semibold text-white">No Stocks Found Matching Current Filters</div>
            <div class="text-xs mt-1">Try resetting the preset filter or search keyword.</div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered
      .map((stock) => {
        const isChecked = shortlistedSymbols.has(stock.symbol);
        const isBull1D = stock.changePercent1D >= 0;
        const isBull1W = stock.changePercent1W >= 0;
        const isBull1M = stock.changePercent1M >= 0;

        // RSI color coding
        let rsiClass = "bg-tv-tertiary text-tv-text";
        if (stock.rsi >= 70) rsiClass = "bg-tv-bearish/20 text-tv-bearish border border-tv-bearish/30";
        else if (stock.rsi <= 35) rsiClass = "bg-tv-bullish/20 text-tv-bullish border border-tv-bullish/30";

        // RVOL badge
        const rvolHigh = stock.rvol >= 2.0;

        return `
        <tr class="border-b border-tv-border/50 hover:bg-tv-tertiary/40 transition group font-sans text-xs ${
          isChecked ? "bg-tv-accent/5" : ""
        }">
          <!-- Checkbox -->
          <td class="p-3 text-center w-10">
            <input type="checkbox" data-stock-select="${stock.symbol}" class="w-4 h-4 rounded border-tv-border bg-tv-primary text-tv-accent focus:ring-0 cursor-pointer" ${
          isChecked ? "checked" : ""
        } />
          </td>

          <!-- Symbol & Name -->
          <td class="p-3">
            <div class="flex items-center space-x-2">
              <div>
                <a href="/index.html?symbols=${stock.symbol}" class="font-bold text-white hover:text-tv-accent transition text-sm font-mono flex items-center space-x-1">
                  <span>${stock.symbol}</span>
                  <span class="text-[10px] text-tv-muted font-normal">↗</span>
                </a>
                <div class="text-[11px] text-tv-muted truncate max-w-[160px]">${stock.name}</div>
              </div>
            </div>
          </td>

          <!-- Sector -->
          <td class="p-3">
            <span class="px-2 py-0.5 rounded bg-tv-tertiary text-tv-text text-[10px] whitespace-nowrap border border-tv-border/60">
              ${stock.sector}
            </span>
          </td>

          <!-- LTP & 1D Change -->
          <td class="p-3 text-right font-mono">
            <div class="font-bold text-white text-xs">₹${stock.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
            <div class="text-[11px] font-semibold ${isBull1D ? "text-tv-bullish" : "text-tv-bearish"}">
              ${isBull1D ? "+" : ""}${stock.changePercent1D.toFixed(2)}%
            </div>
          </td>

          <!-- 1W & 1M Returns -->
          <td class="p-3 text-right font-mono text-[11px] hidden md:table-cell">
            <div class="${isBull1W ? "text-tv-bullish" : "text-tv-bearish"}">${isBull1W ? "+" : ""}${stock.changePercent1W.toFixed(1)}% <span class="text-[9px] text-tv-muted">1W</span></div>
            <div class="${isBull1M ? "text-tv-bullish" : "text-tv-bearish"}">${isBull1M ? "+" : ""}${stock.changePercent1M.toFixed(1)}% <span class="text-[9px] text-tv-muted">1M</span></div>
          </td>

          <!-- Volume & RVOL -->
          <td class="p-3 text-right font-mono">
            <div class="text-white text-xs">${stock.volume}</div>
            <div class="flex items-center justify-end space-x-1 mt-0.5">
              <span class="text-[10px] px-1.5 py-0.2 rounded font-bold ${
                rvolHigh ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-tv-tertiary text-tv-muted"
              }">
                ${stock.rvol.toFixed(1)}× RVOL
              </span>
            </div>
          </td>

          <!-- RSI (14) -->
          <td class="p-3 text-center">
            <span class="px-2 py-0.5 rounded font-mono text-xs font-bold ${rsiClass}">
              ${stock.rsi.toFixed(1)}
            </span>
          </td>

          <!-- Technical Trend (EMA / Supertrend) -->
          <td class="p-3 text-center whitespace-nowrap">
            <div class="flex items-center justify-center space-x-1.5">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                stock.supertrend === "BULLISH"
                  ? "bg-tv-bullish/20 text-tv-bullish border border-tv-bullish/30"
                  : "bg-tv-bearish/20 text-tv-bearish border border-tv-bearish/30"
              }">
                ${stock.supertrend === "BULLISH" ? "🟢 SUPERTREND" : "🔴 SUPERTREND"}
              </span>
            </div>
          </td>

          <!-- 52W High Distance -->
          <td class="p-3 text-right font-mono text-xs">
            <span class="${stock.high52wDiff >= -2.0 ? "text-tv-bullish font-bold" : "text-tv-muted"}">
              ${stock.high52wDiff === 0 ? "🔥 52W HIGH" : `${stock.high52wDiff.toFixed(1)}%`}
            </span>
          </td>

          <!-- Actions -->
          <td class="p-3 text-center">
            <div class="flex items-center justify-center space-x-1.5">
              <a href="/index.html?symbols=${stock.symbol}" title="Open in Workbench" class="px-2 py-1 rounded bg-tv-tertiary hover:bg-tv-accent hover:text-white text-tv-text text-xs transition flex items-center space-x-1 cursor-pointer">
                <span>📊</span>
                <span class="hidden lg:inline text-[11px] font-semibold">Workbench</span>
              </a>
              <a href="/simulator.html?symbol=${stock.symbol}" title="Simulate Strategy" class="px-2 py-1 rounded bg-tv-tertiary hover:bg-amber-500/20 hover:text-amber-400 text-tv-text text-xs transition cursor-pointer">
                🧪
              </a>
            </div>
          </td>
        </tr>
      `;
      })
      .join("");

    // Wire up row checkboxes
    tableBody.querySelectorAll<HTMLInputElement>("[data-stock-select]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const sym = cb.getAttribute("data-stock-select");
        if (!sym) return;

        if (cb.checked) {
          shortlistedSymbols.add(sym);
        } else {
          shortlistedSymbols.delete(sym);
        }

        updateActionBar();
        renderTable();
      });
    });

    // Update master checkbox
    if (masterCheckbox) {
      masterCheckbox.checked = filtered.length > 0 && filtered.every((s) => shortlistedSymbols.has(s.symbol));
    }
  };

  // Preset buttons
  presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentPreset = btn.getAttribute("data-screener-preset") || "all";
      presetButtons.forEach((b) => {
        b.classList.remove("bg-tv-accent", "text-white", "font-semibold");
        b.classList.add("bg-tv-tertiary", "text-tv-muted");
      });
      btn.classList.add("bg-tv-accent", "text-white", "font-semibold");
      btn.classList.remove("bg-tv-tertiary", "text-tv-muted");
      renderTable();
    });
  });

  // Search input
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchKeyword = (e.target as HTMLInputElement).value;
      renderTable();
    });
  }

  // Sector filter
  if (sectorFilter) {
    sectorFilter.addEventListener("change", (e) => {
      currentSector = (e.target as HTMLSelectElement).value;
      renderTable();
    });
  }

  // Master checkbox toggle
  if (masterCheckbox) {
    masterCheckbox.addEventListener("change", () => {
      const filtered = filterData();
      if (masterCheckbox.checked) {
        filtered.forEach((s) => shortlistedSymbols.add(s.symbol));
      } else {
        filtered.forEach((s) => shortlistedSymbols.delete(s.symbol));
      }
      updateActionBar();
      renderTable();
    });
  }

  // Action Bar Buttons
  if (openWorkbenchBtn) {
    openWorkbenchBtn.addEventListener("click", () => {
      const symbols = Array.from(shortlistedSymbols);
      if (symbols.length > 0) {
        window.location.href = `/index.html?symbols=${encodeURIComponent(symbols.join(","))}`;
      }
    });
  }

  if (openSimBtn) {
    openSimBtn.addEventListener("click", () => {
      const symbols = Array.from(shortlistedSymbols);
      if (symbols.length > 0) {
        window.location.href = `/simulator.html?symbol=${encodeURIComponent(symbols[0])}`;
      }
    });
  }

  if (clearShortlistBtn) {
    clearShortlistBtn.addEventListener("click", () => {
      shortlistedSymbols.clear();
      updateActionBar();
      renderTable();
    });
  }

  // Initial render
  renderTable();
}

// Auto-run if entry point
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    initScreener();
  });
}
