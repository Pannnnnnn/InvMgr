'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiForm, apiJson, ClientApiError } from '@/lib/api-client';
import type { Item, StockScanSuggestion } from '@/lib/checkout-types';
import { PhotoCapture } from './PhotoCapture';
import { useI18n } from '@/lib/i18n/context';
import { suggestSku } from '@/lib/slugify';

type Row = StockScanSuggestion & {
  sku: string;
  aliasesText: string;
  action: 'new' | 'existing';
  existingId: string | null;
  included: boolean;
  status: 'idle' | 'saving' | 'done' | 'error';
  errorMsg: string | null;
};

function toRow(s: StockScanSuggestion): Row {
  const top = s.candidates[0];
  return {
    ...s,
    sku: suggestSku(s.name),
    aliasesText: s.suggested_aliases.join(', '),
    action: top && top.similarity > 0.5 ? 'existing' : 'new',
    existingId: top && top.similarity > 0.5 ? top.id : null,
    included: true,
    status: 'idle',
    errorMsg: null,
  };
}

/**
 * Manager stock-intake review flow: upload a photo of a shelf/box, Gemini
 * suggests detected items (src/app/api/inventory/scan), and every
 * suggestion is edited and confirmed here before anything is written —
 * nothing auto-saves.
 */
export function StockScanModal(props: { onClose: () => void; onApplied: () => void }) {
  const { onClose, onApplied } = props;
  const { accessToken } = useAuth();
  const { t } = useI18n();

  const [photo, setPhoto] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  async function analyze() {
    if (!photo) return;
    setAnalyzing(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('image', photo);
      const data = await apiForm<{ suggestions: StockScanSuggestion[] }>(
        '/api/inventory/scan',
        form,
        accessToken
      );
      setRows(data.suggestions.map(toRow));
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Scan failed.');
    } finally {
      setAnalyzing(false);
    }
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function applyRow(index: number): Promise<boolean> {
    const row = rows[index];
    updateRow(index, { status: 'saving', errorMsg: null });
    try {
      if (row.action === 'new') {
        await apiJson<{ item: Item }>(
          '/api/items',
          'POST',
          {
            sku: row.sku,
            name: row.name,
            category: row.category,
            aliases: row.aliasesText
              .split(',')
              .map((a) => a.trim())
              .filter(Boolean),
            total_quantity: row.quantity,
          },
          accessToken
        );
      } else if (row.action === 'existing' && row.existingId) {
        await apiJson<{ item: Item }>(
          `/api/items/${row.existingId}`,
          'PATCH',
          { adjust: { type: 'RESTOCK', quantity: row.quantity, notes: 'AI stock scan' } },
          accessToken
        );
      }
      updateRow(index, { status: 'done' });
      return true;
    } catch (err) {
      updateRow(index, {
        status: 'error',
        errorMsg: err instanceof ClientApiError ? err.message : 'Failed to save.',
      });
      return false;
    }
  }

  async function applyAll() {
    setApplying(true);
    let anySucceeded = false;
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].included || rows[i].status === 'done') continue;
      const ok = await applyRow(i);
      if (ok) anySucceeded = true;
    }
    setApplying(false);
    if (anySucceeded) onApplied();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div>
            <h2 className="text-lg font-semibold">{t('stockScan.title')}</h2>
            <p className="text-sm text-slate-500">{t('stockScan.subtitle')}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {rows.length === 0 ? (
            <div className="space-y-4">
              <PhotoCapture value={photo} onChange={setPhoto} label={t('stockScan.uploadPhoto')} />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button className="btn-primary w-full" onClick={analyze} disabled={!photo || analyzing}>
                {analyzing ? t('stockScan.analyzing') : t('stockScan.uploadPhoto')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-medium text-slate-700">{t('stockScan.reviewTitle')}</p>
              {rows.map((row, i) => (
                <div key={i} className="card space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={(e) => updateRow(i, { included: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <input
                      className="field-input flex-1"
                      value={row.name}
                      onChange={(e) => updateRow(i, { name: e.target.value })}
                    />
                    <span
                      className={`badge ${
                        row.confidence === 'HIGH'
                          ? 'bg-green-100 text-green-700'
                          : row.confidence === 'MEDIUM'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {row.confidence}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <input
                      type="number"
                      min={1}
                      className="field-input"
                      value={row.quantity}
                      onChange={(e) => updateRow(i, { quantity: parseInt(e.target.value, 10) || 1 })}
                    />
                    <input
                      className="field-input"
                      placeholder={t('addItem.category')}
                      value={row.category ?? ''}
                      onChange={(e) => updateRow(i, { category: e.target.value })}
                    />
                    <select
                      className="field-input col-span-2"
                      value={row.action === 'existing' ? row.existingId ?? '' : 'new'}
                      onChange={(e) =>
                        e.target.value === 'new'
                          ? updateRow(i, { action: 'new', existingId: null })
                          : updateRow(i, { action: 'existing', existingId: e.target.value })
                      }
                    >
                      <option value="new">{t('stockScan.createNew')}</option>
                      {row.candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {t('stockScan.addToExisting')}: {c.name} ({c.available_quantity}/{c.total_quantity})
                        </option>
                      ))}
                    </select>
                  </div>

                  {row.action === 'new' && (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="field-input"
                        placeholder={t('addItem.sku')}
                        value={row.sku}
                        onChange={(e) => updateRow(i, { sku: e.target.value })}
                      />
                      <input
                        className="field-input"
                        placeholder={t('addItem.aliases')}
                        value={row.aliasesText}
                        onChange={(e) => updateRow(i, { aliasesText: e.target.value })}
                      />
                    </div>
                  )}

                  {row.status === 'error' && <p className="text-xs text-red-600">{row.errorMsg}</p>}
                  {row.status === 'done' && <p className="text-xs text-green-600">✓</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="border-t border-slate-200 p-4">
            <button className="btn-primary w-full" onClick={applyAll} disabled={applying}>
              {applying ? t('stockScan.applying') : t('stockScan.applyAll')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
