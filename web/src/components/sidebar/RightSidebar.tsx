import { useState } from "react";
import { ListFilter, ShoppingCart, BarChart3 } from "lucide-react";
import WatchlistPanel from "./WatchlistPanel";
import OrderTicket from "./OrderTicket";
import OptionChainView from "./OptionChainView";
import { Tabs } from "../ui";

export interface RightSidebarProps {
  currentSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export default function RightSidebar({
  currentSymbol,
  onSelectSymbol,
}: RightSidebarProps) {
  const [activeTab, setActiveTab] = useState<string>("watchlist");
  const [isOptionsExpanded, setIsOptionsExpanded] = useState(false);

  const tabs = [
    { id: "watchlist", label: "Watchlist", icon: <ListFilter className="w-3.5 h-3.5" /> },
    { id: "order", label: "Order Ticket", icon: <ShoppingCart className="w-3.5 h-3.5" /> },
    { id: "options", label: "Options Chain", icon: <BarChart3 className="w-3.5 h-3.5" /> },
  ];

  const sidebarWidth =
    activeTab === "options"
      ? isOptionsExpanded
        ? "w-[760px]"
        : "w-[600px]"
      : "w-80";

  return (
    <aside
      className={`${sidebarWidth} bg-[#1e222d] border-l border-[#2a2e39] flex flex-col h-full select-none transition-all duration-200 font-sans`}
    >
      {/* Top Tab Bar */}
      <div className="flex items-center h-10 border-b border-[#2a2e39] bg-[#131722]/50 px-2.5">
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab)}
          variant="pill"
          size="sm"
          className="w-full justify-between"
        />
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "watchlist" && (
          <WatchlistPanel
            currentSymbol={currentSymbol}
            onSelectSymbol={onSelectSymbol}
          />
        )}
        {activeTab === "order" && (
          <OrderTicket currentSymbol={currentSymbol} />
        )}
        {activeTab === "options" && (
          <OptionChainView
            isExpanded={isOptionsExpanded}
            onToggleExpand={() => setIsOptionsExpanded(!isOptionsExpanded)}
          />
        )}
      </div>
    </aside>
  );
}
