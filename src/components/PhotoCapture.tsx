'use client';

import { useRef, useState, useEffect } from 'react';
import { compressImage } from '@/lib/image';
import { useI18n } from '@/lib/i18n/context';

export function PhotoCapture(props: {
  value: File | null;
  onChange: (file: File | null) => void;
  label?: string;
}) {
  const { t } = useI18n();
  const { value, onChange, label = t('checkout.workerPhoto') } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);

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
    try {
      const compressed = await compressImage(file);
      onChange(compressed);
    } finally {
      setCompressing(false);
    }
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
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white hover:bg-black/80"
          >
            {t('checkout.retake')}
          </button>
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
