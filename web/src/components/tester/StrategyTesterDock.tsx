import React from "react";

export default function StrategyTesterDock() {
  const metrics = [
    { label: "Net Profit (Post STT/GST)", value: "₹3,42,500.00", change: "+28.4%", color: "text-[#089981]" },
    { label: "Profit Factor", value: "2.18", color: "text-white" },
    { label: "Sharpe Ratio", value: "2.14", color: "text-white" },
    { label: "Max Drawdown", value: "-7.2%", color: "text-[#f23645]" },
    { label: "Win Rate", value: "62.5%", color: "text-white" },
    { label: "Total Closed Trades", value: "128", color: "text-white" },
  ];

  return (
    <div className="grid grid-cols-6 gap-4">
      {metrics.map((m) => (
        <div key={m.label} className="bg-[#131722] p-3 rounded border border-[#2a2e39]">
          <div className="text-xs text-[#787b86] mb-1">{m.label}</div>
          <div className={`text-lg font-bold font-mono ${m.color}`}>{m.value}</div>
          {m.change && <div className="text-xs text-[#089981] font-mono mt-0.5">{m.change}</div>}
        </div>
      ))}
    </div>
  );
}
