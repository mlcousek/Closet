import type Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

import {
  AiUnavailableError,
  getAnthropic,
  getTextModel,
  modelOptions,
  toUnavailable,
} from '@/ai/client';
import { CATEGORY_SLOT, DEFAULT_WARMTH, type Slot } from '@/closet/taxonomy';
import type { Item } from '@/closet/types';
import type { OutfitPiece } from '@/outfits/draft';
import type { DayProfile } from '@/planning/suggestions';

/** At most this many items are described to the model, so large closets stay cheap. */
export const CATALOGUE_LIMIT = 150;

/**
 * Describes owned items as compact text lines for the model. Photos are not
 * sent: the tags already hold what matters for combining pieces. With a day
 * profile, pieces far too warm or too light for it are left out first.
 */
export function buildCatalogue(
  items: Item[],
  options: {
    profile?: DayProfile | null;
    mustInclude?: string[];
    wearCounts?: Map<string, number>;
  } = {},
): { text: string; ids: Set<string> } {
  const must = new Set(options.mustInclude ?? []);
  const warmth = (item: Item) => item.warmth ?? DEFAULT_WARMTH[item.category];
  const profile = options.profile;
  const fits = (item: Item) => {
    if (must.has(item.id) || !profile) return true;
    const slot = CATEGORY_SLOT[item.category];
    if (!['top', 'bottom', 'fullBody', 'outer'].includes(slot)) return true;
    return Math.abs(warmth(item) - profile.band) <= 2;
  };
  const chosen = items
    .filter(fits)
    .sort((a, b) => Number(must.has(b.id)) - Number(must.has(a.id)))
    .slice(0, CATALOGUE_LIMIT);
  const lines = chosen.map((item) =>
    [
      item.id,
      CATEGORY_SLOT[item.category],
      item.subcategory ?? item.category,
      item.name ?? '',
      item.colours.join('/'),
      `warmth ${warmth(item)}`,
      item.occasions.join('/'),
      item.ownership === 'wishlist' ? 'WISHLIST' : `worn ${options.wearCounts?.get(item.id) ?? 0}x`,
    ].join(' | '),
  );
  return { text: lines.join('\n'), ids: new Set(chosen.map((item) => item.id)) };
}

export type Proposal = { pieces: OutfitPiece[]; rationale: string };

type RawOutfit = { itemIds: string[]; rationale: string };

/**
 * Keeps only proposals that can really be worn: every id is a known item,
 * nothing repeats, at most one full-body piece which then excludes top and
 * bottom, one pair of shoes and one bag, something covering the body, and the
 * required item when one was asked for. Anything else is dropped.
 */
export function validateProposals(
  raw: RawOutfit[],
  items: Item[],
  options: { mustInclude?: string | null; allowWishlist?: string | null } = {},
): Proposal[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const proposals: Proposal[] = [];
  const seen = new Set<string>();
  for (const outfit of raw) {
    const ids = [...new Set(outfit.itemIds)];
    if (ids.length === 0 || ids.length !== outfit.itemIds.length) continue;
    const pieces = ids.map((id) => byId.get(id));
    if (pieces.some((item) => !item)) continue;
    const known = pieces as Item[];
    if (
      known.some(
        (item) =>
          item.ownership === 'archived' ||
          (item.ownership === 'wishlist' && item.id !== options.allowWishlist),
      )
    ) {
      continue;
    }
    if (options.mustInclude && !ids.includes(options.mustInclude)) continue;
    const count = (slot: Slot) =>
      known.filter((item) => CATEGORY_SLOT[item.category] === slot).length;
    const fullBody = count('fullBody');
    if (fullBody > 1 || count('shoes') > 1 || count('bag') > 1 || count('bottom') > 1) continue;
    if (fullBody === 1 && (count('top') > 0 || count('bottom') > 0)) continue;
    if (fullBody === 0 && (count('top') === 0 || count('bottom') === 0)) continue;
    const key = [...ids].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const positions = new Map<Slot, number>();
    proposals.push({
      rationale: outfit.rationale.trim(),
      pieces: known.map((item) => {
        const slot = CATEGORY_SLOT[item.category];
        const position = positions.get(slot) ?? 0;
        positions.set(slot, position + 1);
        return { itemId: item.id, slot, position };
      }),
    });
  }
  return proposals;
}

const ResponseSchema = z.object({
  outfits: z.array(z.object({ itemIds: z.array(z.string()), rationale: z.string() })),
});

export type StylistRequest = {
  /** What the user asked for, in their own words. */
  request: string;
  /** Earlier requests and refinements of the same session, oldest first. */
  history?: { request: string; proposals: Proposal[] }[];
  items: Item[];
  language: 'en' | 'cs';
  hints: { gender: string | null; bodyType: string | null };
  /** Weather wording for the target day, when a forecast is available. */
  weather?: string | null;
  profile?: DayProfile | null;
  /** An item every proposal has to contain ("style this"). */
  mustInclude?: string | null;
  wearCounts?: Map<string, number>;
  /** How many outfits to ask for; three unless a trip needs one per day. */
  count?: number;
};

function instructions(input: StylistRequest): string {
  return `You are a personal stylist working only with the clothes this person already has. Each line of the catalogue is one item: id | slot | type | name | colours | warmth 1-5 | occasions | times worn.

Propose ${input.count ?? 3} different outfits for the request. Rules:
- Use only ids from the catalogue, exactly as written. Never invent an item.
- An outfit has either one fullBody piece, or one top and one bottom (more tops are allowed for layering). Add at most one pair of shoes and one bag, and outer and accessory pieces where they help.
- Do not use the same item twice in an outfit.${
    input.mustInclude ? `\n- Every outfit must include the item with id ${input.mustInclude}.` : ''
  }
- Items marked WISHLIST are not owned; use one only if it is the required item.
- Suit the weather when it is given, and prefer pieces that have been worn less when the choice is otherwise equal.
- For each outfit write a rationale of one or two sentences in ${
    input.language === 'cs' ? 'Czech' : 'English'
  }, speaking to the person directly and saying why it suits the request.${
    input.hints.gender || input.hints.bodyType
      ? `\nAbout the person: ${[input.hints.gender, input.hints.bodyType && `${input.hints.bodyType} build`].filter(Boolean).join(', ')}.`
      : ''
  }`;
}

/**
 * Asks Claude for outfits from the user's own items and returns only the
 * proposals that pass validation. Throws AiUnavailableError when there is no
 * key, no connection, or the provider fails.
 */
export async function proposeOutfits(
  input: StylistRequest,
  client?: Anthropic,
): Promise<Proposal[]> {
  try {
    const anthropic = client ?? (await getAnthropic());
    const model = getTextModel();
    const { betas, fallbacks, effort } = modelOptions(model, 'medium');
    const catalogue = buildCatalogue(input.items, {
      profile: input.profile,
      mustInclude: input.mustInclude ? [input.mustInclude] : [],
      wearCounts: input.wearCounts,
    });
    const messages: { role: 'user' | 'assistant'; content: string }[] = [];
    (input.history ?? []).forEach((turn, index) => {
      messages.push({
        role: 'user',
        content:
          index === 0 ? `Catalogue:\n${catalogue.text}\n\nRequest: ${turn.request}` : turn.request,
      });
      messages.push({
        role: 'assistant',
        content: JSON.stringify({
          outfits: turn.proposals.map((proposal) => ({
            itemIds: proposal.pieces.map((piece) => piece.itemId),
            rationale: proposal.rationale,
          })),
        }),
      });
    });
    const weather = input.weather ? `\nWeather on the day: ${input.weather}` : '';
    messages.push({
      role: 'user',
      content:
        messages.length === 0
          ? `Catalogue:\n${catalogue.text}\n\nRequest: ${input.request}${weather}`
          : `${input.request}${weather}`,
    });
    const response = await anthropic.beta.messages.parse({
      model,
      max_tokens: 8000,
      betas,
      ...(fallbacks ? { fallbacks } : {}),
      system: instructions(input),
      messages,
      output_config: {
        format: betaZodOutputFormat(ResponseSchema),
        ...(effort ? { effort } : {}),
      },
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new AiUnavailableError('error');
    }
    return validateProposals(response.parsed_output.outfits, input.items, {
      mustInclude: input.mustInclude,
      allowWishlist: input.mustInclude,
    });
  } catch (error) {
    throw toUnavailable(error);
  }
}
