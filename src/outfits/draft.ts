import { CATEGORY_SLOT, type Slot } from '@/closet/taxonomy';
import type { Item } from '@/closet/types';

/** The order slots are shown in the editor, from the outside of the body inwards and down. */
export const EDITOR_SLOTS: Slot[] = [
  'outer',
  'top',
  'fullBody',
  'bottom',
  'shoes',
  'bag',
  'accessory',
];

/** Slots that can hold more than one piece, for layering and several accessories. */
export const MULTI_SLOTS: Slot[] = ['outer', 'top', 'accessory'];

export const isMultiSlot = (slot: Slot) => MULTI_SLOTS.includes(slot);

export type OutfitPiece = { itemId: string; slot: Slot; position: number };

/**
 * An outfit being edited. Each slot has one or more rows; a row holds the id
 * of the chosen item or null for "none". Hidden slots contribute nothing but
 * keep their rows, so showing a slot again restores the choice.
 */
export type OutfitDraft = {
  rows: Record<Slot, (string | null)[]>;
  hidden: Slot[];
};

export function emptyDraft(): OutfitDraft {
  return {
    rows: {
      outer: [null],
      top: [null],
      fullBody: [null],
      bottom: [null],
      shoes: [null],
      bag: [null],
      accessory: [null],
    },
    hidden: [],
  };
}

export function draftFromPieces(pieces: OutfitPiece[]): OutfitDraft {
  const draft = emptyDraft();
  for (const slot of EDITOR_SLOTS) {
    const ids = pieces
      .filter((piece) => piece.slot === slot)
      .sort((a, b) => a.position - b.position)
      .map((piece) => piece.itemId);
    if (ids.length > 0) draft.rows[slot] = isMultiSlot(slot) ? ids : [ids[0]];
  }
  return draft;
}

/** A draft that starts with one closet item in its slot. */
export function draftFromItem(item: Pick<Item, 'id' | 'category'>): OutfitDraft {
  return select(emptyDraft(), CATEGORY_SLOT[item.category], 0, item.id);
}

const isVisible = (draft: OutfitDraft, slot: Slot) => !draft.hidden.includes(slot);

/** A full-body piece replaces top and bottom, so those slots are not needed while one is chosen. */
export function hasFullBody(draft: OutfitDraft): boolean {
  return isVisible(draft, 'fullBody') && draft.rows.fullBody.some((id) => id !== null);
}

/** True when the slot contributes to the outfit: shown, and not replaced by a full-body piece. */
export function isSlotActive(draft: OutfitDraft, slot: Slot): boolean {
  if (!isVisible(draft, slot)) return false;
  if ((slot === 'top' || slot === 'bottom') && hasFullBody(draft)) return false;
  return true;
}

/** Sets the item of one row of a slot (null for "none") and applies the slot rules. */
export function select(
  draft: OutfitDraft,
  slot: Slot,
  row: number,
  itemId: string | null,
): OutfitDraft {
  const rows = { ...draft.rows, [slot]: [...draft.rows[slot]] };
  // The same piece cannot be worn twice.
  if (itemId !== null && rows[slot].some((id, index) => id === itemId && index !== row)) {
    return draft;
  }
  rows[slot][row] = itemId;
  let hidden = draft.hidden;
  if (itemId !== null) {
    if (slot === 'fullBody') {
      // Choosing a dress clears the pieces it replaces.
      rows.top = [null];
      rows.bottom = [null];
    }
    if (slot === 'top' || slot === 'bottom') rows.fullBody = [null];
    hidden = hidden.filter((entry) => entry !== slot);
  }
  return { rows, hidden };
}

/** Adds another row to a slot that allows several pieces. */
export function addRow(draft: OutfitDraft, slot: Slot): OutfitDraft {
  if (!isMultiSlot(slot)) return draft;
  return { ...draft, rows: { ...draft.rows, [slot]: [...draft.rows[slot], null] } };
}

export function removeRow(draft: OutfitDraft, slot: Slot, row: number): OutfitDraft {
  const remaining = draft.rows[slot].filter((_, index) => index !== row);
  return {
    ...draft,
    rows: { ...draft.rows, [slot]: remaining.length > 0 ? remaining : [null] },
  };
}

export function setHidden(draft: OutfitDraft, slot: Slot, hide: boolean): OutfitDraft {
  const hidden = draft.hidden.filter((entry) => entry !== slot);
  return { ...draft, hidden: hide ? [...hidden, slot] : hidden };
}

/** The pieces the draft amounts to, after hidden slots and the full-body rule. */
export function draftPieces(draft: OutfitDraft): OutfitPiece[] {
  const pieces: OutfitPiece[] = [];
  for (const slot of EDITOR_SLOTS) {
    if (!isSlotActive(draft, slot)) continue;
    let position = 0;
    for (const itemId of draft.rows[slot]) {
      if (itemId !== null) pieces.push({ itemId, slot, position: position++ });
    }
  }
  return pieces;
}

export function isDraftEmpty(draft: OutfitDraft): boolean {
  return draftPieces(draft).length === 0;
}

/** True when two drafts amount to the same outfit, whatever their hidden rows hold. */
export function sameOutfit(a: OutfitDraft, b: OutfitDraft): boolean {
  const key = (draft: OutfitDraft) =>
    draftPieces(draft)
      .map((piece) => `${piece.slot}:${piece.position}:${piece.itemId}`)
      .join('|');
  return key(a) === key(b);
}

/**
 * Picks a random item for every active slot from the items offered for it.
 * `random` returns a number in [0, 1), like Math.random.
 */
export function shuffle(
  draft: OutfitDraft,
  itemsBySlot: Record<Slot, Pick<Item, 'id'>[]>,
  random: () => number = Math.random,
): OutfitDraft {
  let next = draft;
  // A full-body piece and separates exclude each other, so one of the two is chosen first.
  const canFullBody = isVisible(draft, 'fullBody') && itemsBySlot.fullBody.length > 0;
  const canSeparates =
    (isVisible(draft, 'top') && itemsBySlot.top.length > 0) ||
    (isVisible(draft, 'bottom') && itemsBySlot.bottom.length > 0);
  const useFullBody = canFullBody && (!canSeparates || random() < 0.3);
  for (const slot of EDITOR_SLOTS) {
    if (!isVisible(draft, slot)) continue;
    if (slot === 'fullBody' && !useFullBody) {
      next = { ...next, rows: { ...next.rows, fullBody: [null] } };
      continue;
    }
    if ((slot === 'top' || slot === 'bottom') && useFullBody) continue;
    const offered = itemsBySlot[slot];
    if (offered.length === 0) continue;
    const pick = offered[Math.floor(random() * offered.length)];
    next = select({ ...next, rows: { ...next.rows, [slot]: [null] } }, slot, 0, pick.id);
  }
  return next;
}
