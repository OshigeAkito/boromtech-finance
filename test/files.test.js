import assert from 'node:assert/strict';
import test from 'node:test';
import { contentDisposition, detectFileType, safeFilename, validateUploads } from '../lib/files.js';
import { parseMultipart } from '../lib/multipart.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('receipt types are detected from bytes and names stay inside one path segment', () => {
  assert.equal(detectFileType(PNG), 'image/png');
  assert.equal(detectFileType(Buffer.from('%PDF-1.4\n')), 'application/pdf');
  assert.equal(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(detectFileType(Buffer.from('GIF89a')), null);
  assert.equal(safeFilename('../../ใบเสร็จ.png'), 'ใบเสร็จ.png');
  assert.equal(safeFilename(''), 'receipt');
  const header = contentDisposition('ใบเสร็จ.png');
  assert.equal(header.includes('\n'), false);
  assert.equal(header.includes('"ใบ'), false);
  assert.match(header, /filename\*=UTF-8''/);
});

test('uploads reject the wrong type and accept a small png', () => {
  const bad = validateUploads([{ filename: 'a.gif', bytes: Buffer.from('GIF89a') }], { required: true });
  assert.equal(bad.files.length, 0);
  const good = validateUploads([{ field: 'receiptFile', filename: '../a.png', bytes: PNG }], { required: true });
  assert.equal(good.errors.length, 0);
  assert.equal(good.files[0].contentType, 'image/png');
  assert.equal(good.files[0].filename, 'a.png');
  assert.equal(good.files[0].kind, 'receipt');
  const missing = validateUploads([], { required: true });
  assert.equal(missing.files.length, 0);
});

test('multipart keeps binary bodies and skips an empty file input', () => {
  const boundary = '----bt-boundary';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="csrf"\r\n\r\nabc\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="receipt"; filename="note.png"\r\nContent-Type: image/png\r\n\r\n`),
    PNG,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="receipt"; filename=""\r\n\r\n\r\n`),
    Buffer.from(`--${boundary}--\r\n`),
  ]);
  const parsed = parseMultipart(body, `multipart/form-data; boundary=${boundary}`);
  assert.equal(parsed.fields.csrf, 'abc');
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].filename, 'note.png');
  assert.equal(Buffer.compare(parsed.files[0].bytes, PNG), 0);
});
