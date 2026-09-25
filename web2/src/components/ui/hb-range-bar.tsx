import React from 'react';

export interface HbRangeBarProps {
  low: number;
  high: number;
  current: number;
  width?: number | string;
  currencySymbol?: string;
}

export const HbRangeBar: React.FC<HbRangeBarProps> = ({
  low,
  high,
  current,
  width = '100%',
  currencySymbol = '',
}) => {
  const range = high - low || 1;
  const pct = Math.max(0, Math.min(100, ((current - low) / range) * 100));

  return (
    <div className="hb-range-bar range-bar-container" style={{ width }}>
      <div className="hb-range-track range-bar-track">
        <div className="hb-range-fill range-bar-fill" style={{ width: `${pct}%` }} />
        <div className="hb-range-pin range-bar-pin" style={{ left: `${pct}%` }} />
      </div>
      <div className="hb-range-labels range-bar-labels">
        <span className="hb-range-min">{currencySymbol}{low.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</span>
        <span className="hb-range-max">{currencySymbol}{high.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</span>
      </div>
    </div>
  );
};

export const RangeBar = HbRangeBar;
