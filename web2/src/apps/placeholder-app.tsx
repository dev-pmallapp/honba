import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import '../styles/theme.css';
import '../styles/base.css';
import '../styles/components.css';

import { themeEngine } from '../core/theme-engine';
import { AppId, HONBA_APPS } from '../core/data-layer';
import { AppNav } from '../components/layout/app-nav';
import { BottomBar } from '../components/layout/bottom-bar';
import { ArrowLeft, Sparkles } from 'lucide-react';

interface PlaceholderProps {
  appId: AppId;
}

export const PlaceholderApp: React.FC<PlaceholderProps> = ({ appId }) => {
  useEffect(() => {
    themeEngine.applyToDOM();
  }, []);

  const appMeta = HONBA_APPS.find((a) => a.id === appId) || HONBA_APPS[0];

  return (
    <div id="app" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppNav currentAppId={appId} />

      <main style={{ flex: 1, padding: '40px 24px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
            paddingBottom: 16,
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{appMeta.name}</h1>
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{appMeta.jpName}</span>
              <span className="badge badge-bullish" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Sparkles size={11} /> Connected to Data Layer
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{appMeta.tagline}</p>
          </div>

          <a
            href="/index.html"
            className="shortlist-btn shortlist-btn-primary"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft size={13} />
            <span>Return to Screener</span>
          </a>
        </div>

        {/* Modern Modular Placeholder Container */}
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            padding: '48px 32px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)',
              fontSize: 22,
              marginBottom: 16,
            }}
          >
            相
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            {appMeta.name} Modern Workspace
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto 24px' }}>
            This module is ready for TSX component integration (e.g. <code>openalgo-charts</code> for WorkBench,{' '}
            <code>@xyflow/react</code> for AlgoDesigner, and quant tearsheets for Simulator/Researcher).
          </p>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 6,
              background: 'var(--bg-tertiary)',
              fontSize: 12,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-family-mono)',
            }}
          >
            <span>Branch: <strong>web2-modern</strong></span>
            <span>•</span>
            <span>React 19 TSX</span>
            <span>•</span>
            <span>Zustand State Sync Active</span>
          </div>
        </div>
      </main>

      <BottomBar />
    </div>
  );
};

export function mountPlaceholder(appId: AppId) {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(<PlaceholderApp appId={appId} />);
  }
}
