# UI/UX Design System — honba

This document is the authoritative visual design specification for the honba Frontend UI
Layer (see `01-architecture-overview.md` §2). It codifies the tokens, components, and interaction
rules that every screen must follow. The guiding brief is non-negotiable: **high data-density,
clean, distraction-free typography; absolutely no gaudy, flashy, or over-animated modern web
components; dark-mode primary layout optimized for long research sessions.**

## 1. Design Principles

1. **Data-first.** Information density over whitespace. Every pixel earns its place — this is a
   terminal for professionals, not a marketing site.
2. **Quiet professionalism.** No gradients, no glassmorphism, no drop shadows beyond a 1px border
   substitute, no border-radius larger than `4px`.
3. **Long-session comfort.** Dark mode is the default and primary target. Minimize eye strain over
   8+ hour sessions. No flashing, no auto-scrolling, no attention-grabbing motion.
4. **Indian market aware.** Green = up, red = down (Indian/NSE convention, opposite of some East
   Asian markets). All timestamps render in IST (`Asia/Kolkata`) with an explicit `IST` suffix.
5. **Fast by default.** Minimal client-side JavaScript. Server-rendered first. Never show a
   spinner when stale data can be shown instead.

## 2. Color System

### 2.1 Dark Mode (primary)

| Token | Hex | Usage |
|---|---|---|
| `--bg-primary` | `#0D1117` | Main background (deeper than typical to sharpen focus) |
| `--bg-surface` | `#161B22` | Cards, panels, sidebar backgrounds |
| `--bg-elevated` | `#1C2333` | Hover states, active tabs, tooltips, popovers |
| `--bg-input` | `#0D1117` | Input fields, select dropdowns |
| `--border-default` | `#30363D` | Panel dividers, table borders, input borders |
| `--border-subtle` | `#21262D` | Grid lines, subtle row separators |
| `--text-primary` | `#E6EDF3` | Main content text, headings |
| `--text-secondary` | `#8B949E` | Secondary text, labels, muted data |
| `--text-tertiary` | `#484F58` | Disabled text, placeholders |
| `--up-primary` | `#16A34A` | Price up, profit, positive change |
| `--up-bg` | `#0D3320` | Up candle body, positive background wash |
| `--down-primary` | `#DC2626` | Price down, loss, negative change |
| `--down-bg` | `#3B1515` | Down candle body, negative background wash |
| `--neutral` | `#D4A017` | Unchanged / flat |
| `--accent` | `#4493F8` | Links, primary buttons, active states |
| `--accent-2` | `#79C0FF` | Hover accent, secondary highlights |
| `--warning` | `#D29922` | Alerts, warnings, circuit-breaker indicators |

### 2.2 Light Mode (secondary, optional)

- `--bg-primary: #FFFFFF`, `--bg-surface: #F6F8FA`, `--bg-elevated: #EAEEF2`
- Text tokens flip to dark equivalents (`--text-primary: #1F2328`, etc.); up/down/warning hues
  stay identical for muscle-memory consistency across themes.
- Toggle lives in the header bar, persisted to `localStorage` (`honba:theme`), defaults to
  `dark` on first visit regardless of OS `prefers-color-scheme`.

### 2.3 Semantic usage rules

- Green/red are reserved **exclusively** for price/PnL direction — never reused for arbitrary UI
  status (use `--accent` for informational, `--warning` for caution).
- `--neutral` (amber) is used only for zero-change values, never as a decorative accent.

## 3. Typography

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
--font-display: 'Inter', sans-serif;
```

### 3.1 Type scale

| Size | Name | Usage |
|---|---|---|
| `11px` | xs | Table cells, chart axis labels, small badges |
| `12px` | sm | Timeframe buttons, status indicators, metadata |
| `13px` | base | Body text, watchlist items, form labels |
| `14px` | lg | Section headings, tab labels, button text |
| `16px` | xl | Card titles, modal titles |
| `20px` | 2xl | Page headings |
| `28px` | 3xl | Dashboard hero numbers (e.g. NIFTY index value) |
| `36px` | 4xl | Critical price displays |

**Weight scale:** `400` regular · `500` medium · `600` semibold · `700` bold.

### 3.2 Critical typography rules

- All numeric data uses `font-variant-numeric: tabular-nums;` so live-updating digits never
  jitter or shift adjacent layout.
- Price change values render in **bold** weight regardless of direction.
- `--font-mono` is mandatory for: ISIN codes, order/trade IDs, raw API/JSON payload viewers, and
  any code snippet.
- Line-height defaults to `1.4` for body copy, `1.2` for table rows and dense numeric grids.

## 4. Spacing & Layout System

**Base grid: 4px.**

| Token | Value | Usage |
|---|---|---|
| `--space-1` | 4px | Tight icons, compact list items |
| `--space-2` | 8px | Standard padding, table cell padding |
| `--space-3` | 12px | Card padding, panel gutters |
| `--space-4` | 16px | Section spacing, form field gaps |
| `--space-6` | 24px | Major section divisions |
| `--space-8` | 32px | Page margins |
| `--space-12` | 48px | Hero sections |

**Panel widths:**

- Left sidebar: `260px` (collapsible to `0`)
- Right sidebar: `320px` (collapsible to `0`)
- Chart area: `flex-1` (fills remaining space)
- Minimum content width for legibility: `720px`

## 5. Component Specifications

**A. Data Table** (stock screener, option chain)
Header row `bg-surface`, uppercase `11px` with `tracking-wider`, `border-bottom: 1px solid
var(--border-default)`. Data rows: `hover:bg-elevated`, `13px` `tabular-nums`. Row height `32px`
(tight) or `40px` (comfortable, user-toggleable). Alternating rows use subtle `bg-surface` /
`bg-primary` banding. Header is sticky on scroll. Sortable columns show a single subtle arrow
glyph (▲/▼), never a full icon button. Datasets over 5,000 rows use virtual scrolling or
server-side pagination — never render the full set to the DOM.

**B. Metric Card** (fundamental snapshot)
Compact 3-column grid, max two rows of metrics per card. Layout: Label (`11px`,
`text-secondary`, uppercase) on top, Value (`16px`, `text-primary`, semibold) below, with an
inline change indicator span colored per §2. Example: `P/E RATIO` → `24.5` → `(+1.2)` in green.

**C. Watchlist Item**
Row layout: Symbol (left, bold) · Last Price (right, `tabular-nums`) · Change % (right, colored
per direction). Hover applies a subtle background shift; click navigates to `/stock/{symbol}`. A
6px grip-dot drag handle appears on hover for reordering.

**D. News Card**
Layout: Timestamp (`11px`, `text-tertiary`) · Category badge · Title (`13px`) · Source. Category
badges are color-coded: Earnings = green, Management = blue (`--accent`), Results = amber
(`--neutral`), Market = neutral gray. Click opens the source article in a new tab or an internal
modal, never an unannounced full-page navigation.

**E. Option Chain Grid**
Three-column layout: `CALLS` | `Strike` | `PUTS`, with OI, Change, LTP, Volume, and IV
sub-columns nested under each side. The strike column is centered and bold. ITM strikes get a
subtle background wash; the ATM strike gets a gold/amber (`--neutral`) border highlight. Expiry
selection uses horizontal scrollable pills for weekly/monthly expiries — no dropdown for the
primary expiry selector.

**F. Chart Controls**
Top toolbar: symbol search input with autocomplete · timeframe pills (`1m 5m 15m 1H 4H 1D 1W
1M`) · chart-type toggle (Candle/Line/Area) · indicator add (`+`) · layout toggle. All controls
are text-only or icon-only with flat backgrounds — no gradient buttons. Active state is a solid
background fill with a `1px` `--border-default` outline, not a shadow or glow.

## 6. Interaction Patterns

- **Hover:** `transition-colors duration-150` only — subtle and fast. Never animate `scale`,
  `transform`, or position on hover.
- **Click:** Immediate visual feedback via background/border color change. No ripple effects, no
  spring/bounce animation.
- **Loading:** Show stale/last-known data immediately (optimistic render). Indicate refresh via a
  small "updating…" label in the panel footer. Skeleton screens are prohibited — an old value is
  always preferable to a blank placeholder.
- **Streaming data:** Values update in place using `tabular-nums`; ideally only the changed
  character(s) re-render (diff-based DOM patch) to avoid any layout shift or full-cell flash.
- **Error states:** Inline message with an amber warning glyph, scoped to the affected panel.
  Never block or dim the entire page for a partial data failure.
- **Empty states:** Plain text, e.g. *"No data available for {symbol}"*, with a link to the
  underlying data source for manual verification.

## 7. Responsive Strategy

This is a research tool, not a mobile-first product. Desktop-first, optimized for `1920px` and
`1440px` viewports.

| Breakpoint | Behavior |
|---|---|
| `< 1280px` | Right sidebar collapses to icon-only tabs |
| `< 1024px` | Left sidebar becomes a hamburger overlay |
| `< 768px` | Single-column layout; charts degrade to line-only; tables become stacked cards. Not a priority tier — show a "Best viewed on desktop" banner. |

## 8. Tailwind CSS v4 Configuration

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0D1117',
          surface: '#161B22',
          elevated: '#1C2333',
          input: '#0D1117',
        },
        border: {
          DEFAULT: '#30363D',
          subtle: '#21262D',
        },
        text: {
          primary: '#E6EDF3',
          secondary: '#8B949E',
          tertiary: '#484F58',
        },
        up: {
          DEFAULT: '#16A34A',
          bg: '#0D3320',
        },
        down: {
          DEFAULT: '#DC2626',
          bg: '#3B1515',
        },
        neutral: '#D4A017',
        accent: {
          DEFAULT: '#4493F8',
          2: '#79C0FF',
        },
        warning: '#D29922',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
      fontSize: {
        xs: ['11px', { lineHeight: '1.3' }],
        sm: ['12px', { lineHeight: '1.3' }],
        base: ['13px', { lineHeight: '1.4' }],
        lg: ['14px', { lineHeight: '1.4' }],
        xl: ['16px', { lineHeight: '1.4' }],
        '2xl': ['20px', { lineHeight: '1.3' }],
        '3xl': ['28px', { lineHeight: '1.2' }],
        '4xl': ['36px', { lineHeight: '1.1' }],
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        6: '24px',
        8: '32px',
        12: '48px',
      },
      borderRadius: {
        none: '0px',
        sm: '2px',
        DEFAULT: '3px',
        md: '4px',
        lg: '4px', // clamped — no radius exceeds 4px anywhere in the system
      },
      boxShadow: {
        none: 'none',
        DEFAULT: 'none',
        subtle: '0 0 0 1px var(--border-default)', // border-as-shadow, no blur/spread
      },
    },
  },
  plugins: [],
} satisfies Config
```

## 9. Accessibility

- **Target: WCAG AA.** All body text meets a `4.5:1` contrast ratio against its background; large
  text (`18px`+ or `14px`+ bold) meets `3:1`. `--up-primary` and `--down-primary` were chosen to
  pass both checks against `--bg-primary` and `--bg-surface`.
- Every interactive element (buttons, table headers, chart toolbar controls, pills) is reachable
  and operable via keyboard (`Tab`/`Shift+Tab`, `Enter`/`Space`), with a visible focus ring using
  `--accent` at `2px` offset.
- Charting canvases expose an `aria-label` summarizing the instrument, timeframe, and last price
  for screen reader users, since canvas-rendered candlesticks are not otherwise machine-readable.
- `prefers-reduced-motion: reduce` disables all `transition` and `animation` properties
  system-wide, collapsing to instant state changes.
