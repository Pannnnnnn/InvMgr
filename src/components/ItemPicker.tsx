'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api-client';
import type { Item, CartLine } from '@/lib/checkout-types';
import { useI18n } from '@/lib/i18n/context';

/**
 * Tap-to-cart catalog browser. This is the "list of items available to
 * take from inventory" on the checkout page — the fast path: tap what you
 * took instead of typing/describing it, which is both quicker for workers
 * who aren't comfortable typing (especially in a second language) and more
 * reliable than free-text AI parsing for the common case.
 */
export function ItemPicker(props: { value: CartLine[]; onChange: (lines: CartLine[]) => void }) {
  const { value, onChange } = props;
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Item[]>([]);

  useEffect(() => {
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
  }, [query]);

  function add(item: Item) {
    const existing = value.find((l) => l.item.id === item.id);
    if (existing) {
      updateQuantity(item.id, existing.quantity + 1);
      return;
    }
    onChange([...value, { item, quantity: 1 }]);
  }

  function updateQuantity(itemId: string, quantity: number) {
    onChange(value.map((l) => (l.item.id === itemId ? { ...l, quantity: Math.max(1, quantity) } : l)));
  }

  function remove(itemId: string) {
    onChange(value.filter((l) => l.item.id !== itemId));
  }

  return (
    <div>
      <input
        className="field-input mb-2"
        placeholder={t('itemPicker.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="mb-3 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
        {results.length === 0 ? (
          <p className="col-span-full py-4 text-center text-sm text-slate-400">{t('itemPicker.noResults')}</p>
        ) : (
          results.map((item) => {
            const inCart = value.find((l) => l.item.id === item.id);
            const outOfStock = item.available_quantity === 0;
            return (
              <button
                key={item.id}
                type="button"
                disabled={outOfStock}
                onClick={() => add(item)}
                className={`rounded-lg p-2.5 text-left ring-1 ring-inset transition-colors ${
                  inCart
                    ? 'bg-brand-50 ring-brand-300'
                    : outOfStock
                      ? 'cursor-not-allowed bg-slate-50 text-slate-400 ring-slate-200'
                      : 'bg-white ring-slate-200 hover:bg-slate-50'
                }`}
              >
                <p className="text-sm font-medium leading-tight">{item.name}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {outOfStock
                    ? t('itemPicker.outOfStock')
                    : t('itemPicker.available', {
                        available: item.available_quantity,
                        total: item.total_quantity,
                      })}
                </p>
                {inCart && <p className="mt-1 text-xs font-semibold text-brand-700">×{inCart.quantity}</p>}
              </button>
            );
          })
        )}
      </div>

      {value.length > 0 && (
        <div>
          <p className="field-label">{t('itemPicker.cart')}</p>
          <ul className="space-y-2">
            {value.map((line) => (
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
                  onClick={() => remove(line.item.id)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  {t('common.remove')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
