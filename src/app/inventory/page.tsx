'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api-client';
import type { Item } from '@/lib/checkout-types';
import { AddItemModal } from '@/components/AddItemModal';
import { StockAdjustModal } from '@/components/StockAdjustModal';
import { RequireClearance } from '@/components/RequireClearance';
import { StockScanModal } from '@/components/StockScanModal';
import { useI18n } from '@/lib/i18n/context';

/**
 * Real-time inventory catalog view (PRD 4.2): name, SKU, category,
 * available vs total quantity, with fast-action manual overrides for
 * breakage/loss/restocking. Manager-only (see RequireClearance).
 */
export default function InventoryPage() {
  return (
    <RequireClearance>
      <InventoryContent />
    </RequireClearance>
  );
}

function InventoryContent() {
  const { t } = useI18n();
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<Item | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiGet<{ items: Item[] }>(
        `/api/items${search ? `?search=${encodeURIComponent(search)}` : ''}`
      );
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const handle = setTimeout(load, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function replaceItem(updated: Item) {
    setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('inventory.title')}</h1>
          <p className="text-sm text-slate-500">{t('inventory.itemCount', { count: items.length })}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm" onClick={() => setScanOpen(true)}>
            {t('inventory.scanPhoto')}
          </button>
          <button className="btn-primary text-sm" onClick={() => setAddOpen(true)}>
            {t('inventory.addItem')}
          </button>
        </div>
      </div>

      <input
        className="field-input mb-4"
        placeholder={t('inventory.searchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">{t('inventory.name')}</th>
              <th className="px-4 py-3 font-medium">{t('inventory.sku')}</th>
              <th className="px-4 py-3 font-medium">{t('inventory.category')}</th>
              <th className="px-4 py-3 font-medium">{t('inventory.availableTotal')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  {t('common.loading')}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  {t('inventory.noItems')}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                  <td className="px-4 py-3 text-slate-500">{item.sku}</td>
                  <td className="px-4 py-3 text-slate-500">{item.category ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge ${
                        item.available_quantity === 0
                          ? 'bg-red-100 text-red-700'
                          : item.available_quantity <= item.total_quantity * 0.2
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {item.available_quantity} / {item.total_quantity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="text-xs font-medium text-brand-600 hover:underline"
                      onClick={() => setAdjustItem(item)}
                    >
                      {t('inventory.adjust')}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <AddItemModal
          onClose={() => setAddOpen(false)}
          onCreated={(item) => setItems((prev) => [item, ...prev])}
        />
      )}
      {adjustItem && (
        <StockAdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onAdjusted={replaceItem} />
      )}
      {scanOpen && (
        <StockScanModal
          onClose={() => setScanOpen(false)}
          onApplied={() => {
            setScanOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
