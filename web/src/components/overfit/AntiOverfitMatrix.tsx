import { ShieldCheck, BarChart2 } from "lucide-react";
import { Badge } from "../ui";

export default function AntiOverfitMatrix() {
  const auditItems = [
    {
      metric: "Deflated Sharpe Ratio (DSR)",
      value: "0.96",
      benchmark: "> 0.95",
      status: "PASS" as const,
      desc: "Penalizes Sharpe ratio for 240 hyperparameter iterations and non-normal return distributions (Marcos López de Prado).",
    },
    {
      metric: "Probability of Backtest Overfitting (PBO)",
      value: "0.12",
      benchmark: "< 0.20",
      status: "PASS" as const,
      desc: "Measures probability that the selected strategy drops below median performance out-of-sample across 16 CSCV partitions.",
    },
    {
      metric: "Walk-Forward Efficiency (WFE)",
      value: "64.2%",
      benchmark: "> 50.0%",
      status: "PASS" as const,
      desc: "Annualized Out-of-Sample return divided by In-Sample return across 12 rolling quarterly windows.",
    },
    {
      metric: "Slippage Break-Even Multiplier",
      value: "2.4x",
      benchmark: "> 2.0x",
      status: "PASS" as const,
      desc: "Strategy maintains positive net PnL even if bid-ask spread and STT increase by 140%.",
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] text-xs select-none rounded border border-[#2a2e39] p-3 space-y-3 overflow-y-auto font-sans">
      {/* Banner */}
      <div className="flex items-center justify-between p-2.5 bg-[#089981]/10 rounded border border-[#089981]/25">
        <div className="flex items-center space-x-2 text-[#089981] font-semibold">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>STATISTICAL AUDIT VERDICT: ROBUST (Statistical confirmation & data-snooping bias rejection)</span>
        </div>
        <div className="flex items-center space-x-1.5 text-[11px] text-[#787b86]">
          <BarChart2 className="w-3.5 h-3.5 text-[#2962ff] shrink-0" />
          <span className="text-white">Validation: Combinatorial Purged Cross-Validation (CPCV)</span>
        </div>
      </div>

      {/* Grid of Audit Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {auditItems.map((item) => (
          <div
            key={item.metric}
            className="bg-[#1e222d] p-3 rounded border border-[#2a2e39] flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-start mb-2 gap-1">
                <span className="text-xs font-medium text-white">{item.metric}</span>
                <Badge variant="bullish" size="xs">
                  {item.status}
                </Badge>
              </div>
              <div className="text-2xl font-bold font-mono text-white mb-1 tabular-nums">{item.value}</div>
              <div className="text-[11px] text-[#787b86] mb-2 font-mono tabular-nums">Benchmark: {item.benchmark}</div>
            </div>
            <div className="text-[10px] text-[#787b86] border-t border-[#2a2e39]/60 pt-2 leading-relaxed font-sans">
              {item.desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
