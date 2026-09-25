import React from 'react';
import clsx from 'clsx';

export interface HbButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'bullish' | 'icon' | 'pill';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  active?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  badge?: React.ReactNode;
}

export const HbButton = React.forwardRef<HTMLButtonElement, HbButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'sm',
      active = false,
      icon,
      iconRight,
      badge,
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={clsx(
          'hb-button',
          `hb-button--${variant}`,
          `hb-button--${size}`,
          active && 'hb-button--active',
          disabled && 'hb-button--disabled',
          className
        )}
        {...props}
      >
        {icon && <span className="hb-button__icon">{icon}</span>}
        {children && <span className="hb-button__label">{children}</span>}
        {iconRight && <span className="hb-button__icon-right">{iconRight}</span>}
        {badge !== undefined && <span className="hb-button__badge">{badge}</span>}
      </button>
    );
  }
);

HbButton.displayName = 'HbButton';
