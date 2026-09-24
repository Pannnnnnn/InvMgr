'use client';

// Thin fetch wrapper for calling our own /api/* routes from client
// components. Centralizes attaching the operator's bearer token (when
// signed in — see src/lib/auth-context.tsx) and normalizing error shapes
// from src/lib/http.ts's ApiError responses.

export type ApiErrorShape = {
  error: { code: string; message: string; details: unknown };
};

export class ClientApiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const shape = body as ApiErrorShape | null;
    throw new ClientApiError(
      res.status,
      shape?.error?.code ?? 'UNKNOWN_ERROR',
      shape?.error?.message ?? `Request failed with status ${res.status}`,
      shape?.error?.details ?? null
    );
  }
  return body as T;
}

export async function apiGet<T>(path: string, accessToken?: string | null): Promise<T> {
  const res = await fetch(path, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  return parseOrThrow<T>(res);
}

export async function apiJson<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
  accessToken?: string | null
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return parseOrThrow<T>(res);
}

export async function apiForm<T>(
  path: string,
  formData: FormData,
  accessToken?: string | null
): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: formData,
  });
  return parseOrThrow<T>(res);
}
