import React from 'react';
import { useScreenerStore } from '../../core/store/use-screener-store';
import { ExternalLink, Play, Trash2 } from 'lucide-react';

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
    <div className="shortlist-action-bar visible" id="floating-action-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="shortlist-count-badge">{shortlistedSymbols.length}</span>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Selected</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          className="shortlist-btn shortlist-btn-primary"
          onClick={handleOpenWorkbench}
          title="Open selected symbols in WorkBench"
        >
          <span>Open in WorkBench</span>
          <ExternalLink size={13} style={{ marginLeft: 4 }} />
        </button>
        <button
          className="shortlist-btn shortlist-btn-secondary"
          onClick={handleOpenSim}
          title="Open in Nautilus Simulator"
        >
          <Play size={12} style={{ marginRight: 4 }} />
          <span>Simulate</span>
        </button>
        <button
          className="shortlist-btn shortlist-btn-secondary shortlist-btn-danger"
          onClick={clearShortlist}
          title="Clear all selections"
        >
          <Trash2 size={12} style={{ marginRight: 4 }} />
          <span>Clear</span>
        </button>
      </div>
    </div>
  );
};
