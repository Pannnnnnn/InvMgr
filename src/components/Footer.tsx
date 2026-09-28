// Shows the deployed app version + short git commit hash at the bottom of
// every page. Both are baked in at build time (see next.config.mjs) so this
// is a quick way to confirm which build is actually live on Vercel without
// digging through the dashboard's deployment list.
export function Footer() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
  const sha = process.env.NEXT_PUBLIC_GIT_SHA ?? 'dev';

  return (
    <footer className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-slate-400">
      FactoryLens v{version} · {sha}
    </footer>
  );
}
