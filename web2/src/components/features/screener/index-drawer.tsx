import React, { useState, useMemo } from 'react';
import { PillDropdown } from '../../ui/pill-dropdown';
import { CountryCode } from '../../../core/market-data';
import { getIndicesForMarket, IndexItem } from '../../../core/indices';
import {
  HelpCircle,
  Trash2,
  Search,
  X,
  Check,
  Landmark,
  Coins,
  Car,
  HeartPulse,
  Cpu,
  Layers,
  ShoppingBag,
  Building2,
} from 'lucide-react';

interface IndexDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  selectedIndices: string[];
  onSelectIndices: (indices: string[]) => void;
  country: CountryCode;
}

export const IndexDrawer: React.FC<IndexDrawerProps> = ({
  isOpen,
  onClose,
  triggerRef,
  selectedIndices,
  onSelectIndices,
  country,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const marketIndices = useMemo(() => getIndicesForMarket(country), [country]);

  const filteredIndices = useMemo(() => {
    if (!searchQuery.trim()) return marketIndices;
    const q = searchQuery.toLowerCase().trim();
    return marketIndices.filter(
      (idx) => idx.code.toLowerCase().includes(q) || idx.name.toLowerCase().includes(q)
    );
  }, [marketIndices, searchQuery]);

  const allFilteredSelected =
    filteredIndices.length > 0 &&
    filteredIndices.every((idx) => selectedIndices.includes(idx.code));

  const someFilteredSelected =
    filteredIndices.some((idx) => selectedIndices.includes(idx.code)) && !allFilteredSelected;

  const handleToggleIndex = (code: string) => {
    if (selectedIndices.includes(code)) {
      onSelectIndices(selectedIndices.filter((c) => c !== code));
    } else {
      onSelectIndices([...selectedIndices, code]);
    }
  };

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      // Unselect all currently filtered indices
      const filteredCodes = new Set(filteredIndices.map((i) => i.code));
      onSelectIndices(selectedIndices.filter((c) => !filteredCodes.has(c)));
    } else {
      // Select all currently filtered indices
      const combined = new Set([...selectedIndices, ...filteredIndices.map((i) => i.code)]);
      onSelectIndices(Array.from(combined));
    }
  };

  const handleClearAll = () => {
    onSelectIndices([]);
    setSearchQuery('');
  };

  const renderBadgeIcon = (item: IndexItem) => {
    const color = item.badgeColor || '#2962FF';
    switch (item.badgeType) {
      case 'number':
        return (
          <div
            className="tv-index-badge tv-index-badge-number"
            style={{ background: color }}
            title={item.name}
          >
            {item.badgeLabel || '50'}
          </div>
        );
      case 'bank':
      case 'psubank':
        return (
          <div
            className="tv-index-badge tv-index-badge-icon"
            style={{ background: color }}
            title={item.name}
          >
            <Landmark size={12} strokeWidth={2.2} />
          </div>
        );
      case 'finance':
        return (
          <div
            className="tv-index-badge tv-index-badge-icon"
            style={{ background: color }}
            title={item.name}
          >
            <Coins size={12} strokeWidth={2.2} />
          </div>
        );
      case 'auto':
        return (
          <div
            className="tv-index-badge tv-index-badge-icon"
            style={{ background: color }}
            title={item.name}
          >
            <Car size={12} strokeWidth={2.2} />
          </div>
        );
      case 'pharma':
        return (
          <div
            className="tv-index-badge tv-index-badge-icon"
            style={{ background: color }}
            title={item.name}
          >
            <HeartPulse size={12} strokeWidth={2.2} />
          </div>
        );
      case 'it':
        return (
          <div
            className="tv-index-badge tv-index-badge-icon"
            style={{ background: color }}
            title={item.name}
          >
            <Cpu size={12} strokeWidth={2.2} />
          </div>
        );
      case 'metal':
        return (
          <div
            className="tv-index-badge tv-index-badge-icon"
            style={{ background: color }}
            title={item.name}
          >
            <Layers size={12} strokeWidth={2.2} />
          </div>
        );
      case 'fmcg':
        return (
          <div
            className="tv-index-badge tv-index-badge-icon"
            style={{ background: color }}
            title={item.name}
          >
            <ShoppingBag size={12} strokeWidth={2.2} />
          </div>
        );
      case 'realty':
        return (
          <div
            className="tv-index-badge tv-index-badge-icon"
            style={{ background: color }}
            title={item.name}
          >
            <Building2 size={12} strokeWidth={2.2} />
          </div>
        );
      case 'bse':
        return (
          <div
            className="tv-index-badge tv-index-badge-text"
            style={{ background: color }}
            title={item.name}
          >
            BSE
          </div>
        );
      default:
        return (
          <div
            className="tv-index-badge tv-index-badge-text"
            style={{ background: color }}
            title={item.name}
          >
            {item.badgeLabel || item.code.slice(0, 3)}
          </div>
        );
    }
  };

  return (
    <PillDropdown
      isOpen={isOpen}
      onClose={onClose}
      triggerRef={triggerRef}
      width={310}
      className="tv-index-drawer-dropdown"
    >
      <div className="tv-index-drawer-container">
        {/* Header: Title + Info + Trash/Clear */}
        <div className="tv-index-drawer-header">
          <div className="tv-index-header-left">
            <span className="tv-index-title">Index</span>
            <div
              className="tv-index-help-icon"
              title="Filter instruments belonging to specific benchmark or sectoral indices"
            >
              <HelpCircle size={13} style={{ opacity: 0.6 }} />
            </div>
          </div>
          <button
            type="button"
            className={`tv-index-clear-btn ${selectedIndices.length > 0 ? 'active' : ''}`}
            onClick={handleClearAll}
            title="Clear all selected indices"
            disabled={selectedIndices.length === 0}
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="tv-index-search-wrapper">
          <div className="tv-index-search-inner">
            <Search size={13} className="tv-index-search-icon" />
            <input
              type="text"
              className="tv-index-search-input"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                className="tv-index-search-clear"
                onClick={() => setSearchQuery('')}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* List of Indices */}
        <div className="tv-index-list">
          {filteredIndices.length === 0 ? (
            <div className="tv-index-empty">No indices match your search</div>
          ) : (
            filteredIndices.map((item) => {
              const isSelected = selectedIndices.includes(item.code);
              return (
                <div
                  key={item.code}
                  className={`tv-index-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleToggleIndex(item.code)}
                >
                  <div className={`tv-index-checkbox ${isSelected ? 'checked' : ''}`}>
                    {isSelected && <Check size={11} strokeWidth={3} />}
                  </div>

                  {renderBadgeIcon(item)}

                  <div className="tv-index-item-text">
                    <span className="tv-index-code">{item.code}</span>
                    <span className="tv-index-dot">•</span>
                    <span className="tv-index-name">{item.name}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer: Select All checkbox */}
        <div className="tv-index-drawer-footer">
          <div className="tv-index-select-all" onClick={handleToggleSelectAll}>
            <div
              className={`tv-index-checkbox ${
                allFilteredSelected ? 'checked' : someFilteredSelected ? 'indeterminate' : ''
              }`}
            >
              {allFilteredSelected && <Check size={11} strokeWidth={3} />}
              {someFilteredSelected && <span className="tv-checkbox-dash" />}
            </div>
            <span className="tv-select-all-label">Select all</span>
          </div>

          {selectedIndices.length > 0 && (
            <span className="tv-selected-count-badge">
              {selectedIndices.length} selected
            </span>
          )}
        </div>
      </div>
    </PillDropdown>
  );
};
