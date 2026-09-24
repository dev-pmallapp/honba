import { Cpu, Activity, ShieldAlert, CheckCircle } from "lucide-react";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell, Badge, StatCard } from "../ui";

export interface TickWorker {
  id: string;
  symbol: string;
  bufferUsage: number; // 0 to 100%
  throughput: string;
  latencyUs: number;
  indicators: string;
  status: "ACTIVE" | "IDLE" | "THROTTLED";
}

const SAMPLE_WORKERS: TickWorker[] = [
  {
    id: "worker-niftyalpha50",
    symbol: "NIFTY ALPHA 50",
    bufferUsage: 14,
    throughput: "18,400 ticks/s",
    latencyUs: 4,
    indicators: "EMA9: 8122.4 | EMA21: 8094.1 | SuperTrend: Bullish",
    status: "ACTIVE",
  },
  {
    id: "worker-nifty50",
    symbol: "NIFTY 50",
    bufferUsage: 22,
    throughput: "34,200 ticks/s",
    latencyUs: 3,
    indicators: "EMA9: 24840.1 | EMA21: 24810.0 | RSI: 62.4",
    status: "ACTIVE",
  },
  {
    id: "worker-banknifty",
    symbol: "BANKNIFTY",
    bufferUsage: 18,
    throughput: "28,100 ticks/s",
    latencyUs: 5,
    indicators: "EMA9: 51290.0 | EMA21: 51340.0 | RSI: 44.8",
    status: "ACTIVE",
  },
  {
    id: "worker-reliance",
    symbol: "RELIANCE",
    bufferUsage: 8,
    throughput: "9,500 ticks/s",
    latencyUs: 4,
    indicators: "VWAP: 2978.20 | VolumeBreakout: True",
    status: "ACTIVE",
  },
  {
    id: "worker-option-chain",
    symbol: "NIFTY 24800 CE/PE",
    bufferUsage: 31,
    throughput: "42,000 ticks/s",
    latencyUs: 6,
    indicators: "IV: 12.4% | Delta: 0.52 | Gamma: 0.0014",
    status: "ACTIVE",
  },
];

export default function PipelineSupervisor() {
  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] text-xs select-none rounded border border-[#2a2e39] overflow-hidden">
      {/* System Supervisor Header Metric Cards */}
      <div className="p-3 bg-[#1e222d] border-b border-[#2a2e39] grid grid-cols-4 gap-3">
        <StatCard
          title="System Supervisor"
          value="TOKIO ASYNC MPSC"
          subtitle="Honba Pipeline Runtime"
          icon={<Cpu className="w-4 h-4 text-[#2962ff]" />}
        />
        <StatCard
          title="Pipeline Throughput"
          value="132,200 ticks/s"
          valueColor="text-[#089981]"
          badge={{ text: "HIGH TPUT", variant: "bullish" }}
          icon={<Activity className="w-4 h-4 text-[#089981]" />}
        />
        <StatCard
          title="Portfolio Circuit Breaker"
          value="Cap: -2.5% Daily"
          subtitle="RiskGuard Active"
          icon={<ShieldAlert className="w-4 h-4 text-amber-400" />}
        />
        <StatCard
          title="Worker Health"
          value="5 / 5 Healthy"
          valueColor="text-[#089981]"
          badge={{ text: "OPTIMAL", variant: "bullish" }}
          icon={<CheckCircle className="w-4 h-4 text-[#089981]" />}
        />
      </div>

      {/* Workers Aligned Table */}
      <div className="flex-1 overflow-y-auto">
        <Table compact>
          <TableHeader>
            <tr>
              <TableHead style={{ width: "24%" }}>Worker ID / Instrument</TableHead>
              <TableHead style={{ width: "18%" }}>Ring Buffer Depth</TableHead>
              <TableHead style={{ width: "18%" }}>Tick Throughput</TableHead>
              <TableHead style={{ width: "30%" }}>Isolated Engine State</TableHead>
              <TableHead align="right" style={{ width: "10%" }}>Status</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {SAMPLE_WORKERS.map((w) => (
              <TableRow key={w.id}>
                <TableCell mono={false}>
                  <div className="font-semibold text-white">{w.symbol}</div>
                  <div className="text-[10px] text-[#787b86] font-mono">{w.id}</div>
                </TableCell>

                <TableCell>
                  <div className="flex justify-between text-[10px] text-[#787b86] mb-1">
                    <span>{w.bufferUsage}%</span>
                    <span>1024 cap</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#2a2e39] rounded overflow-hidden">
                    <div
                      className="h-full bg-[#2962ff] rounded"
                      style={{ width: `${w.bufferUsage}%` }}
                    />
                  </div>
                </TableCell>

                <TableCell>
                  <div className="text-white font-mono">{w.throughput}</div>
                  <div className="text-[10px] text-[#089981] font-mono">{w.latencyUs} μs latency</div>
                </TableCell>

                <TableCell mono={false}>
                  <span className="text-[11px] text-[#787b86] font-mono truncate block">
                    {w.indicators}
                  </span>
                </TableCell>

                <TableCell align="right">
                  <Badge variant="bullish" size="xs">
                    {w.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
