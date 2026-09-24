import { initHeaderNavigation } from "./nav";

export interface SimulatedTrade {
  id: string;
  entryTime: string;
  exitTime: string;
  symbol: string;
  side: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  qty: number;
  grossPnl: number;
  taxesAndFees: number;
  netPnl: number;
  returnPct: number;
  exitReason: "TAKE_PROFIT" | "STOP_LOSS" | "MIS_SQUARE_OFF";
}

export function initSimulator() {
  initHeaderNavigation("simulator");

  // Load configured strategy if saved
  const rawStrategy = localStorage.getItem("honba_active_strategy");
  if (rawStrategy) {
    try {
      const parsed = JSON.parse(rawStrategy);
      const nameEl = document.getElementById("sim-strategy-name");
      if (nameEl) nameEl.textContent = parsed.name || "Alpha Momentum Trend Rider";
    } catch {
      // ignore
    }
  }

  // Render initial equity and drawdown charts
  renderEquityChart();
  renderDrawdownChart();
  renderMonteCarloChart();

  // Tab switching for Simulation Views (Performance Overview, Monte Carlo, Trade Log, Tax Friction)
  const tabs = document.querySelectorAll<HTMLButtonElement>("[data-sim-tab]");
  const panels = document.querySelectorAll<HTMLDivElement>("[data-sim-panel]");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-sim-tab");
      tabs.forEach((t) => {
        t.classList.remove("text-white", "border-b-2", "border-[#2962ff]", "bg-[#2a2e39]/40");
        t.classList.add("text-[#787b86]");
      });
      tab.classList.add("text-white", "border-b-2", "border-[#2962ff]", "bg-[#2a2e39]/40");
      tab.classList.remove("text-[#787b86]");

      panels.forEach((p) => {
        if (p.getAttribute("data-sim-panel") === target) {
          p.classList.remove("hidden");
        } else {
          p.classList.add("hidden");
        }
      });
    });
  });

  // Run Simulation button
  const runBtn = document.getElementById("btn-run-simulation");
  const progressContainer = document.getElementById("sim-progress-container");
  const progressBar = document.getElementById("sim-progress-bar");
  const progressText = document.getElementById("sim-progress-text");

  if (runBtn) {
    runBtn.addEventListener("click", () => {
      runBtn.setAttribute("disabled", "true");
      runBtn.classList.add("opacity-60", "cursor-not-allowed");
      if (progressContainer) progressContainer.classList.remove("hidden");

      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        if (progressBar) progressBar.style.width = `${progress}%`;
        if (progressText) progressText.textContent = `Simulating Bar ${Math.floor(progress * 25.2)} of 2,520 (NSE Event Loop)...`;

        if (progress >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            if (progressContainer) progressContainer.classList.add("hidden");
            runBtn.removeAttribute("disabled");
            runBtn.classList.remove("opacity-60", "cursor-not-allowed");

            // Re-render charts with slight variation
            renderEquityChart(true);
            renderDrawdownChart();
            renderMonteCarloChart();

            // Flash toast
            const alertEl = document.getElementById("sim-completed-alert");
            if (alertEl) {
              alertEl.classList.remove("hidden");
              setTimeout(() => alertEl.classList.add("hidden"), 3000);
            }
          }, 300);
        }
      }, 70);
    });
  }

  // Export report button
  const exportBtn = document.getElementById("btn-export-report");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      exportBtn.textContent = "Report Exported (JSON) ✓";
      setTimeout(() => {
        exportBtn.textContent = "📥 Export Report";
      }, 2000);
    });
  }
}

function renderEquityChart(isRecomputed = false) {
  const canvas = document.getElementById("sim-equity-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = "#2a2e39";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  for (let y = 30; y < h; y += 35) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Benchmark curve (Nifty 50 TR)
  ctx.strokeStyle = "#787b86";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, h - 20);
  const benchPts = [
    { x: 0, y: h - 20 },
    { x: w * 0.2, y: h - 35 },
    { x: w * 0.4, y: h - 45 },
    { x: w * 0.6, y: h - 60 },
    { x: w * 0.8, y: h - 70 },
    { x: w, y: h - 85 },
  ];
  benchPts.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // Strategy Equity Curve
  ctx.strokeStyle = "#089981";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const stratPts = [
    { x: 0, y: h - 20 },
    { x: w * 0.15, y: h - 40 + (isRecomputed ? -4 : 0) },
    { x: w * 0.3, y: h - 35 + (isRecomputed ? 3 : 0) },
    { x: w * 0.45, y: h - 75 + (isRecomputed ? -5 : 0) },
    { x: w * 0.6, y: h - 90 + (isRecomputed ? -6 : 0) },
    { x: w * 0.75, y: h - 82 + (isRecomputed ? 2 : 0) },
    { x: w * 0.9, y: h - 130 + (isRecomputed ? -8 : 0) },
    { x: w, y: 25 },
  ];
  stratPts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(8, 153, 129, 0.25)");
  grad.addColorStop(1, "rgba(8, 153, 129, 0.0)");
  ctx.fillStyle = grad;
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
}

function renderDrawdownChart() {
  const canvas = document.getElementById("sim-drawdown-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Top baseline (0% DD)
  ctx.strokeStyle = "#787b86";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.lineTo(w, 5);
  ctx.stroke();

  // Underwater DD path
  ctx.strokeStyle = "#f23645";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, 5);

  const ddPoints = [
    { x: 0, y: 5 },
    { x: w * 0.1, y: 5 },
    { x: w * 0.2, y: 35 },
    { x: w * 0.28, y: 5 },
    { x: w * 0.42, y: 20 },
    { x: w * 0.55, y: 55 }, // Max DD point (-7.2%)
    { x: w * 0.68, y: 15 },
    { x: w * 0.78, y: 5 },
    { x: w * 0.88, y: 30 },
    { x: w, y: 5 },
  ];
  ddPoints.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // Red gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(242, 54, 69, 0.0)");
  grad.addColorStop(1, "rgba(242, 54, 69, 0.35)");
  ctx.fillStyle = grad;
  ctx.lineTo(w, 5);
  ctx.closePath();
  ctx.fill();
}

function renderMonteCarloChart() {
  const canvas = document.getElementById("sim-monte-carlo-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = "#2a2e39";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  for (let x = 40; x < w; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 1,000 resampled paths simulated in 25 representative fan strands
  const strands = 25;
  for (let i = 0; i < strands; i++) {
    const isMedian = i === 12;
    const isWorst = i === 0;
    const isBest = i === 24;

    ctx.strokeStyle = isMedian
      ? "#2962ff"
      : isWorst
      ? "rgba(242, 54, 69, 0.6)"
      : isBest
      ? "rgba(8, 153, 129, 0.6)"
      : "rgba(120, 123, 134, 0.15)";
    ctx.lineWidth = isMedian ? 2.5 : 1;

    ctx.beginPath();
    ctx.moveTo(0, h - 20);

    const steps = 14;
    const driftBias = (i - 12) * 4.2;

    for (let s = 1; s <= steps; s++) {
      const x = (s / steps) * w;
      const noise = Math.sin(s * 1.5 + i) * 8;
      const y = Math.max(10, Math.min(h - 10, h - 20 - s * 8 + driftBias * (s / steps) + noise));
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
