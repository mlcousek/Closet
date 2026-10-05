import type Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

import {
  ALL_SUBCATEGORIES,
  CATEGORIES,
  COLOUR_NAMES,
  OCCASIONS,
  SEASONS,
  SUBCATEGORIES,
  isSubcategoryOf,
  isWarmth,
  type Category,
  type Colour,
  type Occasion,
  type Season,
  type Subcategory,
  type Warmth,
} from '@/closet/taxonomy';

import {
  AiUnavailableError,
  getAnthropic,
  getTextModel,
  modelOptions,
  toUnavailable,
} from './client';

const TagSchema = z.object({
  name: z.string(),
  category: z.enum(CATEGORIES),
  subcategory: z.enum(ALL_SUBCATEGORIES as [Subcategory, ...Subcategory[]]).nullable(),
  colours: z.array(z.enum(COLOUR_NAMES as [Colour, ...Colour[]])),
  seasons: z.array(z.enum(SEASONS)),
  occasions: z.array(z.enum(OCCASIONS)),
  warmth: z.number().int(),
  brand: z.string().nullable(),
});

export type ItemTags = {
  name: string | null;
  category: Category;
  subcategory: Subcategory | null;
  colours: Colour[];
  seasons: Season[];
  occasions: Occasion[];
  warmth: Warmth | null;
  brand: string | null;
};

const subcategoryGuide = CATEGORIES.map(
  (category) => `- ${category}: ${SUBCATEGORIES[category].join(', ')}`,
).join('\n');

function instructions(language: 'en' | 'cs'): string {
  return `You are cataloguing one piece of clothing or one accessory for a personal wardrobe app. The image shows the item, usually cut out from its background.

Describe only the item itself, ignoring any background, hanger, mannequin or person.

- name: a short everyday name a person would use for it, two to five words, written in ${
    language === 'cs' ? 'Czech' : 'English'
  }, for example "${language === 'cs' ? 'Bílé lněné tričko' : 'White linen T-shirt'}". No brand in the name.
- category and subcategory: the subcategory must belong to the category. Subcategories by category:
${subcategoryGuide}
  Use null for the subcategory when none fits.
- colours: the one to three most visible colours, most dominant first. Use "multicolour" only for busy prints with no dominant colour.
- seasons: every season in which a person in a temperate climate would normally wear it.
- occasions: the occasions it suits; most items suit one to three.
- warmth: 1 for very light pieces such as a tank top or sandals, 3 for mid-weight pieces such as jeans or a shirt, 5 for the warmest pieces such as a winter coat. Use 3 for bags and jewellery.
- brand: only when a logo or label is clearly readable in the image, otherwise null. Do not guess.`;
}

/** Keeps only values that are valid together, so a slightly off answer still pre-fills the form. */
export function normaliseTags(raw: z.infer<typeof TagSchema>): ItemTags {
  return {
    name: raw.name.trim() || null,
    category: raw.category,
    subcategory: isSubcategoryOf(raw.category, raw.subcategory) ? raw.subcategory : null,
    colours: [...new Set(raw.colours)].slice(0, 3),
    seasons: [...new Set(raw.seasons)],
    occasions: [...new Set(raw.occasions)],
    warmth: isWarmth(raw.warmth) ? raw.warmth : null,
    brand: raw.brand?.trim() || null,
  };
}

export type TagImage = { base64: string; mediaType: 'image/png' | 'image/jpeg' };

/**
 * Suggests item details from a photo. Throws AiUnavailableError with the
 * reason when there is no key, no network, or the provider fails; callers
 * then let the user fill the form by hand.
 */
export async function tagItem(
  image: TagImage,
  language: 'en' | 'cs',
  client?: Anthropic,
): Promise<ItemTags> {
  try {
    const anthropic = client ?? (await getAnthropic());
    const model = getTextModel();
    const { betas, fallbacks, effort } = modelOptions(model, 'low');
    const response = await anthropic.beta.messages.parse({
      model,
      max_tokens: 4000,
      betas,
      ...(fallbacks ? { fallbacks } : {}),
      system: instructions(language),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
            },
            { type: 'text', text: 'Catalogue this item.' },
          ],
        },
      ],
      output_config: {
        format: betaZodOutputFormat(TagSchema),
        ...(effort ? { effort } : {}),
      },
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new AiUnavailableError('error');
    }
    return normaliseTags(response.parsed_output);
  } catch (error) {
    throw toUnavailable(error);
  }
}
