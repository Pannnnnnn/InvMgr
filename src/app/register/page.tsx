'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';

export default function RegisterPage() {
  const { signUp } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t('register.passwordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('register.passwordMismatch'));
      return;
    }

    setSubmitting(true);
    const { error } = await signUp(email, password, name.trim() || undefined);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4">
        <div className="card text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-2xl">
            ⏳
          </div>
          <h1 className="text-xl font-semibold text-slate-900">{t('register.pendingTitle')}</h1>
          <p className="mt-2 text-sm text-slate-500">{t('register.pendingBody')}</p>
          <Link href="/login" className="btn-secondary mt-5 inline-flex">
            {t('register.backToLogin')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-2xl shadow-lg shadow-brand-600/20">
          ✨
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">{t('register.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('register.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="field-label" htmlFor="name">
            {t('register.name')} <span className="text-slate-400">{t('common.optional')}</span>
          </label>
          <input
            id="name"
            type="text"
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </div>
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
            placeholder="you@company.com"
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
            minLength={8}
            className="field-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="confirmPassword">
            {t('register.confirmPassword')}
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            className="field-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
          />
        </div>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn-primary w-full rounded-xl py-3 text-base font-semibold shadow-md shadow-brand-600/20 transition-transform active:scale-[0.99]"
          disabled={submitting}
        >
          {submitting ? t('register.submitting') : t('register.submit')}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">
        {t('register.haveAccount')}{' '}
        <Link href="/login" className="font-medium text-brand-700 hover:text-brand-800 hover:underline">
          {t('login.signIn')}
        </Link>
      </p>
    </div>
  );
}
