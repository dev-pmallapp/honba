export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  primaryBg: string;
  secondaryBg: string;
  accentColor: string;
  bullishColor: string;
  bearishColor: string;
  fontSans: string;
  fontMono: string;
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "tradingview-dark",
    name: "TradingView Dark",
    description: "Official TradingView aesthetic: #131722 with #2962ff blue accent and Inter typography",
    primaryBg: "#131722",
    secondaryBg: "#1e222d",
    accentColor: "#2962ff",
    bullishColor: "#089981",
    bearishColor: "#f23645",
    fontSans: "Inter",
    fontMono: "JetBrains Mono",
  },
  {
    id: "jesse-midnight",
    name: "Jesse Midnight",
    description: "Jesse AI terminal style: deep obsidian #0d1117 with GitHub blue #1f6feb",
    primaryBg: "#0d1117",
    secondaryBg: "#161b22",
    accentColor: "#1f6feb",
    bullishColor: "#238636",
    bearishColor: "#da3633",
    fontSans: "Inter",
    fontMono: "JetBrains Mono",
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night Quant",
    description: "Japanese aesthetic: navy #1a1b26 with lavender #7aa2f7 and Outfit typography",
    primaryBg: "#1a1b26",
    secondaryBg: "#24283b",
    accentColor: "#7aa2f7",
    bullishColor: "#9ece6a",
    bearishColor: "#f7768e",
    fontSans: "Outfit",
    fontMono: "JetBrains Mono",
  },
  {
    id: "monokai-pro",
    name: "Monokai Pro Dark",
    description: "High contrast quant developer palette with warm yellow #ffd866 accent",
    primaryBg: "#19181a",
    secondaryBg: "#221f22",
    accentColor: "#ffd866",
    bullishColor: "#a9dc76",
    bearishColor: "#ff6188",
    fontSans: "Inter",
    fontMono: "JetBrains Mono",
  },
];

const THEME_STORAGE_KEY = "honba_active_theme";

export function getCurrentTheme(): string {
  return localStorage.getItem(THEME_STORAGE_KEY) || "tradingview-dark";
}

export function setTheme(themeId: string): void {
  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  document.documentElement.setAttribute("data-theme", theme.id);
  localStorage.setItem(THEME_STORAGE_KEY, theme.id);

  window.dispatchEvent(new CustomEvent("honba:theme-change", { detail: theme }));
}

export function initTheme(): void {
  const active = getCurrentTheme();
  setTheme(active);
}
