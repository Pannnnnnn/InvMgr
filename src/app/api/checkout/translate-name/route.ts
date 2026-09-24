import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiError, jsonError, ok } from '@/lib/http';
import { transliterateWorkerName } from '@/lib/gemini';

const schema = z.object({ name: z.string().trim().min(1).max(200) });

/**
 * POST /api/checkout/translate-name — public (no auth; checkout stays
 * anonymous per PRD 7). Body: { name: string }.
 *
 * Given whatever the operator typed in the worker-name field, tells the
 * frontend whether it looks like a Burmese name and, if so, a readable Thai
 * phonetic transliteration to offer as a suggestion (src/app/checkout/page.tsx
 * — the operator taps to accept; nothing is changed automatically). This is
 * a UX aid only: it doesn't persist anywhere by itself, and if the operator
 * doesn't accept the suggestion, checkout still proceeds with whatever they
 * typed — never a blocker (PRD 7).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => {
      throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a non-empty "name".', parsed.error.flatten());
    }

    const result = await transliterateWorkerName(parsed.data.name);
    return ok(result);
  } catch (err) {
    return jsonError(err);
  }
}
