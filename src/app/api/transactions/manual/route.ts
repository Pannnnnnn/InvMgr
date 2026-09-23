import { NextRequest } from 'next/server';
import { ApiError, jsonError, ok } from '@/lib/http';
import { getOperatorIdOptional } from '@/lib/auth';
import { commitCheckout } from '@/lib/checkout';

export const runtime = 'nodejs';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * POST /api/transactions/manual
 * multipart/form-data:
 *   image        (required) — worker photo, still captured for the audit trail
 *   items        (required) — JSON string: [{ "item_id": "...", "quantity": 1 }, ...]
 *   worker_name  (optional)
 *   notes        (optional)
 *
 * PRD 7: "Provide a 1-tap manual checkout drawer in the UI so counter
 * operations are never blocked if network or AI parsing errors occur."
 * This bypasses Gemini entirely — items are picked directly from the
 * catalog by the operator — but still goes through the same atomic
 * checkout_batch commit path as the AI flow, so stock and the audit trail
 * stay consistent regardless of which path was used.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const imageFile = form.get('image');
    if (!(imageFile instanceof File)) {
      throw new ApiError(400, 'MISSING_IMAGE', 'A worker photo (field "image") is required for the audit trail.');
    }
    if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
      throw new ApiError(400, 'UNSUPPORTED_IMAGE_TYPE', `Unsupported image type: ${imageFile.type}`);
    }

    const itemsRaw = form.get('items') as string | null;
    if (!itemsRaw) {
      throw new ApiError(400, 'MISSING_ITEMS', 'Provide "items" as a JSON array of { item_id, quantity }.');
    }

    let items: Array<{ item_id: string; quantity: number }>;
    try {
      items = JSON.parse(itemsRaw);
    } catch {
      throw new ApiError(400, 'INVALID_JSON', '"items" must be valid JSON.');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, 'EMPTY_CHECKOUT', 'At least one item is required.');
    }
    for (const it of items) {
      if (typeof it.item_id !== 'string' || !it.item_id || !Number.isInteger(it.quantity) || it.quantity <= 0) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Each item requires a string item_id and positive integer quantity.');
      }
    }

    const workerName = (form.get('worker_name') as string | null)?.trim() || null;
    const notes = (form.get('notes') as string | null)?.trim() || null;
    const operatorId = await getOperatorIdOptional(req);
    const imageBytes = new Uint8Array(await imageFile.arrayBuffer());

    const transactions = await commitCheckout({
      lineItems: items,
      workerName,
      operatorId,
      notes,
      imageBytes,
      imageMimeType: imageFile.type,
    });

    return ok({ status: 'CONFIRMED', worker_name: workerName, transactions }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
