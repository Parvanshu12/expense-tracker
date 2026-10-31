import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;

// Gives `next dev` the bindings from wrangler.jsonc (local D1, rate limiter, vars, .dev.vars secrets).
initOpenNextCloudflareForDev();
