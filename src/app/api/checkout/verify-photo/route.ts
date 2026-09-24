import { NextRequest } from 'next/server';
import { ApiError, jsonError, ok } from '@/lib/http';
import { checkPhotoHasFace } from '@/lib/gemini';

export const runtime = 'nodejs'; // needed for Buffer + multipart handling

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * POST /api/checkout/verify-photo — public (no auth; checkout stays
 * anonymous per PRD 7). multipart/form-data: image (required).
 *
 * A capture-quality sanity check, not identity verification (PRD 8 puts
 * biometric/facial ID explicitly out of scope — this never compares against
 * anyone). Runs right after the operator takes/picks the worker photo
 * (src/components/PhotoCapture.tsx) and shows a small advisory badge —
 * catches an accidental photo of the floor/wall/hand before the operator
 * walks away from the counter. Always advisory: the frontend never blocks
 * submission on this, and a failure here (AI error/timeout) is swallowed
 * client-side rather than surfaced as a checkout error (PRD 7 — fault
 * tolerance, the counter must never be blocked by this).
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const imageFile = form.get('image');
    if (!(imageFile instanceof File)) {
      throw new ApiError(400, 'MISSING_IMAGE', 'An image (field "image") is required.');
    }
    if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
      throw new ApiError(400, 'UNSUPPORTED_IMAGE_TYPE', `Unsupported image type: ${imageFile.type}`);
    }

    const imageBytes = new Uint8Array(await imageFile.arrayBuffer());
    const result = await checkPhotoHasFace({ imageBytes, imageMimeType: imageFile.type });
    return ok(result);
  } catch (err) {
    return jsonError(err);
  }
}
