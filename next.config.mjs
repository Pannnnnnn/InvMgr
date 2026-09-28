import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version } = require('./package.json');

// Vercel sets VERCEL_GIT_COMMIT_SHA at build time (not available locally,
// hence the 'dev' fallback). Baking both into NEXT_PUBLIC_* env vars lets
// the app show its own version/commit in a footer (see Footer.tsx) — an
// easy way to confirm which deploy is actually live without digging
// through the Vercel dashboard.
const gitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
