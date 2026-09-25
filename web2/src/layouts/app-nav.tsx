import React, { useState, useEffect, useRef } from 'react';
import { HONBA_APPS, AppId, dataLayer } from '../core/data-layer';
import { themeEngine, ColorPalette, TypographyPreset } from '../core/theme-engine';
import { CountryCode } from '../core/market-data';
import { useScreenerStore } from '../core/store/use-screener-store';
import {
  Filter,
  Layout,
  Cpu,
  PlayCircle,
  BookOpen,
  ChevronDown,
  SunMoon,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface AppNavProps {
  currentAppId?: AppId;
}

export const AppNav: React.FC<AppNavProps> = ({ currentAppId = 'screener' }) => {
  const currentMarket = useScreenerStore((state) => state.currentMarket);
  const setMarket = useScreenerStore((state) => state.setMarket);
  const isLive = useScreenerStore((state) => state.isLive);
  const toggleLiveTicks = useScreenerStore((state) => state.toggleLiveTicks);

  const [activeMenu, setActiveMenu] = useState<'apps' | 'market' | 'theme' | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [themeConfig, setThemeConfig] = useState(() => themeEngine.getConfig());

  const navRef = useRef<HTMLElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const marketInfo = dataLayer.getCurrentMarketInfo();
  const allMarkets = dataLayer.getSupportedMarkets();
  const currentApp = HONBA_APPS.find((a) => a.id === currentAppId) || HONBA_APPS[0];

  const handlePaletteChange = (palette: ColorPalette) => {
    themeEngine.setPalette(palette);
    setThemeConfig(themeEngine.getConfig());
    setActiveMenu(null);
  };

  const handleTypographyChange = (typography: TypographyPreset) => {
    themeEngine.setTypography(typography);
    setThemeConfig(themeEngine.getConfig());
    setActiveMenu(null);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const getAppIcon = (iconName: string) => {
    switch (iconName) {
      case 'filter':
        return <Filter size={15} />;
      case 'layout':
        return <Layout size={15} />;
      case 'cpu':
        return <Cpu size={15} />;
      case 'play-circle':
        return <PlayCircle size={15} />;
      case 'book-open':
        return <BookOpen size={15} />;
      default:
        return <Filter size={15} />;
    }
  };

  return (
    <header className="app-header tv-topbar" ref={navRef}>
      {/* Left: App Switcher Brand Button */}
      <div className="header-left">
        <div className={`app-switcher-wrapper ${activeMenu === 'apps' ? 'open' : ''}`}>
          <button
            className="tv-brand-btn"
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenu(activeMenu === 'apps' ? null : 'apps');
            }}
            title="Honba Financial Suite"
          >
            <span className="tv-brand-icon">H</span>
            <span className="tv-brand-name">HONBA</span>
            <span className="tv-app-tag">{currentApp.name}</span>
            <ChevronDown size={11} style={{ opacity: 0.7, marginLeft: 2 }} />
          </button>

          {activeMenu === 'apps' && (
            <div className="honba-dropdown-menu" id="app-switcher-menu" style={{ display: 'block' }}>
              <div className="app-menu-header">Honba Trading Platform Suite</div>
              {HONBA_APPS.map((app) => (
                <a
                  key={app.id}
                  href={app.url}
                  className={`app-menu-item ${app.id === currentAppId ? 'active' : ''}`}
                >
                  <div className="app-menu-icon">{getAppIcon(app.icon)}</div>
                  <div className="app-menu-info">
                    <div className="app-menu-title">
                      {app.name}
                    </div>
                    <div className="app-menu-desc">{app.tagline}</div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Live Telemetry, Market Country, Theme, Fullscreen */}
      <div className="header-right">
        {/* Real-time Telemetry */}
        <div
          className="tv-market-status-pill"
          onClick={toggleLiveTicks}
          style={{ cursor: 'pointer' }}
          title={isLive ? 'Live Ticks Active (Click to Pause)' : 'Paused (Click to Resume)'}
        >
          <span className={`status-dot ${isLive ? 'live-pulsing' : ''}`} style={{ background: isLive ? 'var(--bullish)' : 'var(--text-muted)' }} />
          <span className="tv-market-status-text">{isLive ? 'Live Feed' : 'Offline'}</span>
        </div>

        {/* Market Country Selector */}
        <div className={`market-selector-wrapper ${activeMenu === 'market' ? 'open' : ''}`}>
          <button
            className="tv-market-pill"
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenu(activeMenu === 'market' ? null : 'market');
            }}
            title="Select Market Country & Exchange"
          >
            <span className="market-flag">{marketInfo.flag}</span>
            <span style={{ fontWeight: 600 }}>{marketInfo.name}</span>
            <span className="tv-market-exch-badge">{marketInfo.primaryExchanges[0]}</span>
            <ChevronDown size={11} style={{ opacity: 0.7 }} />
          </button>

          {activeMenu === 'market' && (
            <div className="honba-dropdown-menu market-dropdown-menu" style={{ display: 'block' }}>
              <div className="app-menu-header">Select Market Region</div>
              {allMarkets.map((m) => (
                <div
                  key={m.code}
                  className={`market-item ${m.code === currentMarket ? 'active' : ''}`}
                  onClick={() => {
                    setMarket(m.code as CountryCode);
                    setActiveMenu(null);
                  }}
                >
                  <div className="market-item-left">
                    <span className="market-flag">{m.flag}</span>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{m.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="market-currency-tag">{m.primaryExchanges.join('/')}</span>
                    <span className="market-currency-tag">{m.currencySymbol}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="tv-topbar-divider" />

        {/* Theme & Palette Selector */}
        <div className={`dropdown-wrapper ${activeMenu === 'theme' ? 'open' : ''}`}>
          <button
            className="nav-icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenu(activeMenu === 'theme' ? null : 'theme');
            }}
            title="Theme, Palette & Typography"
          >
            <SunMoon size={14} />
            <span>Theme</span>
            <ChevronDown size={10} style={{ opacity: 0.7 }} />
          </button>

          {activeMenu === 'theme' && (
            <div
              className="honba-dropdown-menu"
              style={{ width: 250, right: 0, left: 'auto', display: 'block' }}
            >
              <div className="app-menu-header">Honba Color Palettes</div>
              <div
                className={`market-item ${themeConfig.palette === 'honba-dark' ? 'active' : ''}`}
                onClick={() => handlePaletteChange('honba-dark')}
              >
                <span>Honba Dark</span>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#131722', border: '1px solid #363a45', display: 'inline-block' }} />
              </div>
              <div
                className={`market-item ${themeConfig.palette === 'honba-light' ? 'active' : ''}`}
                onClick={() => handlePaletteChange('honba-light')}
              >
                <span>Honba Light</span>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffffff', border: '1px solid #d1d4dc', display: 'inline-block' }} />
              </div>
              <div
                className={`market-item ${themeConfig.palette === 'tokyo-midnight' ? 'active' : ''}`}
                onClick={() => handlePaletteChange('tokyo-midnight')}
              >
                <span>Tokyo Midnight (OLED)</span>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#00f2fe', display: 'inline-block' }} />
              </div>
              <div
                className={`market-item ${themeConfig.palette === 'kyoto-mist' ? 'active' : ''}`}
                onClick={() => handlePaletteChange('kyoto-mist')}
              >
                <span>Kyoto Mist (Indigo)</span>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#60a5fa', display: 'inline-block' }} />
              </div>

              <div className="app-menu-header" style={{ marginTop: 6 }}>Typography Stack</div>
              <div
                className={`market-item ${themeConfig.typography === 'honba-sans' ? 'active' : ''}`}
                onClick={() => handleTypographyChange('honba-sans')}
              >
                <span>Honba System Sans</span>
              </div>
              <div
                className={`market-item ${themeConfig.typography === 'inter-mono' ? 'active' : ''}`}
                onClick={() => handleTypographyChange('inter-mono')}
              >
                <span>Inter + JetBrains Mono</span>
              </div>
              <div
                className={`market-item ${themeConfig.typography === 'jakarta-fira' ? 'active' : ''}`}
                onClick={() => handleTypographyChange('jakarta-fira')}
              >
                <span>Plus Jakarta + Fira Code</span>
              </div>
            </div>
          )}
        </div>

        {/* Fullscreen Button */}
        <button
          className="nav-icon-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
    </header>
  );
};

export const HbAppNav = AppNav;

