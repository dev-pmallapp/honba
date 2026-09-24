import { useState } from "react";
import TopNavigation from "./components/navigation/TopNavigation";
import DrawingToolbar, { DrawingTool } from "./components/chart/DrawingToolbar";
import MarketChart from "./components/chart/MarketChart";
import RightSidebar from "./components/sidebar/RightSidebar";
import StrategyTesterDock from "./components/tester/StrategyTesterDock";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function App() {
  const [currentSymbol, setCurrentSymbol] = useState("NIFTY ALPHA 50");
  const [timeframe, setTimeframe] = useState("5m");
  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [isRunningBacktest, setIsRunningBacktest] = useState(false);

  const [indicators, setIndicators] = useState({
    ema9: true,
    ema21: true,
    volume: true,
    supertrend: false,
  });

  const handleToggleIndicator = (key: keyof typeof indicators) => {
    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRunBacktest = () => {
    setIsRunningBacktest(true);
    setTimeout(() => {
      setIsRunningBacktest(false);
    }, 1200);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#131722] text-[#d1d4dc] overflow-hidden select-none font-sans">
      {/* 1. Top Navigation Bar */}
      <TopNavigation
        currentSymbol={currentSymbol}
        onSelectSymbol={setCurrentSymbol}
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        indicators={indicators}
        onToggleIndicator={handleToggleIndicator}
        onRunBacktest={handleRunBacktest}
        isRunningBacktest={isRunningBacktest}
      />

      {/* 2. Main Workbench Body (Drawing Tools + Market Chart + Right Sidebar) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Drawing Toolbar */}
        <DrawingToolbar
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          onClearDrawings={() => {}}
        />

        {/* Center Interactive Market Chart */}
        <main className="flex-1 relative overflow-hidden bg-[#131722]">
          <MarketChart
            symbol={currentSymbol}
            timeframe={timeframe}
            indicators={indicators}
          />
        </main>

        {/* Right Sidebar (Watchlist, Order Ticket, Options Chain) */}
        <RightSidebar
          currentSymbol={currentSymbol}
          onSelectSymbol={setCurrentSymbol}
        />
      </div>

      {/* 3. Bottom Strategy Tester & Quantitative Research Dock */}
      <div
        className={`bg-[#1e222d] border-t border-[#2a2e39] transition-all duration-200 relative flex flex-col ${
          isDockCollapsed ? "h-9" : "h-72"
        }`}
      >
        {/* Collapse / Expand Toggle Button */}
        <button
          onClick={() => setIsDockCollapsed(!isDockCollapsed)}
          title={isDockCollapsed ? "Expand Research Dock" : "Collapse Research Dock"}
          className="absolute right-4 top-2 z-30 p-1 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-white transition cursor-pointer"
        >
          {isDockCollapsed ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {/* Dock Interior */}
        <StrategyTesterDock />
      </div>
    </div>
  );
}
