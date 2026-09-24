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
    tr.className = `border-b border-[#2a2e39]/60 hover:bg-[#2a2e39]/60 font-mono text-xs transition ${
      isAtm ? "bg-[#2a2e39]/80 font-semibold" : ""
    }`;
    tr.innerHTML = `
      <!-- CALLS -->
      <td class="p-2 text-right text-[#787b86]">${(strike.callOi / 1000).toFixed(0)}k</td>
      <td class="p-2 text-right ${strike.callOiChange >= 0 ? "text-[#089981]" : "text-[#f23645]"}">${strike.callOiChange >= 0 ? "+" : ""}${(strike.callOiChange / 1000).toFixed(0)}k</td>
      <td class="p-2 text-right text-[#787b86]">${strike.callIv.toFixed(1)}%</td>
      <td class="p-2 text-right text-[#787b86]">${strike.callDelta.toFixed(2)}</td>
      <td class="p-2 text-right text-white font-medium bg-[#1e222d]/60">${strike.callLtp.toFixed(2)}</td>

      <!-- STRIKE -->
      <td class="p-2 text-center text-white bg-[#131722] border-x border-[#2a2e39] font-bold tracking-wide">${strike.strikePrice} ${isAtm ? `<span class="text-[10px] text-[#2962ff] ml-1">ATM</span>` : ""}</td>

      <!-- PUTS -->
      <td class="p-2 text-left text-white font-medium bg-[#1e222d]/60">${strike.putLtp.toFixed(2)}</td>
      <td class="p-2 text-left text-[#787b86]">${strike.putDelta.toFixed(2)}</td>
      <td class="p-2 text-left text-[#787b86]">${strike.putIv.toFixed(1)}%</td>
      <td class="p-2 text-left ${strike.putOiChange >= 0 ? "text-[#089981]" : "text-[#f23645]"}">${strike.putOiChange >= 0 ? "+" : ""}${(strike.putOiChange / 1000).toFixed(0)}k</td>
      <td class="p-2 text-left text-[#787b86]">${(strike.putOi / 1000).toFixed(0)}k</td>
    `;
    tbody.appendChild(tr);
  });
}
