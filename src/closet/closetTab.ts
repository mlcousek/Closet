import { create } from 'zustand';

import type { Category } from './taxonomy';

export type ClosetTab = 'closet' | 'wishlist';

/**
 * Which tab of the Closet section is showing. Kept outside the screen because
 * the add flows need it: an item added while the Wishlist tab is open goes to
 * the wishlist. The category filter lives here too, so other screens (the
 * statistics) can open the closet on one category.
 */
export const useClosetTab = create<{
  tab: ClosetTab;
  category: Category | null;
  setTab(tab: ClosetTab): void;
  setCategory(category: Category | null): void;
  /** Shows the owned items of one category the next time the closet is on screen. */
  showCategory(category: Category): void;
}>((set) => ({
  tab: 'closet',
  category: null,
  setTab: (tab) => set({ tab }),
  setCategory: (category) => set({ category }),
  showCategory: (category) => set({ tab: 'closet', category }),
}));
