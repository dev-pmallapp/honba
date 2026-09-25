import React, { useEffect, useRef } from 'react';
import clsx from 'clsx';

export interface HbDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const HbDropdown: React.FC<HbDropdownProps> = ({
  isOpen,
  onClose,
  className,
  style,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className={clsx('hb-dropdown-menu', className)}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
};
