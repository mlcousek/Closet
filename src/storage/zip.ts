/**
 * A small zip writer and reader that work one file at a time.
 *
 * A backup holds every photo of the closet. A general zip library builds the
 * whole archive in memory, several times the size of the photos, which a
 * phone cannot afford. These two functions only ever hold the file they are
 * working on. Files are stored uncompressed: photos are compressed already.
 *
 * The reader handles archives written by the writer, and any other zip that
 * stores its entries uncompressed with their sizes in the entry headers.
 */

/** Where an archive is written to, piece by piece. */
export type ArchiveWriter = { write(bytes: Uint8Array): void | Promise<void> };

/** Where an archive is read from. Returns fewer bytes than asked only at the end. */
export type ArchiveReader = { read(length: number): Uint8Array | Promise<Uint8Array> };

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
/** General purpose flag: names are UTF-8. */
const FLAG_UTF8 = 0x0800;
/** General purpose flag: sizes follow the data, which a one-pass reader cannot use. */
const FLAG_DESCRIPTOR = 0x0008;
/** The classic zip format counts sizes and offsets in 32 bits and entries in 16. */
const MAX_SIZE = 0xffffffff;
const MAX_ENTRIES = 0xffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index++) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  // Built in slices, so a large file does not become one enormous string concatenation.
  for (let start = 0; start < bytes.length; start += 3 * 4096) {
    const end = Math.min(bytes.length, start + 3 * 4096);
    let chunk = '';
    for (let index = start; index < end; index += 3) {
      const a = bytes[index];
      const b = index + 1 < end ? bytes[index + 1] : 0;
      const c = index + 2 < end ? bytes[index + 2] : 0;
      chunk += BASE64[a >> 2] + BASE64[((a & 3) << 4) | (b >> 4)];
      chunk += index + 1 < end ? BASE64[((b & 15) << 2) | (c >> 6)] : '=';
      chunk += index + 2 < end ? BASE64[c & 63] : '=';
    }
    parts.push(chunk);
  }
  return parts.join('');
}

const BASE64_VALUE = (() => {
  const values = new Int16Array(128).fill(-1);
  for (let index = 0; index < BASE64.length; index++) values[BASE64.charCodeAt(index)] = index;
  return values;
})();

/** Decodes standard base64. Throws ZipError on anything that is not base64. */
export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/[\r\n\s]/g, '');
  if (clean.length % 4 !== 0) throw new ZipError('Not base64');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((clean.length / 4) * 3 - padding);
  let out = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const values = [0, 1, 2, 3].map((offset) => {
      const code = clean.charCodeAt(index + offset);
      const isPadding = code === 61 && index + offset >= clean.length - padding;
      const value = isPadding ? 0 : code < 128 ? BASE64_VALUE[code] : -1;
      if (value < 0) throw new ZipError('Not base64');
      return value;
    });
    const triple = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    if (out < bytes.length) bytes[out++] = (triple >> 16) & 0xff;
    if (out < bytes.length) bytes[out++] = (triple >> 8) & 0xff;
    if (out < bytes.length) bytes[out++] = triple & 0xff;
  }
  return bytes;
}

function utf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const symbol of text) {
    const code = symbol.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
    }
  }
  return Uint8Array.from(bytes);
}

function fromUtf8(bytes: Uint8Array): string {
  let text = '';
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index++];
    let code = first;
    let more = 0;
    if (first >= 0xf0) [code, more] = [first & 7, 3];
    else if (first >= 0xe0) [code, more] = [first & 15, 2];
    else if (first >= 0xc0) [code, more] = [first & 31, 1];
    for (; more > 0 && index < bytes.length; more--) code = (code << 6) | (bytes[index++] & 63);
    text += String.fromCodePoint(code);
  }
  return text;
}

export const textToBytes = utf8;
export const bytesToText = fromUtf8;

/** Builds a block of little-endian fields: [value, width in bytes] pairs. */
function fields(...parts: [number, 2 | 4][]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((sum, [, width]) => sum + width, 0));
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const [value, width] of parts) {
    if (width === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value >>> 0, true);
    offset += width;
  }
  return bytes;
}

/** MS-DOS time and date, which is what zip entries carry. */
function dosTime(date: Date): { time: number; day: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day:
      ((Math.max(1980, date.getFullYear()) - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

/**
 * Writes a zip archive entry by entry. Call `add` for each file and `finish`
 * once at the end; without `finish` the archive has no index and is not valid.
 */
export function createZipWriter(out: ArchiveWriter, now: Date = new Date()) {
  const { time, day } = dosTime(now);
  const entries: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];
  let offset = 0;
  const write = async (bytes: Uint8Array) => {
    await out.write(bytes);
    offset += bytes.length;
  };

  return {
    async add(path: string, data: Uint8Array): Promise<void> {
      const name = utf8(path);
      if (data.length > MAX_SIZE || offset + data.length > MAX_SIZE) {
        throw new ZipError('The archive would be larger than the zip format allows');
      }
      if (entries.length >= MAX_ENTRIES) throw new ZipError('Too many files for one archive');
      const entry = { name, crc: crc32(data), size: data.length, offset };
      entries.push(entry);
      await write(
        fields(
          [LOCAL_HEADER, 4],
          [20, 2],
          [FLAG_UTF8, 2],
          [0, 2],
          [time, 2],
          [day, 2],
          [entry.crc, 4],
          [entry.size, 4],
          [entry.size, 4],
          [name.length, 2],
          [0, 2],
        ),
      );
      await write(name);
      await write(data);
    },
    async finish(): Promise<void> {
      const start = offset;
      for (const entry of entries) {
        await write(
          fields(
            [CENTRAL_HEADER, 4],
            [20, 2],
            [20, 2],
            [FLAG_UTF8, 2],
            [0, 2],
            [time, 2],
            [day, 2],
            [entry.crc, 4],
            [entry.size, 4],
            [entry.size, 4],
            [entry.name.length, 2],
            [0, 2],
            [0, 2],
            [0, 2],
            [0, 2],
            [0, 4],
            [entry.offset, 4],
          ),
        );
        await write(entry.name);
      }
      const size = offset - start;
      await write(
        fields(
          [END_OF_CENTRAL, 4],
          [0, 2],
          [0, 2],
          [entries.length, 2],
          [entries.length, 2],
          [size, 4],
          [start, 4],
          [0, 2],
        ),
      );
    },
  };
}

/**
 * Reads a zip archive from its start, handing each file to `onEntry` before
 * the next is read. Folder entries are skipped. Throws ZipError for anything
 * that is not such an archive, including a file whose checksum does not match.
 */
export async function readZip(
  source: ArchiveReader,
  onEntry: (path: string, data: Uint8Array) => Promise<void> | void,
): Promise<number> {
  const take = async (length: number): Promise<Uint8Array> => {
    if (length === 0) return new Uint8Array(0);
    const bytes = await source.read(length);
    if (bytes.length !== length) throw new ZipError('The archive ends too early');
    return bytes;
  };
  let count = 0;
  for (;;) {
    const head = await source.read(4);
    if (head.length < 4) {
      // A zip always ends with its index, so running out here means it is cut off or not a zip.
      throw new ZipError(count === 0 ? 'Not a zip archive' : 'The archive ends too early');
    }
    const signature = new DataView(head.buffer, head.byteOffset, 4).getUint32(0, true);
    if (signature === CENTRAL_HEADER || signature === END_OF_CENTRAL) return count;
    if (signature !== LOCAL_HEADER) throw new ZipError('Not a zip archive');

    const header = await take(26);
    const view = new DataView(header.buffer, header.byteOffset, 26);
    const flags = view.getUint16(2, true);
    const method = view.getUint16(4, true);
    const crc = view.getUint32(10, true);
    const packed = view.getUint32(14, true);
    const size = view.getUint32(18, true);
    const nameLength = view.getUint16(22, true);
    const extraLength = view.getUint16(24, true);
    if (flags & FLAG_DESCRIPTOR || method !== 0 || packed !== size) {
      throw new ZipError('The archive is compressed or streamed in a way this app does not read');
    }
    const path = fromUtf8(await take(nameLength));
    await take(extraLength);
    const data = await take(size);
    if (path.endsWith('/')) continue;
    if (crc32(data) !== crc) throw new ZipError(`Damaged file in the archive: ${path}`);
    await onEntry(path, data);
    count++;
  }
}

/** An archive kept in memory, for tests and for small archives. */
export function memoryArchive(initial?: Uint8Array) {
  const chunks: Uint8Array[] = initial ? [initial] : [];
  const bytes = (): Uint8Array => {
    const all = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.length;
    }
    return all;
  };
  return {
    writer: { write: (chunk: Uint8Array) => void chunks.push(chunk.slice()) } as ArchiveWriter,
    bytes,
    reader(): ArchiveReader {
      const all = bytes();
      let position = 0;
      return {
        read(length) {
          const piece = all.subarray(position, Math.min(all.length, position + length));
          position += piece.length;
          return piece;
        },
      };
    },
  };
}
