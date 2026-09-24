'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';

export default function LoginPage() {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password, remember);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    router.push('/inventory');
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold">{t('login.title')}</h1>
      <p className="mb-6 text-sm text-slate-500">{t('login.subtitle')}</p>
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="field-label" htmlFor="email">
            {t('login.email')}
          </label>
          <input
            id="email"
            type="email"
            required
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="password">
            {t('login.password')}
          </label>
          <input
            id="password"
            type="password"
            required
            className="field-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          {t('login.rememberMe')}
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? t('login.signingIn') : t('login.signIn')}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        {t('login.noAccount')} <code className="rounded bg-slate-100 px-1">{'{"role": "manager"}'}</code>
      </p>
    </div>
  );
}
