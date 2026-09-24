import { useState } from "react";
import TradeLedger from "./TradeLedger";
import EventPipelineStream from "./EventPipelineStream";
import PipelineSupervisor from "./PipelineSupervisor";
import AntiOverfitMatrix from "../overfit/AntiOverfitMatrix";
import { Tabs, StatCard } from "../ui";
import {
  TrendingUp,
  FileSpreadsheet,
  ShieldCheck,
  Zap,
  Cpu,
  Layers,
} from "lucide-react";

export default function StrategyTesterDock() {
  const [activeTab, setActiveTab] = useState<string>("tearsheet");

  const tabs = [
    { id: "tearsheet", label: "Strategy Tearsheet", icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { id: "ledger", label: "Trade Ledger", icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
    { id: "overfit", label: "Anti-Overfit Audit", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { id: "pipeline", label: "Event Pipeline", icon: <Zap className="w-3.5 h-3.5" /> },
    { id: "supervisor", label: "Pipeline Supervisor", icon: <Cpu className="w-3.5 h-3.5" /> },
  ];

  const metrics = [
    { label: "Net Profit (Post STT/GST)", value: "₹3,42,500.00", badge: { text: "+28.4%", variant: "bullish" as const }, valueColor: "text-[#089981]" },
    { label: "Profit Factor", value: "2.18", valueColor: "text-white" },
    { label: "Sharpe Ratio (Ann.)", value: "2.14", badge: { text: "SHARPE > 2", variant: "bullish" as const }, valueColor: "text-[#089981]" },
    { label: "Sortino Ratio", value: "3.42", valueColor: "text-white" },
    { label: "Max Drawdown", value: "-7.2%", badge: { text: "LOW DD", variant: "bearish" as const }, valueColor: "text-[#f23645]" },
    { label: "Win Rate", value: "62.5%", valueColor: "text-white" },
    { label: "Expectancy (Per Trade)", value: "₹2,675.00", valueColor: "text-[#089981]" },
    { label: "Closed Trades", value: "128", valueColor: "text-white" },
  ];

  return (
    <div className="flex flex-col h-full bg-[#1e222d] border-t border-[#2a2e39] select-none font-sans">
      {/* Dock Navigation Tabs */}
      <div className="flex items-center justify-between h-9 px-3 border-b border-[#2a2e39] bg-[#131722]/50 text-xs">
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab)}
          variant="underline"
          className="h-full border-b-0"
        />

        {/* Right Status / Benchmark */}
        <div className="hidden md:flex items-center space-x-3 text-[11px] font-mono text-[#787b86]">
          <span>Benchmark: NIFTY TR (+14.2%)</span>
          <span className="text-[#089981] font-semibold">Alpha: +14.2%</span>
        </div>
      </div>

      {/* Dock Content Body */}
      <div className="flex-1 overflow-auto p-3">
        {activeTab === "tearsheet" && (
          <div className="flex flex-col space-y-3 h-full">
            {/* Metric KPI cards */}
            <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
              {metrics.map((m) => (
                <StatCard
                  key={m.label}
                  title={m.label}
                  value={m.value}
                  badge={m.badge}
                  valueColor={m.valueColor}
                />
              ))}
            </div>

            {/* Visual Equity Curve & Drawdown Chart Banner */}
            <div className="bg-[#131722] p-3 rounded border border-[#2a2e39] flex flex-col justify-between flex-1">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center space-x-2 text-xs font-semibold text-white">
                  <Layers className="w-4 h-4 text-[#2962ff]" />
                  <span>Cumulative Equity Curve vs Benchmark (Honba Quantitative Research Engine)</span>
                </div>
                <div className="flex items-center space-x-4 text-[10px] font-mono">
                  <div className="flex items-center space-x-1 text-[#089981]">
                    <span className="w-3 h-0.5 bg-[#089981]" />
                    <span>Honba Strategy (+28.4%)</span>
                  </div>
                  <div className="flex items-center space-x-1 text-[#787b86]">
                    <span className="w-3 h-0.5 bg-[#787b86]" />
                    <span>NIFTY 50 Benchmark (+14.2%)</span>
                  </div>
                </div>
              </div>

              {/* Responsive SVG Curve */}
              <div className="w-full h-24 relative overflow-hidden">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 500 100">
                  {/* Subtle Grid */}
                  <line x1="0" y1="25" x2="500" y2="25" stroke="#2a2e39" strokeWidth="0.5" strokeDasharray="3 3" />
                  <line x1="0" y1="50" x2="500" y2="50" stroke="#2a2e39" strokeWidth="0.5" strokeDasharray="3 3" />
                  <line x1="0" y1="75" x2="500" y2="75" stroke="#2a2e39" strokeWidth="0.5" strokeDasharray="3 3" />

                  {/* Benchmark Area / Line */}
                  <polyline
                    fill="none"
                    stroke="#787b86"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                    points="0,85 50,80 100,75 150,78 200,70 250,68 300,60 350,62 400,55 450,52 500,48"
                  />

                  {/* Honba Strategy Fill Gradient */}
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#089981" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#089981" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <polygon
                    fill="url(#equityGrad)"
                    points="0,85 50,78 100,68 150,60 200,64 250,50 300,42 350,35 400,28 450,20 500,12 500,100 0,100"
                  />

                  {/* Honba Strategy Line */}
                  <polyline
                    fill="none"
                    stroke="#089981"
                    strokeWidth="2.5"
                    points="0,85 50,78 100,68 150,60 200,64 250,50 300,42 350,35 400,28 450,20 500,12"
                  />
                </svg>
              </div>
            </div>
          </div>
        )}

        {activeTab === "ledger" && <TradeLedger />}
        {activeTab === "overfit" && <AntiOverfitMatrix />}
        {activeTab === "pipeline" && <EventPipelineStream />}
        {activeTab === "supervisor" && <PipelineSupervisor />}
      </div>
    </div>
  );
}
