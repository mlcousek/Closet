import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { StartupGate } from '../StartupGate';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));

it('keeps wardrobe screens unmounted after recovery fails and retries safely', async () => {
  const prepare = jest
    .fn()
    .mockRejectedValueOnce(new Error('Cannot restore database'))
    .mockResolvedValueOnce(undefined);
  render(
    <StartupGate prepare={prepare}>
      <Text>Saved wardrobe</Text>
    </StartupGate>,
  );
  expect(screen.queryByText('Saved wardrobe')).toBeNull();
  expect(await screen.findByText('Your wardrobe could not be opened')).toBeTruthy();
  expect(screen.queryByText('Saved wardrobe')).toBeNull();
  fireEvent.press(screen.getByTestId('startup-retry'));
  expect(await screen.findByText('Saved wardrobe')).toBeTruthy();
  expect(prepare).toHaveBeenCalledTimes(2);
});

it('waits for recovery to finish before mounting children', async () => {
  let finish!: () => void;
  const prepare = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  render(
    <StartupGate prepare={prepare}>
      <Text>Saved wardrobe</Text>
    </StartupGate>,
  );
  expect(screen.queryByText('Saved wardrobe')).toBeNull();
  await act(async () => finish());
  expect(screen.getByText('Saved wardrobe')).toBeTruthy();
});
