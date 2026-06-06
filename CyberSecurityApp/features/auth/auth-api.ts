import { Platform } from 'react-native';
import Constants from 'expo-constants';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AuthUserResponse = {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
};

export type AuthTokenResponse = {
  access_token: string;
  token_type: string;
  user: AuthUserResponse;
};

// ── Base URL resolution (shared logic with training/api.ts) ────────────────────

const DEFAULT_API_BASE_URL =
  Platform.select({
    android: 'http://10.0.2.2:8000',
    default: 'http://127.0.0.1:8000',
  }) ?? 'http://127.0.0.1:8000';

function getExpoLocalApiBaseUrl(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2
      ?.extra?.expoClient?.hostUri;

  if (!hostUri) {
    return null;
  }

  const withoutScheme = hostUri.includes('://') ? hostUri.split('://')[1] : hostUri;
  const host = withoutScheme.split(':')[0];

  if (!host) {
    return null;
  }

  return `http://${host}:8000`;
}

function getWebApiBaseUrl(): string | null {
  if (Platform.OS !== 'web') {
    return null;
  }

  const host = globalThis.location?.hostname;
  if (!host) {
    return null;
  }

  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://127.0.0.1:8000';
  }

  return null;
}

const API_BASE_URL_CANDIDATES = Array.from(
  new Set(
    [
      getWebApiBaseUrl(),
      process.env.EXPO_PUBLIC_API_BASE_URL?.trim(),
      getExpoLocalApiBaseUrl(),
      DEFAULT_API_BASE_URL,
    ].filter((url): url is string => Boolean(url))
  )
);

// ── Internal fetch helpers ─────────────────────────────────────────────────────

async function authPost<TResponse>(path: string, payload: unknown, fallbackError: string): Promise<TResponse> {
  let lastError: Error | null = null;

  for (const baseUrl of API_BASE_URL_CANDIDATES) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        throw new Error('Email sau parolă incorectă.');
      }
      if (response.status === 409) {
        throw new Error('Există deja un cont cu acest email.');
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? fallbackError);
      }

      return (await response.json()) as TResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(fallbackError);
      // If we got a specific API error (not a network error), don't try other candidates.
      if (error instanceof Error && !error.message.includes('fetch')) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error(fallbackError);
}

async function authGet<TResponse>(path: string, token: string, fallbackError: string): Promise<TResponse> {
  let lastError: Error | null = null;

  for (const baseUrl of API_BASE_URL_CANDIDATES) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        throw new Error('Sesiune expirată. Te rog autentifică-te din nou.');
      }
      if (!response.ok) {
        throw new Error(fallbackError);
      }

      return (await response.json()) as TResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(fallbackError);
      if (error instanceof Error && !error.message.includes('fetch')) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error(fallbackError);
}

async function authPostWithToken<TResponse>(
  path: string,
  token: string,
  fallbackError: string
): Promise<TResponse> {
  let lastError: Error | null = null;

  for (const baseUrl of API_BASE_URL_CANDIDATES) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        throw new Error('Sesiune expirată. Te rog autentifică-te din nou.');
      }
      if (!response.ok) {
        throw new Error(fallbackError);
      }

      return (await response.json()) as TResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(fallbackError);
      if (error instanceof Error && !error.message.includes('fetch')) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error(fallbackError);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function apiLogin(email: string, password: string): Promise<AuthTokenResponse> {
  return authPost<AuthTokenResponse>(
    '/auth/login',
    { email, password },
    'Nu am putut realiza autentificarea.'
  );
}

export async function apiRegister(
  email: string,
  password: string,
  displayName: string
): Promise<AuthTokenResponse> {
  return authPost<AuthTokenResponse>(
    '/auth/register',
    { email, password, display_name: displayName },
    'Nu am putut crea contul.'
  );
}

export async function apiGetMe(token: string): Promise<AuthUserResponse> {
  return authGet<AuthUserResponse>(
    '/auth/me',
    token,
    'Nu am putut verifica sesiunea curentă.'
  );
}

export async function apiRefreshToken(token: string): Promise<AuthTokenResponse> {
  return authPostWithToken<AuthTokenResponse>(
    '/auth/refresh',
    token,
    'Nu am putut reînnoi sesiunea curentă.'
  );
}
