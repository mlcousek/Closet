import { currencyOf } from './itemFormLogic';

export type ProductInfo = {
  name: string | null;
  brand: string | null;
  price: number | null;
  currency: string | null;
  /** Absolute image URLs, best candidates first, without duplicates. */
  images: string[];
};

export type LinkImportReason = 'invalidUrl' | 'unreachable' | 'noProduct';

export class LinkImportError extends Error {
  constructor(public reason: LinkImportReason) {
    super(`Link import failed: ${reason}`);
    this.name = 'LinkImportError';
  }
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&(?:amp|quot|#39|#x27|apos|lt|gt|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

const clean = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = decodeEntities(value).replace(/\s+/g, ' ').trim();
  return text || null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  // Machine-formatted prices such as "89.9900" are plain numbers and need no guessing.
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  // Otherwise take the first number in the text, so a range reads as its lower end.
  // "1 299,00" and "1,299.00" both occur; the last separator is the decimal one.
  const compact = (/\d[\d.,\s\u00a0]*/.exec(text)?.[0] ?? '').replace(/[^\d.,]/g, '');
  if (!compact) return null;
  const lastSeparator = Math.max(compact.lastIndexOf('.'), compact.lastIndexOf(','));
  const decimals = lastSeparator === -1 ? 0 : compact.length - lastSeparator - 1;
  const normalised =
    lastSeparator !== -1 && decimals > 0 && decimals <= 2
      ? `${compact.slice(0, lastSeparator).replace(/[.,]/g, '')}.${compact.slice(lastSeparator + 1)}`
      : compact.replace(/[.,]/g, '');
  const number = Number(normalised);
  return Number.isFinite(number) ? number : null;
}

/** Validates a link typed or pasted by the user. Only web links are accepted. */
export function parseWebUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function absolute(candidate: unknown, baseUrl: string): string | null {
  const text = clean(candidate);
  if (!text) return null;
  try {
    const url = new URL(text, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // The phone refuses plain web links, and shops serve the same file over https.
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

/** Shops list product videos next to the photos; only pictures can become an item. */
const VIDEO = /\.(mp4|m4v|mov|webm|m3u8)$/i;

function imageUrls(value: unknown, baseUrl: string): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => imageUrls(entry, baseUrl));
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return imageUrls(object.url ?? object.contentUrl, baseUrl);
  }
  const url = absolute(value, baseUrl);
  return url && !VIDEO.test(new URL(url).pathname) ? [url] : [];
}

/** Query parameters with which image servers scale a picture down to the given width. */
const SIZE_PARAMS = ['width', 'imwidth'];
/** Widths below this are thumbnails; asking for `LARGE_WIDTH` gives a picture worth importing. */
const SMALL_WIDTH = 600;
const LARGE_WIDTH = 1200;

/**
 * The pictures to offer, best first. Shops list one picture at several sizes
 * and sometimes only as a thumbnail: each picture is offered once, at the
 * largest size listed (no size at all is the original), and a thumbnail is
 * asked for at a useful width instead.
 */
function bestImages(urls: string[]): string[] {
  const best = new Map<string, { url: URL; width: number }>();
  for (const text of urls) {
    const url = new URL(text);
    const param = SIZE_PARAMS.find((name) => url.searchParams.has(name));
    const width = param ? Number(url.searchParams.get(param)) || 0 : Infinity;
    const key = new URL(text);
    for (const name of SIZE_PARAMS) key.searchParams.delete(name);
    const known = best.get(key.toString());
    if (!known || width > known.width) best.set(key.toString(), { url, width });
  }
  return [...best.values()].map(({ url, width }) => {
    const param = SIZE_PARAMS.find((name) => url.searchParams.has(name));
    if (param && width < SMALL_WIDTH) url.searchParams.set(param, String(LARGE_WIDTH));
    return url.toString();
  });
}

function hasType(node: Record<string, unknown>, type: string): boolean {
  const value = node['@type'];
  return Array.isArray(value) ? value.includes(type) : value === type;
}

/** Finds the first Product object anywhere in a JSON-LD document. */
function findProduct(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findProduct(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const object = node as Record<string, unknown>;
  if (hasType(object, 'Product') || hasType(object, 'ProductGroup')) return object;
  return findProduct(object['@graph'], depth + 1) ?? findProduct(object.mainEntity, depth + 1);
}

const firstOffer = (product: Record<string, unknown>) => {
  const offers = product.offers;
  return (Array.isArray(offers) ? offers[0] : offers) as Record<string, unknown> | undefined;
};
const hasPrice = (offer: Record<string, unknown> | undefined) =>
  offer?.price !== undefined || offer?.lowPrice !== undefined;

/**
 * The offer that carries the price. A product group (one product in several
 * sizes) can leave the price to its variants; they share it, so the first is used.
 */
function offerOf(product: Record<string, unknown>): Record<string, unknown> | undefined {
  const own = firstOffer(product);
  if (hasPrice(own) || !Array.isArray(product.hasVariant)) return own;
  const variant = product.hasVariant.find(
    (entry): entry is Record<string, unknown> =>
      !!entry && typeof entry === 'object' && hasPrice(firstOffer(entry)),
  );
  return variant ? firstOffer(variant) : own;
}

function fromJsonLd(html: string, baseUrl: string): ProductInfo | null {
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, body] of blocks) {
    let product: Record<string, unknown> | null = null;
    try {
      product = findProduct(JSON.parse(body.trim()));
    } catch {
      continue;
    }
    if (!product) continue;
    const offer = offerOf(product);
    const brandValue = product.brand;
    return {
      name: clean(product.name),
      brand: clean(
        brandValue && typeof brandValue === 'object'
          ? (brandValue as Record<string, unknown>).name
          : brandValue,
      ),
      price: toNumber(offer?.price ?? offer?.lowPrice),
      currency: currencyOf(clean(offer?.priceCurrency)),
      images: imageUrls(product.image, baseUrl),
    };
  }
  return null;
}

/** Reads `<meta property="..." content="...">` tags in either attribute order. */
function metaTags(html: string): Map<string, string[]> {
  const tags = new Map<string, string[]>();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    // The closing quote must match the opening one, so an apostrophe inside the value is kept.
    const key = /\s(?:property|name)=(["'])(.+?)\1/i.exec(tag)?.[2]?.toLowerCase();
    const content = /\scontent=(["'])(.*?)\1/i.exec(tag)?.[2];
    if (!key || content === undefined) continue;
    tags.set(key, [...(tags.get(key) ?? []), content]);
  }
  return tags;
}

function fromOpenGraph(html: string, baseUrl: string): ProductInfo | null {
  const tags = metaTags(html);
  const first = (key: string) => tags.get(key)?.[0];
  const images = (tags.get('og:image') ?? []).flatMap((url) => imageUrls(url, baseUrl));
  const name = clean(first('og:title'));
  if (!name && images.length === 0) return null;
  return {
    name,
    brand: clean(first('product:brand') ?? first('og:brand')),
    price: toNumber(first('product:price:amount') ?? first('og:price:amount')),
    currency: currencyOf(clean(first('product:price:currency') ?? first('og:price:currency'))),
    images,
  };
}

/**
 * Extracts product details from a shop page: structured product data first,
 * then Open Graph tags, with each filling gaps left by the other. Returns null
 * when the page describes no product with an image.
 */
export function parseProductPage(html: string, baseUrl: string): ProductInfo | null {
  const structured = fromJsonLd(html, baseUrl);
  const openGraph = fromOpenGraph(html, baseUrl);
  if (!structured && !openGraph) return null;
  const images = bestImages([...(structured?.images ?? []), ...(openGraph?.images ?? [])]);
  if (images.length === 0) return null;
  return {
    name: structured?.name ?? openGraph?.name ?? null,
    brand: structured?.brand ?? openGraph?.brand ?? null,
    price: structured?.price ?? openGraph?.price ?? null,
    currency: structured?.currency ?? openGraph?.currency ?? null,
    images: images.slice(0, 12),
  };
}

type FetchPage = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; text(): Promise<string> }>;

/** Fetches a product page and reads it. Throws LinkImportError with the reason on failure. */
export async function fetchProductPage(
  link: string,
  fetchImpl: FetchPage = (url, init) => fetch(url, init),
  timeoutMs = 15000,
): Promise<ProductInfo & { url: string }> {
  const url = parseWebUrl(link);
  if (!url) throw new LinkImportError('invalidUrl');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let html: string;
  try {
    const response = await fetchImpl(url, {
      // Many shops answer only to browser-like requests.
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new LinkImportError('unreachable');
    html = await response.text();
  } catch (error) {
    throw error instanceof LinkImportError ? error : new LinkImportError('unreachable');
  } finally {
    clearTimeout(timer);
  }
  const product = parseProductPage(html, url);
  if (!product) throw new LinkImportError('noProduct');
  return { ...product, url };
}
