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
  refresh_token?: string;
  expires_in?: string | number;
  token_type: string;
  user: AuthUserResponse;
};

type FirebaseAuthResponse = {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  localId: string;
  email?: string;
  displayName?: string;
};

type FirebaseRefreshResponse = {
  id_token: string;
  refresh_token: string;
  expires_in: string;
  user_id: string;
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

const FIREBASE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim() ?? '';

export function isFirebaseAuthEnabled(): boolean {
  return FIREBASE_API_KEY.length > 0;
}

function firebaseAuthUrl(path: string): string {
  return `https://identitytoolkit.googleapis.com/v1/${path}?key=${encodeURIComponent(FIREBASE_API_KEY)}`;
}

function firebaseSecureTokenUrl(): string {
  return `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE_API_KEY)}`;
}

function mapFirebaseError(code: string | undefined, fallbackError: string): string {
  if (code === 'EMAIL_EXISTS') return 'Există deja un cont cu acest email.';
  if (code === 'INVALID_LOGIN_CREDENTIALS' || code === 'EMAIL_NOT_FOUND' || code === 'INVALID_PASSWORD') {
    return 'Email sau parolă incorectă.';
  }
  if (code === 'USER_DISABLED') return 'Acest cont este dezactivat.';
  if (code === 'WEAK_PASSWORD') return 'Parola este prea slabă.';
  if (code === 'INVALID_EMAIL') return 'Adresa de email nu este validă.';
  if (code === 'TOKEN_EXPIRED' || code === 'INVALID_ID_TOKEN' || code === 'USER_NOT_FOUND') {
    return 'Sesiune expirată. Te rog autentifică-te din nou.';
  }
  return fallbackError;
}

async function firebaseJson<TResponse>(
  path: string,
  payload: unknown,
  fallbackError: string
): Promise<TResponse> {
  const response = await fetch(firebaseAuthUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = (body as { error?: { message?: string } }).error?.message;
    throw new Error(mapFirebaseError(code, fallbackError));
  }

  return body as TResponse;
}

async function firebaseRefreshToken(refreshToken: string): Promise<FirebaseRefreshResponse> {
  const response = await fetch(firebaseSecureTokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = (body as { error?: { message?: string } }).error?.message;
    throw new Error(mapFirebaseError(code, 'Nu am putut reînnoi sesiunea curentă.'));
  }

  return body as FirebaseRefreshResponse;
}

async function buildFirebaseTokenResponse(
  authResponse: FirebaseAuthResponse,
  fallbackError: string
): Promise<AuthTokenResponse> {
  const localUser = await apiGetMe(authResponse.idToken).catch((error) => {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(fallbackError);
  });

  return {
    access_token: authResponse.idToken,
    refresh_token: authResponse.refreshToken,
    expires_in: authResponse.expiresIn,
    token_type: 'bearer',
    user: localUser,
  };
}

async function firebaseLogin(email: string, password: string): Promise<AuthTokenResponse> {
  const authResponse = await firebaseJson<FirebaseAuthResponse>(
    'accounts:signInWithPassword',
    {
      email,
      password,
      returnSecureToken: true,
    },
    'Nu am putut realiza autentificarea.'
  );
  return buildFirebaseTokenResponse(authResponse, 'Firebase Auth este activ, dar backend-ul nu poate valida token-ul.');
}

async function firebaseRegister(
  email: string,
  password: string,
  displayName: string
): Promise<AuthTokenResponse> {
  const created = await firebaseJson<FirebaseAuthResponse>(
    'accounts:signUp',
    {
      email,
      password,
      returnSecureToken: true,
    },
    'Nu am putut crea contul.'
  );

  const updated = await firebaseJson<FirebaseAuthResponse>(
    'accounts:update',
    {
      idToken: created.idToken,
      displayName,
      returnSecureToken: true,
    },
    'Contul Firebase a fost creat, dar numele nu a putut fi salvat.'
  );

  return buildFirebaseTokenResponse(
    {
      ...created,
      ...updated,
      refreshToken: updated.refreshToken || created.refreshToken,
      expiresIn: updated.expiresIn || created.expiresIn,
    },
    'Firebase Auth este activ, dar backend-ul nu poate valida token-ul.'
  );
}

async function firebaseRefreshAuthToken(refreshToken: string): Promise<AuthTokenResponse> {
  const refreshed = await firebaseRefreshToken(refreshToken);
  const localUser = await apiGetMe(refreshed.id_token);
  return {
    access_token: refreshed.id_token,
    refresh_token: refreshed.refresh_token,
    expires_in: refreshed.expires_in,
    token_type: 'bearer',
    user: localUser,
  };
}

async function firebaseSendPasswordReset(email: string): Promise<void> {
  await firebaseJson(
    'accounts:sendOobCode',
    {
      requestType: 'PASSWORD_RESET',
      email,
    },
    'Nu am putut trimite emailul de resetare.'
  );
}

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
      if (response.status === 409) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? fallbackError);
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? fallbackError);
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

async function authWrite<TResponse>(
  path: string,
  method: 'PATCH' | 'DELETE',
  token: string,
  payload: unknown,
  fallbackError: string
): Promise<TResponse> {
  let lastError: Error | null = null;

  for (const baseUrl of API_BASE_URL_CANDIDATES) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: method === 'DELETE' ? undefined : JSON.stringify(payload),
      });

      if (response.status === 401) {
        throw new Error('Sesiune expirată. Te rog autentifică-te din nou.');
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? fallbackError);
      }
      if (response.status === 204) {
        return undefined as TResponse;
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

async function authRefreshPost<TResponse>(
  refreshToken: string,
  fallbackError: string
): Promise<TResponse> {
  let lastError: Error | null = null;

  for (const baseUrl of API_BASE_URL_CANDIDATES) {
    try {
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (response.status === 401) {
        throw new Error('Sesiune expirată. Te rog autentifică-te din nou.');
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? fallbackError);
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
  if (isFirebaseAuthEnabled()) {
    return firebaseLogin(email, password);
  }

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
  if (isFirebaseAuthEnabled()) {
    return firebaseRegister(email, password, displayName);
  }

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

export async function apiUpdateProfile(
  token: string,
  displayName: string
): Promise<AuthUserResponse> {
  return authWrite<AuthUserResponse>(
    '/auth/me',
    'PATCH',
    token,
    { display_name: displayName },
    'Nu am putut actualiza profilul.'
  );
}

export async function apiDeleteAccount(token: string): Promise<void> {
  return authWrite<void>(
    '/auth/me',
    'DELETE',
    token,
    undefined,
    'Nu am putut șterge contul.'
  );
}

export async function apiRefreshToken(_token: string, refreshToken?: string | null): Promise<AuthTokenResponse> {
  if (isFirebaseAuthEnabled()) {
    if (!refreshToken) {
      throw new Error('Sesiune expirată. Te rog autentifică-te din nou.');
    }
    return firebaseRefreshAuthToken(refreshToken);
  }

  if (!refreshToken) {
    throw new Error('Sesiune expirată. Te rog autentifică-te din nou.');
  }

  return authRefreshPost<AuthTokenResponse>(refreshToken, 'Nu am putut reînnoi sesiunea curentă.');
}

export async function apiSendPasswordReset(email: string): Promise<void> {
  if (!isFirebaseAuthEnabled()) {
    throw new Error('Resetarea parolei este disponibilă după activarea Firebase Auth.');
  }
  return firebaseSendPasswordReset(email);
}
