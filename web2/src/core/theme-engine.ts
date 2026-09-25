/**
 * Honba Theme & Layout Engine
 * Manages Honba design tokens, color palettes,
 * typography stacks, and layout view modes.
 */

export type ColorPalette =
  | 'honba-dark'
  | 'honba-light'
  | 'tokyo-midnight'
  | 'kyoto-mist';

export type TypographyPreset =
  | 'honba-sans'
  | 'inter-mono'
  | 'jakarta-fira'
  | 'system-pro';
export type LayoutPreset = 'default' | 'full-table' | 'compact-matrix';

export interface ThemeConfig {
  palette: ColorPalette;
  typography: TypographyPreset;
  layout: LayoutPreset;
}

const DEFAULT_THEME_CONFIG: ThemeConfig = {
  palette: 'honba-dark',
  typography: 'honba-sans',
  layout: 'default',
};

const THEME_STORAGE_KEY = 'honba_theme_settings_v2';

class ThemeEngine {
  private config: ThemeConfig;
  private listeners: Array<(config: ThemeConfig) => void> = [];

  constructor() {
    this.config = this.loadConfig();
    this.applyToDOM();
  }

  private loadConfig(): ThemeConfig {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_THEME_CONFIG, ...JSON.parse(saved) };
      }
    } catch {
      // Fallback
    }
    return { ...DEFAULT_THEME_CONFIG };
  }

  private saveConfig() {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      // Ignore
    }
  }

  public getConfig(): ThemeConfig {
    return { ...this.config };
  }

  public setPalette(palette: ColorPalette) {
    this.config.palette = palette;
    this.saveConfig();
    this.applyToDOM();
    this.notify();
  }

  public setTypography(typography: TypographyPreset) {
    this.config.typography = typography;
    this.saveConfig();
    this.applyToDOM();
    this.notify();
  }

  public setLayout(layout: LayoutPreset) {
    this.config.layout = layout;
    this.saveConfig();
    this.applyToDOM();
    this.notify();
  }

  public resetToDefault() {
    this.config = { ...DEFAULT_THEME_CONFIG };
    this.saveConfig();
    this.applyToDOM();
    this.notify();
  }

  public subscribe(cb: (config: ThemeConfig) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.getConfig()));
  }

  public applyToDOM() {
    const root = document.documentElement;
    root.setAttribute('data-theme', this.config.palette);
    root.setAttribute('data-typography', this.config.typography);
    root.setAttribute('data-layout', this.config.layout);
  }
}

export const themeEngine = new ThemeEngine();
