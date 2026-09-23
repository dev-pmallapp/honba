import React, { useState } from "react";
import TradingViewCanvas from "./components/chart/TradingViewCanvas";
import StrategyTesterDock from "./components/tester/StrategyTesterDock";
import AntiOverfitMatrix from "./components/overfit/AntiOverfitMatrix";
import { Play, Sparkles, Activity } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<"tester" | "overfit" | "ledger">("tester");

  return (
    <div className="flex flex-col h-screen w-screen bg-[#131722] text-[#d1d4dc]">
      {/* Top TradingView Navigation Header */}
      <header className="flex items-center justify-between h-12 px-4 bg-[#1e222d] border-b border-[#2a2e39]">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-[#2962ff]" />
            <span className="font-bold tracking-wider text-white">HONBA</span>
          </div>
          <div className="h-4 w-[1px] bg-[#2a2e39]" />
          <button className="px-2.5 py-1 text-sm font-semibold bg-[#2a2e39] rounded text-white hover:bg-[#363a45]">
            NIFTY ALPHA 50
          </button>
          <div className="flex space-x-1 text-xs">
            {["1m", "5m", "15m", "1h", "1D"].map((tf) => (
              <button
                key={tf}
                className={`px-2 py-1 rounded hover:bg-[#2a2e39] ${
                  tf === "5m" ? "text-[#2962ff] font-bold" : "text-[#787b86]"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-[#2962ff] hover:bg-[#1e53e5] text-white rounded transition">
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run Backtest</span>
          </button>
          <button className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-[#2a2e39] hover:bg-[#363a45] text-white rounded transition">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>AI Quant</span>
          </button>
        </div>
      </header>

      {/* Main Workspace (Chart Canvas + Watchlist) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chart Canvas */}
        <div className="flex-1 relative border-r border-[#2a2e39]">
          <TradingViewCanvas />
        </div>

        {/* Watchlist Sidebar */}
        <div className="w-64 bg-[#1e222d] flex flex-col">
          <div className="p-3 border-b border-[#2a2e39] font-semibold text-xs tracking-wider uppercase text-[#787b86]">
            Watchlist
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-[#2a2e39]/50">
            {[
              { symbol: "NIFTY 50", price: "24,850.20", change: "+0.45%" },
              { symbol: "NIFTY ALPHA 50", price: "8,124.60", change: "+1.20%" },
              { symbol: "NIFTY200 A30", price: "4,925.10", change: "+0.85%" },
              { symbol: "NIFTYBEES", price: "274.50", change: "+0.42%" },
              { symbol: "LIQUIDBEES", price: "1,000.00", change: "+0.00%" },
            ].map((item) => (
              <div key={item.symbol} className="p-3 flex justify-between items-center hover:bg-[#2a2e39]/40 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-white">{item.symbol}</div>
                  <div className="text-xs text-[#787b86]">NSE Index / ETF</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono text-white">{item.price}</div>
                  <div className="text-xs font-mono text-[#089981]">{item.change}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Strategy Tester & Overfit Dock */}
      <div className="h-64 bg-[#1e222d] border-t border-[#2a2e39] flex flex-col">
        <div className="flex items-center space-x-6 px-4 h-9 border-b border-[#2a2e39] text-xs font-medium">
          <button
            onClick={() => setActiveTab("tester")}
            className={`h-full border-b-2 transition ${
              activeTab === "tester"
                ? "border-[#2962ff] text-white font-semibold"
                : "border-transparent text-[#787b86] hover:text-[#d1d4dc]"
            }`}
          >
            Strategy Tester
          </button>
          <button
            onClick={() => setActiveTab("overfit")}
            className={`h-full border-b-2 transition ${
              activeTab === "overfit"
                ? "border-[#2962ff] text-white font-semibold"
                : "border-transparent text-[#787b86] hover:text-[#d1d4dc]"
            }`}
          >
            Anti-Overfitting Audit
          </button>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`h-full border-b-2 transition ${
              activeTab === "ledger"
                ? "border-[#2962ff] text-white font-semibold"
                : "border-transparent text-[#787b86] hover:text-[#d1d4dc]"
            }`}
          >
            Trade Ledger (Post-STT)
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {activeTab === "tester" && <StrategyTesterDock />}
          {activeTab === "overfit" && <AntiOverfitMatrix />}
          {activeTab === "ledger" && (
            <div className="text-xs text-[#787b86]">
              Trade ledger displaying all executed entries/exits, slippage, and net taxes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
