import React from 'react';

export interface HbSparklineProps {
  points: number[];
  isUp: boolean;
  symbol: string;
  width?: number;
  height?: number;
}

export const HbSparkline: React.FC<HbSparklineProps> = ({
  points,
  isUp,
  symbol,
  width = 74,
  height = 22,
}) => {
  if (!points || points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const pathData = points
    .map((val, idx) => {
      const x = (idx / (points.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const strokeColor = isUp ? 'var(--bullish)' : 'var(--bearish)';
  const gradId = `hb_spark_${symbol.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const areaData = `${pathData} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg width={width} height={height} className="hb-sparkline-svg sparkline-svg" aria-label={`7D Trend for ${symbol}`}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaData} fill={`url(#${gradId})`} />
      <path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const Sparkline = HbSparkline;
