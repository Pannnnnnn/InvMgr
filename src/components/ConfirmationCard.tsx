'use client';

import type { TransactionResult } from '@/lib/checkout-types';
import { useI18n } from '@/lib/i18n/context';

/**
 * The "structured confirmation card" from the PRD end-to-end flow (3.2):
 * shown after a successful checkout, one row per item, with the visual
 * proof (photo) and audit details.
 */
export function ConfirmationCard(props: { workerName: string | null; transactions: TransactionResult[] }) {
  const { workerName, transactions } = props;
  const { t } = useI18n();
  const photoUrl = transactions[0]?.photo_signed_url;

  return (
    <div className="card border-2 border-green-200 bg-green-50">
      <div className="mb-3 flex items-center gap-2">
        <span className="badge bg-green-600 text-white">{t('confirmation.checkedOut')}</span>
        {workerName && <span className="font-medium text-slate-800">{workerName}</span>}
      </div>

      <div className="flex gap-4">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={workerName ?? 'Worker photo'}
            className="h-24 w-24 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
          />
        )}
        <ul className="flex-1 space-y-1.5">
          {transactions.map((txn) => (
            <li key={txn.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-800">
                {txn.quantity}× {txn.item?.name ?? txn.item_id}
                {txn.item?.sku && <span className="ml-1 text-slate-400">({txn.item.sku})</span>}
              </span>
              <span className="text-slate-500">{new Date(txn.borrowed_at).toLocaleTimeString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
