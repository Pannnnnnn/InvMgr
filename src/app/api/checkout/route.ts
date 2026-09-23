import { NextRequest } from 'next/server';
import { ApiError, jsonError, ok } from '@/lib/http';
import { getOperatorIdOptional } from '@/lib/auth';
import { extractCheckoutIntent } from '@/lib/gemini';
import { resolveMentions, type ResolvedMention } from '@/lib/resolver';
import { commitCheckout } from '@/lib/checkout';

export const runtime = 'nodejs'; // needed for Buffer + multipart handling

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * POST /api/checkout
 * multipart/form-data:
 *   image        (required) — photo of the worker/badge, camera or file picker
 *   text         (optional) — operator's natural-language message
 *   worker_name  (optional) — explicit override, skips AI name extraction
 *
 * This is the core AI Checkout Agent endpoint (PRD 4.1). It never partially
 * commits: either every mentioned item resolves and has stock (-> BORROWED
 * transactions created) or nothing is written and a clarification response
 * is returned so the operator can retry via chat or the manual drawer
 * (PRD 7 — fault tolerance).
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

    const text = (form.get('text') as string | null) ?? '';
    const workerNameOverride = (form.get('worker_name') as string | null)?.trim() || null;

    if (!text.trim() && !workerNameOverride && imageFile.size === 0) {
      throw new ApiError(400, 'EMPTY_REQUEST', 'Provide a photo and/or a short description of what was taken.');
    }

    const imageBytes = new Uint8Array(await imageFile.arrayBuffer());

    // Never block the counter on auth: an unresolvable/missing operator
    // token still logs the checkout with operator_id = null rather than
    // rejecting the request (PRD 7).
    const operatorId = await getOperatorIdOptional(req);

    const extraction = await extractCheckoutIntent({
      text,
      imageBytes,
      imageMimeType: imageFile.type,
    });

    if (extraction.action === 'RETURN') {
      // Returns are resolved by transaction, not by item catalog matching —
      // handled separately so the AI path here stays focused on borrows.
      return ok({
        status: 'ACTION_NOT_SUPPORTED_HERE',
        message:
          'This looks like a return. Use GET /api/transactions to find the open (BORROWED) record and POST /api/transactions/{id}/return.',
        extraction,
      });
    }

    if (extraction.needs_clarification || extraction.items.length === 0) {
      return ok(
        {
          status: 'CLARIFICATION_NEEDED',
          message: extraction.clarification_message ?? 'Could not determine what was borrowed. Please clarify.',
          extraction,
        },
        { status: 200 }
      );
    }

    const resolved = await resolveMentions(extraction.items);
    const unresolved = resolved.filter(
      (r): r is Exclude<ResolvedMention, { status: 'MATCHED' }> => r.status !== 'MATCHED'
    );

    if (unresolved.length > 0) {
      return ok(
        {
          status: 'CLARIFICATION_NEEDED',
          message: buildUnresolvedMessage(unresolved),
          extraction,
          resolutions: resolved,
        },
        { status: 200 }
      );
    }

    const matched = resolved as Extract<ResolvedMention, { status: 'MATCHED' }>[];
    const workerName = workerNameOverride ?? extraction.worker_name;

    const transactions = await commitCheckout({
      lineItems: matched.map((m) => ({ item_id: m.item.id, quantity: m.quantity })),
      workerName,
      operatorId,
      imageBytes,
      imageMimeType: imageFile.type,
    });

    return ok(
      {
        status: 'CONFIRMED',
        worker_name: workerName,
        worker_name_source: workerNameOverride ? 'TEXT' : extraction.worker_name_source,
        transactions,
      },
      { status: 201 }
    );
  } catch (err) {
    return jsonError(err);
  }
}

function buildUnresolvedMessage(unresolved: Exclude<ResolvedMention, { status: 'MATCHED' }>[]): string {
  const parts = unresolved.map((u) => {
    if (u.status === 'NOT_FOUND') {
      return `No catalog match for "${u.mention}".`;
    }
    const options = u.candidates.slice(0, 3).map((c) => c.name).join(', ');
    return `"${u.mention}" is ambiguous — could be: ${options}.`;
  });
  return `Please clarify: ${parts.join(' ')}`;
}
