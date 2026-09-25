/**
 * Honba Multi-Page App Common Integration
 * Powers WorkBench, AlgoDesigner, Simulator, and Researcher pages,
 * rendering the unified AppNav header and connecting to the shared data layer.
 */

import './styles/theme.css';
import './styles/base.css';
import './styles/components.css';

import { dataLayer, AppId, HONBA_APPS } from './core/data-layer';
import { themeEngine } from './core/theme-engine';
import { AppNav } from './components/app-nav';

export function initHonbaApp(appId: AppId) {
  themeEngine.applyToDOM();

  const navContainer = document.getElementById('app-nav-container');
  if (navContainer) {
    new AppNav(navContainer, appId);
  }

  // Parse any query params (e.g. ?symbols=RELIANCE,TCS or ?symbol=INFY)
  const params = new URLSearchParams(window.location.search);
  const symbolsParam = params.get('symbols');
  const symbolParam = params.get('symbol');

  if (symbolsParam) {
    const list = symbolsParam.split(',').filter(Boolean);
    dataLayer.setAllShortlisted(list, true);
    if (list.length > 0) {
      dataLayer.setActiveSymbol(list[0]);
    }
  } else if (symbolParam) {
    dataLayer.setActiveSymbol(symbolParam);
  }

  // Render app details on page
  const contentContainer = document.getElementById('app-body-content');
  if (contentContainer) {
    const appMeta = HONBA_APPS.find((a) => a.id === appId)!;
    const state = dataLayer.getState();
    const activeInst = dataLayer.getInstrument(state.activeSymbol);
    const shortlisted = state.shortlistedSymbols;

    contentContainer.innerHTML = `
      <div style="padding: 32px 40px; max-width: 1200px; margin: 0 auto; width: 100%;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border-subtle);">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <h1 style="font-size: 22px; font-weight: 700; color: var(--text-primary);">${appMeta.name}</h1>
              <span class="badge badge-bullish">Connected to Data Layer</span>
            </div>
            <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">${appMeta.tagline}</p>
          </div>

          <a href="/index.html" class="shortlist-btn shortlist-btn-primary" style="text-decoration: none;">
            ← Return to Screener
          </a>
        </div>

        <!-- Shared State Context Card -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px;">
          <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px;">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px;">Active Target Instrument</div>
            <div style="font-size: 20px; font-weight: 800; font-family: var(--font-family-mono); color: var(--accent-primary);">
              ${state.activeSymbol}
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              ${activeInst ? `${activeInst.name} • ${activeInst.exchange}` : 'Selected in Screener'}
            </div>
          </div>

          <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px;">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px;">Passed Shortlist</div>
            <div style="font-size: 20px; font-weight: 800; font-family: var(--font-family-mono); color: var(--bullish);">
              ${shortlisted.length} Scrips
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              ${shortlisted.join(', ') || 'No scrips currently shortlisted'}
            </div>
          </div>

          <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px;">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px;">Market Context</div>
            <div style="font-size: 20px; font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
              <span>${dataLayer.getCurrentMarketInfo().flag}</span>
              <span>${dataLayer.getCurrentMarketInfo().name}</span>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              Currency: ${dataLayer.getCurrentMarketInfo().currency} (${dataLayer.getCurrentMarketInfo().currencySymbol})
            </div>
          </div>
        </div>

        <!-- App Placeholder Workspace Card -->
        <div style="background: var(--bg-surface); border: 1px solid var(--border-medium); border-radius: var(--radius-lg); padding: 32px; text-align: center;">
          <div style="width: 56px; height: 56px; border-radius: var(--radius-md); background: var(--accent-subtle); color: var(--accent-primary); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
          </div>
          <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">${appMeta.name} Module Ready</h2>
          <p style="font-size: 13px; color: var(--text-secondary); max-width: 600px; margin: 0 auto 20px auto; line-height: 1.6;">
            This module inherits directly from the common data layer and accepts filtered candidate pools from the <strong>Honba Screener</strong>.
          </p>
          <div style="display: inline-flex; gap: 10px;">
            <a href="/index.html" class="nav-icon-btn" style="text-decoration: none;">Filter More Scrips in Screener</a>
          </div>
        </div>
      </div>
    `;
  }
}
