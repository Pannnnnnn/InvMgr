'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiJson, ClientApiError } from '@/lib/api-client';
import type { Item } from '@/lib/checkout-types';
import { useI18n } from '@/lib/i18n/context';

type AdjustType = 'RESTOCK' | 'BREAKAGE' | 'LOSS' | 'CORRECTION';

const ADJUST_KEYS: Record<AdjustType, { label: string; help: string }> = {
  RESTOCK: { label: 'stockAdjust.restock', help: 'stockAdjust.restockHelp' },
  BREAKAGE: { label: 'stockAdjust.breakage', help: 'stockAdjust.breakageHelp' },
  LOSS: { label: 'stockAdjust.loss', help: 'stockAdjust.lossHelp' },
  CORRECTION: { label: 'stockAdjust.correction', help: 'stockAdjust.correctionHelp' },
};

export function StockAdjustModal(props: { item: Item; onClose: () => void; onAdjusted: (item: Item) => void }) {
  const { item, onClose, onAdjusted } = props;
  const { accessToken } = useAuth();
  const { t } = useI18n();
  const [type, setType] = useState<AdjustType>('RESTOCK');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const data = await apiJson<{ item: Item }>(
        `/api/items/${item.id}`,
        'PATCH',
        { adjust: { type, quantity, notes: notes || undefined } },
        accessToken
      );
      onAdjusted(data.item);
      onClose();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Adjustment failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold">{t('stockAdjust.title')}</h2>
        <p className="mb-4 text-sm text-slate-500">{item.name}</p>

        <div className="mb-3 grid grid-cols-2 gap-2">
          {(Object.keys(ADJUST_KEYS) as AdjustType[]).map((adjType) => (
            <button
              key={adjType}
              onClick={() => setType(adjType)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-inset ${
                type === adjType ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300'
              }`}
            >
              {t(ADJUST_KEYS[adjType].label)}
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-slate-500">{t(ADJUST_KEYS[type].help)}</p>

        <label className="field-label" htmlFor="adjust-qty">
          {type === 'CORRECTION' ? t('stockAdjust.newAvailableQty') : t('stockAdjust.quantity')}
        </label>
        <input
          id="adjust-qty"
          type="number"
          min={0}
          className="field-input mb-3"
          value={quantity}
          onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
        />

        <label className="field-label" htmlFor="adjust-notes">
          {t('stockAdjust.notes')} {t('common.optional')}
        </label>
        <input
          id="adjust-notes"
          className="field-input mb-4"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary flex-1" onClick={submit} disabled={submitting}>
            {submitting ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
