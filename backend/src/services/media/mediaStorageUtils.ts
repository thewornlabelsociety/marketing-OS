import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export function mediaStorageRoot(): string {
  return process.env.MEDIA_STORAGE_ROOT ?? path.join(process.cwd(), 'data', 'media');
}

export function workspaceMediaDir(workspaceId: string): string {
  return path.join(mediaStorageRoot(), workspaceId);
}

export function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(JPEG_MAGIC)) return 'image/jpeg';
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(PNG_MAGIC)) return 'image/png';
  return null;
}

export function sha256Checksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function resolveStoragePath(workspaceId: string, storageKey: string): string {
  const root = path.resolve(workspaceMediaDir(workspaceId));
  const resolved = path.resolve(root, storageKey);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error('Invalid storage key');
  }
  return resolved;
}
