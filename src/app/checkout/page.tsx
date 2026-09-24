'use client';

import { useState } from 'react';
import { apiForm, ClientApiError } from '@/lib/api-client';
import type { CheckoutResponse, ManualCheckoutResponse, CartLine } from '@/lib/checkout-types';
import { PhotoCapture } from '@/components/PhotoCapture';
import { ConfirmationCard } from '@/components/ConfirmationCard';
import { ItemPicker } from '@/components/ItemPicker';
import { useI18n } from '@/lib/i18n/context';

type Tab = 'pick' | 'ai';

/**
 * The checkout screen (PRD 4.1 AI Checkout Chat Assistant, plus the item
 * picker the user asked for on top of it). Two ways to say what was taken:
 * tapping items from the catalog (fast, reliable, no typing — the default)
 * or describing it to the AI in natural language (for anything easier said
 * than tapped). Both share the same required photo and go through the same
 * confirmation-card result.
 */
export default function CheckoutPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('pick');
  const [photo, setPhoto] = useState<File | null>(null);
  const [workerName, setWorkerName] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ workerName: string | null; transactions: ManualCheckoutResponse['transactions'] } | null>(null);
  const [clarification, setClarification] = useState<Extract<CheckoutResponse, { status: 'CLARIFICATION_NEEDED' }> | null>(null);

  function resetResult() {
    setConfirmed(null);
    setClarification(null);
    setError(null);
  }

  async function submitPick() {
    if (!photo) return setError(t('checkout.noPhotoError'));
    if (cart.length === 0) return setError(t('checkout.noItemsError'));

    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('image', photo);
      form.set('items', JSON.stringify(cart.map((l) => ({ item_id: l.item.id, quantity: l.quantity }))));
      if (workerName.trim()) form.set('worker_name', workerName.trim());

      const data = await apiForm<ManualCheckoutResponse>('/api/transactions/manual', form);
      setConfirmed({ workerName: data.worker_name, transactions: data.transactions });
      setPhoto(null);
      setCart([]);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Checkout failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAi() {
    if (!photo) return setError(t('checkout.noPhotoError'));

    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('image', photo);
      form.set('text', text);
      if (workerName.trim()) form.set('worker_name', workerName.trim());

      const data = await apiForm<CheckoutResponse>('/api/checkout', form);
      if (data.status === 'CONFIRMED') {
        setConfirmed({ workerName: data.worker_name, transactions: data.transactions });
        setPhoto(null);
        setText('');
      } else if (data.status === 'CLARIFICATION_NEEDED') {
        setClarification(data);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Checkout failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">{t('checkout.title')}</h1>
        <p className="text-sm text-slate-500">{t('checkout.subtitle')}</p>
      </div>

      {confirmed ? (
        <div className="space-y-4">
          <ConfirmationCard workerName={confirmed.workerName} transactions={confirmed.transactions} />
          <button className="btn-secondary w-full" onClick={resetResult}>
            {t('checkout.checkOutButton')}
          </button>
        </div>
      ) : (
        <div className="card space-y-4">
          <PhotoCapture value={photo} onChange={setPhoto} label={t('checkout.workerPhoto')} />

          <div>
            <label className="field-label" htmlFor="worker-name">
              {t('checkout.workerName')}
            </label>
            <input
              id="worker-name"
              className="field-input"
              placeholder={t('checkout.workerNamePlaceholder')}
              value={workerName}
              onChange={(e) => setWorkerName(e.target.value)}
            />
          </div>

          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                tab === 'pick' ? 'bg-white shadow-sm' : 'text-slate-500'
              }`}
              onClick={() => setTab('pick')}
            >
              {t('checkout.tabPick')}
            </button>
            <button
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                tab === 'ai' ? 'bg-white shadow-sm' : 'text-slate-500'
              }`}
              onClick={() => setTab('ai')}
            >
              {t('checkout.tabAi')}
            </button>
          </div>

          {tab === 'pick' ? (
            <ItemPicker value={cart} onChange={setCart} />
          ) : (
            <div>
              <label className="field-label" htmlFor="checkout-text">
                {t('checkout.whatWasTaken')}
              </label>
              <textarea
                id="checkout-text"
                className="field-input"
                rows={2}
                placeholder={t('checkout.whatWasTakenPlaceholder')}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            className="btn-primary w-full"
            onClick={tab === 'pick' ? submitPick : submitAi}
            disabled={submitting}
          >
            {submitting ? t('checkout.processing') : t('checkout.checkOutButton')}
          </button>
        </div>
      )}

      {clarification && (
        <div className="card mt-4 border-2 border-amber-200 bg-amber-50">
          <p className="mb-2 font-medium text-amber-900">{t('checkout.needsClarification')}</p>
          <p className="mb-3 text-sm text-amber-800">{clarification.message}</p>
          <button className="btn-secondary text-sm" onClick={() => setClarification(null)}>
            {t('checkout.editRetry')}
          </button>
        </div>
      )}
    </div>
  );
}
