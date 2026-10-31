import fs from 'node:fs/promises';
import path from 'node:path';

// Files under public/. On Node they are read from disk; the Cloudflare Worker
// passes its own reader backed by the ASSETS binding.
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function assetType(name) {
  return TYPES[path.posix.extname(name).toLowerCase()] || null;
}

// A path inside one public/ folder, or null for anything that could leave it.
export function assetPath(dir, rest) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(rest ?? '').replace(/^\/+/, ''));
  } catch {
    return null;
  }
  if (!decoded || decoded.includes('\\') || decoded.includes('\0')) return null;
  const parts = decoded.split('/');
  if (parts.some((part) => !part || part.startsWith('.'))) return null;
  if (!assetType(decoded)) return null;
  return `${dir}/${decoded}`;
}

export function diskAssets(root) {
  return {
    async read(relative) {
      try {
        return await fs.readFile(path.join(root, ...relative.split('/')));
      } catch {
        return null;
      }
    },
  };
}
