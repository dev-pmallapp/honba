import React from 'react';

export interface HbGaugeProps {
  rating: string;
  size?: number;
}

export const HbGauge: React.FC<HbGaugeProps> = ({ rating, size = 200 }) => {
  const getRatingAngle = (r: string): number => {
    switch (r) {
      case 'Strong Sell':
        return -70;
      case 'Sell':
        return -35;
      case 'Neutral':
        return 0;
      case 'Buy':
        return 35;
      case 'Strong Buy':
        return 70;
      default:
        return 0;
    }
  };

  const angle = getRatingAngle(rating);

  return (
    <div className="hb-gauge-wrapper speedometer-wrapper">
      <svg
        viewBox="0 0 200 110"
        className="hb-gauge-svg speedometer-svg"
        style={{ maxWidth: size }}
        aria-label={`Honba Technical rating gauge: ${rating}`}
      >
        {/* Strong Sell (Red) */}
        <path d="M 20 100 A 80 80 0 0 1 45 43" fill="none" stroke="var(--bearish)" strokeWidth="12" strokeLinecap="round" />
        {/* Sell (Coral) */}
        <path d="M 48 40 A 80 80 0 0 1 85 22" fill="none" stroke="#ff7987" strokeWidth="12" />
        {/* Neutral (Gray) */}
        <path d="M 88 21 A 80 80 0 0 1 112 21" fill="none" stroke="var(--text-secondary)" strokeWidth="12" />
        {/* Buy (Light Green) */}
        <path d="M 115 22 A 80 80 0 0 1 152 40" fill="none" stroke="#26a69a" strokeWidth="12" />
        {/* Strong Buy (Emerald) */}
        <path d="M 155 43 A 80 80 0 0 1 180 100" fill="none" stroke="var(--bullish)" strokeWidth="12" strokeLinecap="round" />

        {/* Center Pivot and Needle */}
        <g transform={`rotate(${angle}, 100, 100)`} className="speedometer-needle-group hb-gauge-needle-group">
          <line x1="100" y1="100" x2="100" y2="30" stroke="var(--text-primary)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="100" cy="100" r="6" fill="var(--text-primary)" />
        </g>
      </svg>

      <div className="gauge-labels-row hb-gauge-labels">
        <span style={{ color: 'var(--bearish)', fontWeight: 700 }}>Strong Sell</span>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Neutral</span>
        <span style={{ color: 'var(--bullish)', fontWeight: 700 }}>Strong Buy</span>
      </div>
    </div>
  );
};

export const TechnicalsGauge = HbGauge;
