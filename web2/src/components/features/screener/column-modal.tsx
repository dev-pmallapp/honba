import React, { useState } from 'react';
import { useScreenerStore } from '../../../core/store/use-screener-store';
import { ALL_COLUMNS, ColumnDef } from '../../column-modal';
import { X, RotateCcw, Check } from 'lucide-react';

export const ColumnModal: React.FC = () => {
  const isOpen = useScreenerStore((state) => state.isColumnModalOpen);
  const setOpen = useScreenerStore((state) => state.setColumnModalOpen);
  const columns = useScreenerStore((state) => state.columns);
  const setColumns = useScreenerStore((state) => state.setColumns);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [localColumns, setLocalColumns] = useState<ColumnDef[]>(columns);

  // Sync with store when opened
  React.useEffect(() => {
    if (isOpen) {
      setLocalColumns([...columns]);
    }
  }, [isOpen, columns]);

  if (!isOpen) return null;

  const filteredCols =
    selectedCategory === 'all'
      ? localColumns
      : localColumns.filter((c) => c.category === selectedCategory);

  const handleToggle = (id: string) => {
    if (id === 'symbol') return; // Always visible
    setLocalColumns((prev) =>
      prev.map((col) => (col.id === id ? { ...col, visible: !col.visible } : col))
    );
  };

  const handleResetDefaults = () => {
    setLocalColumns([...ALL_COLUMNS]);
  };

  const handleApply = () => {
    setColumns(localColumns);
    setOpen(false);
  };

  return (
    <div className="modal-overlay open" onClick={() => setOpen(false)}>
      <div
        className="modal-dialog"
        style={{ width: 580 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">Customize Screener Columns</div>
          <button
            className="nav-icon-btn modal-close-btn"
            style={{ border: 'none' }}
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            padding: '10px 18px 0',
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          {['all', 'overview', 'valuation', 'technicals', 'performance', 'fundamentals'].map((cat) => (
            <button
              key={cat}
              className={`view-tab-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)} {cat === 'all' ? `(${localColumns.length})` : ''}
            </button>
          ))}
        </div>

        <div className="modal-body" style={{ maxHeight: 380, overflowY: 'auto' }}>
          <div
            className="columns-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}
          >
            {filteredCols.map((col) => (
              <label key={col.id} className="checkbox-item" style={{ cursor: col.id === 'symbol' ? 'default' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={col.visible}
                  disabled={col.id === 'symbol'}
                  onChange={() => handleToggle(col.id)}
                />
                <span style={{ fontSize: 12, fontWeight: 500 }}>{col.label}</span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  {col.category}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="nav-icon-btn reset-columns-btn" onClick={handleResetDefaults}>
            <RotateCcw size={12} style={{ marginRight: 4 }} />
            <span>Reset Defaults</span>
          </button>
          <button className="shortlist-btn shortlist-btn-primary apply-columns-btn" onClick={handleApply}>
            <Check size={14} style={{ marginRight: 4 }} />
            <span>Apply Columns</span>
          </button>
        </div>
      </div>
    </div>
  );
};
