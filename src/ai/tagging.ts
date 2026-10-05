import type Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

import {
  CATEGORIES,
  COLOUR_NAMES,
  OCCASIONS,
  SEASONS,
  SUBCATEGORIES,
  isCategory,
  isColour,
  isOccasion,
  isSeason,
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

/**
 * Deliberately loose: plain strings instead of enums. The allowed values are
 * given in the instructions and enforced by normaliseTags, so one word outside
 * the vocabulary costs that one value and not the whole answer.
 */
const TagSchema = z.object({
  name: z.string(),
  category: z.string(),
  subcategory: z.string().nullable(),
  colours: z.array(z.string()),
  seasons: z.array(z.string()),
  occasions: z.array(z.string()),
  warmth: z.number(),
  brand: z.string().nullable(),
});

type RawTags = z.infer<typeof TagSchema>;

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

Use only the exact values listed below, spelled as shown. They are identifiers, not words to translate.

- name: a short everyday name a person would use for it, two to five words, written in ${
    language === 'cs' ? 'Czech' : 'English'
  }, for example "${language === 'cs' ? 'Bílé lněné tričko' : 'White linen T-shirt'}". No brand in the name.
- category: one of ${CATEGORIES.join(', ')}.
- subcategory: must belong to the category. Subcategories by category:
${subcategoryGuide}
  Use null when none fits.
- colours: the one to three most visible colours, most dominant first, from: ${COLOUR_NAMES.join(', ')}. Pick the nearest listed colour for shades that are not listed, for example navy for dark blue or red for burgundy. Use "multicolour" only for busy prints with no dominant colour.
- seasons: every season in which a person in a temperate climate would normally wear it, from: ${SEASONS.join(', ')}.
- occasions: the occasions it suits, from: ${OCCASIONS.join(', ')}. Most items suit one to three.
- warmth: a whole number from 1 to 5. 1 for very light pieces such as a tank top or sandals, 3 for mid-weight pieces such as jeans or a shirt, 5 for the warmest pieces such as a winter coat. Use 3 for bags and jewellery.
- brand: only when a logo or label is clearly readable in the image, otherwise null. Do not guess.`;
}

const unique = <T>(values: T[]): T[] => [...new Set(values)];

/**
 * Keeps every value that is in the vocabulary and drops the rest, so a
 * slightly off answer still pre-fills the form. Returns null only when the
 * category itself is unusable, because nothing else can be trusted then.
 */
export function normaliseTags(raw: RawTags): ItemTags | null {
  const category = raw.category.trim();
  if (!isCategory(category)) return null;
  const subcategory = raw.subcategory?.trim();
  const warmth = Math.round(raw.warmth);
  return {
    name: raw.name.trim() || null,
    category,
    subcategory: isSubcategoryOf(category, subcategory) ? subcategory : null,
    colours: unique(raw.colours.map((value) => value.trim()).filter(isColour)).slice(0, 3),
    seasons: unique(raw.seasons.map((value) => value.trim()).filter(isSeason)),
    occasions: unique(raw.occasions.map((value) => value.trim()).filter(isOccasion)),
    warmth: isWarmth(warmth) ? warmth : null,
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
    const tags =
      response.stop_reason !== 'refusal' && response.parsed_output
        ? normaliseTags(response.parsed_output)
        : null;
    if (!tags) throw new AiUnavailableError('error');
    return tags;
  } catch (error) {
    throw toUnavailable(error);
  }
}
