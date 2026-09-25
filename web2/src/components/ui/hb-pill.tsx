import React from 'react';
import clsx from 'clsx';
import { ChevronDown, X } from 'lucide-react';

export interface HbPillProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  active?: boolean;
  value?: string | number | null;
  onClear?: (e: React.MouseEvent) => void;
  showDropdownArrow?: boolean;
  dot?: boolean;
}

export const HbPill = React.forwardRef<HTMLButtonElement, HbPillProps>(
  (
    {
      active = false,
      value,
      children,
      onClear,
      showDropdownArrow = true,
      dot = false,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <div className={clsx('hb-pill-wrapper', active && 'hb-pill-wrapper--active')}>
        <button
          ref={ref}
          type="button"
          disabled={disabled}
          className={clsx(
            'hb-pill',
            active && 'hb-pill--active',
            disabled && 'hb-pill--disabled',
            className
          )}
          {...props}
        >
          {dot && <span className="hb-pill__dot" />}
          <span className="hb-pill__label">{children}</span>
          {value !== undefined && value !== null && (
            <span className="hb-pill__value">{value}</span>
          )}
          {showDropdownArrow && !onClear && (
            <ChevronDown size={11} className="hb-pill__arrow" />
          )}
        </button>

        {active && onClear && (
          <button
            type="button"
            className="hb-pill__clear"
            title="Reset filter"
            onClick={(e) => {
              e.stopPropagation();
              onClear(e);
            }}
          >
            <X size={10} />
          </button>
        )}
      </div>
    );
  }
);

HbPill.displayName = 'HbPill';
