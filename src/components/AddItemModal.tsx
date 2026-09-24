'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiJson, ClientApiError } from '@/lib/api-client';
import type { Item } from '@/lib/checkout-types';
import { useI18n } from '@/lib/i18n/context';

export function AddItemModal(props: { onClose: () => void; onCreated: (item: Item) => void }) {
  const { onClose, onCreated } = props;
  const { accessToken } = useAuth();
  const { t } = useI18n();
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [aliases, setAliases] = useState('');
  const [totalQuantity, setTotalQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const data = await apiJson<{ item: Item }>(
        '/api/items',
        'POST',
        {
          sku,
          name,
          category: category || null,
          aliases: aliases
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean),
          total_quantity: totalQuantity,
        },
        accessToken
      );
      onCreated(data.item);
      onClose();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Could not create item.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">{t('addItem.title')}</h2>

        <div className="space-y-3">
          <div>
            <label className="field-label" htmlFor="item-sku">
              {t('addItem.sku')}
            </label>
            <input id="item-sku" className="field-input" value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="item-name">
              {t('addItem.name')}
            </label>
            <input id="item-name" className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="item-category">
              {t('addItem.category')} {t('common.optional')}
            </label>
            <input
              id="item-category"
              className="field-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="item-aliases">
              {t('addItem.aliases')}
            </label>
            <input
              id="item-aliases"
              className="field-input"
              placeholder="drill, makita cordless"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="item-qty">
              {t('addItem.totalQuantity')}
            </label>
            <input
              id="item-qty"
              type="number"
              min={0}
              className="field-input"
              value={totalQuantity}
              onChange={(e) => setTotalQuantity(parseInt(e.target.value, 10) || 0)}
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button className="btn-secondary flex-1" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn-primary flex-1"
            onClick={submit}
            disabled={submitting || !sku.trim() || !name.trim()}
          >
            {submitting ? t('addItem.adding') : t('addItem.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
