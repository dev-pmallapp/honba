import React, { useRef, useCallback } from 'react';
import { useLayoutStore } from './use-layout-store';

interface DockableWorkspaceProps {
  primaryContent: React.ReactNode;
  secondaryContent: React.ReactNode;
}

export const DockableWorkspace: React.FC<DockableWorkspaceProps> = ({
  primaryContent,
  secondaryContent,
}) => {
  const isDrawerOpen = useLayoutStore((state) => state.isDrawerOpen);
  const drawerWidth = useLayoutStore((state) => state.drawerWidth);
  const setDrawerWidth = useLayoutStore((state) => state.setDrawerWidth);

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = drawerWidth;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const deltaX = startXRef.current - moveEvent.clientX; // moving left increases drawer width
        const newWidth = startWidthRef.current + deltaX;
        setDrawerWidth(newWidth);
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [drawerWidth, setDrawerWidth]
  );

  return (
    <div className="workspace-wrapper" id="workspace-container" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Primary Workspace (Table / Chart) */}
      <div className="table-panel" id="table-panel" style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {primaryContent}
      </div>

      {/* Draggable Vertical Splitter Handle */}
      {isDrawerOpen && (
        <div
          className="workspace-splitter"
          onMouseDown={handleMouseDown}
          title="Drag to resize panel (Double-click to reset)"
          onDoubleClick={() => useLayoutStore.getState().resetLayout()}
          style={{
            width: 5,
            cursor: 'col-resize',
            backgroundColor: 'var(--border-subtle)',
            transition: 'background-color 0.15s ease',
            zIndex: 10,
            flexShrink: 0,
            position: 'relative',
          }}
        />
      )}

      {/* Secondary Drawer / Details Panel */}
      {isDrawerOpen && (
        <div
          className="workspace-secondary-panel"
          style={{
            width: drawerWidth,
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {secondaryContent}
        </div>
      )}
    </div>
  );
};

export const HbDockableWorkspace = DockableWorkspace;

