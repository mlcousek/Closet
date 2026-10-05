import JSZip from 'jszip';

import type { FsAdapter } from './fs';
import { IMAGES_DIR } from './imageStore';

export const DB_FILE = 'SQLite/closet.db';
const DB_SIDE_FILES = [`${DB_FILE}-wal`, `${DB_FILE}-shm`];
const MANIFEST = 'manifest.json';
const DB_ENTRY = 'closet.db';
const APP_ID = 'closet';

/** Where an archive is unpacked before it replaces anything. */
const STAGING_DIR = 'restore-staging';
/** Where the current data waits until the restored data is known to work. */
const PREVIOUS_DIR = 'restore-previous';

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
 * Packs the database file and every stored image into one zip, returned as base64.
 * Provider keys live in the device keychain and are never part of the archive.
 * The caller must checkpoint the database first so the file on disk is complete.
 */
export async function createBackupArchive(
  fs: FsAdapter,
  info: { schemaVersion: number; appVersion: string; now?: Date },
): Promise<string> {
  const zip = new JSZip();
  const manifest: BackupManifest = {
    app: APP_ID,
    formatVersion: 1,
    schemaVersion: info.schemaVersion,
    appVersion: info.appVersion,
    createdAt: (info.now ?? new Date()).toISOString(),
  };
  zip.file(MANIFEST, JSON.stringify(manifest));
  zip.file(DB_ENTRY, await fs.readBase64(DB_FILE), { base64: true });
  for (const path of await fs.listFiles(IMAGES_DIR)) {
    zip.file(path, await fs.readBase64(path), { base64: true });
  }
  return zip.generateAsync({ type: 'base64', compression: 'STORE' });
}

function isSafeImagePath(path: string): boolean {
  return path.startsWith(`${IMAGES_DIR}/`) && !path.split('/').includes('..');
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
 * staging folder. Live data is not touched, so any failure here (not a backup,
 * damaged entry, disk full) leaves the app exactly as it was.
 */
export async function stageBackup(
  fs: FsAdapter,
  archiveBase64: string,
  currentSchemaVersion: number,
): Promise<BackupManifest> {
  await fs.remove(STAGING_DIR);
  try {
    let zip: JSZip;
    let manifest: BackupManifest;
    try {
      zip = await JSZip.loadAsync(archiveBase64, { base64: true, checkCRC32: true });
      const manifestFile = zip.file(MANIFEST);
      if (!manifestFile || !zip.file(DB_ENTRY)) throw new Error('missing entries');
      manifest = JSON.parse(await manifestFile.async('string'));
    } catch {
      throw new BackupError('invalid');
    }
    if (
      manifest?.app !== APP_ID ||
      manifest.formatVersion !== 1 ||
      !Number.isInteger(manifest.schemaVersion)
    ) {
      throw new BackupError('invalid');
    }
    if (manifest.schemaVersion > currentSchemaVersion) throw new BackupError('newer');

    const imageEntries = Object.values(zip.files).filter(
      (entry) => !entry.dir && entry.name !== MANIFEST && entry.name !== DB_ENTRY,
    );
    if (!imageEntries.every((entry) => isSafeImagePath(entry.name))) {
      throw new BackupError('invalid');
    }

    const dbEntry = zip.file(DB_ENTRY)!;
    try {
      if (!looksLikeSqlite(await dbEntry.async('uint8array'))) throw new Error('not sqlite');
      await fs.writeBase64(`${STAGING_DIR}/${DB_ENTRY}`, await dbEntry.async('base64'));
      for (const entry of imageEntries) {
        await fs.writeBase64(`${STAGING_DIR}/${entry.name}`, await entry.async('base64'));
      }
    } catch {
      throw new BackupError('invalid');
    }
    return manifest;
  } catch (error) {
    await fs.remove(STAGING_DIR);
    throw error;
  }
}

/**
 * Step 2: sets the current data aside and moves the staged data into place.
 * The database must be closed. If anything fails the previous data is put back.
 */
export async function swapInStagedBackup(fs: FsAdapter): Promise<void> {
  await fs.remove(PREVIOUS_DIR);
  try {
    for (const side of DB_SIDE_FILES) await fs.remove(side);
    if (await fs.exists(DB_FILE)) await fs.move(DB_FILE, `${PREVIOUS_DIR}/${DB_ENTRY}`);
    if (await fs.exists(IMAGES_DIR)) await fs.move(IMAGES_DIR, `${PREVIOUS_DIR}/${IMAGES_DIR}`);
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
  await fs.remove(IMAGES_DIR);
  if (await fs.exists(previousImages)) await fs.move(previousImages, IMAGES_DIR);
  await fs.remove(PREVIOUS_DIR);
}

/** Step 3: discards the data that was set aside, once the restored database has opened. */
export async function finishRestore(fs: FsAdapter): Promise<void> {
  await fs.remove(PREVIOUS_DIR);
}
