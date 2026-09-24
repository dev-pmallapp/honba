import { useState } from "react";
import {
  Crosshair,
  TrendingUp,
  Minus,
  GitBranch,
  Target,
  Ruler,
  Trash2,
  Lock,
  Eye,
} from "lucide-react";

export type DrawingTool =
  | "cursor"
  | "trendline"
  | "horizontal"
  | "fibonacci"
  | "position"
  | "measure";

interface DrawingToolbarProps {
  activeTool: DrawingTool;
  onSelectTool: (tool: DrawingTool) => void;
  onClearDrawings: () => void;
}

export default function DrawingToolbar({
  activeTool,
  onSelectTool,
  onClearDrawings,
}: DrawingToolbarProps) {
  const [locked, setLocked] = useState(false);
  const [hidden, setHidden] = useState(false);

  const tools: { id: DrawingTool; label: string; icon: typeof Crosshair }[] = [
    { id: "cursor", label: "Crosshair Pointer", icon: Crosshair },
    { id: "trendline", label: "Trend Line (Alt+T)", icon: TrendingUp },
    { id: "horizontal", label: "Horizontal Support/Resistance (Alt+H)", icon: Minus },
    { id: "fibonacci", label: "Fibonacci Retracement (Alt+F)", icon: GitBranch },
    { id: "position", label: "Long / Short Position Bracket", icon: Target },
    { id: "measure", label: "Measure Price & Bars", icon: Ruler },
  ];

  return (
    <div className="w-11 bg-[#1e222d] border-r border-[#2a2e39] flex flex-col justify-between py-2 items-center select-none text-[#787b86]">
      {/* Top Drawing Tools */}
      <div className="flex flex-col items-center space-y-1">
        {tools.map((t) => {
          const Icon = t.icon;
          const isActive = activeTool === t.id;
          return (
            <button
              key={t.id}
              title={t.label}
              onClick={() => onSelectTool(t.id)}
              className={`w-8 h-8 rounded flex items-center justify-center transition group relative cursor-pointer ${
                isActive
                  ? "bg-[#2962ff] text-white"
                  : "hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>

      {/* Bottom Control Tools */}
      <div className="flex flex-col items-center space-y-1 border-t border-[#2a2e39] pt-2">
        <button
          title={locked ? "Unlock All Drawings" : "Lock All Drawings"}
          onClick={() => setLocked(!locked)}
          className={`w-8 h-8 rounded flex items-center justify-center transition ${
            locked ? "text-amber-400 bg-[#2a2e39]" : "hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
          }`}
        >
          <Lock className="w-4 h-4" />
        </button>

        <button
          title={hidden ? "Show Drawings" : "Hide Drawings"}
          onClick={() => setHidden(!hidden)}
          className={`w-8 h-8 rounded flex items-center justify-center transition ${
            hidden ? "text-[#f23645] bg-[#2a2e39]" : "hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
          }`}
        >
          <Eye className="w-4 h-4" />
        </button>

        <button
          title="Clear All Drawings & Measurements"
          onClick={onClearDrawings}
          className="w-8 h-8 rounded flex items-center justify-center hover:bg-[#f23645]/20 hover:text-[#f23645] transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
