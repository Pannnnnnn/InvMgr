'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';

export function Nav() {
  const pathname = usePathname();
  const { operatorEmail, signOut, loading } = useAuth();
  const { t, lang, setLang } = useI18n();

  const links = [
    { href: '/checkout', label: t('nav.checkout') },
    { href: '/inventory', label: t('nav.inventory') },
    { href: '/transactions', label: t('nav.transactions') },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/checkout" className="text-lg font-semibold text-slate-900">
          {t('app.name')}
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href || pathname?.startsWith(link.href + '/');
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 text-sm">
          <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-300">
            <button
              onClick={() => setLang('th')}
              className={`px-2 py-1 text-xs font-medium ${lang === 'th' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600'}`}
            >
              ไทย
            </button>
            <button
              onClick={() => setLang('en')}
              className={`px-2 py-1 text-xs font-medium ${lang === 'en' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600'}`}
            >
              EN
            </button>
          </div>

          {loading ? null : operatorEmail ? (
            <>
              <span className="hidden text-slate-500 sm:inline">{operatorEmail}</span>
              <button onClick={() => signOut()} className="btn-secondary py-1.5 text-sm">
                {t('nav.signOut')}
              </button>
            </>
          ) : (
            <Link href="/login" className="btn-secondary py-1.5 text-sm">
              {t('nav.signIn')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
