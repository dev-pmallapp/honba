import { initTheme } from "./theme";
import { initWidgetCustomizer } from "./widgets/widget-customizer";

export function initHeaderNavigation(
  activePage: "workbench" | "designer" | "simulator" | "stock" | "options" | "backtest"
) {
  // 1. Initialize user's selected theme & typography
  initTheme();

  // 2. Update live IST market clock
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

  // 3. Active page styling
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
