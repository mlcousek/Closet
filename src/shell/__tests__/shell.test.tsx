import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import i18n from 'i18next';

import { AddButton, AddMenu } from '../AddMenu';
import { SectionPlaceholder } from '../SectionPlaceholder';
import { ToastHost } from '../ToastHost';
import { useAddActions } from '../addActions';
import { deleteWithUndo, useToast } from '../toast';

beforeEach(() => {
  useAddActions.setState({ actions: [], menuOpen: false });
  useToast.getState().dismiss();
});

describe('add menu', () => {
  it('opens from the floating button', () => {
    render(
      <>
        <AddButton />
        <AddMenu />
      </>,
    );
    expect(screen.queryByText('Add to your closet')).toBeNull();
    fireEvent.press(screen.getByTestId('add-button'));
    expect(screen.getByText('Add to your closet')).toBeTruthy();
  });

  it('explains when no actions are available', () => {
    useAddActions.setState({ menuOpen: true });
    render(<AddMenu />);
    expect(screen.getByText(/Nothing can be added yet/)).toBeTruthy();
  });

  it('lists registered actions in order and runs the chosen one', async () => {
    const second = jest.fn();
    const first = jest.fn();
    act(() => {
      useAddActions.getState().register({
        id: 'second',
        labelKey: 'tabs.outfits',
        icon: 'albums-outline',
        order: 2,
        onPress: second,
      });
      useAddActions.getState().register({
        id: 'first',
        labelKey: 'tabs.closet',
        icon: 'shirt-outline',
        order: 1,
        onPress: first,
      });
      useAddActions.getState().openMenu();
    });
    render(<AddMenu />);

    expect(useAddActions.getState().actions.map((action) => action.id)).toEqual([
      'first',
      'second',
    ]);
    fireEvent.press(screen.getByTestId('add-action-first'));

    // The menu closes at once; the action waits until the sheet is gone, as iOS needs.
    expect(useAddActions.getState().menuOpen).toBe(false);
    expect(first).not.toHaveBeenCalled();
    await waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    expect(second).not.toHaveBeenCalled();
    expect(useAddActions.getState().menuOpen).toBe(false);
  });

  it('replaces an action registered twice and removes it on unregister', () => {
    const action = {
      id: 'item',
      labelKey: 'tabs.closet',
      icon: 'shirt-outline' as const,
      onPress: jest.fn(),
    };
    useAddActions.getState().register(action);
    const unregister = useAddActions.getState().register(action);
    expect(useAddActions.getState().actions).toHaveLength(1);
    unregister();
    expect(useAddActions.getState().actions).toHaveLength(0);
  });
});

describe('empty states', () => {
  it.each([
    ['home', 'Welcome to your closet', 'Add your first item'],
    ['closet', 'Your closet is empty', 'Add your first item'],
    ['outfits', 'No outfits yet', 'Create an outfit'],
    ['calendar', 'Nothing planned', 'Plan an outfit'],
  ] as const)('%s shows a title and a call to action', (section, title, action) => {
    render(<SectionPlaceholder section={section} icon="shirt-outline" />);
    expect(screen.getByText(title)).toBeTruthy();
    fireEvent.press(screen.getByText(action));
    expect(useAddActions.getState().menuOpen).toBe(true);
  });

  it('is translated to Czech', async () => {
    await act(() => i18n.changeLanguage('cs'));
    render(<SectionPlaceholder section="closet" icon="shirt-outline" />);
    expect(screen.getByText('Šatník je prázdný')).toBeTruthy();
  });
});

describe('delete with undo', () => {
  it('removes immediately, then restores when undo is tapped', async () => {
    const remove = jest.fn(async () => {});
    const restore = jest.fn(async () => {});
    const onChange = jest.fn();
    render(<ToastHost />);

    await act(() =>
      deleteWithUndo({ remove, restore, onChange, message: 'Deleted', undoLabel: 'Undo' }),
    );
    expect(remove).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Deleted')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('toast-action'));
    });
    expect(restore).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Deleted')).toBeNull();
  });

  it('stops offering undo after a short period', async () => {
    jest.useFakeTimers();
    render(<ToastHost />);
    await act(() =>
      deleteWithUndo({
        remove: async () => {},
        restore: async () => {},
        message: 'Deleted',
        undoLabel: 'Undo',
      }),
    );
    expect(screen.getByText('Undo')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(6000);
    });
    expect(screen.queryByText('Undo')).toBeNull();
    jest.useRealTimers();
  });
});
