import { initHeaderNavigation } from "./nav";

export function initStockPage() {
  initHeaderNavigation("stock");

  const symbol = localStorage.getItem("honba_symbol") || "NIFTY ALPHA 50";
  const titleEl = document.getElementById("stock-page-symbol");
  if (titleEl) titleEl.textContent = symbol;

  // Tab switching for Overview, Financials, Delivery, Ratios
  const tabs = document.querySelectorAll<HTMLButtonElement>("[data-stock-tab]");
  const panels = document.querySelectorAll<HTMLDivElement>("[data-stock-panel]");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-stock-tab");
      tabs.forEach((t) => {
        t.classList.remove("text-white", "border-b-2", "border-[#2962ff]", "bg-[#2a2e39]/30");
        t.classList.add("text-[#787b86]");
      });
      tab.classList.add("text-white", "border-b-2", "border-[#2962ff]", "bg-[#2a2e39]/30");
      tab.classList.remove("text-[#787b86]");

      panels.forEach((p) => {
        if (p.getAttribute("data-stock-panel") === target) {
          p.classList.remove("hidden");
        } else {
          p.classList.add("hidden");
        }
      });
    });
  });
}
