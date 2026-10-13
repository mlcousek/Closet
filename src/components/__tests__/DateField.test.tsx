import { act, fireEvent, render, screen } from '@testing-library/react-native';
import i18n from 'i18next';
import { useState } from 'react';
import { Platform } from 'react-native';

import { ItemForm } from '@/closet/ItemForm';
import { fromDay } from '@/planning/dates';

import { DateField } from '../DateField';

jest.mock('expo-localization', () => ({ getLocales: () => [{ regionCode: 'CZ' }] }));

const select = (id: string, day: string) => {
  fireEvent.press(screen.getByTestId(id));
  fireEvent(screen.getByTestId(`${id}-picker`), 'valueChange', {}, fromDay(day));
  fireEvent.press(screen.getByTestId(`${id}-done`));
};

function Field() {
  const [value, setValue] = useState('2028-02-29');
  return <DateField label="Purchased" testID="date" value={value} onChange={setValue} clearable />;
}

it('cancels draft edits, reopens at the committed day, confirms and clears', () => {
  render(<Field />);
  fireEvent.press(screen.getByTestId('date'));
  fireEvent(screen.getByTestId('date-picker'), 'valueChange', {}, fromDay('2028-03-26'));
  fireEvent.press(screen.getByTestId('date-cancel'));
  expect(screen.getByTestId('date').props.accessibilityValue.text).toBe('2/29/2028');
  fireEvent.press(screen.getByTestId('date'));
  expect(screen.getByTestId('date-picker').props.value).toEqual(fromDay('2028-02-29'));
  // System dismissal follows the same cancellation path.
  fireEvent(screen.getByTestId('date-picker'), 'dismiss');
  select('date', '2028-03-26');
  expect(screen.getByTestId('date').props.accessibilityValue.text).toBe('3/26/2028');
  fireEvent.press(screen.getByTestId('date-clear'));
  expect(screen.getByTestId('date').props.accessibilityValue.text).toBe('Not set');
  expect(screen.queryByTestId('date-clear')).toBeNull();
});

it('uses Czech locale in both the field and iPhone picker', async () => {
  await act(() => i18n.changeLanguage('cs'));
  render(<Field />);
  expect(screen.getByTestId('date').props.accessibilityValue.text).toBe('29. 2. 2028');
  fireEvent.press(screen.getByTestId('date'));
  expect(screen.getByTestId('date-picker').props.locale).toBe('cs-CZ');
});

it('commits Android selections and leaves dismissed selections unchanged', () => {
  const original = Platform.OS;
  Platform.OS = 'android';
  try {
    render(<Field />);
    fireEvent.press(screen.getByTestId('date'));
    fireEvent(screen.getByTestId('date-picker'), 'dismiss');
    expect(screen.getByTestId('date').props.accessibilityValue.text).toBe('2/29/2028');
    fireEvent.press(screen.getByTestId('date'));
    fireEvent(screen.getByTestId('date-picker'), 'valueChange', {}, fromDay('2028-10-29'));
    expect(screen.queryByTestId('date-picker')).toBeNull();
    expect(screen.getByTestId('date').props.accessibilityValue.text).toBe('10/29/2028');
  } finally {
    Platform.OS = original;
  }
});

it('saves purchase dates at local noon and can remove an existing purchase date', () => {
  const save = jest.fn();
  render(
    <ItemForm
      initial={{ name: 'Coat', category: 'outerwear' }}
      submitLabel="Save"
      onSubmit={save}
    />,
  );
  select('item-purchased', '2028-03-26');
  fireEvent.press(screen.getByTestId('item-save'));
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({ purchasedAt: fromDay('2028-03-26').getTime() }),
  );
  fireEvent.press(screen.getByTestId('item-purchased-clear'));
  fireEvent.press(screen.getByTestId('item-save'));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ purchasedAt: null }));
});
