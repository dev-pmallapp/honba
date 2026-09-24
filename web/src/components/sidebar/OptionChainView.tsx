import { useState } from "react";
import { Gauge, Maximize2, Minimize2 } from "lucide-react";
import { Select, Button } from "../ui";

export interface StrikeRow {
  callOi: string;
  callIv: string;
  callDelta: string;
  callLtp: string;
  strike: number;
  putLtp: string;
  putDelta: string;
  putIv: string;
  putOi: string;
  isAtm?: boolean;
}

const NIFTY_OPTION_CHAIN: StrikeRow[] = [
  { callOi: "48.2k", callIv: "13.4%", callDelta: "0.82", callLtp: "245.50", strike: 24650, putLtp: "28.40", putDelta: "-0.18", putIv: "15.2%", putOi: "12.4k" },
  { callOi: "62.1k", callIv: "13.1%", callDelta: "0.74", callLtp: "185.00", strike: 24700, putLtp: "42.10", putDelta: "-0.26", putIv: "14.8%", putOi: "24.8k" },
  { callOi: "94.5k", callIv: "12.8%", callDelta: "0.63", callLtp: "132.80", strike: 24750, putLtp: "64.50", putDelta: "-0.37", putIv: "14.2%", putOi: "45.2k" },
  { callOi: "142.8k", callIv: "12.4%", callDelta: "0.52", callLtp: "88.20", strike: 24800, putLtp: "92.00", putDelta: "-0.48", putIv: "13.9%", putOi: "88.6k", isAtm: true },
  { callOi: "118.2k", callIv: "12.2%", callDelta: "0.41", callLtp: "52.40", strike: 24850, putLtp: "128.50", putDelta: "-0.59", putIv: "13.6%", putOi: "112.4k" },
  { callOi: "185.6k", callIv: "12.0%", callDelta: "0.30", callLtp: "28.50", strike: 24900, putLtp: "178.00", putDelta: "-0.70", putIv: "13.2%", putOi: "76.1k" },
  { callOi: "98.4k", callIv: "11.8%", callDelta: "0.21", callLtp: "14.20", strike: 24950, putLtp: "234.80", putDelta: "-0.79", putIv: "13.0%", putOi: "34.5k" },
  { callOi: "210.4k", callIv: "11.6%", callDelta: "0.14", callLtp: "6.80", strike: 25000, putLtp: "298.50", putDelta: "-0.86", putIv: "12.8%", putOi: "18.2k" },
];

export interface OptionChainViewProps {
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export default function OptionChainView({
  isExpanded = false,
  onToggleExpand,
}: OptionChainViewProps) {
  const [expiry, setExpiry] = useState("26-SEP-2024 (Weekly)");
  const [viewMode, setViewMode] = useState<"compact" | "greeks">(
    isExpanded ? "greeks" : "compact"
  );

  return (
    <div className="flex flex-col h-full bg-[#1e222d] text-[#d1d4dc] text-xs select-none font-sans overflow-hidden">
      {/* Expiry Selector & Controls */}
      <div className="p-2.5 border-b border-[#2a2e39] bg-[#131722]/60 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1">
            <Select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              options={[
                { value: "26-SEP-2024 (Weekly)", label: "26-SEP-2024 (Weekly)" },
                { value: "03-OCT-2024 (Weekly)", label: "03-OCT-2024 (Weekly)" },
                { value: "31-OCT-2024 (Monthly)", label: "31-OCT-2024 (Monthly)" },
              ]}
            />
          </div>

          {/* View Mode Toggle & Expand Button */}
          <div className="flex items-center space-x-1 pt-4">
            <Button
              variant="secondary"
              size="xs"
              isActive={viewMode === "compact"}
              onClick={() => setViewMode("compact")}
              title="Compact (OI & Price)"
            >
              Compact
            </Button>
            <Button
              variant="secondary"
              size="xs"
              isActive={viewMode === "greeks"}
              onClick={() => setViewMode("greeks")}
              title="Full Greeks (IV, Delta)"
            >
              Greeks
            </Button>
            {onToggleExpand && (
              <Button
                variant="ghost"
                size="xs"
                onClick={onToggleExpand}
                title={isExpanded ? "Collapse Sidebar" : "Expand Options Desk"}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </Button>
            )}
          </div>
        </div>

        {/* PCR & Max Pain Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[#1e222d] p-1.5 rounded border border-[#2a2e39] flex items-center justify-between">
            <div className="flex items-center space-x-1 text-[10px] text-[#787b86]">
              <Gauge className="w-3 h-3 text-[#089981]" />
              <span>PCR (OI)</span>
            </div>
            <span className="font-mono font-bold text-[#089981] tabular-nums">1.18</span>
          </div>

          <div className="bg-[#1e222d] p-1.5 rounded border border-[#2a2e39] flex items-center justify-between">
            <span className="text-[10px] text-[#787b86]">Max Pain</span>
            <span className="font-mono font-bold text-amber-400 tabular-nums">24,800</span>
          </div>
        </div>
      </div>

      {/* Structured Option Chain Table with Scrollbar */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        {viewMode === "compact" ? (
          /* 5 Columns Compact Layout: Fits expanded sidebar with zero overlapping and aligned Call OI & Put OI */
          <div className="min-w-[560px]">
            <table className="w-full border-collapse text-xs table-fixed">
              <thead className="bg-[#131722] text-[10px] font-semibold uppercase sticky top-0 z-10 select-none">
                {/* Category Tier */}
                <tr className="border-b border-[#2a2e39]">
                  <th colSpan={2} className="py-1.5 px-3 text-center text-[#089981] bg-[#089981]/10 border-r border-[#2a2e39] font-bold tracking-wider">
                    CALLS (CE)
                  </th>
                  <th className="py-1.5 px-2 text-center text-white bg-[#181c27] font-bold tracking-wider">
                    STRIKE
                  </th>
                  <th colSpan={2} className="py-1.5 px-3 text-center text-[#f23645] bg-[#f23645]/10 border-l border-[#2a2e39] font-bold tracking-wider">
                    PUTS (PE)
                  </th>
                </tr>
                {/* Column Metrics Tier: Perfectly aligned Call OI and Put OI */}
                <tr className="border-b border-[#2a2e39] bg-[#131722] text-[#787b86]">
                  <th className="py-2 px-3 text-right text-[#089981] w-[20%] whitespace-nowrap font-bold">CALL OI</th>
                  <th className="py-2 px-3 text-right text-[#089981] w-[20%] whitespace-nowrap font-bold">CALL LTP</th>
                  <th className="py-2 px-2 text-center text-white w-[20%] whitespace-nowrap font-bold">ATM</th>
                  <th className="py-2 px-3 text-right text-[#f23645] w-[20%] whitespace-nowrap font-bold">PUT LTP</th>
                  <th className="py-2 px-3 text-right text-[#f23645] w-[20%] whitespace-nowrap font-bold">PUT OI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2e39]/30 text-[11px] font-mono">
                {NIFTY_OPTION_CHAIN.map((row) => (
                  <tr
                    key={row.strike}
                    className={`hover:bg-[#2a2e39]/30 transition-colors ${
                      row.isAtm ? "bg-[#2962ff]/15 border-y border-[#2962ff]/40 font-semibold" : ""
                    }`}
                  >
                    <td className="py-2 px-3 text-right text-[#089981] tabular-nums whitespace-nowrap font-medium">{row.callOi}</td>
                    <td className="py-2 px-3 text-right text-white font-medium tabular-nums whitespace-nowrap">{row.callLtp}</td>
                    <td className="py-2 px-2 text-center whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold tabular-nums ${
                          row.isAtm ? "bg-[#2962ff] text-white shadow-sm" : "bg-[#131722] text-amber-400 border border-[#2a2e39]"
                        }`}
                      >
                        {row.strike}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-white font-medium tabular-nums whitespace-nowrap">{row.putLtp}</td>
                    <td className="py-2 px-3 text-right text-[#f23645] tabular-nums whitespace-nowrap font-medium">{row.putOi}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* 9 Columns Detailed Greeks Layout: with scroll container and min-width */
          <div className="min-w-[740px]">
            <table className="w-full border-collapse text-xs table-fixed">
              <thead className="bg-[#131722] text-[10px] font-semibold uppercase sticky top-0 z-10 select-none">
                {/* Category Tier */}
                <tr className="border-b border-[#2a2e39]">
                  <th colSpan={4} className="py-1.5 px-3 text-center text-[#089981] bg-[#089981]/10 border-r border-[#2a2e39] font-bold tracking-wider">
                    CALLS (CE)
                  </th>
                  <th className="py-1.5 px-2 text-center text-white bg-[#181c27] font-bold tracking-wider">
                    STRIKE
                  </th>
                  <th colSpan={4} className="py-1.5 px-3 text-center text-[#f23645] bg-[#f23645]/10 border-l border-[#2a2e39] font-bold tracking-wider">
                    PUTS (PE)
                  </th>
                </tr>
                {/* Column Metrics Tier: Perfectly aligned Call OI and Put OI */}
                <tr className="border-b border-[#2a2e39] bg-[#131722] text-[#787b86]">
                  <th className="py-2 px-2 text-right text-[#089981] w-[11%] whitespace-nowrap font-bold">CALL OI</th>
                  <th className="py-2 px-2 text-right text-[#787b86] w-[10%] whitespace-nowrap font-bold">IV</th>
                  <th className="py-2 px-2 text-right text-[#787b86] w-[10%] whitespace-nowrap font-bold">DELTA</th>
                  <th className="py-2 px-2 text-right text-[#089981] w-[11%] whitespace-nowrap font-bold">LTP</th>
                  <th className="py-2 px-2 text-center text-white w-[16%] whitespace-nowrap font-bold">STRIKE</th>
                  <th className="py-2 px-2 text-right text-[#f23645] w-[11%] whitespace-nowrap font-bold">LTP</th>
                  <th className="py-2 px-2 text-right text-[#787b86] w-[10%] whitespace-nowrap font-bold">DELTA</th>
                  <th className="py-2 px-2 text-right text-[#787b86] w-[10%] whitespace-nowrap font-bold">IV</th>
                  <th className="py-2 px-2 text-right text-[#f23645] w-[11%] whitespace-nowrap font-bold">PUT OI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2e39]/30 text-[11px] font-mono">
                {NIFTY_OPTION_CHAIN.map((row) => (
                  <tr
                    key={row.strike}
                    className={`hover:bg-[#2a2e39]/30 transition-colors ${
                      row.isAtm ? "bg-[#2962ff]/15 border-y border-[#2962ff]/40 font-semibold" : ""
                    }`}
                  >
                    <td className="py-2 px-2 text-right text-[#089981] tabular-nums whitespace-nowrap font-medium">{row.callOi}</td>
                    <td className="py-2 px-2 text-right text-[#787b86] tabular-nums whitespace-nowrap">{row.callIv}</td>
                    <td className="py-2 px-2 text-right text-[#d1d4dc] tabular-nums whitespace-nowrap">{row.callDelta}</td>
                    <td className="py-2 px-2 text-right text-white font-medium tabular-nums whitespace-nowrap">{row.callLtp}</td>
                    <td className="py-2 px-2 text-center whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold tabular-nums ${
                          row.isAtm ? "bg-[#2962ff] text-white shadow-sm" : "bg-[#131722] text-amber-400 border border-[#2a2e39]"
                        }`}
                      >
                        {row.strike}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-white font-medium tabular-nums whitespace-nowrap">{row.putLtp}</td>
                    <td className="py-2 px-2 text-right text-[#d1d4dc] tabular-nums whitespace-nowrap">{row.putDelta}</td>
                    <td className="py-2 px-2 text-right text-[#787b86] tabular-nums whitespace-nowrap">{row.putIv}</td>
                    <td className="py-2 px-2 text-right text-[#f23645] tabular-nums whitespace-nowrap font-medium">{row.putOi}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Greeks Footer */}
      <div className="p-2 border-t border-[#2a2e39] bg-[#131722]/70 text-[10px] text-[#787b86] flex justify-between font-sans">
        <span>SIMD Black-Scholes Engine</span>
        <span>NSE Real-Time IV</span>
      </div>
    </div>
  );
}
