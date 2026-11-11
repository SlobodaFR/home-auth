export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** Shared by the upload interceptor (read limit) and the upload use case. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const startsWith = (body: Buffer, signature: number[], offset = 0) =>
  body.length >= offset + signature.length &&
  signature.every((byte, i) => body[offset + i] === byte);

const ascii = (text: string) => [...Buffer.from(text, 'ascii')];

/**
 * Image type from the content itself (magic bytes), never from what the client declares:
 * a declared type can lie (e.g. HTML sent as image/png). Only JPEG, PNG and WebP are allowed.
 */
export function detectImageType(body: Buffer): ImageType | null {
  if (startsWith(body, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (startsWith(body, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith(body, ascii('RIFF')) && startsWith(body, ascii('WEBP'), 8)) {
    return 'image/webp';
  }
  return null;
}
