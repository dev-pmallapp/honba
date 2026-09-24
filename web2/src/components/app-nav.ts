/**
 * TradingView Exact Replica Top Navigation Bar
 * Product Switcher, Screens Selector, Symbol Search, Market Country Pill,
 * Timeframe interval pills, Auto-refresh, Currency, Split View toggle, and Theme Presets.
 */

import { HONBA_APPS, dataLayer, AppId } from '../core/data-layer';
import { themeEngine, ColorPalette, TypographyPreset, LayoutPreset } from '../core/theme-engine';
import { CountryCode } from '../core/market-data';

export interface AppNavHandlers {
  onSearch: (query: string) => void;
  onSelectScreenPreset: (presetId: string) => void;
  onToggleDetailDrawer: () => void;
  onOpenColumnsModal: () => void;
  onExportCSV: () => void;
}

export const SCREEN_PRESETS = [
  { id: 'all', name: 'All Instruments', icon: '📋' },
  { id: 'gainers', name: 'Top Gainers', icon: '▲' },
  { id: 'losers', name: 'Top Losers', icon: '▼' },
  { id: 'most_active', name: 'Most Active (Volume)', icon: '🔥' },
  { id: 'high52', name: '52-Week High', icon: '📈' },
  { id: 'oversold', name: 'Oversold RSI (<35)', icon: '📉' },
  { id: 'overbought', name: 'Overbought RSI (>70)', icon: '⚡' },
  { id: 'dividend', name: 'High Dividend Yield (>1.5%)', icon: '💰' },
  { id: 'value', name: 'Value Stocks (P/E < 25)', icon: '💎' },
  { id: 'momentum', name: 'Bullish Momentum', icon: '🚀' },
];

export class AppNav {
  private container: HTMLElement;
  private currentAppId: AppId;
  private handlers: AppNavHandlers;
  private currentScreenId: string = 'all';
  private currentTimeframe: string = '1D';
  private autoRefreshInterval: number | null = null;
  private autoRefreshSeconds: number = 10;
  private isAutoRefreshActive: boolean = true;

  constructor(
    container: HTMLElement,
    currentAppId: AppId = 'screener',
    handlers?: Partial<AppNavHandlers>
  ) {
    this.container = container;
    this.currentAppId = currentAppId;
    this.handlers = {
      onSearch: () => {},
      onSelectScreenPreset: () => {},
      onToggleDetailDrawer: () => {},
      onOpenColumnsModal: () => {},
      onExportCSV: () => {},
      ...handlers,
    };

    this.render();
    this.setupListeners();
    this.startAutoRefresh();
  }

  public setCurrentScreen(screenId: string) {
    this.currentScreenId = screenId;
    const labelEl = this.container.querySelector('#active-screen-label');
    const preset = SCREEN_PRESETS.find((p) => p.id === screenId);
    if (labelEl && preset) {
      labelEl.textContent = preset.name;
    }
  }

  public render() {
    const market = dataLayer.getCurrentMarketInfo();
    const allMarkets = dataLayer.getSupportedMarkets();
    const currentTheme = themeEngine.getConfig();
    const currentApp = HONBA_APPS.find((a) => a.id === this.currentAppId) || HONBA_APPS[0];
    const currentScreen = SCREEN_PRESETS.find((p) => p.id === this.currentScreenId) || SCREEN_PRESETS[0];

    this.container.innerHTML = `
      <header class="app-header tv-topbar">
        <!-- Left Section: App Logo, Product Menu, Screens Dropdown, Search -->
        <div class="header-left">
          <!-- TradingView Styled Brand & App Switcher -->
          <div class="app-switcher-wrapper" id="app-switcher-container">
            <button class="tv-brand-btn" id="app-switcher-btn" title="Honba Financial Suite">
              <span class="tv-brand-icon">相</span>
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

          <div class="tv-topbar-divider"></div>

          <!-- Screens Selector Dropdown (e.g. Top Gainers, Most Active) -->
          <div class="dropdown-wrapper" id="screen-dropdown-container">
            <button class="tv-screen-selector-btn" id="screen-selector-btn" title="Saved Screens & Popular Presets">
              <span class="tv-screen-icon">${currentScreen.icon}</span>
              <span id="active-screen-label" style="font-weight: 600;">${currentScreen.name}</span>
              <span class="app-caret" style="font-size: 8px;">▼</span>
            </button>
            <div class="honba-dropdown-menu" id="screen-menu" style="width: 250px;">
              <div class="app-menu-header">Popular Screener Presets</div>
              ${SCREEN_PRESETS.map(
                (preset) => `
                <div class="market-item ${preset.id === this.currentScreenId ? 'active' : ''}" data-screen-id="${preset.id}">
                  <div class="market-item-left">
                    <span>${preset.icon}</span>
                    <span style="font-weight: 500;">${preset.name}</span>
                  </div>
                </div>
              `
              ).join('')}
            </div>
          </div>

          <div class="tv-topbar-divider"></div>

          <!-- Quick Symbol / Company Search Bar -->
          <div class="tv-search-container">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tv-search-icon">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              type="text" 
              class="tv-search-input" 
              id="top-symbol-search-input" 
              placeholder="Search ticker, company... (/)" 
              autocomplete="off"
            />
            <span class="kbd-shortcut" style="margin-right: 6px;">/</span>
          </div>

          <!-- Market Country Selector Pill (Default: India) -->
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

          <!-- Timeframe Selector Pills -->
          <div class="tv-timeframe-group">
            <button class="tv-timeframe-btn ${this.currentTimeframe === '1D' ? 'active' : ''}" data-tf="1D">1D</button>
            <button class="tv-timeframe-btn ${this.currentTimeframe === '1W' ? 'active' : ''}" data-tf="1W">1W</button>
            <button class="tv-timeframe-btn ${this.currentTimeframe === '1M' ? 'active' : ''}" data-tf="1M">1M</button>
            <button class="tv-timeframe-btn ${this.currentTimeframe === '1h' ? 'active' : ''}" data-tf="1h">1h</button>
          </div>
        </div>

        <!-- Right Section: Auto-Refresh, Currency, Split Drawer Toggle, Columns, Export, Theme, Fullscreen -->
        <div class="header-right">
          <!-- Real-Time Auto-Refresh Control -->
          <div class="tv-refresh-control" id="refresh-control" title="Toggle Auto-Refresh (Click to trigger manual refresh)">
            <span class="status-dot ${this.isAutoRefreshActive ? '' : 'paused'}"></span>
            <span id="refresh-label" style="font-size: 11px; font-weight: 500;">
              ${this.isAutoRefreshActive ? `Live (${this.autoRefreshSeconds}s)` : 'Manual'}
            </span>
          </div>

          <!-- Currency Selector Pill -->
          <div class="tv-currency-pill" title="Active Base Currency">
            <span>${market.currencySymbol}</span>
            <span>${market.currency}</span>
          </div>

          <!-- Split View / Detail Drawer Toggle -->
          <button class="nav-icon-btn" id="toggle-drawer-btn" title="Toggle Symbol Detail Preview Drawer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="15" y1="3" x2="15" y2="21"/>
            </svg>
            <span>Panel</span>
          </button>

          <!-- Columns Customizer -->
          <button class="nav-icon-btn" id="top-columns-btn" title="Customize Screener Columns">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="18"></rect>
              <rect x="14" y="3" width="7" height="18"></rect>
            </svg>
            <span>Columns</span>
          </button>

          <!-- Export CSV -->
          <button class="nav-icon-btn" id="top-export-btn" title="Export Screener to CSV">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Export</span>
          </button>

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

    // Screen Presets dropdown
    const screenContainer = this.container.querySelector('#screen-dropdown-container');
    this.container.querySelector('#screen-selector-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllDropdowns(screenContainer);
      screenContainer?.classList.toggle('open');
    });

    this.container.querySelectorAll('.market-item[data-screen-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-screen-id');
        if (id) {
          this.setCurrentScreen(id);
          this.handlers.onSelectScreenPreset(id);
          screenContainer?.classList.remove('open');
        }
      });
    });

    // Top Search Input
    const searchInput = this.container.querySelector<HTMLInputElement>('#top-symbol-search-input');
    searchInput?.addEventListener('input', () => {
      this.handlers.onSearch(searchInput.value.trim());
    });

    // Shortcut '/' for search
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput?.focus();
      }
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

    // Timeframe toggle
    this.container.querySelectorAll('.tv-timeframe-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tf = btn.getAttribute('data-tf');
        if (tf) {
          this.currentTimeframe = tf;
          this.container.querySelectorAll('.tv-timeframe-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });

    // Auto-refresh control (click toggles or triggers manual)
    this.container.querySelector('#refresh-control')?.addEventListener('click', () => {
      this.isAutoRefreshActive = !this.isAutoRefreshActive;
      const label = this.container.querySelector('#refresh-label');
      const dot = this.container.querySelector('.status-dot');
      if (this.isAutoRefreshActive) {
        if (label) label.textContent = `Live (${this.autoRefreshSeconds}s)`;
        dot?.classList.remove('paused');
        this.startAutoRefresh();
      } else {
        if (label) label.textContent = 'Manual';
        dot?.classList.add('paused');
        if (this.autoRefreshInterval) clearInterval(this.autoRefreshInterval);
      }
    });

    // Drawer toggle
    this.container.querySelector('#toggle-drawer-btn')?.addEventListener('click', () => {
      this.handlers.onToggleDetailDrawer();
    });

    // Columns modal
    this.container.querySelector('#top-columns-btn')?.addEventListener('click', () => {
      this.handlers.onOpenColumnsModal();
    });

    // Export CSV
    this.container.querySelector('#top-export-btn')?.addEventListener('click', () => {
      this.handlers.onExportCSV();
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

  private startAutoRefresh() {
    if (this.autoRefreshInterval) clearInterval(this.autoRefreshInterval);
    if (!this.isAutoRefreshActive) return;

    this.autoRefreshInterval = window.setInterval(() => {
      // Simulate real-time tick injection via dataLayer
      const instruments = dataLayer.getInstruments();
      if (instruments.length > 0) {
        const randomInst = instruments[Math.floor(Math.random() * instruments.length)];
        const delta = (Math.random() - 0.48) * (randomInst.price * 0.006);
        const newPrice = Math.max(1, randomInst.price + delta);
        const change = newPrice - (randomInst.price - randomInst.change);
        const changePercent = (change / (newPrice - change)) * 100;

        dataLayer.emitTick({
          symbol: randomInst.symbol,
          price: newPrice,
          change: change,
          changePercent: changePercent,
          volume: randomInst.volume + Math.floor(Math.random() * 5000),
          timestamp: Date.now(),
        });
      }
    }, 1500);
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
    if (this.autoRefreshInterval) clearInterval(this.autoRefreshInterval);
  }
}
