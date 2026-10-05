import JSZip from 'jszip';

import type { FsAdapter } from './fs';
import { IMAGES_DIR } from './imageStore';

export const DB_FILE = 'SQLite/closet.db';
const DB_SIDE_FILES = [`${DB_FILE}-wal`, `${DB_FILE}-shm`];
const MANIFEST = 'manifest.json';
const DB_ENTRY = 'closet.db';
const APP_ID = 'closet';

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

/**
 * Validates an archive completely before touching anything on disk, then replaces
 * the database file and the image folder. The caller must close the database
 * before and reopen it after.
 */
export async function restoreBackupArchive(
  fs: FsAdapter,
  archiveBase64: string,
  currentSchemaVersion: number,
): Promise<BackupManifest> {
  let zip: JSZip;
  let manifest: BackupManifest;
  try {
    zip = await JSZip.loadAsync(archiveBase64, { base64: true });
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
  if (!imageEntries.every((entry) => isSafeImagePath(entry.name))) throw new BackupError('invalid');

  const dbData = await zip.file(DB_ENTRY)!.async('base64');

  await fs.remove(IMAGES_DIR);
  for (const side of DB_SIDE_FILES) await fs.remove(side);
  await fs.writeBase64(DB_FILE, dbData);
  for (const entry of imageEntries) {
    await fs.writeBase64(entry.name, await entry.async('base64'));
  }
  return manifest;
}
