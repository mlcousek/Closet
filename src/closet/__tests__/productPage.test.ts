import { LinkImportError, fetchProductPage, parseProductPage, parseWebUrl } from '../productPage';

const page = (head: string) => `<!doctype html><html><head>${head}</head><body></body></html>`;
const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

/** Structured data in the shapes five kinds of shop commonly publish. */
const samples = {
  simpleProduct: page(
    ld({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Linen Shirt',
      brand: { '@type': 'Brand', name: 'Arket' },
      image: ['https://cdn.shop-a.example/shirt-1.jpg', 'https://cdn.shop-a.example/shirt-2.jpg'],
      offers: { '@type': 'Offer', price: '1290.00', priceCurrency: 'CZK' },
    }),
  ),
  graphWithStringBrand: page(
    ld({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Shop B' },
        {
          '@type': 'Product',
          name: 'Pleated Skirt &amp; Belt',
          brand: 'Zara',
          image: '/media/skirt.jpg',
          offers: [{ '@type': 'Offer', price: 59.9, priceCurrency: 'eur' }],
        },
      ],
    }),
  ),
  aggregateOfferAndImageObject: page(
    ld([
      { '@type': 'BreadcrumbList' },
      {
        '@type': ['Product', 'Thing'],
        name: 'Leather Boots',
        image: { '@type': 'ImageObject', url: 'https://img.shop-c.example/boots.png' },
        offers: { '@type': 'AggregateOffer', lowPrice: '2 499,00', priceCurrency: 'CZK' },
      },
    ]),
  ),
  openGraphOnly: page(`
    <meta property="og:title" content="Canvas Tote Bag" />
    <meta content="https://shop-d.example/img/tote.jpg" property="og:image">
    <meta property="product:price:amount" content="19.99">
    <meta property="product:price:currency" content="USD">
    <meta property="product:brand" content="Baggu">
  `),
  mixed: page(
    `${ld({ '@type': 'Product', name: 'Wool Scarf', image: [] })}
     <meta property="og:image" content="//shop-e.example/scarf.webp">
     <meta property="og:title" content="Wool Scarf | Shop E">`,
  ),
};

describe('product page reader', () => {
  it('reads a plain product object', () => {
    expect(parseProductPage(samples.simpleProduct, 'https://shop-a.example/p/1')).toEqual({
      name: 'Linen Shirt',
      brand: 'Arket',
      price: 1290,
      currency: 'CZK',
      images: ['https://cdn.shop-a.example/shirt-1.jpg', 'https://cdn.shop-a.example/shirt-2.jpg'],
    });
  });

  it('finds the product inside a graph, resolves relative images and decodes entities', () => {
    expect(
      parseProductPage(samples.graphWithStringBrand, 'https://shop-b.example/p/skirt'),
    ).toEqual({
      name: 'Pleated Skirt & Belt',
      brand: 'Zara',
      price: 59.9,
      currency: 'EUR',
      images: ['https://shop-b.example/media/skirt.jpg'],
    });
  });

  it('reads aggregate offers, image objects and locally formatted prices', () => {
    expect(
      parseProductPage(samples.aggregateOfferAndImageObject, 'https://shop-c.example/boots'),
    ).toMatchObject({
      name: 'Leather Boots',
      brand: null,
      price: 2499,
      currency: 'CZK',
      images: ['https://img.shop-c.example/boots.png'],
    });
  });

  it('falls back to Open Graph tags in either attribute order', () => {
    expect(parseProductPage(samples.openGraphOnly, 'https://shop-d.example/tote')).toEqual({
      name: 'Canvas Tote Bag',
      brand: 'Baggu',
      price: 19.99,
      currency: 'USD',
      images: ['https://shop-d.example/img/tote.jpg'],
    });
  });

  it('fills gaps in structured data from Open Graph', () => {
    expect(parseProductPage(samples.mixed, 'https://shop-e.example/scarf')).toMatchObject({
      name: 'Wool Scarf',
      images: ['https://shop-e.example/scarf.webp'],
    });
  });

  it('returns nothing for a page without product data or without an image', () => {
    expect(parseProductPage(page('<title>About us</title>'), 'https://x.example')).toBeNull();
    expect(
      parseProductPage(page(ld({ '@type': 'Product', name: 'No picture' })), 'https://x.example'),
    ).toBeNull();
  });

  it('survives broken structured data', () => {
    const html = page(
      `<script type="application/ld+json">{ not json </script>
       <meta property="og:title" content="Fallback"><meta property="og:image" content="https://x.example/a.jpg">`,
    );
    expect(parseProductPage(html, 'https://x.example')).toMatchObject({ name: 'Fallback' });
  });

  it('ignores image links that are not web links', () => {
    const html = page(
      ld({
        '@type': 'Product',
        name: 'X',
        image: ['javascript:alert(1)', 'https://x.example/ok.jpg'],
      }),
    );
    expect(parseProductPage(html, 'https://x.example')!.images).toEqual([
      'https://x.example/ok.jpg',
    ]);
  });
});

describe('web links', () => {
  it('accepts web links and adds a missing scheme', () => {
    expect(parseWebUrl(' https://shop.example/p/1?x=1 ')).toBe('https://shop.example/p/1?x=1');
    expect(parseWebUrl('shop.example/p/1')).toBe('https://shop.example/p/1');
  });

  it('rejects anything else', () => {
    expect(parseWebUrl('')).toBeNull();
    expect(parseWebUrl('not a link')).toBeNull();
    expect(parseWebUrl('file:///etc/passwd')).toBeNull();
    expect(parseWebUrl('localhost')).toBeNull();
  });
});

describe('fetching a product page', () => {
  const respond = (html: string, ok = true) =>
    jest.fn(async () => ({ ok, text: async () => html }));

  it('returns the product with the link it came from', async () => {
    const fetchMock = respond(samples.simpleProduct);
    const product = await fetchProductPage('shop-a.example/p/1', fetchMock);
    expect(product).toMatchObject({ name: 'Linen Shirt', url: 'https://shop-a.example/p/1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://shop-a.example/p/1',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  const reasonOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error instanceof LinkImportError ? error.reason : 'other';
    }
    return 'none';
  };

  it('reports a link that is not a web link without fetching', async () => {
    const fetchMock = respond('');
    expect(await reasonOf(fetchProductPage('nonsense', fetchMock))).toBe('invalidUrl');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a page that cannot be fetched', async () => {
    expect(await reasonOf(fetchProductPage('https://x.example', respond('', false)))).toBe(
      'unreachable',
    );
    const offline = jest.fn(async () => {
      throw new Error('network');
    });
    expect(await reasonOf(fetchProductPage('https://x.example', offline))).toBe('unreachable');
  });

  it('reports a page with no product data', async () => {
    expect(
      await reasonOf(fetchProductPage('https://x.example', respond(page('<title>Blog</title>')))),
    ).toBe('noProduct');
  });
});
