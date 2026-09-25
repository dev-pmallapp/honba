import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface PillDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  width?: number | string;
  maxHeight?: number | string;
  align?: 'left' | 'right';
  className?: string;
  style?: React.CSSProperties;
}

export const PillDropdown: React.FC<PillDropdownProps> = ({
  isOpen,
  onClose,
  triggerRef,
  children,
  width = 200,
  maxHeight = 'calc(100vh - 120px)',
  align = 'left',
  className = '',
  style = {},
}) => {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const gap = 4;
    const targetWidth = typeof width === 'number' ? width : 200;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = rect.bottom + gap;
    const estimatedHeight = 260;
    if (top + estimatedHeight > viewportHeight && rect.top > estimatedHeight) {
      top = Math.max(8, rect.top - gap - estimatedHeight);
    }

    let left = rect.left;
    if (align === 'right') {
      left = rect.right - targetWidth;
    }
    // Keep within screen bounds
    if (left + targetWidth > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - targetWidth - 12);
    }
    if (left < 12) {
      left = 12;
    }

    setCoords({ top, left });
  }, [triggerRef, width, align]);

  useEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }

    updatePosition();

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    const handleScrollOrResize = (e: Event) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
        return;
      }
      updatePosition();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updatePosition, onClose, triggerRef]);

  if (!isOpen || !coords) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      className={`tv-pill-dropdown ${className}`}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        width,
        maxHeight,
        zIndex: 9999,
        ...style,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
};
