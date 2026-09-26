import React from 'react';
import { AppId } from '../core/apps';
import { AppNav } from './app-nav';
import { BottomBar } from './bottom-bar';
import { FloatingActionBar } from './floating-action-bar';

interface AppShellProps {
  currentAppId: AppId;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ currentAppId, children }) => {
  return (
    <div id="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <AppNav currentAppId={currentAppId} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </div>
      <BottomBar />
      <FloatingActionBar />
    </div>
  );
};

export const HbAppShell = AppShell;

