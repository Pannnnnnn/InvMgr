'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiJson, ClientApiError } from '@/lib/api-client';
import type { TransactionResult } from '@/lib/checkout-types';
import { RequireManager } from '@/components/RequireManager';
import { useI18n } from '@/lib/i18n/context';

type StatusFilter = '' | 'BORROWED' | 'RETURNED';

/**
 * Visual audit & transaction log (PRD 4.3): chronological feed with worker
 * photo thumbnail, name, items, timestamp, status — searchable by date,
 * worker name, or item type. Manager-only (see RequireManager).
 */
export default function TransactionsPage() {
  return (
    <RequireManager>
      <TransactionsContent />
    </RequireManager>
  );
}

function TransactionsContent() {
  const { accessToken } = useAuth();
  const { t } = useI18n();
  const [worker, setWorker] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [transactions, setTransactions] = useState<TransactionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (worker) params.set('worker', worker);
      if (status) params.set('status', status);
      if (from) params.set('from', new Date(from).toISOString());
      if (to) params.set('to', new Date(to).toISOString());

      const data = await apiGet<{ transactions: TransactionResult[] }>(
        `/api/transactions?${params.toString()}`
      );
      setTransactions(data.transactions);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Could not load transactions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const handle = setTimeout(load, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worker, status, from, to]);

  async function markReturned(id: string) {
    setReturningId(id);
    try {
      await apiJson(`/api/transactions/${id}/return`, 'POST', {}, accessToken);
      await load();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Could not mark as returned.');
    } finally {
      setReturningId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">{t('transactions.title')}</h1>
      <p className="mb-5 text-sm text-slate-500">{t('transactions.subtitle')}</p>

      <div className="card mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <input
          className="field-input"
          placeholder={t('transactions.workerName')}
          value={worker}
          onChange={(e) => setWorker(e.target.value)}
        />
        <select
          className="field-input"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="">{t('transactions.allStatuses')}</option>
          <option value="BORROWED">{t('transactions.borrowed')}</option>
          <option value="RETURNED">{t('transactions.returned')}</option>
        </select>
        <input type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400">{t('common.loading')}</p>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-slate-400">{t('transactions.noResults')}</p>
      ) : (
        <ul className="space-y-3">
          {transactions.map((txn) => (
            <li key={txn.id} className="card flex items-center gap-4">
              {txn.photo_signed_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={txn.photo_signed_url}
                  alt={txn.worker_name ?? 'Worker'}
                  className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
                />
              ) : (
                <div className="h-14 w-14 shrink-0 rounded-lg bg-slate-100" />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">{txn.worker_name ?? 'Unknown worker'}</span>
                  <span
                    className={`badge ${
                      txn.status === 'BORROWED' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {txn.status === 'BORROWED' ? t('transactions.borrowed') : t('transactions.returned')}
                  </span>
                </div>
                <p className="truncate text-sm text-slate-600">
                  {txn.quantity}× {txn.item?.name ?? txn.item_id}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(txn.borrowed_at).toLocaleString()}
                  {txn.returned_at && <> · {new Date(txn.returned_at).toLocaleString()}</>}
                </p>
              </div>

              {txn.status === 'BORROWED' && (
                <button
                  className="btn-secondary shrink-0 text-xs"
                  onClick={() => markReturned(txn.id)}
                  disabled={returningId === txn.id}
                >
                  {returningId === txn.id ? t('transactions.marking') : t('transactions.markReturned')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
