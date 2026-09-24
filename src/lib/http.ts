import { NextResponse } from 'next/server';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function jsonError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    // 5xx ApiErrors (e.g. AI_PROVIDER_ERROR from a failed Gemini call) are
    // real server-side failures worth seeing in the dev-server terminal —
    // only 4xx (expected validation/auth rejections) stay quiet. Previously
    // NO ApiError was ever logged here, which made a failing Gemini call on
    // an advisory endpoint (translate-name/verify-photo) invisible on both
    // ends: the client swallows it by design (never blocks checkout), and
    // the server never printed it either.
    if (err.status >= 500) {
      // eslint-disable-next-line no-console
      console.error(`API error ${err.status} ${err.code}:`, err.message, err.details ?? '');
    }
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details ?? null } },
      { status: err.status }
    );
  }
  // eslint-disable-next-line no-console
  console.error('Unhandled API error:', err);
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message, details: null } },
    { status: 500 }
  );
}

export function ok(data: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(data, { status: init?.status ?? 200 });
}
