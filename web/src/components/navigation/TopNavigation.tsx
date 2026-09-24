import { useState } from "react";
import {
  Activity,
  Play,
  Sparkles,
  ChevronDown,
  Layers,
  Search,
  KeyRound,
  Clock,
} from "lucide-react";
import { Button, Badge } from "../ui";

export interface SymbolInfo {
  symbol: string;
  name: string;
  price: string;
  change: string;
  isPositive: boolean;
  high: string;
  low: string;
  vol: string;
}

export interface TopNavigationProps {
  currentSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  timeframe: string;
  onSelectTimeframe: (tf: string) => void;
  indicators: {
    ema9: boolean;
    ema21: boolean;
    volume: boolean;
    supertrend: boolean;
  };
  onToggleIndicator: (key: "ema9" | "ema21" | "volume" | "supertrend") => void;
  onRunBacktest: () => void;
  isRunningBacktest: boolean;
}

export const SYMBOL_DATABASE: Record<string, SymbolInfo> = {
  "NIFTY ALPHA 50": {
    symbol: "NIFTY ALPHA 50",
    name: "NSE Momentum & Alpha Index",
    price: "8,124.60",
    change: "+96.40 (+1.20%)",
    isPositive: true,
    high: "8,180.20",
    low: "8,020.15",
    vol: "42.8M",
  },
  "NIFTY 50": {
    symbol: "NIFTY 50",
    name: "National Stock Exchange Benchmark",
    price: "24,850.20",
    change: "+112.30 (+0.45%)",
    isPositive: true,
    high: "24,910.00",
    low: "24,765.40",
    vol: "128.4M",
  },
  "BANKNIFTY": {
    symbol: "BANKNIFTY",
    name: "NSE Banking Sector Index",
    price: "51,320.50",
    change: "-145.20 (-0.28%)",
    isPositive: false,
    high: "51,600.00",
    low: "51,210.00",
    vol: "84.2M",
  },
  "NIFTY200 A30": {
    symbol: "NIFTY200 A30",
    name: "Nifty200 Alpha 30 Multi-Factor",
    price: "4,925.10",
    change: "+41.80 (+0.85%)",
    isPositive: true,
    high: "4,948.00",
    low: "4,890.30",
    vol: "18.5M",
  },
  "RELIANCE": {
    symbol: "RELIANCE",
    name: "Reliance Industries Ltd (INE002A01018)",
    price: "2,984.75",
    change: "+24.50 (+0.83%)",
    isPositive: true,
    high: "2,998.00",
    low: "2,955.00",
    vol: "5.1M",
  },
};

export default function TopNavigation({
  currentSymbol,
  onSelectSymbol,
  timeframe,
  onSelectTimeframe,
  indicators,
  onToggleIndicator,
  onRunBacktest,
  isRunningBacktest,
}: TopNavigationProps) {
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const [showIndicatorsDropdown, setShowIndicatorsDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const activeSymbolData = SYMBOL_DATABASE[currentSymbol] || SYMBOL_DATABASE["NIFTY ALPHA 50"];

  const filteredSymbols = Object.keys(SYMBOL_DATABASE).filter((sym) =>
    sym.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <header className="flex items-center justify-between h-12 px-3 bg-[#1e222d] border-b border-[#2a2e39] select-none text-xs font-sans">
      {/* Left: Brand + Symbol Search + Timeframes */}
      <div className="flex items-center space-x-3">
        {/* Brand */}
        <div className="flex items-center space-x-1.5 cursor-pointer">
          <div className="w-7 h-7 rounded bg-[#2962ff]/20 border border-[#2962ff]/40 flex items-center justify-center">
            <Activity className="w-4 h-4 text-[#2962ff]" />
          </div>
          <div>
            <div className="flex items-center space-x-1">
              <span className="font-extrabold tracking-wider text-white text-sm">HONBA</span>
              <span className="text-[10px] text-[#787b86] font-mono font-medium tracking-wider">QUANT</span>
            </div>
          </div>
        </div>

        <div className="h-5 w-[1px] bg-[#2a2e39]" />

        {/* Symbol Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSymbolDropdown(!showSymbolDropdown)}
            className="flex items-center space-x-2 px-3 py-1.5 bg-[#2a2e39] hover:bg-[#363a45] rounded text-white font-semibold transition cursor-pointer"
          >
            <span>{currentSymbol}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#787b86]" />
          </button>

          {showSymbolDropdown && (
            <div className="absolute left-0 mt-1 w-72 bg-[#1e222d] border border-[#2a2e39] rounded shadow-2xl z-50 overflow-hidden font-sans">
              <div className="p-2 border-b border-[#2a2e39] flex items-center space-x-2 bg-[#131722]">
                <Search className="w-3.5 h-3.5 text-[#787b86]" />
                <input
                  type="text"
                  placeholder="Search NSE/BSE symbol or ISIN..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-transparent text-white focus:outline-none text-xs w-full"
                  autoFocus
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                {filteredSymbols.map((sym) => {
                  const item = SYMBOL_DATABASE[sym];
                  return (
                    <div
                      key={sym}
                      onClick={() => {
                        onSelectSymbol(sym);
                        setShowSymbolDropdown(false);
                      }}
                      className="p-2.5 hover:bg-[#2a2e39] cursor-pointer flex justify-between items-center transition border-b border-[#2a2e39]/30"
                    >
                      <div>
                        <div className="font-semibold text-white">{sym}</div>
                        <div className="text-[10px] text-[#787b86]">{item.name}</div>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <div className="text-white text-xs">{item.price}</div>
                        <div
                          className={`text-[10px] ${
                            item.isPositive ? "text-[#089981]" : "text-[#f23645]"
                          }`}
                        >
                          {item.change}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Timeframes */}
        <div className="flex items-center space-x-0.5 bg-[#131722]/50 p-0.5 rounded border border-[#2a2e39]/50">
          {["1s", "1m", "5m", "15m", "1h", "1D"].map((tf) => (
            <button
              key={tf}
              onClick={() => onSelectTimeframe(tf)}
              className={`px-2 py-1 rounded transition text-xs font-sans cursor-pointer ${
                timeframe === tf
                  ? "bg-[#2a2e39] text-[#2962ff] font-bold"
                  : "text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]/50"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="h-5 w-[1px] bg-[#2a2e39]" />

        {/* Indicator Menu */}
        <div className="relative">
          <button
            onClick={() => setShowIndicatorsDropdown(!showIndicatorsDropdown)}
            className="flex items-center space-x-1 px-2.5 py-1 text-[#787b86] hover:text-white hover:bg-[#2a2e39] rounded transition cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Indicators</span>
            <ChevronDown className="w-3 h-3 ml-0.5" />
          </button>

          {showIndicatorsDropdown && (
            <div className="absolute left-0 mt-1 w-52 bg-[#1e222d] border border-[#2a2e39] rounded shadow-2xl z-50 p-2 space-y-1 font-sans">
              {[
                { key: "ema9", label: "EMA 9 (Fast Trend)", color: "#2962ff" },
                { key: "ema21", label: "EMA 21 (Slow Trend)", color: "#f59e0b" },
                { key: "volume", label: "Volume Sub-pane", color: "#089981" },
                { key: "supertrend", label: "SuperTrend (10, 3)", color: "#10b981" },
              ].map((ind) => (
                <label
                  key={ind.key}
                  className="flex items-center justify-between p-1.5 hover:bg-[#2a2e39] rounded cursor-pointer transition text-xs"
                >
                  <span className="flex items-center space-x-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: ind.color }}
                    />
                    <span className="text-[#d1d4dc]">{ind.label}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={indicators[ind.key as keyof typeof indicators]}
                    onChange={() =>
                      onToggleIndicator(ind.key as keyof typeof indicators)
                    }
                    className="rounded bg-[#2a2e39] border-[#363a45] text-[#2962ff] focus:ring-0 cursor-pointer"
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Quick Ticker Readout */}
        <div className="hidden lg:flex items-center space-x-3 text-[11px] font-mono pl-2">
          <div>
            <span className="text-[#787b86]">LTP: </span>
            <span className="text-white font-semibold tabular-nums">{activeSymbolData.price}</span>
          </div>
          <div className={`tabular-nums ${activeSymbolData.isPositive ? "text-[#089981]" : "text-[#f23645]"}`}>
            {activeSymbolData.change}
          </div>
          <div className="text-[#787b86]">
            H: <span className="text-white tabular-nums">{activeSymbolData.high}</span> L:{" "}
            <span className="text-white tabular-nums">{activeSymbolData.low}</span> Vol:{" "}
            <span className="text-white tabular-nums">{activeSymbolData.vol}</span>
          </div>
        </div>
      </div>

      {/* Right: Market Status, Keyring Vault, Backtest & AI Quant */}
      <div className="flex items-center space-x-3">
        {/* NSE Market Hours Pill */}
        <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 bg-[#131722] rounded border border-[#2a2e39] text-[11px]">
          <span className="w-2 h-2 rounded-full bg-[#089981] animate-pulse" />
          <span className="text-[#787b86] font-mono">NSE LIVE</span>
          <span className="text-[#787b86]">|</span>
          <Clock className="w-3 h-3 text-[#787b86]" />
          <span className="text-[#d1d4dc] font-mono tabular-nums">14:42:18 IST</span>
        </div>

        {/* OS Keyring Vault Pill */}
        <div
          title="Protected by OS Keychain / Hardware Security Enclave"
          className="hidden sm:flex items-center space-x-1 px-2 py-1 bg-[#131722] rounded border border-[#2a2e39] text-[11px] text-[#787b86]"
        >
          <KeyRound className="w-3 h-3 text-[#2962ff]" />
          <span className="text-[#d1d4dc]">Keyring:</span>
          <Badge variant="bullish" size="xs">Active</Badge>
        </div>

        {/* Run Backtest Button */}
        <Button
          variant="primary"
          size="sm"
          isLoading={isRunningBacktest}
          onClick={onRunBacktest}
          icon={!isRunningBacktest ? <Play className="w-3.5 h-3.5 fill-current" /> : undefined}
          className="font-semibold shadow-md"
        >
          {isRunningBacktest ? "Running Engine..." : "Run Backtest"}
        </Button>

        {/* AI Quant Agent */}
        <Button
          variant="secondary"
          size="sm"
          icon={<Sparkles className="w-3.5 h-3.5 text-amber-400" />}
          className="border-[#363a45]"
        >
          AI Quant
        </Button>
      </div>
    </header>
  );
}
