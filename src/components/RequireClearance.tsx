'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';
import type { Clearance } from '@/lib/roles';

/**
 * Gates a page behind an approved clearance level (client-side UX only —
 * the real enforcement is server-side via requireManager()/requireOwner()
 * in src/lib/auth.ts). `min={1}` restricts to owners only (e.g. /admin);
 * the default `min={2}` allows either clearance 1 or 2 (the existing
 * manager-gated pages — /inventory, /transactions).
 *
 * Distinguishes three non-happy-path states: no session → redirect to
 * /login; signed in but pending approval → "awaiting approval" message;
 * signed in and approved, but below the page's required clearance →
 * "you don't have access" message.
 */
export function RequireClearance({
  children,
  min = 2,
}: {
  children: React.ReactNode;
  min?: Clearance;
}) {
  const { loading, operatorEmail, clearance, isPending } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !operatorEmail) {
      router.replace('/login');
    }
  }, [loading, operatorEmail, router]);

  if (loading) {
    return <p className="py-12 text-center text-sm text-slate-400">{t('common.loading')}</p>;
  }

  if (!operatorEmail) {
    return null; // redirecting
  }

  if (isPending) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="font-medium text-slate-800">{t('access.pendingTitle')}</p>
        <p className="mt-1 text-sm text-slate-500">{t('access.pendingBody')}</p>
      </div>
    );
  }

  const allowed = clearance !== null && (min === 1 ? clearance === 1 : true);
  if (!allowed) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="font-medium text-slate-800">
          {min === 1 ? t('access.ownerOnlyTitle') : t('inventory.notManagerTitle')}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {min === 1
            ? t('access.ownerOnlyBody')
            : t('inventory.notManagerBody', { email: operatorEmail })}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
