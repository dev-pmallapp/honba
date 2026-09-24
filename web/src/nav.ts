export function initHeaderNavigation(
  activePage: "workbench" | "designer" | "simulator" | "stock" | "options" | "backtest"
) {
  // Update live IST market clock
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

  // Active page styling
  const navLinks = document.querySelectorAll<HTMLAnchorElement>("[data-nav-page]");
  navLinks.forEach((link) => {
    const page = link.getAttribute("data-nav-page");
    if (page === activePage) {
      link.classList.add("bg-[#2a2e39]", "text-white", "font-medium");
      link.classList.remove("text-[#787b86]");
    } else {
      link.classList.remove("bg-[#2a2e39]", "text-white", "font-medium");
      link.classList.add("text-[#787b86]", "hover:text-[#d1d4dc]", "hover:bg-[#1e222d]");
    }
  });

  // Global symbol switcher listener
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
}
