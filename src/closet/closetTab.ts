import { create } from 'zustand';

export type ClosetTab = 'closet' | 'wishlist';

/**
 * Which tab of the Closet section is showing. Kept outside the screen because
 * the add flows need it: an item added while the Wishlist tab is open goes to
 * the wishlist.
 */
export const useClosetTab = create<{ tab: ClosetTab; setTab(tab: ClosetTab): void }>((set) => ({
  tab: 'closet',
  setTab: (tab) => set({ tab }),
}));
