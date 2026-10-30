export class PlatformApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export async function platformRequest<T>(
  path: string,
  body?: unknown,
  csrf?: string | null,
): Promise<T> {
  const response = await fetch(`/api/platform/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(body === undefined
        ? {}
        : {
            'content-type': 'application/json',
            'x-orkobi-request': '1',
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
          }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('orkobi:unauthenticated'));
    const error = value && typeof value === 'object' && 'error' in value ? value.error : null;
    throw new PlatformApiError(
      error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'unknown',
    );
  }
  return value as T;
}
