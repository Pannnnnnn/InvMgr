'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';
import { apiGet, apiJson, ClientApiError } from '@/lib/api-client';

type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  created_at: string;
  status: string;
  clearance: 1 | 2 | null;
};

/**
 * Owner-only approval UI for src/app/admin/page.tsx. Talks to
 * /api/admin/users (list) and /api/admin/users/[id] (PATCH to approve/
 * change clearance, DELETE to reject/revoke) — both gated server-side by
 * requireOwner() in src/lib/auth.ts.
 */
export function AdminUsersPanel() {
  const { accessToken, session } = useAuth();
  const { t } = useI18n();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ users: AdminUser[] }>('/api/admin/users', accessToken);
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t('admin.loadError'));
    }
  }, [accessToken, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(id: string, clearance: 1 | 2) {
    setBusyId(id);
    setError(null);
    try {
      await apiJson(`/api/admin/users/${id}`, 'PATCH', { clearance }, accessToken);
      await load();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t('admin.actionError'));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await apiJson(`/api/admin/users/${id}`, 'DELETE', undefined, accessToken);
      await load();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t('admin.actionError'));
    } finally {
      setBusyId(null);
    }
  }

  if (!users) {
    return <p className="py-12 text-center text-sm text-slate-400">{t('common.loading')}</p>;
  }

  const pending = users.filter((u) => u.status !== 'approved');
  const approved = users.filter((u) => u.status === 'approved');
  const currentUserId = session?.user?.id;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{t('admin.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('admin.subtitle')}</p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
          {error}
        </p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t('admin.pendingHeading')} ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="card text-sm text-slate-400">{t('admin.noPending')}</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((u) => (
              <li key={u.id} className="card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-800">{u.name || u.email}</p>
                  <p className="text-sm text-slate-500">{u.email}</p>
                  <p className="text-xs text-slate-400">
                    {t('admin.registered')} {new Date(u.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-primary py-1.5 text-sm"
                    disabled={busyId === u.id}
                    onClick={() => approve(u.id, 1)}
                  >
                    {t('admin.approveAsOwner')}
                  </button>
                  <button
                    className="btn-secondary py-1.5 text-sm"
                    disabled={busyId === u.id}
                    onClick={() => approve(u.id, 2)}
                  >
                    {t('admin.approveAsManager')}
                  </button>
                  <button
                    className="btn-danger py-1.5 text-sm"
                    disabled={busyId === u.id}
                    onClick={() => remove(u.id)}
                  >
                    {t('admin.reject')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t('admin.approvedHeading')} ({approved.length})
        </h2>
        <ul className="space-y-2">
          {approved.map((u) => (
            <li key={u.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-800">{u.name || u.email}</p>
                <p className="text-sm text-slate-500">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${u.clearance === 1 ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-700'}`}>
                  {u.clearance === 1 ? t('admin.levelOwner') : t('admin.levelManager')}
                </span>
                {u.clearance !== 1 && (
                  <button
                    className="btn-secondary py-1.5 text-sm"
                    disabled={busyId === u.id}
                    onClick={() => approve(u.id, 1)}
                  >
                    {t('admin.promoteToOwner')}
                  </button>
                )}
                {u.clearance !== 2 && (
                  <button
                    className="btn-secondary py-1.5 text-sm"
                    disabled={busyId === u.id}
                    onClick={() => approve(u.id, 2)}
                  >
                    {t('admin.demoteToManager')}
                  </button>
                )}
                <button
                  className="btn-danger py-1.5 text-sm"
                  disabled={busyId === u.id || u.id === currentUserId}
                  onClick={() => remove(u.id)}
                  title={u.id === currentUserId ? t('admin.cannotRevokeSelf') : undefined}
                >
                  {t('admin.revoke')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
