/**
 * TradingView Clean Platform Global Navigation Bar
 * Product Switcher, Market Country Selector,
 * Theme & Typography Presets, Market Status Telemetry, Fullscreen mode.
 */

import { HONBA_APPS, dataLayer, AppId } from '../core/data-layer';
import { themeEngine, ColorPalette, TypographyPreset } from '../core/theme-engine';
import { CountryCode } from '../core/market-data';

export interface AppNavHandlers {
  onSearch?: (query: string) => void;
}

export class AppNav {
  private container: HTMLElement;
  private currentAppId: AppId;
  private handlers: AppNavHandlers;

  constructor(
    container: HTMLElement,
    currentAppId: AppId = 'screener',
    handlers?: Partial<AppNavHandlers>
  ) {
    this.container = container;
    this.currentAppId = currentAppId;
    this.handlers = {
      ...handlers,
    };

    this.render();
    this.setupListeners();
  }

  public render() {
    const market = dataLayer.getCurrentMarketInfo();
    const allMarkets = dataLayer.getSupportedMarkets();
    const currentTheme = themeEngine.getConfig();
    const currentApp = HONBA_APPS.find((a) => a.id === this.currentAppId) || HONBA_APPS[0];

    this.container.innerHTML = `
      <header class="app-header tv-topbar">
        <!-- Left Section: App Logo, Brand Switcher -->
        <div class="header-left">
          <!-- TradingView Styled Brand & App Switcher -->
          <div class="app-switcher-wrapper" id="app-switcher-container">
            <button class="tv-brand-btn" id="app-switcher-btn" title="Honba Financial Suite">
              <span class="tv-brand-icon">H</span>
              <span class="tv-brand-name">HONBA</span>
              <span class="tv-app-tag">${currentApp.name}</span>
              <span class="app-caret" style="font-size: 8px;">▼</span>
            </button>
            <div class="honba-dropdown-menu" id="app-switcher-menu">
              <div class="app-menu-header">Honba Trading Platform Suite</div>
              ${HONBA_APPS.map(
                (app) => `
                <a href="${app.url}" class="app-menu-item ${app.id === this.currentAppId ? 'active' : ''}">
                  <div class="app-menu-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      ${this.getAppIconSvg(app.icon)}
                    </svg>
                  </div>
                  <div class="app-menu-info">
                    <div class="app-menu-title">${app.name}</div>
                    <div class="app-menu-desc">${app.tagline}</div>
                  </div>
                </a>
              `
              ).join('')}
            </div>
          </div>
        </div>

        <!-- Right Section: Live Telemetry, Market Country, Theme, Fullscreen -->
        <div class="header-right">
          <!-- Real-Time Market Telemetry Status -->
          <div class="tv-market-status-pill" title="Real-time Market Telemetry & Data Layer Active">
            <span class="status-dot"></span>
            <span class="tv-market-status-text">Live Feed</span>
          </div>

          <!-- Market Country Selector Pill -->
          <div class="market-selector-wrapper" id="market-selector-container">
            <button class="tv-market-pill" id="market-selector-btn" title="Select Market Country & Exchange">
              <span class="market-flag">${market.flag}</span>
              <span style="font-weight: 600;">${market.name}</span>
              <span class="tv-market-exch-badge">${market.primaryExchanges[0]}</span>
              <span class="app-caret" style="font-size: 8px;">▼</span>
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

          <div class="tv-topbar-divider"></div>

          <!-- Theme & Palette Switcher -->
          <div class="dropdown-wrapper" id="theme-dropdown-container">
            <button class="nav-icon-btn" id="theme-btn" title="Theme, Palette & Typography">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="5"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
              </svg>
              <span>Theme</span>
              <span class="app-caret" style="font-size: 8px;">▼</span>
            </button>
            <div class="honba-dropdown-menu" id="theme-menu" style="width: 250px; right: 0; left: auto;">
              <div class="app-menu-header">TradingView Themes</div>
              <div class="market-item ${currentTheme.palette === 'tradingview-dark' ? 'active' : ''}" data-palette="tradingview-dark">
                <span>TradingView Dark</span>
                <span style="width: 12px; height: 12px; border-radius: 50%; background: #131722; border: 1px solid #363a45; display: inline-block;"></span>
              </div>
              <div class="market-item ${currentTheme.palette === 'tradingview-light' ? 'active' : ''}" data-palette="tradingview-light">
                <span>TradingView Light</span>
                <span style="width: 12px; height: 12px; border-radius: 50%; background: #ffffff; border: 1px solid #d1d4dc; display: inline-block;"></span>
              </div>

              <div class="app-menu-header" style="margin-top: 6px;">Honba Custom Palettes</div>
              <div class="market-item ${currentTheme.palette === 'honba-dark' ? 'active' : ''}" data-palette="honba-dark">
                <span>Honba Shibui (Slate)</span>
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

              <div class="app-menu-header" style="margin-top: 6px;">Typography Stack</div>
              <div class="market-item ${currentTheme.typography === 'tradingview-sans' ? 'active' : ''}" data-typo="tradingview-sans">
                <span>TradingView System Sans</span>
              </div>
              <div class="market-item ${currentTheme.typography === 'inter-mono' ? 'active' : ''}" data-typo="inter-mono">
                <span>Inter + JetBrains Mono</span>
              </div>
              <div class="market-item ${currentTheme.typography === 'jakarta-fira' ? 'active' : ''}" data-typo="jakarta-fira">
                <span>Plus Jakarta + Fira Code</span>
              </div>
            </div>
          </div>

          <!-- Fullscreen Toggle -->
          <button class="nav-icon-btn" id="fullscreen-btn" title="Toggle Fullscreen Mode">
            ⛶
          </button>
        </div>
      </header>
    `;
  }

  private setupListeners() {
    // App switcher
    const appSwitcherContainer = this.container.querySelector('#app-switcher-container');
    this.container.querySelector('#app-switcher-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllDropdowns(appSwitcherContainer);
      appSwitcherContainer?.classList.toggle('open');
    });

    // Market selector
    const marketContainer = this.container.querySelector('#market-selector-container');
    this.container.querySelector('#market-selector-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllDropdowns(marketContainer);
      marketContainer?.classList.toggle('open');
    });

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

    // Theme dropdown
    const themeContainer = this.container.querySelector('#theme-dropdown-container');
    this.container.querySelector('#theme-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllDropdowns(themeContainer);
      themeContainer?.classList.toggle('open');
    });

    this.container.querySelectorAll('.market-item[data-palette]').forEach((el) => {
      el.addEventListener('click', () => {
        const pal = el.getAttribute('data-palette') as ColorPalette;
        if (pal) {
          themeEngine.setPalette(pal);
          this.render();
          this.setupListeners();
        }
      });
    });

    this.container.querySelectorAll('.market-item[data-typo]').forEach((el) => {
      el.addEventListener('click', () => {
        const typo = el.getAttribute('data-typo') as TypographyPreset;
        if (typo) {
          themeEngine.setTypography(typo);
          this.render();
          this.setupListeners();
        }
      });
    });

    // Fullscreen toggle
    this.container.querySelector('#fullscreen-btn')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });

    // Global click outside to close dropdowns
    document.addEventListener('click', () => {
      this.closeAllDropdowns();
    });
  }

  private closeAllDropdowns(except?: Element | null) {
    this.container.querySelectorAll('.app-switcher-wrapper, .market-selector-wrapper, .dropdown-wrapper').forEach((d) => {
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
        return '<rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line>';
      case 'play-circle':
        return '<circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon>';
      case 'book-open':
        return '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>';
      default:
        return '<circle cx="12" cy="12" r="10"></circle>';
    }
  }

  public destroy() {
    // cleanup
  }
}
