import * as FileSystem from 'expo-file-system/legacy';

/**
 * File access relative to the app's document directory. Kept behind an interface
 * so storage logic can be unit tested with an in-memory implementation.
 */
export type FsAdapter = {
  /** Absolute URI for a relative path, usable as an image source. */
  uri(path: string): string;
  exists(path: string): Promise<boolean>;
  makeDir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** Moves a file or directory within the document directory. */
  move(fromPath: string, toPath: string): Promise<void>;
  /** Copies a file from any URI into the document directory. */
  copyIn(fromUri: string, toPath: string): Promise<void>;
  /** All files under a directory, recursively, as paths relative to the document directory. */
  listFiles(dir: string): Promise<string[]>;
  readBase64(path: string): Promise<string>;
  writeBase64(path: string, data: string): Promise<void>;
};

const root = () => FileSystem.documentDirectory ?? '';

function parentOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

async function listRecursive(dir: string): Promise<string[]> {
  const info = await FileSystem.getInfoAsync(root() + dir);
  if (!info.exists) return [];
  const names = await FileSystem.readDirectoryAsync(root() + dir);
  const files: string[] = [];
  for (const name of names) {
    const path = `${dir}/${name}`;
    const entry = await FileSystem.getInfoAsync(root() + path);
    if (entry.exists && entry.isDirectory) files.push(...(await listRecursive(path)));
    else files.push(path);
  }
  return files;
}

export const expoFs: FsAdapter = {
  uri: (path) => root() + path,
  exists: async (path) => (await FileSystem.getInfoAsync(root() + path)).exists,
  makeDir: (path) => FileSystem.makeDirectoryAsync(root() + path, { intermediates: true }),
  remove: (path) => FileSystem.deleteAsync(root() + path, { idempotent: true }),
  move: async (fromPath, toPath) => {
    const parent = parentOf(toPath);
    if (parent) await FileSystem.makeDirectoryAsync(root() + parent, { intermediates: true });
    await FileSystem.moveAsync({ from: root() + fromPath, to: root() + toPath });
  },
  copyIn: async (fromUri, toPath) => {
    const parent = parentOf(toPath);
    if (parent) await FileSystem.makeDirectoryAsync(root() + parent, { intermediates: true });
    await FileSystem.copyAsync({ from: fromUri, to: root() + toPath });
  },
  listFiles: listRecursive,
  readBase64: (path) =>
    FileSystem.readAsStringAsync(root() + path, { encoding: FileSystem.EncodingType.Base64 }),
  writeBase64: async (path, data) => {
    const parent = parentOf(path);
    if (parent) await FileSystem.makeDirectoryAsync(root() + parent, { intermediates: true });
    await FileSystem.writeAsStringAsync(root() + path, data, {
      encoding: FileSystem.EncodingType.Base64,
    });
  },
};
