'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';

/**
 * Gates a page behind a manager session (client-side UX only — the real
 * enforcement is server-side via requireManager() in src/lib/auth.ts).
 * Redirects to /login if signed out, or shows a plain "not authorized"
 * message if signed in as a non-manager operator account.
 */
export function RequireManager({ children }: { children: React.ReactNode }) {
  const { loading, operatorEmail, isManager } = useAuth();
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

  if (!isManager) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="font-medium text-slate-800">{t('inventory.notManagerTitle')}</p>
        <p className="mt-1 text-sm text-slate-500">{t('inventory.notManagerBody', { email: operatorEmail })}</p>
      </div>
    );
  }

  return <>{children}</>;
}
