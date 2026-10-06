import type { FsAdapter } from './fs';
import { IMAGES_DIR } from './imageStore';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToText,
  createZipWriter,
  memoryArchive,
  readZip,
  textToBytes,
  type ArchiveReader,
  type ArchiveWriter,
} from './zip';

export const DB_FILE = 'SQLite/closet.db';
const DB_SIDE_FILES = [`${DB_FILE}-wal`, `${DB_FILE}-shm`];
const MANIFEST = 'manifest.json';
const DB_ENTRY = 'closet.db';
const APP_ID = 'closet';

/** Where an archive is unpacked before it replaces anything. */
const STAGING_DIR = 'restore-staging';
/** Where the current data waits until the restored data is known to work. */
const PREVIOUS_DIR = 'restore-previous';
/** Where the previous data goes once the restore has worked, on its way to being deleted. */
const DISCARD_DIR = 'restore-discard';
/** Present from the moment a restore has worked until its leftovers are gone. */
const DONE_MARKER = 'restore-done';

const SQLITE_HEADER = 'SQLite format 3\u0000';

export type BackupManifest = {
  app: typeof APP_ID;
  formatVersion: 1;
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
};

export type BackupErrorReason = 'invalid' | 'newer';

export class BackupError extends Error {
  constructor(public reason: BackupErrorReason) {
    super(`Backup rejected: ${reason}`);
    this.name = 'BackupError';
  }
}

/**
 * Writes the database file and every stored image into one zip, one file at a
 * time, so a large closet never has to fit in memory. Provider keys live in
 * the device keychain and are never part of the archive. The caller must
 * checkpoint the database first so the file on disk is complete.
 */
export async function writeBackupArchive(
  fs: FsAdapter,
  info: { schemaVersion: number; appVersion: string; now?: Date },
  out: ArchiveWriter,
): Promise<void> {
  const now = info.now ?? new Date();
  const manifest: BackupManifest = {
    app: APP_ID,
    formatVersion: 1,
    schemaVersion: info.schemaVersion,
    appVersion: info.appVersion,
    createdAt: now.toISOString(),
  };
  const zip = createZipWriter(out, now);
  // The manifest comes first, so a restore knows what it is reading before anything else.
  await zip.add(MANIFEST, textToBytes(JSON.stringify(manifest)));
  await zip.add(DB_ENTRY, await fs.readBytes(DB_FILE));
  for (const path of await fs.listFiles(IMAGES_DIR)) {
    await zip.add(path, await fs.readBytes(path));
  }
  await zip.finish();
}

/** The same archive as base64, held in memory. For tests and small data only. */
export async function createBackupArchive(
  fs: FsAdapter,
  info: { schemaVersion: number; appVersion: string; now?: Date },
): Promise<string> {
  const archive = memoryArchive();
  await writeBackupArchive(fs, info, archive.writer);
  return bytesToBase64(archive.bytes());
}

/**
 * True for a path the app itself could have written: under the image folder,
 * every part made of plain letters, digits, dot, dash and underscore. Anything
 * else is refused. A name is later used as part of a file URL, where "%2e%2e"
 * means "..", and "?" or "#" cut the path short, so a crafted archive could
 * otherwise write outside the folder it is unpacked into.
 */
export function isSafeImagePath(path: string): boolean {
  const parts = path.split('/');
  return (
    parts.length >= 2 &&
    parts[0] === IMAGES_DIR &&
    parts.every((part) => /^[A-Za-z0-9._-]+$/.test(part) && part !== '.' && part !== '..')
  );
}

function looksLikeSqlite(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_HEADER.length) return false;
  for (let index = 0; index < SQLITE_HEADER.length; index++) {
    if (bytes[index] !== SQLITE_HEADER.charCodeAt(index)) return false;
  }
  return true;
}

/**
 * Step 1 of a restore: validates the archive and unpacks all of it into a
 * staging folder, one file at a time. Live data is not touched, so any failure
 * here (not a backup, damaged entry, disk full) leaves the app exactly as it was.
 */
export async function stageBackupFrom(
  fs: FsAdapter,
  source: ArchiveReader,
  currentSchemaVersion: number,
): Promise<BackupManifest> {
  await fs.remove(STAGING_DIR);
  try {
    let manifest: BackupManifest | null = null;
    let hasDb = false;
    try {
      await readZip(source, async (path, data) => {
        if (path === MANIFEST) {
          manifest = JSON.parse(bytesToText(data)) as BackupManifest;
          if (
            manifest?.app !== APP_ID ||
            manifest.formatVersion !== 1 ||
            !Number.isInteger(manifest.schemaVersion)
          ) {
            throw new BackupError('invalid');
          }
          // Known before any photo is unpacked, so a backup from a newer app stops at once.
          if (manifest.schemaVersion > currentSchemaVersion) throw new BackupError('newer');
          return;
        }
        if (path === DB_ENTRY) {
          if (!looksLikeSqlite(data)) throw new BackupError('invalid');
          hasDb = true;
        } else if (!isSafeImagePath(path)) {
          throw new BackupError('invalid');
        }
        await fs.writeBytes(`${STAGING_DIR}/${path}`, data);
      });
    } catch (error) {
      // Whatever went wrong while reading (not a zip, damaged, disk full), it is not a
      // backup this app can restore; only "newer" has its own message.
      throw error instanceof BackupError ? error : new BackupError('invalid');
    }
    if (!manifest || !hasDb) throw new BackupError('invalid');
    return manifest;
  } catch (error) {
    await fs.remove(STAGING_DIR);
    throw error;
  }
}

/** The same step for an archive given as base64. For tests and small data only. */
export async function stageBackup(
  fs: FsAdapter,
  archiveBase64: string,
  currentSchemaVersion: number,
): Promise<BackupManifest> {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(archiveBase64);
  } catch {
    throw new BackupError('invalid');
  }
  return stageBackupFrom(fs, memoryArchive(bytes).reader(), currentSchemaVersion);
}

/** True when a restore was cut off after the current data had been set aside. */
export async function hasInterruptedRestore(fs: FsAdapter): Promise<boolean> {
  // Leftovers of a restore that worked are only waiting to be deleted.
  if (await fs.exists(DONE_MARKER)) return false;
  return (
    (await fs.exists(`${PREVIOUS_DIR}/${DB_ENTRY}`)) ||
    (await fs.exists(`${PREVIOUS_DIR}/${IMAGES_DIR}`))
  );
}

/** Removes what an abandoned restore left behind before it touched live data. */
export async function clearStagedBackup(fs: FsAdapter): Promise<void> {
  await fs.remove(STAGING_DIR);
  if (await fs.exists(DONE_MARKER)) await discardPrevious(fs);
  await fs.remove(DISCARD_DIR);
}

/**
 * Step 2: sets the current data aside and moves the staged data into place.
 * The database must be closed. If anything fails the previous data is put back.
 */
export async function swapInStagedBackup(fs: FsAdapter): Promise<void> {
  await fs.remove(PREVIOUS_DIR);
  await fs.remove(DONE_MARKER);
  try {
    for (const side of DB_SIDE_FILES) await fs.remove(side);
    // Either of the two in the set-aside folder marks a restore under way, so a start-up
    // after a crash at any point between these moves finds everything that was moved.
    if (await fs.exists(IMAGES_DIR)) await fs.move(IMAGES_DIR, `${PREVIOUS_DIR}/${IMAGES_DIR}`);
    if (await fs.exists(DB_FILE)) await fs.move(DB_FILE, `${PREVIOUS_DIR}/${DB_ENTRY}`);
    await fs.move(`${STAGING_DIR}/${DB_ENTRY}`, DB_FILE);
    if (await fs.exists(`${STAGING_DIR}/${IMAGES_DIR}`)) {
      await fs.move(`${STAGING_DIR}/${IMAGES_DIR}`, IMAGES_DIR);
    }
  } catch (error) {
    await rollbackRestore(fs);
    throw error;
  } finally {
    await fs.remove(STAGING_DIR);
  }
}

/** Puts back the data that was set aside by swapInStagedBackup. The database must be closed. */
export async function rollbackRestore(fs: FsAdapter): Promise<void> {
  const previousDb = `${PREVIOUS_DIR}/${DB_ENTRY}`;
  const previousImages = `${PREVIOUS_DIR}/${IMAGES_DIR}`;
  for (const side of DB_SIDE_FILES) await fs.remove(side);
  if (await fs.exists(previousDb)) {
    await fs.remove(DB_FILE);
    await fs.move(previousDb, DB_FILE);
  }
  // The photos in place are only replaced when the user's own were really set aside;
  // otherwise they are the user's own and must stay.
  if (await fs.exists(previousImages)) {
    await fs.remove(IMAGES_DIR);
    await fs.move(previousImages, IMAGES_DIR);
  }
  await fs.remove(PREVIOUS_DIR);
}

/** Step 3: discards the data that was set aside, once the restored database has opened. */
export async function finishRestore(fs: FsAdapter): Promise<void> {
  // Written first: from here on the restore counts as done, whatever happens to the
  // clean-up below. Deleting a large folder takes time and can fail or be cut off.
  await fs.writeBase64(DONE_MARKER, '');
  await discardPrevious(fs);
}

async function discardPrevious(fs: FsAdapter): Promise<void> {
  await fs.remove(DISCARD_DIR);
  if (await fs.exists(PREVIOUS_DIR)) await fs.move(PREVIOUS_DIR, DISCARD_DIR);
  await fs.remove(DISCARD_DIR);
  await fs.remove(PREVIOUS_DIR);
  await fs.remove(DONE_MARKER);
}
