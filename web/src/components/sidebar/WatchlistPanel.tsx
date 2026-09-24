import { useState } from "react";
import { Search, TrendingUp, TrendingDown } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../ui";

export interface WatchlistItem {
  symbol: string;
  name: string;
  category: string;
  price: string;
  change: string;
  changeValue: string;
  isPositive: boolean;
  vol: string;
}

export interface WatchlistPanelProps {
  currentSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

const WATCHLIST_ITEMS: WatchlistItem[] = [
  {
    symbol: "NIFTY 50",
    name: "Nifty 50 Index",
    category: "NSE Benchmark",
    price: "24,850.20",
    change: "+0.45%",
    changeValue: "+112.30",
    isPositive: true,
    vol: "128.4M",
  },
  {
    symbol: "NIFTY ALPHA 50",
    name: "Alpha Momentum Index",
    category: "Thematic Factor",
    price: "8,124.60",
    change: "+1.20%",
    changeValue: "+96.40",
    isPositive: true,
    vol: "42.8M",
  },
  {
    symbol: "BANKNIFTY",
    name: "Nifty Bank",
    category: "Sectoral Index",
    price: "51,320.50",
    change: "-0.28%",
    changeValue: "-145.20",
    isPositive: false,
    vol: "84.2M",
  },
  {
    symbol: "NIFTY200 A30",
    name: "Alpha 30 Low Vol",
    category: "Smart Beta",
    price: "4,925.10",
    change: "+0.85%",
    changeValue: "+41.80",
    isPositive: true,
    vol: "18.5M",
  },
  {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    category: "Oil & Telecom",
    price: "2,984.75",
    change: "+0.83%",
    changeValue: "+24.50",
    isPositive: true,
    vol: "5.1M",
  },
  {
    symbol: "HDFCBANK",
    name: "HDFC Bank Ltd",
    category: "Private Banking",
    price: "1,642.10",
    change: "-0.42%",
    changeValue: "-6.90",
    isPositive: false,
    vol: "14.2M",
  },
  {
    symbol: "NIFTYBEES",
    name: "Nippon ETF Nifty BeES",
    category: "Index ETF",
    price: "274.50",
    change: "+0.42%",
    changeValue: "+1.15",
    isPositive: true,
    vol: "12.8M",
  },
  {
    symbol: "LIQUIDBEES",
    name: "Nippon Liquid ETF",
    category: "Cash Collateral",
    price: "1,000.00",
    change: "+0.00%",
    changeValue: "+0.00",
    isPositive: true,
    vol: "3.4M",
  },
];

export default function WatchlistPanel({
  currentSymbol,
  onSelectSymbol,
}: WatchlistPanelProps) {
  const [filter, setFilter] = useState("");

  const filtered = WATCHLIST_ITEMS.filter(
    (item) =>
      item.symbol.toLowerCase().includes(filter.toLowerCase()) ||
      item.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#1e222d] text-[#d1d4dc] text-xs select-none font-sans">
      {/* Search Header */}
      <div className="p-2 border-b border-[#2a2e39] bg-[#131722]/50">
        <div className="flex items-center space-x-2 px-2.5 py-1.5 bg-[#2a2e39] rounded border border-[#363a45]">
          <Search className="w-3.5 h-3.5 text-[#787b86] shrink-0" />
          <input
            type="text"
            placeholder="Filter symbols..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-transparent text-white focus:outline-none w-full text-xs font-sans placeholder-[#787b86]"
          />
        </div>
      </div>

      {/* Structured Aligned Table */}
      <div className="flex-1 overflow-y-auto">
        <Table compact>
          <TableHeader>
            <tr>
              <TableHead style={{ width: "48%" }}>Symbol</TableHead>
              <TableHead align="right" style={{ width: "26%" }}>Last</TableHead>
              <TableHead align="right" style={{ width: "26%" }}>Chg %</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => {
              const isSelected = item.symbol === currentSymbol;
              return (
                <TableRow
                  key={item.symbol}
                  onClick={() => onSelectSymbol(item.symbol)}
                  isHighlight={isSelected}
                  className={`cursor-pointer ${
                    isSelected ? "border-l-2 border-l-[#2962ff] bg-[#2962ff]/10" : ""
                  }`}
                >
                  <TableCell mono={false}>
                    <div className="font-semibold text-white truncate">{item.symbol}</div>
                    <div className="text-[10px] text-[#787b86] truncate">{item.name}</div>
                  </TableCell>

                  <TableCell align="right" className="font-medium text-white">
                    {item.price}
                  </TableCell>

                  <TableCell align="right">
                    <div
                      className={`inline-flex items-center space-x-0.5 font-semibold ${
                        item.isPositive ? "text-[#089981]" : "text-[#f23645]"
                      }`}
                    >
                      {item.isPositive ? (
                        <TrendingUp className="w-3 h-3 shrink-0" />
                      ) : (
                        <TrendingDown className="w-3 h-3 shrink-0" />
                      )}
                      <span>{item.change}</span>
                    </div>
                    <div className="text-[9px] text-[#787b86] font-mono">{item.changeValue}</div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Watchlist Footer */}
      <div className="p-2 border-t border-[#2a2e39] bg-[#131722]/50 text-[10px] text-[#787b86] flex justify-between items-center">
        <span>{filtered.length} Instruments</span>
        <span className="font-mono text-[#089981]">Feed: Real-time NSE</span>
      </div>
    </div>
  );
}
