import React from "react";
import { ShieldCheck, AlertTriangle } from "lucide-react";

export default function AntiOverfitMatrix() {
  const auditItems = [
    {
      metric: "Deflated Sharpe Ratio (DSR)",
      value: "0.96",
      benchmark: "> 0.95",
      status: "PASS",
      desc: "Penalizes Sharpe ratio for 240 hyperparameter iterations and non-normal return distributions.",
    },
    {
      metric: "Probability of Backtest Overfitting (PBO)",
      value: "0.12",
      benchmark: "< 0.20",
      status: "PASS",
      desc: "Measures probability that the selected strategy drops below median performance out-of-sample.",
    },
    {
      metric: "Walk-Forward Efficiency (WFE)",
      value: "64.2%",
      benchmark: "> 50.0%",
      status: "PASS",
      desc: "Annualized Out-of-Sample return divided by In-Sample return across rolling windows.",
    },
    {
      metric: "Slippage Break-Even Multiplier",
      value: "2.4x",
      benchmark: "> 2.0x",
      status: "PASS",
      desc: "Strategy maintains positive net PnL even if bid-ask spread slippage increases by 140%.",
    },
  ];

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex items-center space-x-2 text-xs font-semibold text-[#089981] bg-[#089981]/10 px-3 py-1.5 rounded border border-[#089981]/20 w-fit">
        <ShieldCheck className="w-4 h-4" />
        <span>AUDIT VERDICT: ROBUST (Alpha is statistically significant with minimal data-snooping bias)</span>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {auditItems.map((item) => (
          <div key={item.metric} className="bg-[#131722] p-3 rounded border border-[#2a2e39] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-medium text-white">{item.metric}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#089981]/20 text-[#089981]">
                  {item.status}
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-white mb-1">{item.value}</div>
              <div className="text-[11px] text-[#787b86] mb-2">Threshold: {item.benchmark}</div>
            </div>
            <div className="text-[10px] text-[#787b86] border-t border-[#2a2e39]/60 pt-2 leading-relaxed">
              {item.desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
