// Cloudflare Workers entry. The same Express app as server.js; files under
// public/ come from the ASSETS binding, and a daily cron touches Supabase so
// the free project is not paused for inactivity.
import { env } from 'cloudflare:workers';
import { handleAsNodeRequest } from 'cloudflare:node';
import { createApp } from './server.js';
import { readConfig } from './lib/config.js';
import { createSupabaseStore } from './lib/supabase-store.js';

const PORT = 8080;

const assets = {
  async read(relative) {
    const response = await env.ASSETS.fetch(new URL(`/${relative}`, 'https://assets.invalid'));
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  },
};

createApp({ env, assets }).listen(PORT);

export default {
  fetch(request, workerEnv, ctx) {
    return handleAsNodeRequest(PORT, request, workerEnv, ctx);
  },

  async scheduled() {
    const config = readConfig(env);
    const store = createSupabaseStore({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
    });
    if (!store.configured) return;
    await store.loadForecast();
  },
};
