import { initTheme } from "./theme";
import { initWidgetCustomizer } from "./widgets/widget-customizer";

export function initHeaderNavigation(
  activePage: "workbench" | "screener" | "designer" | "simulator" | "stock" | "options" | "backtest"
) {
  // 1. Initialize user's selected theme & typography
  initTheme();

  // 2. Setup Top-Left Sub-App Selector Launcher
  const launcherBtn = document.getElementById("subapp-launcher-btn");
  const launcherMenu = document.getElementById("subapp-launcher-menu");
  const currentBadge = document.getElementById("current-app-badge");

  const pageTitleMap: Record<string, string> = {
    workbench: "WORKBENCH",
    screener: "SCREENER",
    designer: "ALGO DESIGNER",
    simulator: "SIMULATOR",
    stock: "SECURITY INTEL",
    options: "OPTIONS CHAIN",
    backtest: "CPCV TESTER",
  };

  if (currentBadge && pageTitleMap[activePage]) {
    currentBadge.textContent = pageTitleMap[activePage];
  }

  if (launcherBtn && launcherMenu) {
    launcherBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      launcherMenu.classList.toggle("hidden");
    });

    document.addEventListener("click", (e) => {
      if (!launcherMenu.contains(e.target as Node) && e.target !== launcherBtn) {
        launcherMenu.classList.add("hidden");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        launcherMenu.classList.add("hidden");
      }
    });

    // Highlight current active app in dropdown
    const activeAppItem = launcherMenu.querySelector(`[data-app-item="${activePage}"]`);
    if (activeAppItem) {
      activeAppItem.classList.add("bg-tv-tertiary", "border-tv-accent");
    }
  }

  // 3. Update live IST market clock
  const clockEl = document.getElementById("ist-clock");
  if (clockEl) {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      };
      clockEl.textContent = `NSE LIVE | ${new Intl.DateTimeFormat("en-IN", options).format(now)} IST`;
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  // 4. Active page styling for top nav links
  const navLinks = document.querySelectorAll<HTMLAnchorElement>("[data-nav-page]");
  navLinks.forEach((link) => {
    const page = link.getAttribute("data-nav-page");
    if (page === activePage) {
      link.classList.add("bg-tv-tertiary", "text-white", "font-medium");
      link.classList.remove("text-tv-muted");
    } else {
      link.classList.remove("bg-tv-tertiary", "text-white", "font-medium");
      link.classList.add("text-tv-muted", "hover:text-tv-text", "hover:bg-tv-secondary");
    }
  });

  // 4. Global symbol switcher listener
  const symbolSelect = document.getElementById("symbol-select") as HTMLSelectElement | null;
  if (symbolSelect) {
    const currentStoredSymbol = localStorage.getItem("honba_symbol") || "NIFTY ALPHA 50";
    symbolSelect.value = currentStoredSymbol;

    symbolSelect.addEventListener("change", (e) => {
      const target = e.target as HTMLSelectElement;
      localStorage.setItem("honba_symbol", target.value);
      window.dispatchEvent(new CustomEvent("honba:symbol-change", { detail: target.value }));
    });
  }

  // 5. Initialize modular widget customization and saved views
  initWidgetCustomizer(activePage);
}
