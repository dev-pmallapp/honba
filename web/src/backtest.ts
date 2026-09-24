import { initHeaderNavigation } from "./nav";

export function initBacktestPage() {
  initHeaderNavigation("backtest");

  // Render CPCV fan chart canvas
  const canvas = document.getElementById("cpcv-fan-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  // Grid
  ctx.strokeStyle = "#2a2e39";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  for (let y = 30; y < height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Generate 16 CPCV slice paths (fan chart)
  const pathsCount = 16;
  for (let p = 0; p < pathsCount; p++) {
    const isMedian = p === 8;
    ctx.strokeStyle = isMedian ? "#2962ff" : "rgba(8, 153, 129, 0.18)";
    ctx.lineWidth = isMedian ? 2.5 : 1.2;

    ctx.beginPath();
    ctx.moveTo(0, height - 20);

    const steps = 12;
    let currY = height - 20;
    const spread = (p - 8) * 6;

    for (let s = 1; s <= steps; s++) {
      const x = (s / steps) * width;
      const drift = -s * 14 + spread * (s / steps) + (Math.sin(s + p) * 10);
      currY = Math.max(20, Math.min(height - 10, height - 20 + drift));
      ctx.lineTo(x, currY);
    }
    ctx.stroke();
  }
}
