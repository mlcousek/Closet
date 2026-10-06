import { fireEvent, render, screen } from '@testing-library/react-native';
import i18n from 'i18next';
import { useState } from 'react';
import { Text } from 'react-native';

import {
  EMPTY_SHEET_FILTER,
  FilterSheet,
  activeFilterCount,
  type SheetFilter,
} from '../FilterSheet';
import { matchesSearch } from '../search';
import type { Item } from '../types';

/** The filter the sheet last handed to the screen. */
let applied: SheetFilter = EMPTY_SHEET_FILTER;
/** The sheet as the closet screen uses it: the screen keeps the filter and shows how many are on. */
function Harness({
  initial = EMPTY_SHEET_FILTER,
  brands = ['Arket', 'COS'],
  visible = true,
  onClose = () => {},
}: {
  initial?: SheetFilter;
  brands?: string[];
  visible?: boolean;
  onClose?: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Text testID="active-count">{activeFilterCount(value)}</Text>
      <FilterSheet
        visible={visible}
        value={value}
        brands={brands}
        onChange={(next) => {
          applied = next;
          setValue(next);
        }}
        onClose={onClose}
      />
    </>
  );
}

beforeEach(() => {
  applied = EMPTY_SHEET_FILTER;
});

describe('filter sheet', () => {
  it('starts with nothing narrowed and the newest items first', () => {
    render(<Harness />);
    expect(screen.getByText('Filters')).toBeTruthy();
    expect(screen.getByTestId('sort-newest')).toBeChecked();
    expect(screen.getByTestId('filter-colour-black')).not.toBeChecked();
    expect(screen.getByTestId('filter-season-summer')).not.toBeChecked();
    expect(screen.getByTestId('filter-occasion-work')).not.toBeChecked();
    expect(screen.getByTestId('filter-brand-Arket')).not.toBeChecked();
    expect(screen.getByTestId('filter-archived').props.value).toBe(false);
    expect(screen.getByTestId('active-count')).toHaveTextContent('0');
  });

  it.each([
    ['colours', 'filter-colour', 'navy', 'red', 'Navy'],
    ['seasons', 'filter-season', 'summer', 'winter', 'Summer'],
    ['occasions', 'filter-occasion', 'work', 'party', 'Work'],
  ] as const)(
    'adds and removes %s, several at a time',
    (field, prefix, first, second, firstLabel) => {
      render(<Harness />);
      expect(screen.getByTestId(`${prefix}-${first}`)).toHaveTextContent(firstLabel);

      fireEvent.press(screen.getByTestId(`${prefix}-${first}`));
      expect(screen.getByTestId(`${prefix}-${first}`)).toBeChecked();
      expect(applied[field]).toEqual([first]);
      expect(screen.getByTestId('active-count')).toHaveTextContent('1');

      fireEvent.press(screen.getByTestId(`${prefix}-${second}`));
      expect(applied[field]).toEqual([first, second]);
      // Two choices in one group are still one filter.
      expect(screen.getByTestId('active-count')).toHaveTextContent('1');

      fireEvent.press(screen.getByTestId(`${prefix}-${first}`));
      expect(screen.getByTestId(`${prefix}-${first}`)).not.toBeChecked();
      expect(screen.getByTestId(`${prefix}-${second}`)).toBeChecked();
      expect(applied[field]).toEqual([second]);

      fireEvent.press(screen.getByTestId(`${prefix}-${second}`));
      expect(applied[field]).toEqual([]);
      expect(screen.getByTestId('active-count')).toHaveTextContent('0');
      // Nothing else was touched along the way.
      expect(applied).toEqual(EMPTY_SHEET_FILTER);
    },
  );

  it('offers every colour, season and occasion', () => {
    render(<Harness />);
    expect(screen.getAllByTestId(/^filter-colour-/)).toHaveLength(16);
    expect(screen.getAllByTestId(/^filter-season-/)).toHaveLength(4);
    expect(screen.getAllByTestId(/^filter-occasion-/)).toHaveLength(7);
  });

  it('sorts by one thing at a time, which does not count as a filter', () => {
    render(<Harness />);
    expect(screen.getAllByTestId(/^sort-/).map((chip) => chip.props.accessibilityLabel)).toEqual([
      'Newest',
      'Name',
      'Price',
      'Brand',
    ]);

    fireEvent.press(screen.getByTestId('sort-price'));
    expect(screen.getByTestId('sort-price')).toBeChecked();
    expect(screen.getByTestId('sort-newest')).not.toBeChecked();
    expect(applied.sort).toBe('price');
    expect(screen.getByTestId('active-count')).toHaveTextContent('0');

    // Tapping the chosen order again keeps it: there is always an order.
    fireEvent.press(screen.getByTestId('sort-price'));
    expect(applied.sort).toBe('price');
    fireEvent.press(screen.getByTestId('sort-name'));
    expect(applied.sort).toBe('name');
    expect(screen.getByTestId('sort-price')).not.toBeChecked();
  });

  it('filters by one brand, replaced by another and cleared by a second tap', () => {
    render(<Harness />);
    fireEvent.press(screen.getByTestId('filter-brand-Arket'));
    expect(screen.getByTestId('filter-brand-Arket')).toBeChecked();
    expect(applied.brand).toBe('Arket');
    expect(screen.getByTestId('active-count')).toHaveTextContent('1');

    fireEvent.press(screen.getByTestId('filter-brand-COS'));
    expect(screen.getByTestId('filter-brand-COS')).toBeChecked();
    expect(screen.getByTestId('filter-brand-Arket')).not.toBeChecked();
    expect(applied.brand).toBe('COS');
    expect(screen.getByTestId('active-count')).toHaveTextContent('1');

    fireEvent.press(screen.getByTestId('filter-brand-COS'));
    expect(applied.brand).toBeNull();
    expect(screen.getByTestId('active-count')).toHaveTextContent('0');
  });

  it('leaves the brand section out when no item has a brand', () => {
    render(<Harness brands={[]} />);
    expect(screen.queryByTestId(/^filter-brand-/)).toBeNull();
    // "Brand" is then only the name of a sort order.
    expect(screen.getAllByText('Brand')).toHaveLength(1);
  });

  it('shows archived items with the switch', () => {
    render(<Harness />);
    expect(screen.getByText('Show archived items')).toBeTruthy();
    fireEvent(screen.getByTestId('filter-archived'), 'valueChange', true);
    expect(screen.getByTestId('filter-archived').props.value).toBe(true);
    expect(applied.archived).toBe(true);
    expect(screen.getByTestId('active-count')).toHaveTextContent('1');

    fireEvent(screen.getByTestId('filter-archived'), 'valueChange', false);
    expect(applied.archived).toBe(false);
    expect(screen.getByTestId('active-count')).toHaveTextContent('0');
  });

  it('combines the groups and counts each narrowing group once', () => {
    render(<Harness />);
    fireEvent.press(screen.getByTestId('filter-colour-black'));
    fireEvent.press(screen.getByTestId('filter-colour-white'));
    fireEvent.press(screen.getByTestId('filter-season-winter'));
    fireEvent.press(screen.getByTestId('filter-occasion-formal'));
    fireEvent.press(screen.getByTestId('filter-brand-COS'));
    fireEvent(screen.getByTestId('filter-archived'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('sort-brand'));

    expect(applied).toEqual({
      colours: ['black', 'white'],
      seasons: ['winter'],
      occasions: ['formal'],
      brand: 'COS',
      archived: true,
      sort: 'brand',
    });
    expect(screen.getByTestId('active-count')).toHaveTextContent('5');
  });

  it('clears every filter and the sort order at once', () => {
    render(
      <Harness
        initial={{
          colours: ['red'],
          seasons: ['spring', 'summer'],
          occasions: ['casual'],
          brand: 'Arket',
          archived: true,
          sort: 'price',
        }}
      />,
    );
    expect(screen.getByTestId('active-count')).toHaveTextContent('5');
    expect(screen.getByTestId('filter-colour-red')).toBeChecked();
    expect(screen.getByTestId('filter-brand-Arket')).toBeChecked();

    fireEvent.press(screen.getByTestId('filter-clear'));
    expect(applied).toEqual(EMPTY_SHEET_FILTER);
    expect(screen.getByTestId('active-count')).toHaveTextContent('0');
    expect(screen.getByTestId('filter-colour-red')).not.toBeChecked();
    expect(screen.getByTestId('filter-season-spring')).not.toBeChecked();
    expect(screen.getByTestId('filter-occasion-casual')).not.toBeChecked();
    expect(screen.getByTestId('filter-brand-Arket')).not.toBeChecked();
    expect(screen.getByTestId('filter-archived').props.value).toBe(false);
    expect(screen.getByTestId('sort-newest')).toBeChecked();
  });

  it('closes from Done and from the backdrop, keeping what was chosen', () => {
    const onClose = jest.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.press(screen.getByTestId('filter-season-autumn'));

    fireEvent.press(screen.getByTestId('filter-done'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(applied.seasons).toEqual(['autumn']);
  });

  it('shows nothing while it is closed', () => {
    render(<Harness visible={false} />);
    expect(screen.queryByTestId('filter-sheet')).toBeNull();
    expect(screen.queryByTestId('filter-clear')).toBeNull();
  });
});

describe('active filter count', () => {
  it('ignores the sort order and counts brand and archived on their own', () => {
    expect(activeFilterCount(EMPTY_SHEET_FILTER)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_SHEET_FILTER, sort: 'name' })).toBe(0);
    expect(activeFilterCount({ ...EMPTY_SHEET_FILTER, brand: 'COS' })).toBe(1);
    expect(activeFilterCount({ ...EMPTY_SHEET_FILTER, archived: true })).toBe(1);
    expect(activeFilterCount({ ...EMPTY_SHEET_FILTER, colours: ['red', 'blue', 'green'] })).toBe(1);
    expect(
      activeFilterCount({ ...EMPTY_SHEET_FILTER, seasons: ['summer'], occasions: ['work'] }),
    ).toBe(2);
  });
});

describe('closet search', () => {
  const item = (patch: Partial<Item>): Item => ({
    id: 'i1',
    createdAt: 1,
    name: null,
    category: 'tops',
    subcategory: null,
    colours: [],
    seasons: [],
    occasions: [],
    warmth: null,
    brand: null,
    size: null,
    price: null,
    currency: null,
    purchasedAt: null,
    notes: null,
    sourceUrl: null,
    ownership: 'owned',
    originalPath: 'o.jpg',
    cutoutPath: null,
    thumbPath: 't.jpg',
    needsReview: false,
    ...patch,
  });
  /** The labels the closet screen searches in, in the given interface language. */
  const labelsIn = (language: 'en' | 'cs') => {
    const t = i18n.getFixedT(language);
    return (entry: Item) => [
      t(`taxonomy.category.${entry.category}`),
      entry.subcategory ? t(`taxonomy.subcategory.${entry.subcategory}`) : '',
      ...entry.colours.map((colour) => t(`taxonomy.colour.${colour}`)),
    ];
  };
  const english = labelsIn('en');
  const czech = labelsIn('cs');

  const shirt = item({
    name: 'Žlutý svetr',
    brand: 'Søstrene',
    notes: 'Dárek od Jiřího',
    subcategory: 'shirt',
    colours: ['yellow', 'white'],
  });

  it('finds accented text from a query typed without accents, and the other way round', () => {
    expect(matchesSearch(shirt, 'zluty', english)).toBe(true);
    expect(matchesSearch(shirt, 'ZLUTY', english)).toBe(true);
    expect(matchesSearch(shirt, 'jiriho', english)).toBe(true);
    expect(matchesSearch(item({ name: 'Zluty svetr' }), 'žlutý', english)).toBe(true);
    expect(matchesSearch(shirt, 'zelen', english)).toBe(false);
  });

  it('needs every word of the query, in any order and across fields', () => {
    expect(matchesSearch(shirt, 'svetr zluty', english)).toBe(true);
    expect(matchesSearch(shirt, '  zluty   darek  ', english)).toBe(true);
    // One word from the name, one from the colour label, one from the notes.
    expect(matchesSearch(shirt, 'svetr white jiriho', english)).toBe(true);
    expect(matchesSearch(shirt, 'svetr black', english)).toBe(false);
  });

  it('finds category, type and colour words in English', () => {
    expect(matchesSearch(shirt, 'tops', english)).toBe(true);
    expect(matchesSearch(shirt, 'shirt', english)).toBe(true);
    expect(matchesSearch(shirt, 'yellow', english)).toBe(true);
    expect(matchesSearch(shirt, 'white shirt', english)).toBe(true);
    // The Czech words are not searched while the interface is in English.
    expect(matchesSearch(shirt, 'kosile', english)).toBe(false);
    expect(matchesSearch(shirt, 'bila', english)).toBe(false);
  });

  it('finds category, type and colour words in Czech, with or without accents', () => {
    expect(matchesSearch(shirt, 'svršky', czech)).toBe(true);
    expect(matchesSearch(shirt, 'svrsky', czech)).toBe(true);
    expect(matchesSearch(shirt, 'kosile', czech)).toBe(true);
    expect(matchesSearch(shirt, 'zluta', czech)).toBe(true);
    expect(matchesSearch(shirt, 'bila kosile', czech)).toBe(true);
    expect(matchesSearch(shirt, 'yellow', czech)).toBe(false);
    expect(matchesSearch(shirt, 'cerna', czech)).toBe(false);
  });

  it('matches part of a word, and the brand', () => {
    expect(matchesSearch(shirt, 'sve', english)).toBe(true);
    expect(matchesSearch(shirt, 'strene', english)).toBe(true);
  });

  it('matches everything for an empty query', () => {
    expect(matchesSearch(shirt, '', english)).toBe(true);
    expect(matchesSearch(shirt, '   ', english)).toBe(true);
    expect(matchesSearch(item({}), '', () => [])).toBe(true);
  });

  it('searches an item without a name, brand or notes by its labels only', () => {
    const bare = item({ category: 'shoes', subcategory: 'sneakers', colours: ['black'] });
    expect(matchesSearch(bare, 'black sneakers', english)).toBe(true);
    expect(matchesSearch(bare, 'cerne', czech)).toBe(false);
    expect(matchesSearch(bare, 'cerna tenisky boty', czech)).toBe(true);
    expect(matchesSearch(bare, 'null', english)).toBe(false);
  });
});
