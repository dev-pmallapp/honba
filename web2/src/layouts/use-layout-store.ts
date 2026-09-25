import { create } from 'zustand';

export type LayoutPreset = 'default' | 'focus' | 'split';

export interface LayoutState {
  preset: LayoutPreset;
  drawerWidth: number; // in pixels
  isDrawerOpen: boolean;
  viewMode: 'table' | 'chart' | 'matrix';

  setPreset: (preset: LayoutPreset) => void;
  setDrawerWidth: (width: number) => void;
  toggleDrawer: () => void;
  setDrawerOpen: (open: boolean) => void;
  setViewMode: (mode: 'table' | 'chart' | 'matrix') => void;
  resetLayout: () => void;
}

const DEFAULT_DRAWER_WIDTH = 380;
const MIN_DRAWER_WIDTH = 300;
const MAX_DRAWER_WIDTH = 750;

const getStoredLayout = (): { preset: LayoutPreset; drawerWidth: number } => {
  try {
    const savedPreset = localStorage.getItem('honba_layout_preset_v2') as LayoutPreset | null;
    const savedWidth = localStorage.getItem('honba_drawer_width_v2');
    const parsedWidth = savedWidth ? Number(savedWidth) : DEFAULT_DRAWER_WIDTH;
    const cleanWidth = parsedWidth > 600 || parsedWidth < MIN_DRAWER_WIDTH ? DEFAULT_DRAWER_WIDTH : parsedWidth;
    return {
      preset: savedPreset && ['default', 'focus', 'split'].includes(savedPreset) ? savedPreset : 'focus',
      drawerWidth: cleanWidth,
    };
  } catch {
    return { preset: 'focus', drawerWidth: DEFAULT_DRAWER_WIDTH };
  }
};

export const useLayoutStore = create<LayoutState>((set) => {
  const initial = getStoredLayout();

  return {
    preset: initial.preset,
    drawerWidth: initial.drawerWidth,
    isDrawerOpen: initial.preset !== 'focus',
    viewMode: 'table',

    setViewMode: (viewMode: 'table' | 'chart' | 'matrix') => {
      if (viewMode === 'chart') {
        set((state) => ({
          viewMode,
          isDrawerOpen: true,
          drawerWidth: state.drawerWidth > 600 || state.drawerWidth < MIN_DRAWER_WIDTH ? DEFAULT_DRAWER_WIDTH : state.drawerWidth,
        }));
      } else if (viewMode === 'table') {
        set({ viewMode, isDrawerOpen: false });
      } else {
        set({ viewMode, isDrawerOpen: false });
      }
    },

    setPreset: (preset: LayoutPreset) => {
      try {
        localStorage.setItem('honba_layout_preset_v2', preset);
      } catch {}

      if (preset === 'focus') {
        set({ preset, isDrawerOpen: false });
      } else if (preset === 'split') {
        set({
          preset,
          isDrawerOpen: true,
          drawerWidth: 420,
        });
      } else {
        // default
        set({ preset: 'default', isDrawerOpen: true, drawerWidth: DEFAULT_DRAWER_WIDTH });
      }
    },

    setDrawerWidth: (width: number) => {
      const clamped = Math.max(MIN_DRAWER_WIDTH, Math.min(MAX_DRAWER_WIDTH, width));
      try {
        localStorage.setItem('honba_drawer_width_v2', String(clamped));
      } catch {}
      set({ drawerWidth: clamped, preset: 'default', isDrawerOpen: true });
    },

    toggleDrawer: () => {
      set((state) => {
        const next = !state.isDrawerOpen;
        return { isDrawerOpen: next, preset: next ? 'default' : 'focus' };
      });
    },

    setDrawerOpen: (open: boolean) => {
      set({ isDrawerOpen: open, preset: open ? 'default' : 'focus' });
    },

    resetLayout: () => {
      try {
        localStorage.removeItem('honba_layout_preset_v2');
        localStorage.removeItem('honba_drawer_width_v2');
      } catch {}
      set({
        preset: 'default',
        drawerWidth: DEFAULT_DRAWER_WIDTH,
        isDrawerOpen: true,
      });
    },
  };
});
