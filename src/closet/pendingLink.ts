import { create } from 'zustand';

/** What link import read from a shop page, handed to the new-item screen. */
export type PendingLinkItem = {
  /** Local URI of the downloaded product photo. */
  uri: string;
  sourceUrl: string;
  name: string | null;
  brand: string | null;
  price: number | null;
  currency: string | null;
  /** Whether the item is being added to the closet or to the wishlist. */
  target: 'owned' | 'wishlist';
};

/**
 * Carries link-import data between two screens. Route parameters are not used
 * for this: they are decoded by the router, which can alter a product link,
 * and they can be supplied by any deep link.
 */
export const usePendingLink = create<{
  pending: PendingLinkItem | null;
  set(pending: PendingLinkItem): void;
  /** Returns the pending data once and clears it. */
  take(): PendingLinkItem | null;
}>((set, get) => ({
  pending: null,
  set: (pending) => set({ pending }),
  take: () => {
    const { pending } = get();
    set({ pending: null });
    return pending;
  },
}));
