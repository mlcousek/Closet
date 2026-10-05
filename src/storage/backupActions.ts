import * as Application from 'expo-application';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { checkpointDb, closeDb, openDb, setDbLocked } from '@/db/client';
import { LATEST_SCHEMA_VERSION } from '@/db/migrations';

import {
  BackupError,
  createBackupArchive,
  finishRestore,
  rollbackRestore,
  stageBackup,
  swapInStagedBackup,
} from './backup';
import { expoFs } from './fs';

const base64 = { encoding: FileSystem.EncodingType.Base64 };

/** Writes a backup to a temporary file and opens the system share sheet for it. */
export async function exportBackup(): Promise<void> {
  checkpointDb();
  const archive = await createBackupArchive(expoFs, {
    schemaVersion: LATEST_SCHEMA_VERSION,
    appVersion: Application.nativeApplicationVersion ?? 'unknown',
  });
  const date = new Date().toISOString().slice(0, 10);
  const target = `${FileSystem.cacheDirectory}closet-backup-${date}.zip`;
  await FileSystem.writeAsStringAsync(target, archive, base64);
  await Sharing.shareAsync(target, { mimeType: 'application/zip', UTI: 'public.zip-archive' });
}

/** Lets the user pick a backup file. Returns its contents, or null if they cancelled. */
export async function pickBackupFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) return null;
  return FileSystem.readAsStringAsync(result.assets[0].uri, base64);
}

/**
 * Replaces all data with the archive contents. The archive is validated and
 * unpacked before anything is touched, and the previous data is kept until the
 * restored database has opened, so a bad archive throws BackupError and leaves
 * the app as it was.
 */
export async function importBackup(archiveBase64: string): Promise<void> {
  await stageBackup(expoFs, archiveBase64, LATEST_SCHEMA_VERSION);

  // From here until the database is open again nothing else may open it.
  setDbLocked(true);
  closeDb();
  try {
    await swapInStagedBackup(expoFs);
    try {
      setDbLocked(false);
      openDb();
    } catch {
      // The restored file would not open or migrate: go back to the previous data.
      closeDb();
      setDbLocked(true);
      await rollbackRestore(expoFs);
      throw new BackupError('invalid');
    }
  } finally {
    setDbLocked(false);
    openDb();
  }
  await finishRestore(expoFs);
}
