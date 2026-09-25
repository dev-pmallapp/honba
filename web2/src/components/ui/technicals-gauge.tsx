import React from 'react';

interface TechnicalsGaugeProps {
  rating: string;
}

export const TechnicalsGauge: React.FC<TechnicalsGaugeProps> = ({ rating }) => {
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
    <div className="speedometer-wrapper">
      <svg viewBox="0 0 200 110" className="speedometer-svg" aria-label={`Technical rating gauge: ${rating}`}>
        {/* Strong Sell (Red) */}
        <path d="M 20 100 A 80 80 0 0 1 45 43" fill="none" stroke="#f23645" strokeWidth="12" strokeLinecap="round" />
        {/* Sell (Coral) */}
        <path d="M 48 40 A 80 80 0 0 1 85 22" fill="none" stroke="#ff7987" strokeWidth="12" />
        {/* Neutral (Gray) */}
        <path d="M 88 21 A 80 80 0 0 1 112 21" fill="none" stroke="#787b86" strokeWidth="12" />
        {/* Buy (Light Green) */}
        <path d="M 115 22 A 80 80 0 0 1 152 40" fill="none" stroke="#26a69a" strokeWidth="12" />
        {/* Strong Buy (Dark Green) */}
        <path d="M 155 43 A 80 80 0 0 1 180 100" fill="none" stroke="#089981" strokeWidth="12" strokeLinecap="round" />

        {/* Center Pivot and Needle */}
        <g transform={`rotate(${angle}, 100, 100)`} className="speedometer-needle-group">
          <line x1="100" y1="100" x2="100" y2="30" stroke="var(--text-primary)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="100" cy="100" r="6" fill="var(--text-primary)" />
        </g>
      </svg>

      <div className="gauge-labels-row">
        <span style={{ color: '#f23645', fontWeight: 700 }}>Strong Sell</span>
        <span style={{ color: '#787b86', fontWeight: 500 }}>Neutral</span>
        <span style={{ color: '#089981', fontWeight: 700 }}>Strong Buy</span>
      </div>
    </div>
  );
};
