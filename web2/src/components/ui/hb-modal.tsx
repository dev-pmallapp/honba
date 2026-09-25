import React, { useEffect } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';

export interface HbModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  width?: number | string;
  maxWidth?: number | string;
  className?: string;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const HbModal: React.FC<HbModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  width = 600,
  maxWidth = '92vw',
  className,
  headerRight,
  footer,
  children,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="hb-modal-overlay" onClick={onClose}>
      <div
        className={clsx('hb-modal-dialog', className)}
        style={{ width, maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || headerRight) && (
          <div className="hb-modal-header">
            <div>
              {title && <div className="hb-modal-title">{title}</div>}
              {subtitle && <div className="hb-modal-subtitle">{subtitle}</div>}
            </div>

            <div className="hb-modal-header-actions">
              {headerRight}
              <button
                type="button"
                className="hb-modal-close-btn"
                onClick={onClose}
                title="Close dialog"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="hb-modal-body">{children}</div>

        {footer && <div className="hb-modal-footer">{footer}</div>}
      </div>
    </div>
  );
};
