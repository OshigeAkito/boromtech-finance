import { MAX_FILE_BYTES, MAX_FILES } from './files.js';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function parseMultipart(buffer, contentType, limits = {}) {
  if (!Buffer.isBuffer(buffer)) throw fail('BAD_MULTIPART');
  const maxFiles = limits.maxFiles ?? MAX_FILES;
  const maxFileBytes = limits.maxFileBytes ?? MAX_FILE_BYTES;
  // /actual/new submits every control: about 28 fields, plus one part for each
  // of the 4 file inputs (browsers send the empty ones too). A cap of 20 rejected
  // that normal save as TOO_MANY_PARTS.
  const maxFields = limits.maxFields ?? 40;
  const maxFieldChars = limits.maxFieldChars ?? 8000;
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || '');
  const raw = match && (match[1] || match[2]);
  if (!raw || raw.length > 70) throw fail('BAD_MULTIPART');
  const boundary = Buffer.from(`--${raw}`);
  const fields = {};
  const files = [];
  let cursor = buffer.indexOf(boundary);
  if (cursor < 0) throw fail('BAD_MULTIPART');
  cursor += boundary.length;
  let parts = 0;
  while (cursor < buffer.length) {
    if (buffer[cursor] === 45 && buffer[cursor + 1] === 45) break;
    if (!(buffer[cursor] === 13 && buffer[cursor + 1] === 10)) throw fail('BAD_MULTIPART');
    cursor += 2;
    const headerEnd = buffer.indexOf('\r\n\r\n', cursor);
    if (headerEnd < 0) throw fail('BAD_MULTIPART');
    const header = buffer.subarray(cursor, headerEnd).toString('utf8');
    const bodyStart = headerEnd + 4;
    const next = buffer.indexOf(boundary, bodyStart);
    if (next < 0 || next < 2) throw fail('BAD_MULTIPART');
    const bodyEnd = buffer[next - 2] === 13 && buffer[next - 1] === 10 ? next - 2 : next;
    if (bodyEnd < bodyStart) throw fail('BAD_MULTIPART');
    const body = buffer.subarray(bodyStart, bodyEnd);
    parts += 1;
    if (parts > maxFields + maxFiles) throw fail('TOO_MANY_PARTS');
    const disposition = /content-disposition:[^\r\n]*/i.exec(header)?.[0] || '';
    const name = /(?:^|;)\s*name="([^"]*)"/.exec(disposition)?.[1] || '';
    const starred = /filename\*=UTF-8''([^;\r\n]+)/i.exec(header)?.[1];
    let filename = null;
    if (starred) {
      try {
        filename = decodeURIComponent(starred);
      } catch {
        throw fail('BAD_MULTIPART');
      }
    } else {
      const plain = /filename="([^"]*)"/.exec(disposition);
      if (plain) filename = plain[1];
    }
    if (filename != null) {
      if (filename !== '' || body.length !== 0) {
        if (body.length > maxFileBytes) throw fail('FILE_TOO_LARGE');
        if (files.length >= maxFiles) throw fail('TOO_MANY_FILES');
        files.push({ field: name, filename, bytes: Buffer.from(body) });
      }
    } else if (name) {
      if (body.length > maxFieldChars) throw fail('FIELD_TOO_LARGE');
      fields[name] = body.toString('utf8');
    }
    cursor = next + boundary.length;
  }
  return { fields, files };
}
