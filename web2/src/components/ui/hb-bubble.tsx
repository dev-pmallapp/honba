import React from 'react';
import clsx from 'clsx';

export type HbBubbleVariant =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'accent'
  | 'gold'
  | 'muted'
  | 'outline'
  | 'counter';

export interface HbBubbleProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: HbBubbleVariant;
  size?: 'xs' | 'sm' | 'md';
  dot?: boolean;
  pulse?: boolean;
}

export const HbBubble: React.FC<HbBubbleProps> = ({
  variant = 'neutral',
  size = 'sm',
  dot = false,
  pulse = false,
  className,
  children,
  ...props
}) => {
  return (
    <span
      className={clsx(
        'hb-bubble',
        `hb-bubble--${variant}`,
        `hb-bubble--${size}`,
        pulse && 'hb-bubble--pulse',
        className
      )}
      {...props}
    >
      {dot && <span className={clsx('hb-bubble__dot', pulse && 'hb-bubble__dot--pulse')} />}
      {children}
    </span>
  );
};

export const HbBadge = HbBubble;
