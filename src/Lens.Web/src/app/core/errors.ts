import { HttpErrorResponse } from '@angular/common/http';

/** A readable message from any failure: the API's { error } body when present, else the status, else the exception. */
export function errorMessage(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    const body: unknown = e.error;
    if (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string') {
      return (body as { error: string }).error;
    }
    if (typeof body === 'string' && body.trim().length > 0 && body.length < 400) return body;
    if (e.status === 0) return 'The API is not reachable.';
    return `HTTP ${e.status} ${e.statusText}`;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
