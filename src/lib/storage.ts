import { supabaseAdmin } from './supabase';
import { env } from './env';
import { ApiError } from './http';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB — PRD 7: client should compress below this
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Uploads a worker checkout photo to the private storage bucket. Accepts
 * already-compressed image bytes; the PRD requires client-side compression
 * before this point (section 7), this is a server-side backstop only.
 */
export async function uploadWorkerPhoto(params: {
  bytes: Uint8Array;
  contentType: string;
  /** Used to namespace the object path, e.g. by date. */
  filenameHint?: string;
}): Promise<{ path: string }> {
  const { bytes, contentType, filenameHint } = params;

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new ApiError(
      400,
      'UNSUPPORTED_IMAGE_TYPE',
      `Unsupported image content type: ${contentType}. Allowed: ${Array.from(ALLOWED_CONTENT_TYPES).join(', ')}`
    );
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ApiError(
      413,
      'IMAGE_TOO_LARGE',
      `Image is ${(bytes.byteLength / 1024 / 1024).toFixed(2)}MB; max allowed is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB. Compress on the client before upload.`
    );
  }

  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const now = new Date();
  const datePrefix = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const safeHint = (filenameHint || 'checkout').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const path = `${datePrefix}/${now.getTime()}-${safeHint}.${ext}`;

  const { error } = await supabaseAdmin()
    .storage.from(env.storageBucket)
    .upload(path, bytes, { contentType, upsert: false });

  if (error) {
    throw new ApiError(502, 'STORAGE_UPLOAD_FAILED', `Failed to upload worker photo: ${error.message}`);
  }

  return { path };
}

/**
 * Resolves a stored object path to a short-lived signed URL for display in
 * the UI. Never return the raw storage path or a public URL — the bucket
 * is private (see migration 0004_storage.sql).
 */
export async function getSignedPhotoUrl(objectPath: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .storage.from(env.storageBucket)
    .createSignedUrl(objectPath, env.signedUrlTtlSeconds);

  if (error || !data) return null;
  return data.signedUrl;
}

export async function getSignedPhotoUrls(objectPaths: string[]): Promise<Record<string, string | null>> {
  if (objectPaths.length === 0) return {};
  const { data, error } = await supabaseAdmin()
    .storage.from(env.storageBucket)
    .createSignedUrls(objectPaths, env.signedUrlTtlSeconds);

  if (error || !data) {
    return Object.fromEntries(objectPaths.map((p) => [p, null]));
  }
  const result: Record<string, string | null> = {};
  data.forEach((entry, i) => {
    result[objectPaths[i]] = entry.signedUrl ?? null;
  });
  return result;
}
