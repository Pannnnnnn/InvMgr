'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiForm, ClientApiError } from '@/lib/api-client';
import type { Item } from '@/lib/checkout-types';
import type { ManualCheckoutResponse } from '@/lib/checkout-types';
import { PhotoCapture } from './PhotoCapture';
import { ConfirmationCard } from './ConfirmationCard';

type Line = { item: Item; quantity: number };

/**
 * PRD 7 — fault tolerance: "Provide a 1-tap manual checkout drawer in the
 * UI so counter operations are never blocked if network or AI parsing
 * errors occur." Bypasses Gemini entirely; the operator picks items
 * straight from the catalog. Still requires a photo — the visual audit
 * trail (PRD 1.2/4.3) isn't optional just because the AI step is skipped.
 */
export function ManualCheckoutDrawer(props: { open: boolean; onClose: () => void; onCommitted?: () => void }) {
  const { open, onClose, onCommitted } = props;
  const { accessToken } = useAuth();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [workerName, setWorkerName] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ManualCheckoutResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      try {
        const data = await apiGet<{ items: Item[] }>(
          `/api/items${query ? `?search=${encodeURIComponent(query)}` : ''}`
        );
        setResults(data.items);
      } catch {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open]);

  if (!open) return null;

  function addLine(item: Item) {
    setLines((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) {
        return prev.map((l) => (l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { item, quantity: 1 }];
    });
  }

  function updateQuantity(itemId: string, quantity: number) {
    setLines((prev) => prev.map((l) => (l.item.id === itemId ? { ...l, quantity: Math.max(1, quantity) } : l)));
  }

  function removeLine(itemId: string) {
    setLines((prev) => prev.filter((l) => l.item.id !== itemId));
  }

  function reset() {
    setLines([]);
    setWorkerName('');
    setNotes('');
    setPhoto(null);
    setResult(null);
    setError(null);
  }

  async function submit() {
    if (!photo) {
      setError('A worker photo is required for the audit trail.');
      return;
    }
    if (lines.length === 0) {
      setError('Add at least one item.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('image', photo);
      form.set('items', JSON.stringify(lines.map((l) => ({ item_id: l.item.id, quantity: l.quantity }))));
      if (workerName.trim()) form.set('worker_name', workerName.trim());
      if (notes.trim()) form.set('notes', notes.trim());

      const data = await apiForm<ManualCheckoutResponse>('/api/transactions/manual', form, accessToken);
      setResult(data);
      onCommitted?.();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Checkout failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Manual checkout</h2>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <ConfirmationCard workerName={result.worker_name} transactions={result.transactions} />
            <button
              className="btn-secondary w-full"
              onClick={() => {
                reset();
              }}
            >
              Log another checkout
            </button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4">
            <div>
              <label className="field-label" htmlFor="manual-search">
                Find item
              </label>
              <input
                id="manual-search"
                className="field-input"
                placeholder="Search by name or alias…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {results.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg ring-1 ring-slate-200">
                  {results.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => addLine(item)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                        disabled={item.available_quantity === 0}
                      >
                        <span>{item.name}</span>
                        <span className="text-xs text-slate-400">
                          {item.available_quantity}/{item.total_quantity} available
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {lines.length > 0 && (
              <ul className="space-y-2">
                {lines.map((line) => (
                  <li key={line.item.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <span className="flex-1 text-sm">{line.item.name}</span>
                    <input
                      type="number"
                      min={1}
                      max={line.item.available_quantity}
                      value={line.quantity}
                      onChange={(e) => updateQuantity(line.item.id, parseInt(e.target.value, 10) || 1)}
                      className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => removeLine(line.item.id)}
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <label className="field-label" htmlFor="manual-worker">
                Worker name (optional)
              </label>
              <input
                id="manual-worker"
                className="field-input"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
              />
            </div>

            <PhotoCapture value={photo} onChange={setPhoto} />

            <div>
              <label className="field-label" htmlFor="manual-notes">
                Notes (optional)
              </label>
              <textarea
                id="manual-notes"
                className="field-input"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button className="btn-primary mt-auto w-full" onClick={submit} disabled={submitting}>
              {submitting ? 'Logging checkout…' : 'Confirm checkout'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
