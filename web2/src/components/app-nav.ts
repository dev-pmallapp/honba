/**
 * Honba Top Navigation Bar Component
 * Houses the top left Honba App Switcher, Market Selector, Theme Switcher,
 * and Layout Presets with Default-Reset.
 */

import { HONBA_APPS, dataLayer, AppId } from '../core/data-layer';
import { themeEngine, ColorPalette, TypographyPreset, LayoutPreset } from '../core/theme-engine';
import { CountryCode } from '../core/market-data';

export class AppNav {
  private container: HTMLElement;
  private currentAppId: AppId;

  constructor(container: HTMLElement, currentAppId: AppId = 'screener') {
    this.container = container;
    this.currentAppId = currentAppId;
    this.render();
    this.setupListeners();
  }

  public render() {
    const market = dataLayer.getCurrentMarketInfo();
    const allMarkets = dataLayer.getSupportedMarkets();
    const currentTheme = themeEngine.getConfig();
    const currentApp = HONBA_APPS.find((a) => a.id === this.currentAppId) || HONBA_APPS[0];

    this.container.innerHTML = `
      <header class="app-header">
        <div class="header-left">
          <!-- Top Left Dropdown Apps Button Honba -->
          <div class="app-switcher-wrapper" id="app-switcher-container">
            <button class="app-switcher-btn" id="app-switcher-btn" aria-label="Switch Honba App">
              <span class="app-logo-badge">HONBA</span>
              <span style="font-weight: 700; color: var(--accent-primary);">${currentApp.name}</span>
              <span class="app-caret">▼</span>
            </button>
            <div class="honba-dropdown-menu" id="app-switcher-menu">
              <div class="app-menu-header">Honba Quantitative Suite</div>
              ${HONBA_APPS.map(
                (app) => `
                <a href="${app.url}" class="app-menu-item ${app.id === this.currentAppId ? 'active' : ''}">
                  <div class="app-menu-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      ${this.getAppIconSvg(app.icon)}
                    </svg>
                  </div>
                  <div class="app-menu-info">
                    <div class="app-menu-title">
                      ${app.name}
                    </div>
                    <div class="app-menu-desc">${app.tagline}</div>
                  </div>
                </a>
              `
              ).join('')}
            </div>
          </div>

          <!-- Market Country Selector (Default: India) -->
          <div class="market-selector-wrapper" id="market-selector-container">
            <button class="market-selector-btn" id="market-selector-btn" aria-label="Select Market Country">
              <span class="market-flag">${market.flag}</span>
              <span>${market.name}</span>
              <span class="market-currency-tag">${market.primaryExchanges[0]}</span>
              <span class="app-caret" style="font-size: 9px;">▼</span>
            </button>
            <div class="honba-dropdown-menu market-dropdown-menu" id="market-selector-menu">
              <div class="app-menu-header">Select Market Region</div>
              ${allMarkets
                .map(
                  (m) => `
                <div class="market-item ${m.code === market.code ? 'active' : ''}" data-market-code="${m.code}">
                  <div class="market-item-left">
                    <span class="market-flag">${m.flag}</span>
                    <span style="font-size: 12px; font-weight: 500;">${m.name}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="market-currency-tag">${m.primaryExchanges.join('/')}</span>
                    <span class="market-currency-tag">${m.currencySymbol}</span>
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          </div>

          <!-- Live Market Connectivity Indicator -->
          <div class="market-status-pill" data-tooltip="Real-time Simulated Market Feed (NSE Tick fidelity)">
            <span class="status-dot"></span>
            <span>${market.primaryExchanges[0]} Live</span>
          </div>
        </div>

        <div class="header-right">
          <!-- Layout Presets Dropdown & Reset -->
          <div class="dropdown-wrapper" id="layout-dropdown-container" style="position: relative;">
            <button class="nav-icon-btn" id="layout-btn" title="Layout Presets">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="12" y1="12" x2="12" y2="21"/>
              </svg>
              <span>Layout</span>
              <span class="app-caret" style="font-size: 9px;">▼</span>
            </button>
            <div class="honba-dropdown-menu" id="layout-menu" style="width: 220px; right: 0; left: auto;">
              <div class="app-menu-header">Table Layout & Density</div>
              <div class="market-item ${currentTheme.layout === 'default' ? 'active' : ''}" data-layout="default">
                <span>Standard Grid</span>
                <span class="kbd-shortcut">Normal</span>
              </div>
              <div class="market-item ${currentTheme.layout === 'compact-matrix' ? 'active' : ''}" data-layout="compact-matrix">
                <span>Compact Matrix</span>
                <span class="kbd-shortcut">Dense</span>
              </div>
              <div style="border-top: 1px solid var(--border-subtle); margin: 4px 0;"></div>
              <div class="market-item" id="reset-layout-item" style="color: var(--accent-gold);">
                <span style="display: flex; align-items: center; gap: 6px;">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                    <path d="M3 3v5h5"/>
                  </svg>
                  Reset to Default View
                </span>
              </div>
            </div>
          </div>

          <!-- Theming & Typography Dropdown -->
          <div class="dropdown-wrapper" id="theme-dropdown-container" style="position: relative;">
            <button class="nav-icon-btn" id="theme-btn" title="Customize Theme & Typography">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="5"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
              </svg>
              <span>Theme</span>
              <span class="app-caret" style="font-size: 9px;">▼</span>
            </button>
            <div class="honba-dropdown-menu" id="theme-menu" style="width: 240px; right: 0; left: auto;">
              <div class="app-menu-header">Color Palette</div>
              <div class="market-item ${currentTheme.palette === 'honba-dark' ? 'active' : ''}" data-palette="honba-dark">
                <span>Honba Shibui (Dark)</span>
                <span style="width: 12px; height: 12px; border-radius: 50%; background: #38bdf8; display: inline-block;"></span>
              </div>
              <div class="market-item ${currentTheme.palette === 'tokyo-midnight' ? 'active' : ''}" data-palette="tokyo-midnight">
                <span>Tokyo Midnight (OLED)</span>
                <span style="width: 12px; height: 12px; border-radius: 50%; background: #00f2fe; display: inline-block;"></span>
              </div>
              <div class="market-item ${currentTheme.palette === 'kyoto-mist' ? 'active' : ''}" data-palette="kyoto-mist">
                <span>Kyoto Mist (Indigo)</span>
                <span style="width: 12px; height: 12px; border-radius: 50%; background: #60a5fa; display: inline-block;"></span>
              </div>
              <div class="market-item ${currentTheme.palette === 'washi-light' ? 'active' : ''}" data-palette="washi-light">
                <span>Washi Light (Clean)</span>
                <span style="width: 12px; height: 12px; border-radius: 50%; background: #ffffff; border: 1px solid #ccc; display: inline-block;"></span>
              </div>

              <div class="app-menu-header" style="margin-top: 6px;">Typography</div>
              <div class="market-item ${currentTheme.typography === 'inter-mono' ? 'active' : ''}" data-typo="inter-mono">
                <span>Inter + JetBrains Mono</span>
              </div>
              <div class="market-item ${currentTheme.typography === 'jakarta-fira' ? 'active' : ''}" data-typo="jakarta-fira">
                <span>Jakarta + Fira Code</span>
              </div>
              <div class="market-item ${currentTheme.typography === 'system-pro' ? 'active' : ''}" data-typo="system-pro">
                <span>System Native Pro</span>
              </div>
            </div>
          </div>
        </div>
      </header>
    `;
  }

  private setupListeners() {
    // App switcher toggle
    const appSwitcherContainer = this.container.querySelector('#app-switcher-container');
    const appSwitcherBtn = this.container.querySelector('#app-switcher-btn');
    appSwitcherBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllDropdowns(appSwitcherContainer);
      appSwitcherContainer?.classList.toggle('open');
    });

    // Market selector toggle
    const marketContainer = this.container.querySelector('#market-selector-container');
    const marketBtn = this.container.querySelector('#market-selector-btn');
    marketBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllDropdowns(marketContainer);
      marketContainer?.classList.toggle('open');
    });

    // Market item click
    this.container.querySelectorAll('.market-item[data-market-code]').forEach((el) => {
      el.addEventListener('click', () => {
        const code = el.getAttribute('data-market-code') as CountryCode;
        if (code) {
          dataLayer.setMarket(code);
          this.render();
          this.setupListeners();
        }
      });
    });

    // Layout dropdown
    const layoutContainer = this.container.querySelector('#layout-dropdown-container');
    const layoutBtn = this.container.querySelector('#layout-btn');
    layoutBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllDropdowns(layoutContainer);
      layoutContainer?.classList.toggle('open');
    });

    this.container.querySelectorAll('.market-item[data-layout]').forEach((el) => {
      el.addEventListener('click', () => {
        const layout = el.getAttribute('data-layout') as LayoutPreset;
        if (layout) themeEngine.setLayout(layout);
        layoutContainer?.classList.remove('open');
      });
    });

    this.container.querySelector('#reset-layout-item')?.addEventListener('click', () => {
      themeEngine.resetToDefault();
      layoutContainer?.classList.remove('open');
    });

    // Theme dropdown
    const themeContainer = this.container.querySelector('#theme-dropdown-container');
    const themeBtn = this.container.querySelector('#theme-btn');
    themeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllDropdowns(themeContainer);
      themeContainer?.classList.toggle('open');
    });

    this.container.querySelectorAll('.market-item[data-palette]').forEach((el) => {
      el.addEventListener('click', () => {
        const pal = el.getAttribute('data-palette') as ColorPalette;
        if (pal) themeEngine.setPalette(pal);
        this.render();
        this.setupListeners();
      });
    });

    this.container.querySelectorAll('.market-item[data-typo]').forEach((el) => {
      el.addEventListener('click', () => {
        const typo = el.getAttribute('data-typo') as TypographyPreset;
        if (typo) themeEngine.setTypography(typo);
        this.render();
        this.setupListeners();
      });
    });

    // Close on click outside
    document.addEventListener('click', () => {
      this.closeAllDropdowns();
    });
  }

  private closeAllDropdowns(except?: Element | null) {
    const dropdowns = this.container.querySelectorAll('.app-switcher-wrapper, .market-selector-wrapper, .dropdown-wrapper');
    dropdowns.forEach((d) => {
      if (d !== except) d.classList.remove('open');
    });
  }

  private getAppIconSvg(icon: string): string {
    switch (icon) {
      case 'filter':
        return '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>';
      case 'layout':
        return '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line>';
      case 'cpu':
        return '<rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line>';
      case 'play-circle':
        return '<circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon>';
      case 'book-open':
        return '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>';
      default:
        return '<circle cx="12" cy="12" r="10"></circle>';
    }
  }
}
