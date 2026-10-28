export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 4;

const TYPES = [
  { type: 'application/pdf', magic: Buffer.from('%PDF') },
  { type: 'image/jpeg', magic: Buffer.from([0xff, 0xd8, 0xff]) },
  { type: 'image/png', magic: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
];

export function detectFileType(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_FILE_BYTES) return null;
  const found = TYPES.find((item) => (
    bytes.length >= item.magic.length && bytes.subarray(0, item.magic.length).equals(item.magic)
  ));
  return found ? found.type : null;
}

export function safeFilename(name) {
  const base = String(name ?? '').replace(/\\/g, '/').split('/').pop() || '';
  const cleaned = base.replace(/[^\w.\- ()\u0E00-\u0E7F]/gu, '').replace(/^\.+/, '').slice(0, 80);
  return cleaned || 'receipt';
}

export function contentDisposition(filename) {
  const safe = safeFilename(filename);
  const ascii = safe.replace(/[^\w.\- ]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'receipt';
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

const FILE_KIND_BY_FIELD = {
  receiptFile: 'receipt',
  paymentFile: 'payment_proof',
  screenshotFile: 'screenshot',
  assignmentFile: 'assignment',
};

export function validateUploads(files, { required = false } = {}) {
  const errors = [];
  const accepted = [];
  if (!Array.isArray(files)) return { errors: ['The attachments are not valid'], files: [] };
  if (required && files.length === 0) errors.push('Attach at least 1 proof file (PDF, JPG or PNG)');
  if (files.length > MAX_FILES) errors.push(`Attach at most ${MAX_FILES} files`);
  for (const file of files.slice(0, MAX_FILES)) {
    const kind = FILE_KIND_BY_FIELD[file.field];
    const type = detectFileType(file.bytes);
    if (!kind || !type) {
      errors.push('Only PDF, JPG or PNG files, up to 5 MB each');
      continue;
    }
    accepted.push({
      filename: safeFilename(file.filename),
      contentType: type,
      bytes: file.bytes,
      kind,
    });
  }
  return { errors, files: errors.length ? [] : accepted };
}
