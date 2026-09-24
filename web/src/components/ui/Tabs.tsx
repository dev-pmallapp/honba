import React from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: "pill" | "underline" | "dock";
  size?: "sm" | "md";
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = "pill",
  size = "sm",
  className = "",
}) => {
  if (variant === "dock") {
    return (
      <div className={`flex items-center space-x-1 border-b border-[#2a2e39] bg-[#131722]/60 px-3 ${className}`}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-sans transition-all border-b-2 cursor-pointer focus:outline-none ${
                isActive
                  ? "border-[#2962ff] text-white font-semibold bg-[#2a2e39]/30"
                  : "border-transparent text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]/20"
              }`}
            >
              {tab.icon && <span className="w-3.5 h-3.5">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-[#2a2e39] text-[#787b86]">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === "underline") {
    return (
      <div className={`flex items-center space-x-2 border-b border-[#2a2e39] ${className}`}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex items-center space-x-1.5 pb-2 text-xs font-sans transition border-b-2 cursor-pointer focus:outline-none ${
                isActive
                  ? "border-[#2962ff] text-white font-medium"
                  : "border-transparent text-[#787b86] hover:text-[#d1d4dc]"
              }`}
            >
              {tab.icon && <span className="w-3.5 h-3.5">{tab.icon}</span>}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Default: Pill tabs
  const sizeClass = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-xs";

  return (
    <div className={`flex items-center bg-[#131722]/80 p-0.5 rounded border border-[#2a2e39] space-x-1 ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center space-x-1.5 rounded transition font-sans cursor-pointer focus:outline-none ${sizeClass} ${
              isActive
                ? "bg-[#2a2e39] text-white font-semibold shadow-sm"
                : "text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]/50"
            }`}
          >
            {tab.icon && <span className="w-3.5 h-3.5">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className="ml-1 text-[10px] font-mono px-1 py-0.2 rounded bg-[#1e222d] text-[#787b86]">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
