import fs from 'node:fs';
import path from 'node:path';

import { parseProductPage } from '../productPage';

/**
 * Product pages saved from real shops on 13 October 2026, cut down to the
 * structured data and meta tags the reader looks at. Each file starts with the
 * address it came from. H&M, Uniqlo, Mango and Decathlon answered the app's
 * request with 403 Forbidden, so a link from them cannot be imported.
 */
const saved = (name: string) => {
  const html = fs.readFileSync(path.join(__dirname, 'shops', `${name}.html`), 'utf8');
  const url = /from (\S+);/.exec(html)![1];
  return parseProductPage(html, url);
};

describe('product pages of real shops', () => {
  it('reads a Shopify product group once, at its original size (Allbirds)', () => {
    expect(saved('allbirds')).toEqual({
      name: "Women's Allbirds Flip Flop",
      brand: 'Allbirds',
      price: 25,
      currency: 'USD',
      // Listed at 100 to 900 pixels and once without a size, over plain http: one picture remains.
      images: [
        'https://www.allbirds.com/cdn/shop/files/A12513_26Q2_Allbirds-Flip-Flop-Dusty-Pink_PDP_LEFT.png?v=1774646345',
      ],
    });
  });

  it('reads a Czech shop with image objects, leaving out the product video (Answear)', () => {
    const product = saved('answear')!;
    expect(product).toMatchObject({
      name: 'Answear.LAB šaty z viskózy červené hladké',
      brand: 'answear.lab',
      price: 3399,
      currency: 'CZK',
    });
    expect(product.images).toHaveLength(7);
    expect(product.images[0]).toBe(
      'https://img2.ans-media.com/i/430x645/WA26-SUD037-33X_F1.avif?v=1787756252',
    );
    expect(product.images.some((url) => url.includes('.mp4'))).toBe(false);
    // The share logo from Open Graph comes after every product photo.
    expect(product.images.at(-1)).toMatch(/logo_share/);
  });

  it('reads a page that publishes no price, without guessing one (ASOS)', () => {
    expect(saved('asos')).toEqual({
      name: 'Bershka Animal print lace tulle mini dress in brown',
      brand: 'Bershka',
      price: null,
      currency: null,
      images: [
        'https://images.asos-media.com/products/bershka-animal-print-lace-tulle-mini-dress-in-brown/211910812-1-brown',
      ],
    });
  });

  it('reads the brand of a collaboration and the local price (Kith)', () => {
    const product = saved('kith')!;
    expect(product).toMatchObject({
      name: 'adidas x CLOT Samba Espadrille - Core Black / Cloud White',
      brand: 'adidas',
      price: 4100,
      currency: 'CZK',
    });
    expect(product.images).toHaveLength(6);
    expect(product.images.every((url) => url.startsWith('https://kith.com/'))).toBe(true);
  });

  it('keeps the original of the first picture and the large size of the others (Taylor Stitch)', () => {
    const product = saved('taylorstitch')!;
    expect(product).toMatchObject({
      name: 'The Alta Jacket in Montana Plaid Fleece',
      brand: 'Taylor Stitch',
      price: 218,
      currency: 'USD',
    });
    expect(product.images).toEqual([
      'https://www.taylorstitch.com/cdn/shop/files/Q426_The_Alta_Jacket_in_Montana_Plaid_Fleece_PDP_001.jpg?v=1791566573',
      'https://www.taylorstitch.com/cdn/shop/files/Q426_The_Alta_Jacket_in_Montana_Plaid_Fleece_PDP_002.jpg?v=1791566573&width=1600',
      'https://www.taylorstitch.com/cdn/shop/files/Q426_The_Alta_Jacket_in_Montana_Plaid_Fleece_PDP_003.jpg?v=1791566573&width=1600',
    ]);
  });

  it('takes the price from the variants and asks for pictures larger than thumbnails (Zalando)', () => {
    const product = saved('zalando')!;
    expect(product).toMatchObject({
      name: 'Maxi šaty - bordeaux',
      brand: 'Anna Field by Zalando',
      price: 1140,
      currency: 'CZK',
    });
    expect(product.images).toHaveLength(5);
    // Listed at 200 pixels; the one Open Graph lists at 800 keeps that size.
    expect(product.images.filter((url) => url.includes('imwidth=1200'))).toHaveLength(4);
    expect(product.images[3]).toMatch(/imwidth=800&filter=packshot$/);
  });
});
