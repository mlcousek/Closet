import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { layoutTree } from '@/testing/layoutTree';
import type { Item } from '@/closet/types';
import { OutfitCollage } from '@/outfits/OutfitImage';

import { ShareSheet, type ShareOutfit } from '../ShareSheet';
import { FORMAT_RATIO, SHARE_FORMATS, sheetPages } from '../share';

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View {...props} /> };
});
jest.mock('@/storage/imageStore', () => ({
  imageStore: { uri: (path: string) => `file:///documents/${path}` },
}));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(), Asset: {} }));

const piece = (id: string): Pick<Item, 'id' | 'thumbPath' | 'name' | 'brand'> => ({
  id,
  thumbPath: `images/items/${id}-t.jpg`,
  name: id,
  brand: id === 'shirt' ? 'Arket' : null,
});
const outfit = (id: string, renderPath: string | null = null): ShareOutfit => ({
  id,
  name: `Outfit ${id}`,
  items: [piece('shirt'), piece('skirt'), piece('boots')],
  renderPath,
});

/** The share card as it is captured: everything inside it, nothing of the sheet around it. */
const card = () => layoutTree(screen.getByTestId('share-card'));
const cardStyle = () => StyleSheet.flatten(screen.getByTestId('share-card').props.style);

describe('share composer', () => {
  it.each(SHARE_FORMATS)('composes the %s format from the render', (format) => {
    render(
      <ShareSheet
        title="Friday"
        outfits={[outfit('o1', 'images/renders/r1.png')]}
        onClose={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId(`share-format-${format}`));

    expect(cardStyle().width / cardStyle().height).toBeCloseTo(FORMAT_RATIO[format], 5);
    expect(card()).toMatchSnapshot();
  });

  it.each(SHARE_FORMATS)(
    'composes the %s format from the pieces, with the item strip',
    (format) => {
      render(<ShareSheet title="Friday" outfits={[outfit('o1')]} onClose={jest.fn()} />);
      fireEvent.press(screen.getByTestId(`share-format-${format}`));
      fireEvent(screen.getByTestId('share-with-items'), 'valueChange', true);

      expect(cardStyle().width / cardStyle().height).toBeCloseTo(FORMAT_RATIO[format], 5);
      expect(card()).toMatchSnapshot();
    },
  );
});

describe('lookbook contact sheet', () => {
  const lookbook = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      // Every other outfit has a render, so both kinds of tile appear.
      outfit(`o${index + 1}`, index % 2 === 0 ? `images/renders/r${index + 1}.png` : null),
    );

  it('lays out five outfits on one image', () => {
    render(<ShareSheet title="Summer" outfits={lookbook(5)} onClose={jest.fn()} />);
    expect(screen.getAllByTestId(/^share-tile-/)).toHaveLength(5);
    expect(card()).toMatchSnapshot();
  });

  it('pages thirty outfits into images of twelve, twelve and six', () => {
    const pages = sheetPages(lookbook(30));
    expect(pages.map((page) => page.length)).toEqual([12, 12, 6]);
    pages.forEach((page, index) => {
      const view = render(
        <ShareSheet
          title={`Summer (${index + 1}/${pages.length})`}
          outfits={page}
          onClose={jest.fn()}
        />,
      );
      expect(screen.getAllByTestId(/^share-tile-/)).toHaveLength(page.length);
      expect(card()).toMatchSnapshot(`page ${index + 1}`);
      view.unmount();
    });
  });
});

describe('flat preview collage', () => {
  it.each([2, 4, 6])('lays out %i pieces from head to feet', (count) => {
    const items = ['hat', 'shirt', 'jumper', 'skirt', 'bag', 'boots']
      .slice(0, count)
      .map((id) => piece(id));
    render(<OutfitCollage items={items} />);

    const places = items.map((item) =>
      StyleSheet.flatten(screen.getByTestId(`collage-piece-${item.id}`).props.style),
    );
    // Each piece stays inside the box.
    for (const place of places) {
      expect(parseFloat(place.left) + parseFloat(place.width)).toBeLessThanOrEqual(100);
      expect(parseFloat(place.top) + parseFloat(place.height)).toBeLessThanOrEqual(100);
    }
    expect(layoutTree(screen.getByTestId('outfit-collage'))).toMatchSnapshot();
  });
});
