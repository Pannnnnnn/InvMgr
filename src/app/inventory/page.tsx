'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiJson } from '@/lib/api-client';
import type { Item } from '@/lib/checkout-types';
import { AddItemModal } from '@/components/AddItemModal';
import { StockAdjustModal } from '@/components/StockAdjustModal';
import { RequireClearance } from '@/components/RequireClearance';
import { StockScanModal } from '@/components/StockScanModal';
import { useI18n } from '@/lib/i18n/context';
import { useAuth } from '@/lib/auth-context';

/**
 * Real-time inventory catalog view (PRD 4.2): name, category, available vs
 * total quantity, with fast-action manual overrides for breakage/loss/
 * restocking. Manager-only (see RequireClearance).
 *
 * SKU is still generated and stored under the hood (unique catalog
 * identifier, matches the PRD data model) but is no longer manager-facing —
 * typing one for every item was pure friction with no payoff for this
 * workflow, so POST /api/items auto-generates it from the item name.
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
  const { accessToken } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<Item | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Archived items are opt-in only — the default view stays exactly like a
  // normal editable catalog list. Toggling this on reveals them (dimmed,
  // with a restore action); checkout's item picker never sees them either way.
  const [showArchived, setShowArchived] = useState(false);

  async function load(includeArchived: boolean) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (includeArchived) params.set('includeInactive', 'true');
      if (search) params.set('search', search);
      const qs = params.toString();
      const data = await apiGet<{ items: Item[] }>(`/api/items${qs ? `?${qs}` : ''}`, accessToken);
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const handle = setTimeout(() => load(showArchived), 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, showArchived]);

  function replaceItem(updated: Item) {
    setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
  }

  async function handleDelete(item: Item) {
    if (!window.confirm(t('inventory.deleteConfirm', { name: item.name }))) return;
    setBusyId(item.id);
    try {
      const res = await apiJson<{ deleted: boolean; archived: boolean; item?: Item }>(
        `/api/items/${item.id}`,
        'DELETE',
        {},
        accessToken
      );
      if (res.deleted) {
        setItems((prev) => prev.filter((it) => it.id !== item.id));
      } else if (res.archived && res.item) {
        // Archived items only belong in the list when "show archived" is on
        // — otherwise this would leave a dimmed, un-deletable row sitting in
        // what's supposed to be a plain, always-editable catalog view.
        if (showArchived) {
          replaceItem(res.item);
        } else {
          setItems((prev) => prev.filter((it) => it.id !== item.id));
        }
        window.alert(t('inventory.archivedInsteadOfDeleted', { name: item.name }));
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('inventory.actionError'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestore(item: Item) {
    setBusyId(item.id);
    try {
      const res = await apiJson<{ item: Item }>(`/api/items/${item.id}`, 'PATCH', { is_active: true }, accessToken);
      replaceItem(res.item);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('inventory.actionError'));
    } finally {
      setBusyId(null);
    }
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className="field-input flex-1"
          placeholder={t('inventory.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-500">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          {t('inventory.showArchived')}
        </label>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">{t('inventory.name')}</th>
              <th className="px-4 py-3 font-medium">{t('inventory.category')}</th>
              <th className="px-4 py-3 font-medium">{t('inventory.availableTotal')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  {t('common.loading')}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  {t('inventory.noItems')}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-slate-100 last:border-0 ${!item.is_active ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {item.name}
                    {!item.is_active && (
                      <span className="badge ml-2 bg-slate-200 text-slate-600">{t('inventory.archivedBadge')}</span>
                    )}
                  </td>
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
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {item.is_active ? (
                      <>
                        <button
                          className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                          disabled={busyId === item.id}
                          onClick={() => setAdjustItem(item)}
                        >
                          {t('inventory.adjust')}
                        </button>
                        <button
                          className="ml-3 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                          disabled={busyId === item.id}
                          onClick={() => handleDelete(item)}
                        >
                          {t('inventory.delete')}
                        </button>
                      </>
                    ) : (
                      <button
                        className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                        disabled={busyId === item.id}
                        onClick={() => handleRestore(item)}
                      >
                        {t('inventory.restore')}
                      </button>
                    )}
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
            load(showArchived);
          }}
        />
      )}
    </div>
  );
}
