import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnv } from '../lib/dotenv.js';
import { importForecastFile } from '../lib/import-forecast.js';
import { createSupabaseStore } from '../lib/supabase-store.js';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotEnv(path.join(repoRoot, '.env'));

const filePath = process.argv[2];
if (!filePath || process.argv.length !== 3) {
  console.error('usage: npm run import-forecast -- <path-outside-the-repo>');
  process.exit(1);
}

const messages = {
  INSIDE_REPO: 'refusing to import a file inside the repository',
  NOT_FOUND: 'file not found',
  TOO_LARGE: 'file is too large',
  NOT_CONFIGURED: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
  STORE: 'import failed',
};

try {
  const store = createSupabaseStore({
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const result = await importForecastFile({ filePath, repoRoot, store });
  console.log(`imported ${result.months} months`);
} catch (error) {
  const code = error && error.code;
  if (code === 'INVALID' && Array.isArray(error.details) && error.details.length) {
    console.error(error.details.join('\n'));
  } else {
    console.error(messages[code] || 'import failed');
  }
  process.exit(1);
}
