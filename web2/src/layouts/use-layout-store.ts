import { create } from 'zustand';

export type LayoutPreset = 'default' | 'focus' | 'split';

export interface LayoutState {
  preset: LayoutPreset;
  drawerWidth: number; // in pixels
  isDrawerOpen: boolean;

  setPreset: (preset: LayoutPreset) => void;
  setDrawerWidth: (width: number) => void;
  toggleDrawer: () => void;
  setDrawerOpen: (open: boolean) => void;
  resetLayout: () => void;
}

const DEFAULT_DRAWER_WIDTH = 330;
const MIN_DRAWER_WIDTH = 260;
const MAX_DRAWER_WIDTH = 640;

const getStoredLayout = (): { preset: LayoutPreset; drawerWidth: number } => {
  try {
    const savedPreset = localStorage.getItem('honba_layout_preset_v2') as LayoutPreset | null;
    const savedWidth = localStorage.getItem('honba_drawer_width_v2');
    return {
      preset: savedPreset && ['default', 'focus', 'split'].includes(savedPreset) ? savedPreset : 'focus',
      drawerWidth: savedWidth ? Math.max(MIN_DRAWER_WIDTH, Math.min(MAX_DRAWER_WIDTH, Number(savedWidth))) : DEFAULT_DRAWER_WIDTH,
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

    setPreset: (preset: LayoutPreset) => {
      try {
        localStorage.setItem('honba_layout_preset_v2', preset);
      } catch {}

      if (preset === 'focus') {
        set({ preset, isDrawerOpen: false });
      } else if (preset === 'split') {
        const halfWidth = Math.floor(window.innerWidth * 0.45);
        set({
          preset,
          isDrawerOpen: true,
          drawerWidth: Math.max(MIN_DRAWER_WIDTH, Math.min(MAX_DRAWER_WIDTH, halfWidth)),
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
