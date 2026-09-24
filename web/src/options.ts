import { initHeaderNavigation } from "./nav";
import { SAMPLE_OPTIONS_CHAIN } from "./data";

export function initOptionsPage() {
  initHeaderNavigation("options");

  const tbody = document.getElementById("options-full-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";
  SAMPLE_OPTIONS_CHAIN.forEach((strike) => {
    const isAtm = strike.strikePrice === 24850;
    const tr = document.createElement("tr");
    tr.className = `border-b border-tv-border hover:bg-tv-tertiary/60 font-mono text-xs transition ${
      isAtm ? "bg-tv-tertiary/80 font-semibold" : ""
    }`;
    tr.innerHTML = `
      <!-- CALLS -->
      <td class="p-2 text-right text-tv-muted">${(strike.callOi / 1000).toFixed(0)}k</td>
      <td class="p-2 text-right ${strike.callOiChange >= 0 ? "text-tv-bullish" : "text-tv-bearish"}">${strike.callOiChange >= 0 ? "+" : ""}${(strike.callOiChange / 1000).toFixed(0)}k</td>
      <td class="p-2 text-right text-tv-muted">${strike.callIv.toFixed(1)}%</td>
      <td class="p-2 text-right text-tv-muted">${strike.callDelta.toFixed(2)}</td>
      <td class="p-2 text-right text-white font-medium bg-tv-secondary/60">${strike.callLtp.toFixed(2)}</td>

      <!-- STRIKE -->
      <td class="p-2 text-center text-white bg-tv-primary border-x border-tv-border font-bold tracking-wide">${strike.strikePrice} ${isAtm ? `<span class="text-[10px] text-tv-accent ml-1">ATM</span>` : ""}</td>

      <!-- PUTS -->
      <td class="p-2 text-left text-white font-medium bg-tv-secondary/60">${strike.putLtp.toFixed(2)}</td>
      <td class="p-2 text-left text-tv-muted">${strike.putDelta.toFixed(2)}</td>
      <td class="p-2 text-left text-tv-muted">${strike.putIv.toFixed(1)}%</td>
      <td class="p-2 text-left ${strike.putOiChange >= 0 ? "text-tv-bullish" : "text-tv-bearish"}">${strike.putOiChange >= 0 ? "+" : ""}${(strike.putOiChange / 1000).toFixed(0)}k</td>
      <td class="p-2 text-left text-tv-muted">${(strike.putOi / 1000).toFixed(0)}k</td>
    `;
    tbody.appendChild(tr);
  });
}
