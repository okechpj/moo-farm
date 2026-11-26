import { useAuthStore } from '../stores/authStore';
import { AuthSessionPayload } from '../types/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let refreshPromise: Promise<boolean> | null = null;

export async function tryRefreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        useAuthStore.getState().clearSession();
        return false;
      }

      const body = (await response.json()) as {
        success: boolean;
        data: AuthSessionPayload;
      };

      if (body.success && body.data) {
        useAuthStore.getState().setSession(body.data);
        return true;
      }
      useAuthStore.getState().clearSession();
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  skipAuth?: boolean;
  retryOn401?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, skipAuth = false, retryOn401 = true } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = useAuthStore.getState().accessToken;
  if (!skipAuth && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      'Could not reach the farm server. Check your internet connection and try again.',
    );
  }

  if (response.status === 401 && !skipAuth && retryOn401) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, retryOn401: false });
    }
  }

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const errObj = json?.error;
    throw new ApiClientError(
      response.status,
      errObj?.code ?? 'REQUEST_FAILED',
      errObj?.message ?? 'Something went wrong. Please try again.',
      errObj?.details,
    );
  }

  return (json?.data ?? json) as T;
}
