import type { FsAdapter } from './fs';
import { base64ToBytes, bytesToBase64 } from './zip';

/** In-memory file system for unit tests. File contents are base64 strings. */
export function createMemoryFs(initial: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(initial));
  /** Contents of files outside the document directory that copyIn can read. */
  const external = new Map<string, string>();

  /** Destinations for which the next move fails once, to simulate a write error. */
  const failMoveTo = new Set<string>();

  const fs: FsAdapter = {
    uri: (path) => `file:///documents/${path}`,
    exists: async (path) =>
      files.has(path) || [...files.keys()].some((key) => key.startsWith(`${path}/`)),
    makeDir: async () => {},
    remove: async (path) => {
      for (const key of [...files.keys()]) {
        if (key === path || key.startsWith(`${path}/`)) files.delete(key);
      }
    },
    move: async (fromPath, toPath) => {
      if (failMoveTo.delete(toPath)) throw new Error(`Cannot move to ${toPath}`);
      for (const key of [...files.keys()]) {
        if (key === fromPath || key.startsWith(`${fromPath}/`)) {
          files.set(toPath + key.slice(fromPath.length), files.get(key)!);
          files.delete(key);
        }
      }
    },
    copyIn: async (fromUri, toPath) => {
      const data = external.get(fromUri);
      if (data === undefined) throw new Error(`No such file: ${fromUri}`);
      files.set(toPath, data);
    },
    listFiles: async (dir) => [...files.keys()].filter((key) => key.startsWith(`${dir}/`)).sort(),
    readBase64: async (path) => {
      const data = files.get(path);
      if (data === undefined) throw new Error(`No such file: ${path}`);
      return data;
    },
    writeBase64: async (path, data) => {
      files.set(path, data);
    },
    readBytes: async (path) => {
      const data = files.get(path);
      if (data === undefined) throw new Error(`No such file: ${path}`);
      return base64ToBytes(data);
    },
    writeBytes: async (path, data) => {
      files.set(path, bytesToBase64(data));
    },
  };

  return { fs, files, external, failMoveTo };
}
