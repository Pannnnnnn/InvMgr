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
