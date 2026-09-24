import React from 'react';

interface RangeBarProps {
  current: number;
  low: number;
  high: number;
}

export const RangeBar: React.FC<RangeBarProps> = ({ current, low, high }) => {
  const range = high - low || 1;
  const pct = Math.max(0, Math.min(100, ((current - low) / range) * 100));

  return (
    <div
      className="mini-52w-track"
      title={`52W Low: ${low} | Current: ${current} | 52W High: ${high}`}
    >
      <div className="mini-52w-fill" style={{ width: `${pct}%` }} />
      <div className="mini-52w-pip" style={{ left: `${pct}%` }} />
    </div>
  );
};
