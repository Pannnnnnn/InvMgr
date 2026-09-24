import { NextRequest } from 'next/server';
import { ApiError, jsonError, ok } from '@/lib/http';
import { requireManager } from '@/lib/auth';
import { extractStockFromPhoto } from '@/lib/gemini';
import { suggestCatalogMatches } from '@/lib/resolver';
import type { StockScanSuggestion } from '@/lib/checkout-types';

export const runtime = 'nodejs';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * POST /api/inventory/scan
 * multipart/form-data: image (required) — a photo of a shelf/box of stock.
 *
 * Manager-only. Returns AI-detected items with fuzzy-matched candidates
 * against the existing catalog, so the manager can choose "add to this
 * existing item" vs "create new" per detection — nothing is written here.
 * The review UI applies confirmed rows via the existing POST /api/items
 * (new) and PATCH /api/items/[id] with {adjust:{type:"RESTOCK",...}}
 * (existing) endpoints, both already manager-gated.
 */
export async function POST(req: NextRequest) {
  try {
    await requireManager(req);

    const form = await req.formData();
    const imageFile = form.get('image');
    if (!(imageFile instanceof File)) {
      throw new ApiError(400, 'MISSING_IMAGE', 'A stock photo (field "image") is required.');
    }
    if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
      throw new ApiError(400, 'UNSUPPORTED_IMAGE_TYPE', `Unsupported image type: ${imageFile.type}`);
    }

    const imageBytes = new Uint8Array(await imageFile.arrayBuffer());
    const detections = await extractStockFromPhoto({ imageBytes, imageMimeType: imageFile.type });

    const suggestions: StockScanSuggestion[] = [];
    for (const d of detections) {
      const candidates = await suggestCatalogMatches(d.name, 3);
      suggestions.push({ ...d, candidates });
    }

    return ok({ suggestions });
  } catch (err) {
    return jsonError(err);
  }
}
