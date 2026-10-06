import * as Application from 'expo-application';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { checkpointDb, closeDb, openDb, setDbLocked } from '@/db/client';
import { LATEST_SCHEMA_VERSION } from '@/db/migrations';
import { setSetting } from '@/db/settings';

import {
  BackupError,
  clearStagedBackup,
  finishRestore,
  hasInterruptedRestore,
  rollbackRestore,
  stageBackupFrom,
  swapInStagedBackup,
  writeBackupArchive,
} from './backup';
import { expoFs } from './fs';

/**
 * Writes a backup to a temporary file and opens the system share sheet for it.
 * The archive goes to disk file by file, so its size is limited by free space
 * and not by memory.
 */
export async function exportBackup(): Promise<void> {
  checkpointDb();
  // The local date, which is the one the user would look for.
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const target = new File(Paths.cache, `closet-backup-${date}.zip`);
  target.create({ overwrite: true });
  const handle = target.open();
  try {
    await writeBackupArchive(
      expoFs,
      {
        schemaVersion: LATEST_SCHEMA_VERSION,
        appVersion: Application.nativeApplicationVersion ?? 'unknown',
      },
      { write: (bytes) => handle.writeBytes(bytes) },
    );
  } catch (error) {
    handle.close();
    // Half an archive is worse than none: it would look like a backup.
    if (target.exists) target.delete();
    throw error;
  }
  handle.close();
  await Sharing.shareAsync(target.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' });
}

/** Lets the user pick a backup file. Returns where it is, or null if they cancelled. */
export async function pickBackupFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

/**
 * Replaces all data with the contents of the archive at `archiveUri`. The
 * archive is validated and unpacked before anything is touched, and the
 * previous data is kept until the restored database has opened, so a bad
 * archive throws BackupError and leaves the app as it was.
 */
export async function importBackup(archiveUri: string): Promise<void> {
  const archive = new File(archiveUri);
  if (!archive.exists) throw new BackupError('invalid');
  const handle = archive.open();
  try {
    const size = handle.size ?? 0;
    let position = 0;
    await stageBackupFrom(
      expoFs,
      {
        // Never asks for more than the file holds, so the end is seen as a short read.
        read: (length) => {
          // An entry that claims more than is left is not read at all: loading the rest of
          // a large file just to reject it could use more memory than the phone has.
          if (length <= 0 || length > size - position) return new Uint8Array(0);
          position += length;
          return handle.readBytes(length);
        },
      },
      LATEST_SCHEMA_VERSION,
    );
  } finally {
    handle.close();
    // The picker made its own copy of the archive, which can be as large as the closet.
    if (archive.exists) archive.delete();
  }

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
  // The restore has worked by now; a failure to tidy up must not be reported as a failure.
  await finishRestore(expoFs).catch(() => {});
  // Whether a key works was tested on the phone the backup came from; the keys themselves
  // never travel with a backup.
  for (const provider of ['anthropic', 'image']) setSetting(`ai.status.${provider}`, null);
}

/**
 * Run once at start, before any screen reads data. If the app was closed in
 * the middle of a restore, after the data in use had been set aside, that data
 * is put back; the database opened at launch was an empty stand-in and is
 * replaced. Returns true when data was put back. Leftovers of a restore that
 * never got that far are removed.
 */
export async function recoverInterruptedRestore(): Promise<boolean> {
  if (!(await hasInterruptedRestore(expoFs))) {
    await clearStagedBackup(expoFs);
    return false;
  }
  setDbLocked(true);
  closeDb();
  try {
    await rollbackRestore(expoFs);
  } finally {
    setDbLocked(false);
    openDb();
  }
  await clearStagedBackup(expoFs);
  return true;
}
