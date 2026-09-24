'use client';

import { useRef, useState, useEffect } from 'react';
import { compressImage } from '@/lib/image';
import { useI18n } from '@/lib/i18n/context';
import { apiForm } from '@/lib/api-client';

type FaceCheckState = 'idle' | 'checking' | 'has-face' | 'no-face' | 'error';

export function PhotoCapture(props: {
  value: File | null;
  onChange: (file: File | null) => void;
  label?: string;
  /**
   * When true, runs a background "does this look like a photo of a person?"
   * sanity check (POST /api/checkout/verify-photo) after each capture and
   * shows an advisory badge. Purely advisory — never blocks onChange/the
   * caller's submit flow, and any check failure (AI error, timeout, network)
   * is swallowed silently rather than shown, per PRD 7 (fault tolerance —
   * the counter must never be blocked by this). Off by default; only the
   * worker-photo capture on /checkout opts in — StockScanModal's shelf
   * photos aren't people, so it never applies there.
   */
  checkFace?: boolean;
}) {
  const { t } = useI18n();
  const { value, onChange, label = t('checkout.workerPhoto'), checkFace = false } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [faceCheck, setFaceCheck] = useState<FaceCheckState>('idle');

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setCompressing(true);
    setFaceCheck('idle');
    try {
      const compressed = await compressImage(file);
      onChange(compressed);
      if (checkFace) runFaceCheck(compressed);
    } finally {
      setCompressing(false);
    }
  }

  async function runFaceCheck(file: File) {
    setFaceCheck('checking');
    try {
      const form = new FormData();
      form.set('image', file);
      const result = await apiForm<{ has_face: boolean }>('/api/checkout/verify-photo', form);
      setFaceCheck(result.has_face ? 'has-face' : 'no-face');
    } catch (err) {
      // Advisory only — never surface this as a blocking error, but DO log
      // it so it's visible in devtools rather than silently vanishing.
      // eslint-disable-next-line no-console
      console.error('Face check failed (non-blocking):', err);
      setFaceCheck('error');
    }
  }

  function handleRetake() {
    onChange(null);
    setFaceCheck('idle');
  }

  return (
    <div>
      <span className="field-label">{label}</span>

      {previewUrl ? (
        <div className="relative overflow-hidden rounded-lg ring-1 ring-slate-300">
          {/* Preview of a locally-selected photo before upload. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt={label} className="h-56 w-full object-cover" />
          <button
            type="button"
            onClick={handleRetake}
            className="absolute right-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white hover:bg-black/80"
          >
            {t('checkout.retake')}
          </button>
          {checkFace && faceCheck === 'checking' && (
            <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
              {t('checkout.faceChecking')}
            </span>
          )}
          {checkFace && faceCheck === 'has-face' && (
            <span className="absolute bottom-2 left-2 rounded-full bg-emerald-600/90 px-2.5 py-1 text-xs font-medium text-white">
              {t('checkout.faceFound')}
            </span>
          )}
          {checkFace && faceCheck === 'no-face' && (
            <span className="absolute bottom-2 left-2 rounded-full bg-amber-500/90 px-2.5 py-1 text-xs font-medium text-white">
              {t('checkout.faceNotFound')}
            </span>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="btn-secondary cursor-pointer justify-center">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            {t('checkout.takePhoto')}
          </label>
          <label className="btn-secondary cursor-pointer justify-center">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            {t('checkout.chooseFile')}
          </label>
        </div>
      )}

      {compressing && <p className="mt-1 text-xs text-slate-500">{t('checkout.compressing')}</p>}
      {value && !compressing && (
        <p className="mt-1 text-xs text-slate-500">
          {t('checkout.readyKb', { size: (value.size / 1024).toFixed(0) })}
        </p>
      )}
    </div>
  );
}
