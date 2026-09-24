import { initHeaderNavigation } from "./nav";

export interface StrategyConfig {
  name: string;
  symbol: string;
  timeframe: string;
  productType: "MIS" | "CNC";
  fastEma: number;
  slowEma: number;
  rsiPeriod: number;
  rsiThreshold: number;
  useSupertrend: boolean;
  stopLossType: "percent" | "points" | "atr";
  stopLossValue: number;
  takeProfitType: "ratio" | "points" | "percent";
  takeProfitValue: number;
  lotSize: number;
  maxDailyLoss: number;
}

export function initDesigner() {
  initHeaderNavigation("designer");

  const config: StrategyConfig = {
    name: "Alpha Momentum Trend Rider",
    symbol: localStorage.getItem("honba_symbol") || "NIFTY ALPHA 50",
    timeframe: "5m",
    productType: "MIS",
    fastEma: 9,
    slowEma: 21,
    rsiPeriod: 14,
    rsiThreshold: 50,
    useSupertrend: true,
    stopLossType: "percent",
    stopLossValue: 1.5,
    takeProfitType: "ratio",
    takeProfitValue: 2.0,
    lotSize: 2,
    maxDailyLoss: 15000,
  };

  bindInputs(config);
  updateGeneratedCode(config);

  // Tab switching for Code Preview (Python / OpenAlgo JSON / Rust Nautilus)
  const codeTabs = document.querySelectorAll<HTMLButtonElement>("[data-code-tab]");
  const codePanels = document.querySelectorAll<HTMLPreElement>("[data-code-panel]");

  codeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-code-tab");
      codeTabs.forEach((t) => {
        t.classList.remove("text-white", "border-b-2", "border-tv-accent", "bg-tv-tertiary/40");
        t.classList.add("text-tv-muted");
      });
      tab.classList.add("text-white", "border-b-2", "border-tv-accent", "bg-tv-tertiary/40");
      tab.classList.remove("text-tv-muted");

      codePanels.forEach((p) => {
        if (p.getAttribute("data-code-panel") === target) {
          p.classList.remove("hidden");
        } else {
          p.classList.add("hidden");
        }
      });
    });
  });

  // Copy code button
  const copyBtn = document.getElementById("btn-copy-code");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const activeCode = document.querySelector<HTMLPreElement>("pre[data-code-panel]:not(.hidden) code");
      if (activeCode) {
        navigator.clipboard.writeText(activeCode.textContent || "");
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = `✓ Copied!`;
        setTimeout(() => {
          copyBtn.innerHTML = originalText;
        }, 1500);
      }
    });
  }

  // Route to simulator button
  const simBtn = document.getElementById("btn-test-in-simulator");
  if (simBtn) {
    simBtn.addEventListener("click", () => {
      localStorage.setItem("honba_active_strategy", JSON.stringify(config));
      window.location.href = "/simulator.html";
    });
  }

  // Deploy to OpenAlgo button
  const deployBtn = document.getElementById("btn-deploy-openalgo");
  if (deployBtn) {
    deployBtn.addEventListener("click", () => {
      deployBtn.innerHTML = `<span class="animate-spin inline-block mr-1">⚙</span> Deploying...`;
      deployBtn.classList.add("opacity-80");
      setTimeout(() => {
        deployBtn.innerHTML = `✓ Deployed to OpenAlgo API`;
        deployBtn.classList.remove("opacity-80");
        setTimeout(() => {
          deployBtn.innerHTML = `🚀 Deploy to OpenAlgo / Dhan`;
        }, 2000);
      }, 900);
    });
  }
}

function bindInputs(config: StrategyConfig) {
  const nameInput = document.getElementById("strategy-name") as HTMLInputElement | null;
  const fastEmaInput = document.getElementById("param-fast-ema") as HTMLInputElement | null;
  const slowEmaInput = document.getElementById("param-slow-ema") as HTMLInputElement | null;
  const rsiThreshInput = document.getElementById("param-rsi-thresh") as HTMLInputElement | null;
  const slInput = document.getElementById("param-sl-val") as HTMLInputElement | null;
  const tpInput = document.getElementById("param-tp-val") as HTMLInputElement | null;
  const lotInput = document.getElementById("param-lot-size") as HTMLInputElement | null;

  const onUpdate = () => {
    if (nameInput) config.name = nameInput.value || config.name;
    if (fastEmaInput) config.fastEma = parseInt(fastEmaInput.value, 10) || 9;
    if (slowEmaInput) config.slowEma = parseInt(slowEmaInput.value, 10) || 21;
    if (rsiThreshInput) config.rsiThreshold = parseInt(rsiThreshInput.value, 10) || 50;
    if (slInput) config.stopLossValue = parseFloat(slInput.value) || 1.5;
    if (tpInput) config.takeProfitValue = parseFloat(tpInput.value) || 2.0;
    if (lotInput) config.lotSize = parseInt(lotInput.value, 10) || 2;
    updateGeneratedCode(config);
  };

  [nameInput, fastEmaInput, slowEmaInput, rsiThreshInput, slInput, tpInput, lotInput].forEach((el) => {
    el?.addEventListener("input", onUpdate);
  });
}

function updateGeneratedCode(config: StrategyConfig) {
  const pythonEl = document.getElementById("code-python");
  const jsonEl = document.getElementById("code-json");
  const rustEl = document.getElementById("code-rust");

  // 1. Jesse & Honba Strategy DSL
  const pythonCode = `from honba.strategy import Strategy, OrderType
import numpy as np

class ${config.name.replace(/[^a-zA-Z0-9]/g, "")}(Strategy):
    """
    Generated by Honba Algo Designer (OpenAlgo & Jesse Architecture)
    Target: \${config.symbol} | Timeframe: \${config.timeframe} | Product: \${config.productType}
    """
    def __init__(self):
        super().__init__()
        self.fast_ema_period = ${config.fastEma}
        self.slow_ema_period = ${config.slowEma}
        self.rsi_threshold = ${config.rsiThreshold}
        self.stop_loss_pct = ${config.stopLossValue} / 100.0
        self.rr_ratio = ${config.takeProfitValue}
        self.lot_size = ${config.lotSize}

    @property
    def fast_ema(self) -> float:
        return self.indicators.ema(self.fast_ema_period)

    @property
    def slow_ema(self) -> float:
        return self.indicators.ema(self.slow_ema_period)

    @property
    def rsi(self) -> float:
        return self.indicators.rsi(14)

    def should_long(self) -> bool:
        # Strategy Engine Entry Rule
        ema_cross = self.fast_ema > self.slow_ema and self.indicators.crossover(self.fast_ema, self.slow_ema)
        momentum_filter = self.rsi > self.rsi_threshold
        # Check Indian market trading session window (09:20 - 15:15 IST)
        return ema_cross and momentum_filter and self.is_session_active("09:20", "15:15")

    def should_short(self) -> bool:
        ema_cross_down = self.fast_ema < self.slow_ema and self.indicators.crossunder(self.fast_ema, self.slow_ema)
        return ema_cross_down and self.rsi < (100 - self.rsi_threshold) and self.is_session_active("09:20", "15:15")

    def go_long(self):
        entry_price = self.price
        sl_price = entry_price * (1 - self.stop_loss_pct)
        tp_price = entry_price + (entry_price - sl_price) * self.rr_ratio
        qty = self.lot_size * self.instrument.lot_multiplier # NSE Lot Size

        self.buy(
            quantity=qty,
            price=entry_price,
            order_type=OrderType.MARKET,
            product="${config.productType}",
            stop_loss=sl_price,
            take_profit=tp_price,
            tag="HONBA_EMA_LONG"
        )

    def update_position(self):
        # Auto-square-off at 15:15 IST for Intraday MIS
        if self.current_time.strftime("%H:%M") >= "15:15":
            self.liquidate(reason="MIS_AUTO_SQUARE_OFF")`;

  // 2. OpenAlgo JSON Rule Payload
  const jsonCode = JSON.stringify(
    {
      strategy_id: "honba-" + config.name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
      name: config.name,
      engine: "openalgo-v2",
      symbol: config.symbol,
      exchange: "NSE",
      timeframe: config.timeframe,
      product: config.productType,
      indicators: [
        { name: "EMA", length: config.fastEma, field: "close" },
        { name: "EMA", length: config.slowEma, field: "close" },
        { name: "RSI", length: 14, field: "close" },
      ],
      rules: {
        entry_long: [
          { left: "indicator.ema_" + config.fastEma, op: "cross_above", right: "indicator.ema_" + config.slowEma },
          { left: "indicator.rsi_14", op: ">", right: config.rsiThreshold },
        ],
        exit_long: [
          { type: "stop_loss", mode: config.stopLossType, value: config.stopLossValue },
          { type: "take_profit", mode: "risk_reward", value: config.takeProfitValue },
          { type: "time_exit", time: "15:15:00", reason: "MIS_EXPIRY" },
        ],
      },
      execution: {
        lots: config.lotSize,
        lot_multiplier: 25,
        broker_route: "DHAN_HQ",
        order_type: "MARKET",
      },
    },
    null,
    2
  );

  // 3. Rust Quantitative Execution Kernel
  const rustCode = `// Strategy Engine & High-Throughput Event Loop
use honba_core::prelude::*;

#[derive(Default)]
pub struct ${config.name.replace(/[^a-zA-Z0-9]/g, "")} {
    pub fast_ema: Ema,
    pub slow_ema: Ema,
    pub rsi: Rsi,
}

impl Strategy for ${config.name.replace(/[^a-zA-Z0-9]/g, "")} {
    fn on_bar(&mut self, ctx: &mut Context, bar: &Bar) {
        self.fast_ema.update(bar.close);
        self.slow_ema.update(bar.close);
        self.rsi.update(bar.close);

        if self.fast_ema.value() > self.slow_ema.value() && self.rsi.value() > ${config.rsiThreshold}.0 {
            if ctx.is_session_open("09:20", "15:15") {
                ctx.submit_order(Order::market_buy(
                    "${config.symbol}",
                    ${config.lotSize} * 25, // NSE NIFTY Lot
                ));
            }
        }
    }
}`;

  if (pythonEl) pythonEl.textContent = pythonCode;
  if (jsonEl) jsonEl.textContent = jsonCode;
  if (rustEl) rustEl.textContent = rustCode;
}
