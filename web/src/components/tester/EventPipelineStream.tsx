import { CheckCircle2, ShieldCheck, Zap } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge } from "../ui";

export interface PipelineEvent {
  id: string;
  time: string;
  stage: "MarketEvent" | "StrategySignal" | "RiskGuard" | "OrderEvent" | "FillEvent";
  symbol: string;
  payload: string;
  latencyUs: number;
  status: "OK" | "WARNING" | "REJECTED";
}

const SAMPLE_EVENTS: PipelineEvent[] = [
  {
    id: "EVT-10928",
    time: "14:42:18.492104",
    stage: "FillEvent",
    symbol: "NIFTY ALPHA 50",
    payload: "Order #ORD-9021 FILLED: 50 @ ₹8,165.00 (STT: ₹102.00, Slip: 0.05 pt)",
    latencyUs: 42,
    status: "OK",
  },
  {
    id: "EVT-10927",
    time: "14:42:18.491210",
    stage: "OrderEvent",
    symbol: "NIFTY ALPHA 50",
    payload: "Submitting LIMIT SELL to Execution Gateway (Lot: 2, Qty: 50)",
    latencyUs: 88,
    status: "OK",
  },
  {
    id: "EVT-10926",
    time: "14:42:18.490150",
    stage: "RiskGuard",
    symbol: "NIFTY ALPHA 50",
    payload: "Passed Max Intra-day Exposure Check (Used: 34.2% / Cap: 60.0%), VaR: 1.4%",
    latencyUs: 14,
    status: "OK",
  },
  {
    id: "EVT-10925",
    time: "14:42:18.489800",
    stage: "StrategySignal",
    symbol: "NIFTY ALPHA 50",
    payload: "Signal: SELL / EXIT LONG (Reason: EMA 9 down-cross EMA 21 on 5m bar)",
    latencyUs: 19,
    status: "OK",
  },
  {
    id: "EVT-10924",
    time: "14:42:18.489200",
    stage: "MarketEvent",
    symbol: "NIFTY ALPHA 50",
    payload: "BarClose(5m): Open: 8150.00, High: 8170.00, Low: 8145.00, Close: 8165.00, Vol: 34,200",
    latencyUs: 8,
    status: "OK",
  },
  {
    id: "EVT-10923",
    time: "14:42:05.112000",
    stage: "RiskGuard",
    symbol: "BANKNIFTY",
    payload: "Rejected order attempt: Circuit breaker margin limit exceeded for Sector Banking",
    latencyUs: 12,
    status: "REJECTED",
  },
];

export default function EventPipelineStream() {
  const getStageBadge = (stage: PipelineEvent["stage"], status: PipelineEvent["status"]) => {
    if (stage === "FillEvent") return <Badge variant="bullish" size="xs">FillEvent</Badge>;
    if (stage === "RiskGuard") {
      return status === "REJECTED" ? (
        <Badge variant="bearish" size="xs">RiskGuard</Badge>
      ) : (
        <Badge variant="bullish" size="xs">RiskGuard</Badge>
      );
    }
    if (stage === "OrderEvent") return <Badge variant="warning" size="xs">OrderEvent</Badge>;
    if (stage === "StrategySignal") return <Badge variant="accent" size="xs">Signal</Badge>;
    return <Badge variant="neutral" size="xs">MarketEvent</Badge>;
  };

  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] text-xs select-none rounded border border-[#2a2e39] overflow-hidden font-sans">
      {/* Event Pipeline Stage Diagram */}
      <div className="p-2.5 bg-[#1e222d] border-b border-[#2a2e39] flex items-center justify-between">
        <div className="flex items-center space-x-2 text-[11px]">
          <span className="font-semibold text-white">Event Lifecycle Pipeline:</span>
          <div className="flex items-center space-x-1.5 font-mono text-[10px]">
            <span className="px-2 py-0.5 rounded bg-[#2962ff]/20 text-[#2962ff] border border-[#2962ff]/40">
              1. Market Event
            </span>
            <span className="text-[#787b86]">➔</span>
            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/40">
              2. Strategy Signal
            </span>
            <span className="text-[#787b86]">➔</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              3. Risk Guard
            </span>
            <span className="text-[#787b86]">➔</span>
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
              4. Order Routing
            </span>
            <span className="text-[#787b86]">➔</span>
            <span className="px-2 py-0.5 rounded bg-[#089981]/20 text-[#089981] border border-[#089981]/40">
              5. Trade Fill
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-[10px] text-[#787b86]">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Zero heap allocations in event hot path</span>
        </div>
      </div>

      {/* Events Table */}
      <div className="flex-1 overflow-y-auto">
        <Table compact>
          <TableHeader>
            <tr>
              <TableHead style={{ width: "16%" }}>Timestamp (IST)</TableHead>
              <TableHead style={{ width: "14%" }}>Stage</TableHead>
              <TableHead style={{ width: "16%" }}>Symbol</TableHead>
              <TableHead style={{ width: "44%" }}>Message Payload</TableHead>
              <TableHead align="right" style={{ width: "10%" }}>Latency</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {SAMPLE_EVENTS.map((evt) => (
              <TableRow key={evt.id}>
                <TableCell className="text-[#787b86] text-[10px]">{evt.time}</TableCell>
                <TableCell mono={false}>{getStageBadge(evt.stage, evt.status)}</TableCell>
                <TableCell mono={false} className="font-semibold text-white">
                  {evt.symbol}
                </TableCell>
                <TableCell mono={false} className="text-[#d1d4dc] text-[11px] truncate">
                  {evt.payload}
                </TableCell>
                <TableCell align="right">
                  <span
                    className={
                      evt.latencyUs < 50
                        ? "text-[#089981]"
                        : evt.latencyUs < 100
                        ? "text-amber-400"
                        : "text-[#f23645]"
                    }
                  >
                    {evt.latencyUs} μs
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-[#2a2e39] bg-[#1e222d] text-[10px] text-[#787b86] flex justify-between items-center">
        <div className="flex items-center space-x-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#089981]" />
          <span>Execution Parity: 100% Identical logic in Backtest and Live</span>
        </div>
        <div className="flex items-center space-x-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#089981]" />
          <span>Pipeline State: Normal (0 drops)</span>
        </div>
      </div>
    </div>
  );
}
