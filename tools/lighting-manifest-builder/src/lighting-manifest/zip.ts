export interface ZipFileInput {
  path: string;
  data: string | Blob | Uint8Array;
}

const encoder = new TextEncoder();
const crcTable = makeCrcTable();

export async function createZipBlob(files: ZipFileInput[]): Promise<Blob> {
  const records: { path: string; data: Uint8Array; crc: number; localOffset: number }[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const path = sanitizeZipPath(file.path);
    const data = await toBytes(file.data);
    const crc = crc32(data);
    const header = localHeader(path, data, crc);
    chunks.push(header, data);
    records.push({ path, data, crc, localOffset: offset });
    offset += header.byteLength + data.byteLength;
  }
  const centralStart = offset;
  for (const record of records) {
    const central = centralHeader(record.path, record.data, record.crc, record.localOffset);
    chunks.push(central);
    offset += central.byteLength;
  }
  chunks.push(endOfCentralDirectory(records.length, offset - centralStart, centralStart));
  return new Blob(chunks as unknown as BlobPart[], { type: 'application/zip' });
}

export function sanitizeZipPath(path: string): string {
  const parts = path.replaceAll('\\', '/').replace(/^\/+/, '').split('/').filter((part) => part && part !== '.' && part !== '..');
  return parts.join('/') || 'artifact.bin';
}

async function toBytes(data: string | Blob | Uint8Array): Promise<Uint8Array> {
  if (typeof data === 'string') return encoder.encode(data);
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(await data.arrayBuffer());
}

function localHeader(path: string, data: Uint8Array, crc: number): Uint8Array {
  const name = encoder.encode(path);
  const out = new Uint8Array(30 + name.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, name.length, true);
  out.set(name, 30);
  return out;
}

function centralHeader(path: string, data: Uint8Array, crc: number, localOffset: number): Uint8Array {
  const name = encoder.encode(path);
  const out = new Uint8Array(46 + name.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, data.length, true);
  view.setUint32(24, data.length, true);
  view.setUint16(28, name.length, true);
  view.setUint32(42, localOffset, true);
  out.set(name, 46);
  return out;
}

function endOfCentralDirectory(fileCount: number, centralSize: number, centralStart: number): Uint8Array {
  const out = new Uint8Array(22);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralStart, true);
  return out;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
}
