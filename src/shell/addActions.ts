import { create } from 'zustand';

import type { IconName } from '@/components/ui';

export type AddAction = {
  id: string;
  /** Translation key for the label. */
  labelKey: string;
  icon: IconName;
  /** Lower numbers are listed first. */
  order?: number;
  onPress: () => void;
};

type AddActionsState = {
  actions: AddAction[];
  menuOpen: boolean;
  register(action: AddAction): () => void;
  openMenu(): void;
  closeMenu(): void;
};

/**
 * Creation actions offered by the floating add button. Features register their
 * own actions here, so the shell does not need to know about them.
 */
export const useAddActions = create<AddActionsState>((set) => ({
  actions: [],
  menuOpen: false,
  register(action) {
    set((state) => ({
      actions: [...state.actions.filter((existing) => existing.id !== action.id), action].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
      ),
    }));
    return () =>
      set((state) => ({ actions: state.actions.filter((existing) => existing.id !== action.id) }));
  },
  openMenu: () => set({ menuOpen: true }),
  closeMenu: () => set({ menuOpen: false }),
}));
