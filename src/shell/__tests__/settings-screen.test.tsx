import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import i18n from 'i18next';
import { Alert } from 'react-native';

import SettingsScreen from '@/app/settings/index';
import { Row } from '@/components/ui';
import { ToastHost } from '@/shell/ToastHost';
import { BackupError } from '@/storage/backup';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', regionCode: 'CZ' }],
}));

const mockApplication = { version: '1.4.0' as string | null, build: '27' as string | null };
jest.mock('expo-application', () => ({
  __esModule: true,
  get nativeApplicationVersion() {
    return mockApplication.version;
  },
  get nativeBuildVersion() {
    return mockApplication.build;
  },
}));

const mockRouter = { push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const mockSettings = new Map<string, string>();
jest.mock('@/db/settings', () => ({
  getSetting: (key: string) => mockSettings.get(key) ?? null,
  setSetting: (key: string, value: string | null) =>
    void (value === null ? mockSettings.delete(key) : mockSettings.set(key, value)),
}));

/** What happened during a restore, in order. */
let mockSteps: string[] = [];
const mockBackup = {
  exportBackup: jest.fn(async (): Promise<void> => {}),
  pickBackupFile: jest.fn(async (): Promise<string | null> => 'file:///cache/closet-backup.zip'),
  importBackup: jest.fn(async (_archive: string): Promise<void> => {}),
};
jest.mock('@/storage/backupActions', () => ({
  exportBackup: () => mockBackup.exportBackup(),
  pickBackupFile: () => mockBackup.pickBackupFile(),
  importBackup: async (archive: string) => {
    await mockBackup.importBackup(archive);
    mockSteps.push('import');
  },
}));
/** Whether photos are being turned into items right now. */
let mockImporting = false;
jest.mock('@/closet/importActions', () => ({
  isImporting: () => mockImporting,
  resumeImports: async () => void mockSteps.push('imports'),
}));
/** The counter screens watch to read the renders again. */
let mockRenderVersion = 0;
jest.mock('@/outfits/renderActions', () => ({
  useRenderVersion: {
    setState: (update: (state: { version: number }) => { version: number }) => {
      mockRenderVersion = update({ version: mockRenderVersion }).version;
      mockSteps.push('render version');
    },
  },
}));

const mockUsage = {
  counts: jest.fn(async (_kind: string) => ({ month: 0, total: 0 })),
};
jest.mock('@/outfits/renders', () => ({
  usageLog: { counts: (kind: string) => mockUsage.counts(kind) },
  renderRepository: {
    failUnfinished: async () => void mockSteps.push('unfinished renders failed'),
  },
}));

// The reminder itself is real; only the system notifications underneath it are replaced.
const mockNotifications = {
  granted: true,
  schedule: jest.fn(async (_request: unknown) => 'id'),
  cancel: jest.fn(async (_id: string) => {}),
};
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  getPermissionsAsync: async () => ({ granted: mockNotifications.granted }),
  requestPermissionsAsync: async () => ({ granted: mockNotifications.granted }),
  scheduleNotificationAsync: (request: unknown) => mockNotifications.schedule(request),
  cancelScheduledNotificationAsync: (id: string) => mockNotifications.cancel(id),
}));

const ARCHIVE = 'file:///cache/closet-backup.zip';
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

const show = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SettingsScreen />
      <ToastHost />
    </QueryClientProvider>,
  );
  return client;
};

/** Answers the next confirmation with the button at `index`. */
const answerAlert = (index: number) =>
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.[index].onPress?.();
  });

/** The handler of a row, to call it twice before anything is drawn again. */
const handlerOf = (testID: string) =>
  screen.UNSAFE_getAllByType(Row).find((row) => row.props.testID === testID)!.props
    .onPress as () => void;

/** A promise that stays open until the test settles it, for looking at the busy state. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.clear();
  mockSteps = [];
  mockImporting = false;
  mockRenderVersion = 0;
  mockApplication.version = '1.4.0';
  mockApplication.build = '27';
  mockNotifications.granted = true;
  mockBackup.exportBackup.mockResolvedValue(undefined);
  mockBackup.pickBackupFile.mockResolvedValue(ARCHIVE);
  mockBackup.importBackup.mockResolvedValue(undefined);
  mockUsage.counts.mockResolvedValue({ month: 0, total: 0 });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('language', () => {
  it('follows the device until a language is chosen', async () => {
    show();
    await settle();
    expect(screen.getByText('Language')).toBeTruthy();
    expect(screen.getByTestId('language-system')).toBeSelected();
    expect(screen.getByTestId('language-system')).toHaveTextContent('Same as device');
    expect(screen.getByTestId('language-en')).not.toBeSelected();
    expect(screen.getByTestId('language-cs')).not.toBeSelected();
    expect(screen.getByTestId('language-cs')).toHaveTextContent('Čeština');
  });

  it('shows the stored choice as selected', async () => {
    mockSettings.set('language', 'en');
    show();
    await settle();
    expect(screen.getByTestId('language-en')).toBeSelected();
    expect(screen.getByTestId('language-system')).not.toBeSelected();
  });

  it('switches the interface at once and remembers the choice', async () => {
    show();
    fireEvent.press(screen.getByTestId('language-cs'));
    await settle();
    expect(mockSettings.get('language')).toBe('cs');
    expect(i18n.language).toBe('cs');
    expect(screen.getByTestId('language-cs')).toBeSelected();
    expect(screen.getByTestId('language-system')).not.toBeSelected();
    expect(screen.getByText('Jazyk')).toBeTruthy();
    expect(screen.getByTestId('language-system')).toHaveTextContent('Podle zařízení');
    expect(screen.queryByText('Language')).toBeNull();
  });

  it('goes back to the device language and forgets the choice', async () => {
    mockSettings.set('language', 'cs');
    await act(() => i18n.changeLanguage('cs'));
    show();
    expect(screen.getByTestId('language-cs')).toBeSelected();

    fireEvent.press(screen.getByTestId('language-system'));
    await settle();
    expect(mockSettings.has('language')).toBe(false);
    expect(i18n.language).toBe('en');
    expect(screen.getByTestId('language-system')).toBeSelected();
    expect(screen.getByText('Language')).toBeTruthy();
  });

  it('schedules the daily reminder again with its text in the new language', async () => {
    mockSettings.set('reminder.time', JSON.stringify({ hour: 7, minute: 5 }));
    show();
    fireEvent.press(screen.getByTestId('language-cs'));
    await settle();
    expect(mockNotifications.cancel).toHaveBeenCalledTimes(1);
    expect(mockNotifications.schedule).toHaveBeenCalledTimes(1);
    expect(mockNotifications.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        content: {
          title: 'Co si dnes obléknete?',
          body: i18n.getFixedT('cs')('reminder.body'),
        },
        trigger: expect.objectContaining({ hour: 7, minute: 5 }),
      }),
    );

    fireEvent.press(screen.getByTestId('language-en'));
    await settle();
    expect(mockNotifications.schedule).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: {
          title: 'What are you wearing today?',
          body: "Open Closet to pick today's outfit.",
        },
      }),
    );
    // The reminder keeps its time.
    expect(JSON.parse(mockSettings.get('reminder.time')!)).toEqual({ hour: 7, minute: 5 });
  });

  it('schedules nothing when no reminder is set', async () => {
    show();
    fireEvent.press(screen.getByTestId('language-cs'));
    await settle();
    expect(i18n.language).toBe('cs');
    expect(mockNotifications.schedule).not.toHaveBeenCalled();
    expect(mockNotifications.cancel).not.toHaveBeenCalled();
  });

  it('does not schedule the reminder when notifications are no longer allowed', async () => {
    mockSettings.set('reminder.time', JSON.stringify({ hour: 7, minute: 5 }));
    mockNotifications.granted = false;
    show();
    fireEvent.press(screen.getByTestId('language-cs'));
    await settle();
    expect(mockSettings.get('language')).toBe('cs');
    expect(mockNotifications.schedule).not.toHaveBeenCalled();
  });
});

describe('backup export', () => {
  it('says it is working, ignores further taps, and is ready again afterwards', async () => {
    const running = deferred();
    mockBackup.exportBackup.mockReturnValue(running.promise);
    show();
    expect(screen.queryByTestId('backup-working')).toBeNull();

    fireEvent.press(screen.getByTestId('export-backup'));
    expect(screen.getByTestId('backup-working')).toHaveTextContent(/Working on the backup/);
    fireEvent.press(screen.getByTestId('export-backup'));
    fireEvent.press(screen.getByTestId('import-backup'));
    await settle();
    expect(mockBackup.exportBackup).toHaveBeenCalledTimes(1);
    expect(mockBackup.pickBackupFile).not.toHaveBeenCalled();
    // The language cannot be changed in the middle of it either.
    expect(screen.getByTestId('language-cs')).toBeDisabled();
    fireEvent.press(screen.getByTestId('language-cs'));
    expect(mockSettings.has('language')).toBe(false);

    await act(async () => running.resolve());
    expect(screen.queryByTestId('backup-working')).toBeNull();
    expect(screen.getByTestId('language-cs')).not.toBeDisabled();
    expect(screen.queryByText('The backup could not be created.')).toBeNull();

    fireEvent.press(screen.getByTestId('export-backup'));
    await settle();
    expect(mockBackup.exportBackup).toHaveBeenCalledTimes(2);
  });

  it('starts one backup when the row is tapped twice before the screen is drawn again', async () => {
    const running = deferred();
    mockBackup.exportBackup.mockReturnValue(running.promise);
    show();
    const tap = handlerOf('export-backup');
    act(() => {
      tap();
      tap();
    });
    expect(mockBackup.exportBackup).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('backup-working')).toBeTruthy();

    await act(async () => running.resolve());
    expect(screen.queryByTestId('backup-working')).toBeNull();
    // The guard is released: the next tap starts a backup again.
    fireEvent.press(screen.getByTestId('export-backup'));
    await settle();
    expect(mockBackup.exportBackup).toHaveBeenCalledTimes(2);
  });

  it('tells the user when the backup could not be created', async () => {
    mockBackup.exportBackup.mockRejectedValue(new Error('disk full'));
    show();
    fireEvent.press(screen.getByTestId('export-backup'));
    expect(await screen.findByText('The backup could not be created.')).toBeTruthy();
    expect(screen.queryByTestId('backup-working')).toBeNull();

    // A failure does not leave the screen stuck.
    mockBackup.exportBackup.mockResolvedValue(undefined);
    fireEvent.press(screen.getByTestId('export-backup'));
    await settle();
    expect(mockBackup.exportBackup).toHaveBeenCalledTimes(2);
  });
});

describe('backup restore', () => {
  it('does nothing when no file was picked', async () => {
    const alert = answerAlert(1);
    mockBackup.pickBackupFile.mockResolvedValue(null);
    show();
    fireEvent.press(screen.getByTestId('import-backup'));
    await settle();
    expect(mockBackup.pickBackupFile).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
    expect(mockBackup.importBackup).not.toHaveBeenCalled();
    expect(screen.queryByTestId('backup-working')).toBeNull();
    expect(screen.queryByText(/Backup restored|not a Closet backup/)).toBeNull();
  });

  it('says the file is not a backup when it could not be picked', async () => {
    const alert = answerAlert(1);
    mockBackup.pickBackupFile.mockRejectedValue(new Error('unreadable'));
    show();
    fireEvent.press(screen.getByTestId('import-backup'));
    expect(
      await screen.findByText('This file is not a Closet backup. Nothing was changed.'),
    ).toBeTruthy();
    expect(alert).not.toHaveBeenCalled();
    expect(mockBackup.importBackup).not.toHaveBeenCalled();
  });

  it('warns that everything is replaced and leaves the data alone on cancel', async () => {
    const alert = answerAlert(0);
    show();
    fireEvent.press(screen.getByTestId('import-backup'));
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(alert).toHaveBeenCalledWith(
      'Replace all data?',
      expect.stringMatching(/will be replaced by the contents of the backup/),
      [
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Replace', style: 'destructive' }),
      ],
    );
    await settle();
    expect(mockBackup.importBackup).not.toHaveBeenCalled();
    expect(mockSteps).toEqual([]);
    expect(screen.queryByTestId('backup-working')).toBeNull();
  });

  it('restores the picked file, continues imports, starts no waiting render, and reads everything again', async () => {
    answerAlert(1);
    mockUsage.counts.mockResolvedValue({ month: 0, total: 0 });
    const client = show();
    const reset = jest.spyOn(client, 'resetQueries');
    await settle();
    expect(screen.queryByTestId('stylist-usage')).toBeNull();

    // The restored data has stylist requests the data before it did not.
    mockUsage.counts.mockResolvedValue({ month: 1, total: 4 });
    fireEvent.press(screen.getByTestId('import-backup'));
    expect(await screen.findByText('Backup restored.')).toBeTruthy();
    expect(mockBackup.importBackup).toHaveBeenCalledTimes(1);
    expect(mockBackup.importBackup).toHaveBeenCalledWith(ARCHIVE);
    // Renders that were waiting in the backup fail instead of starting: each is a paid request.
    expect(mockSteps).toEqual(['import', 'imports', 'unfinished renders failed', 'render version']);
    expect(mockRenderVersion).toBe(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('stylist-usage')).toHaveTextContent(
      'Stylist requests: 1 this month, 4 in total',
    );
    expect(screen.queryByTestId('backup-working')).toBeNull();
  });

  it('refuses to restore while photos are being imported, before any file is picked', async () => {
    const alert = answerAlert(1);
    mockImporting = true;
    show();
    fireEvent.press(screen.getByTestId('import-backup'));
    expect(
      await screen.findByText('Photos are still being imported. Restore once that has finished.'),
    ).toBeTruthy();
    await settle();
    expect(mockBackup.pickBackupFile).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    expect(mockBackup.importBackup).not.toHaveBeenCalled();
    expect(mockSteps).toEqual([]);
    expect(screen.queryByTestId('backup-working')).toBeNull();

    // Once the import has finished the restore goes ahead.
    mockImporting = false;
    fireEvent.press(screen.getByTestId('import-backup'));
    expect(await screen.findByText('Backup restored.')).toBeTruthy();
    expect(mockBackup.importBackup).toHaveBeenCalledWith(ARCHIVE);
  });

  it('restores once when the confirmation is answered twice at the same moment', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.[1].onPress?.();
      buttons?.[1].onPress?.();
    });
    show();
    fireEvent.press(screen.getByTestId('import-backup'));
    expect(await screen.findByText('Backup restored.')).toBeTruthy();
    await settle();
    expect(mockBackup.importBackup).toHaveBeenCalledTimes(1);
    expect(mockSteps).toEqual(['import', 'imports', 'unfinished renders failed', 'render version']);
    expect(mockRenderVersion).toBe(1);
  });

  it('takes over the language stored in the restored data', async () => {
    answerAlert(1);
    mockBackup.importBackup.mockImplementation(async () => {
      mockSettings.set('language', 'cs');
    });
    show();
    expect(screen.getByTestId('language-system')).toBeSelected();

    fireEvent.press(screen.getByTestId('import-backup'));
    await waitFor(() => expect(screen.getByTestId('language-cs')).toBeSelected());
    await settle();
    expect(i18n.language).toBe('cs');
    expect(screen.getByText('Jazyk')).toBeTruthy();
    expect(screen.getByTestId('language-system')).not.toBeSelected();
  });

  it('shows that it is working during the restore and ignores an export meanwhile', async () => {
    answerAlert(1);
    const running = deferred();
    mockBackup.importBackup.mockReturnValue(running.promise);
    show();
    fireEvent.press(screen.getByTestId('import-backup'));
    expect(await screen.findByTestId('backup-working')).toBeTruthy();

    fireEvent.press(screen.getByTestId('export-backup'));
    fireEvent.press(screen.getByTestId('import-backup'));
    await settle();
    expect(mockBackup.exportBackup).not.toHaveBeenCalled();
    expect(mockBackup.pickBackupFile).toHaveBeenCalledTimes(1);

    await act(async () => running.resolve());
    expect(await screen.findByText('Backup restored.')).toBeTruthy();
    expect(screen.queryByTestId('backup-working')).toBeNull();
  });

  it.each([
    [
      'a backup from a newer app',
      new BackupError('newer'),
      'This backup comes from a newer version of the app. Update the app and try again.',
    ],
    [
      'a file that is not a backup',
      new BackupError('invalid'),
      'This file is not a Closet backup. Nothing was changed.',
    ],
    [
      'a backup that could not be unpacked here',
      new BackupError('unwritable'),
      'The backup could not be unpacked on this phone, most likely for lack of free space. Restoring needs about twice the size of the backup. Nothing was changed.',
    ],
    ['any other failure', new Error('database locked'), 'Something went wrong. Please try again.'],
  ])('explains %s and restarts nothing', async (_case, error, message) => {
    answerAlert(1);
    mockBackup.importBackup.mockRejectedValue(error);
    const client = show();
    const reset = jest.spyOn(client, 'resetQueries');
    fireEvent.press(screen.getByTestId('import-backup'));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(mockSteps).toEqual([]);
    expect(mockRenderVersion).toBe(0);
    expect(reset).not.toHaveBeenCalled();
    expect(screen.queryByText('Backup restored.')).toBeNull();
    expect(screen.queryByTestId('backup-working')).toBeNull();

    // Another attempt is possible straight away.
    fireEvent.press(screen.getByTestId('import-backup'));
    await settle();
    expect(mockBackup.pickBackupFile).toHaveBeenCalledTimes(2);
  });
});

describe('the rest of settings', () => {
  it('shows the app version and build', async () => {
    show();
    await settle();
    expect(screen.getByText('Version')).toBeTruthy();
    expect(screen.getByText('1.4.0 · Build 27')).toBeTruthy();
  });

  it('shows dashes where the version is not known', async () => {
    mockApplication.version = null;
    mockApplication.build = null;
    show();
    await settle();
    expect(screen.getByText('– · Build –')).toBeTruthy();
  });

  it('opens the AI provider keys', async () => {
    show();
    await settle();
    expect(screen.getByTestId('open-ai-keys')).toHaveTextContent(/AI provider keys/);
    fireEvent.press(screen.getByTestId('open-ai-keys'));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/ai-keys');
  });

  it('counts stylist requests only once there were some', async () => {
    show();
    await settle();
    expect(mockUsage.counts).toHaveBeenCalledWith('stylist');
    expect(screen.queryByTestId('stylist-usage')).toBeNull();
    expect(screen.queryByText(/Stylist requests/)).toBeNull();
  });

  it('shows the stylist requests of this month and in total', async () => {
    mockUsage.counts.mockResolvedValue({ month: 3, total: 12 });
    show();
    expect(await screen.findByTestId('stylist-usage')).toHaveTextContent(
      'Stylist requests: 3 this month, 12 in total',
    );
  });

  it('includes the weather, reminder and display settings', async () => {
    show();
    await settle();
    expect(screen.getByTestId('planning-settings')).toBeTruthy();
    expect(screen.getByTestId('display-settings')).toBeTruthy();
    fireEvent.press(screen.getByTestId('display-open'));
    expect(mockRouter.push).toHaveBeenCalledWith('/display');
  });
});
