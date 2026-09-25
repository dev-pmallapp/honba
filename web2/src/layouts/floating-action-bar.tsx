import React from 'react';
import { useScreenerStore } from '../core/store/use-screener-store';
import { ExternalLink, Play, Trash2 } from 'lucide-react';
import { HbButton } from '../components/ui/hb-button';
import { HbBubble } from '../components/ui/hb-bubble';

export const FloatingActionBar: React.FC = () => {
  const shortlistedSymbols = useScreenerStore((state) => state.shortlistedSymbols);
  const clearShortlist = useScreenerStore((state) => state.clearShortlist);
  const activeSymbol = useScreenerStore((state) => state.activeSymbol);

  if (shortlistedSymbols.length === 0) return null;

  const handleOpenWorkbench = () => {
    window.location.href = `/workbench.html?symbols=${encodeURIComponent(shortlistedSymbols.join(','))}`;
  };

  const handleOpenSim = () => {
    const target = shortlistedSymbols[0] || activeSymbol;
    window.location.href = `/simulator.html?symbol=${encodeURIComponent(target)}`;
  };

  return (
    <div className="shortlist-action-bar hb-floating-action-bar visible" id="floating-action-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <HbBubble variant="accent" size="sm">
          {shortlistedSymbols.length}
        </HbBubble>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Selected</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <HbButton
          variant="primary"
          size="sm"
          onClick={handleOpenWorkbench}
          iconRight={<ExternalLink size={13} />}
          title="Open selected symbols in WorkBench"
        >
          Open in WorkBench
        </HbButton>
        <HbButton
          variant="secondary"
          size="sm"
          onClick={handleOpenSim}
          icon={<Play size={12} />}
          title="Open in Nautilus Simulator"
        >
          Simulate
        </HbButton>
        <HbButton
          variant="danger"
          size="sm"
          onClick={clearShortlist}
          icon={<Trash2 size={12} />}
          title="Clear all selections"
        >
          Clear
        </HbButton>
      </div>
    </div>
  );
};

export const HbFloatingActionBar = FloatingActionBar;
