import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge } from "../ui";

export interface TradeRecord {
  id: string;
  symbol: string;
  type: "LONG" | "SHORT";
  entryTime: string;
  entryPrice: number;
  exitTime: string;
  exitPrice: number;
  qty: number;
  grossPnl: number;
  taxAndSlippage: number;
  netPnl: number;
  returnPct: number;
  exitReason: string;
}

const SAMPLE_TRADES: TradeRecord[] = [
  {
    id: "TRD-8902",
    symbol: "NIFTY ALPHA 50",
    type: "LONG",
    entryTime: "2024-01-08 09:25",
    entryPrice: 8042.50,
    exitTime: "2024-01-08 14:45",
    exitPrice: 8165.00,
    qty: 50,
    grossPnl: 6125.00,
    taxAndSlippage: 142.50,
    netPnl: 5982.50,
    returnPct: 1.52,
    exitReason: "Target 2 Reached (+1.5%)",
  },
  {
    id: "TRD-8901",
    symbol: "NIFTY 50",
    type: "SHORT",
    entryTime: "2024-01-05 10:15",
    entryPrice: 24890.00,
    exitTime: "2024-01-05 13:30",
    exitPrice: 24780.00,
    qty: 25,
    grossPnl: 2750.00,
    taxAndSlippage: 98.20,
    netPnl: 2651.80,
    returnPct: 0.44,
    exitReason: "SuperTrend Trend Reversal",
  },
  {
    id: "TRD-8900",
    symbol: "NIFTY ALPHA 50",
    type: "LONG",
    entryTime: "2024-01-04 11:30",
    entryPrice: 8120.00,
    exitTime: "2024-01-04 15:15",
    exitPrice: 8092.00,
    qty: 50,
    grossPnl: -1400.00,
    taxAndSlippage: 124.00,
    netPnl: -1524.00,
    returnPct: -0.34,
    exitReason: "MIS Intraday Auto Square-Off (15:15)",
  },
  {
    id: "TRD-8899",
    symbol: "BANKNIFTY",
    type: "LONG",
    entryTime: "2024-01-03 09:40",
    entryPrice: 51100.00,
    exitTime: "2024-01-03 14:10",
    exitPrice: 51480.00,
    qty: 30,
    grossPnl: 11400.00,
    taxAndSlippage: 285.00,
    netPnl: 11115.00,
    returnPct: 0.74,
    exitReason: "EMA 9 Trailing Stop Triggered",
  },
  {
    id: "TRD-8898",
    symbol: "RELIANCE",
    type: "LONG",
    entryTime: "2024-01-02 10:00",
    entryPrice: 2940.00,
    exitTime: "2024-01-02 12:45",
    exitPrice: 2982.50,
    qty: 100,
    grossPnl: 4250.00,
    taxAndSlippage: 164.20,
    netPnl: 4085.80,
    returnPct: 1.45,
    exitReason: "Resistance Breakout Volume Spike",
  },
];

export default function TradeLedger() {
  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] text-xs select-none rounded border border-[#2a2e39] overflow-hidden font-sans">
      <div className="flex-1 overflow-y-auto">
        <Table compact>
          <TableHeader>
            <tr>
              <TableHead style={{ width: "9%" }}>ID</TableHead>
              <TableHead style={{ width: "16%" }}>Symbol / Side</TableHead>
              <TableHead style={{ width: "16%" }}>Entry Time & Px</TableHead>
              <TableHead style={{ width: "16%" }}>Exit Time & Px</TableHead>
              <TableHead align="right" style={{ width: "6%" }}>Qty</TableHead>
              <TableHead align="right" style={{ width: "10%" }}>Taxes/STT</TableHead>
              <TableHead align="right" style={{ width: "13%" }}>Net PnL</TableHead>
              <TableHead style={{ width: "14%" }}>Exit Reason</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {SAMPLE_TRADES.map((trade) => {
              const isProfitable = trade.netPnl >= 0;
              return (
                <TableRow key={trade.id}>
                  <TableCell className="text-[#787b86]">{trade.id}</TableCell>

                  <TableCell mono={false}>
                    <div className="flex items-center space-x-1.5">
                      <Badge variant={trade.type === "LONG" ? "bullish" : "bearish"} size="xs">
                        {trade.type}
                      </Badge>
                      <span className="font-semibold text-white truncate">{trade.symbol}</span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="text-white">₹{trade.entryPrice.toFixed(2)}</div>
                    <div className="text-[10px] text-[#787b86]">{trade.entryTime}</div>
                  </TableCell>

                  <TableCell>
                    <div className="text-white">₹{trade.exitPrice.toFixed(2)}</div>
                    <div className="text-[10px] text-[#787b86]">{trade.exitTime}</div>
                  </TableCell>

                  <TableCell align="right" className="text-white">
                    {trade.qty}
                  </TableCell>

                  <TableCell align="right" className="text-[#787b86]">
                    -₹{trade.taxAndSlippage.toFixed(2)}
                  </TableCell>

                  <TableCell align="right">
                    <div
                      className={`font-bold flex items-center justify-end space-x-0.5 ${
                        isProfitable ? "text-[#089981]" : "text-[#f23645]"
                      }`}
                    >
                      {isProfitable ? (
                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>
                        {isProfitable ? "+" : ""}₹{trade.netPnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div
                      className={`text-[10px] ${
                        isProfitable ? "text-[#089981]" : "text-[#f23645]"
                      }`}
                    >
                      {isProfitable ? "+" : ""}{trade.returnPct.toFixed(2)}%
                    </div>
                  </TableCell>

                  <TableCell mono={false} className="text-[#787b86] text-[11px] truncate">
                    {trade.exitReason}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
