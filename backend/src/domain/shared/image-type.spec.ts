import { detectImageType } from './image-type';

const bytes = (...values: number[]) =>
  Buffer.from([...values, 0x00, 0x01, 0x02, 0x03]);

describe('detectImageType', () => {
  it.each([
    ['JPEG', bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg'],
    ['PNG', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/png'],
    [
      'WebP',
      Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0x24, 0, 0, 0]),
        Buffer.from('WEBPVP8 '),
      ]),
      'image/webp',
    ],
  ])('recognizes %s from its magic bytes', (_label, body, expected) => {
    expect(detectImageType(body)).toBe(expected);
  });

  it.each([
    ['HTML', Buffer.from('<html><script>alert(1)</script>')],
    ['an empty body', Buffer.alloc(0)],
    ['GIF', Buffer.from('GIF89a......')],
    [
      'RIFF that is not WebP',
      Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0x24, 0, 0, 0]),
        Buffer.from('WAVEfmt '),
      ]),
    ],
    ['a truncated PNG signature', Buffer.from([0x89, 0x50, 0x4e])],
    [
      'a WebP header shorter than 12 bytes',
      Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0, 0, 0, 0]),
        Buffer.from('WEB'),
      ]),
    ],
  ])('rejects %s', (_label, body) => {
    expect(detectImageType(body)).toBeNull();
  });
});
