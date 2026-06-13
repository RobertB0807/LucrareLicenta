import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  apiDeleteAccount,
  apiGetMe,
  apiLogin,
  apiRefreshToken,
  apiRegister,
  apiSendPasswordReset,
  apiUpdateProfile,
  type AuthUserResponse,
} from './auth-api';
import {
  getAuthStorageItem,
  removeAuthStorageItem,
  setAuthStorageItem,
} from './secure-auth-storage';
import { setAuthFailureHandler, setAuthTokenAccessor } from '../training/api';
import { clearTrainingLocalCache } from '../training/local-cache';

// ── Types ──────────────────────────────────────────────────────────────────────

type AuthUser = {
  id: string;
  email: string;
  displayName: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  updateProfile: (displayName: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const AUTH_STORAGE_KEY = 'auth-session-v2';
const LEGACY_AUTH_STORAGE_KEY = 'auth-session-v1';
const REMEMBER_SESSION_MS = 1000 * 60 * 60 * 24 * 7;
const TOKEN_REFRESH_BUFFER_MS = 1000 * 60 * 5;
const TOKEN_REFRESH_RETRY_MS = 1000 * 60;

type PersistedAuthState = {
  version: 2;
  token: string;
  refreshToken: string;
  user: AuthUser;
  rememberedUntil: number;
};

// ── Context ────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

function mapUserResponse(u: AuthUserResponse): AuthUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
  };
}

function decodeBase64Url(payload: string): string | null {
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${'='.repeat(paddingLength)}`;
  const atobFn = (globalThis as { atob?: (data: string) => string }).atob;
  if (typeof atobFn !== 'function') {
    return null;
  }
  try {
    return atobFn(padded);
  } catch {
    return null;
  }
}

function getTokenExpiryMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  const decoded = decodeBase64Url(parts[1]);
  if (!decoded) {
    return null;
  }
  try {
    const payload = JSON.parse(decoded) as { exp?: number };
    if (typeof payload.exp === 'number') {
      return payload.exp * 1000;
    }
  } catch {
    return null;
  }
  return null;
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authGenerationRef = useRef(0);
  const shouldPersistRef = useRef(false);
  const rememberedUntilRef = useRef<number | null>(null);

  // Keep tokenRef in sync for the accessor function.
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    refreshTokenRef.current = refreshToken;
  }, [refreshToken]);

  // Wire up the token accessor so the training API client can inject auth headers.
  useEffect(() => {
    setAuthTokenAccessor(() => tokenRef.current);
  }, []);


  const isAuthenticated = useMemo(() => Boolean(token && user), [token, user]);

  const clearPersistedSession = useCallback(async () => {
    await Promise.all([
      removeAuthStorageItem(AUTH_STORAGE_KEY),
      removeAuthStorageItem(LEGACY_AUTH_STORAGE_KEY),
    ]);
  }, []);

  const persistSession = useCallback(
    async (
      nextToken: string,
      nextRefreshToken: string | null,
      nextUser: AuthUser,
      rememberedUntil: number
    ) => {
      if (!nextRefreshToken || rememberedUntil <= Date.now()) {
        await clearPersistedSession();
        return;
      }

      const state: PersistedAuthState = {
        version: 2,
        token: nextToken,
        refreshToken: nextRefreshToken,
        user: nextUser,
        rememberedUntil,
      };
      await setAuthStorageItem(AUTH_STORAGE_KEY, JSON.stringify(state));
    },
    [clearPersistedSession]
  );

  const clearRefreshTimeout = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        await removeAuthStorageItem(LEGACY_AUTH_STORAGE_KEY);
        const raw = await getAuthStorageItem(AUTH_STORAGE_KEY);
        if (!raw || cancelled) {
          return;
        }

        const parsed = JSON.parse(raw) as Partial<PersistedAuthState>;
        if (
          parsed.version !== 2 ||
          typeof parsed.token !== 'string' ||
          typeof parsed.refreshToken !== 'string' ||
          !parsed.refreshToken ||
          typeof parsed.rememberedUntil !== 'number' ||
          !parsed.user?.id ||
          typeof parsed.user.email !== 'string' ||
          typeof parsed.user.displayName !== 'string' ||
          parsed.rememberedUntil <= Date.now()
        ) {
          await clearPersistedSession();
          return;
        }

        let nextToken = parsed.token;
        let nextRefreshToken = parsed.refreshToken;
        let nextUser: AuthUser = parsed.user;
        const accessExpiresAt = getTokenExpiryMs(parsed.token);
        let shouldRefresh = accessExpiresAt === null || accessExpiresAt <= Date.now();

        if (!shouldRefresh) {
          try {
            const freshUser = await apiGetMe(parsed.token);
            nextUser = mapUserResponse(freshUser);
          } catch {
            shouldRefresh = true;
          }
        }

        if (shouldRefresh) {
          const refreshed = await apiRefreshToken(parsed.token, parsed.refreshToken);
          nextToken = refreshed.access_token;
          nextRefreshToken = refreshed.refresh_token ?? parsed.refreshToken;
          nextUser = mapUserResponse(refreshed.user);
        }

        if (cancelled) {
          return;
        }

        shouldPersistRef.current = true;
        rememberedUntilRef.current = parsed.rememberedUntil;
        tokenRef.current = nextToken;
        refreshTokenRef.current = nextRefreshToken;
        setToken(nextToken);
        setRefreshToken(nextRefreshToken);
        setUser(nextUser);
        await persistSession(
          nextToken,
          nextRefreshToken,
          nextUser,
          parsed.rememberedUntil
        );
      } catch {
        shouldPersistRef.current = false;
        rememberedUntilRef.current = null;
        await clearPersistedSession().catch(() => undefined);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [clearPersistedSession, persistSession]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const login = useCallback(
    async (email: string, password: string, rememberMe = true) => {
      const loginGeneration = authGenerationRef.current + 1;
      authGenerationRef.current = loginGeneration;
      const response = await apiLogin(email, password);
      if (authGenerationRef.current !== loginGeneration) {
        return;
      }
      const mappedUser = mapUserResponse(response.user);
      setToken(response.access_token);
      setRefreshToken(response.refresh_token ?? null);
      setUser(mappedUser);
      tokenRef.current = response.access_token;
      refreshTokenRef.current = response.refresh_token ?? null;
      shouldPersistRef.current = rememberMe;
      rememberedUntilRef.current = rememberMe ? Date.now() + REMEMBER_SESSION_MS : null;

      if (rememberMe && rememberedUntilRef.current) {
        await persistSession(
          response.access_token,
          response.refresh_token ?? null,
          mappedUser,
          rememberedUntilRef.current
        ).catch(() => undefined);
      } else {
        await clearPersistedSession().catch(() => undefined);
      }
    },
    [clearPersistedSession, persistSession]
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const registerGeneration = authGenerationRef.current + 1;
      authGenerationRef.current = registerGeneration;
      const response = await apiRegister(email, password, displayName);
      if (authGenerationRef.current !== registerGeneration) {
        return;
      }
      const mappedUser = mapUserResponse(response.user);
      setToken(response.access_token);
      setRefreshToken(response.refresh_token ?? null);
      setUser(mappedUser);
      tokenRef.current = response.access_token;
      refreshTokenRef.current = response.refresh_token ?? null;
      shouldPersistRef.current = false;
      rememberedUntilRef.current = null;
      await clearPersistedSession().catch(() => undefined);
    },
    [clearPersistedSession]
  );

  const resetPassword = useCallback(async (email: string) => {
    await apiSendPasswordReset(email);
  }, []);

  const logout = useCallback(async () => {
    authGenerationRef.current += 1;
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    tokenRef.current = null;
    refreshTokenRef.current = null;
    shouldPersistRef.current = false;
    rememberedUntilRef.current = null;
    clearRefreshTimeout();
    await clearPersistedSession();
  }, [clearPersistedSession, clearRefreshTimeout]);

  const updateProfile = useCallback(
    async (displayName: string) => {
      const currentToken = tokenRef.current;
      if (!currentToken) {
        throw new Error('Sesiune expirată. Te rog autentifică-te din nou.');
      }

      const updatedUser = mapUserResponse(await apiUpdateProfile(currentToken, displayName));
      setUser(updatedUser);

      const currentRefreshToken = refreshTokenRef.current;
      const rememberedUntil = rememberedUntilRef.current;
      if (
        shouldPersistRef.current &&
        currentRefreshToken &&
        rememberedUntil &&
        rememberedUntil > Date.now()
      ) {
        await persistSession(
          currentToken,
          currentRefreshToken,
          updatedUser,
          rememberedUntil
        );
      }
    },
    [persistSession]
  );

  const deleteAccount = useCallback(async () => {
    const currentToken = tokenRef.current;
    const currentUserId = user?.id;
    if (!currentToken || !currentUserId) {
      throw new Error('Sesiune expirată. Te rog autentifică-te din nou.');
    }

    await apiDeleteAccount(currentToken);
    await Promise.allSettled([
      clearTrainingLocalCache(currentUserId),
      logout(),
    ]);
  }, [logout, user?.id]);

  const refreshAccessToken = useCallback(async () => {
    const refreshGeneration = authGenerationRef.current;
    const currentToken = tokenRef.current;
    const currentRefreshToken = refreshTokenRef.current;
    if (!currentToken || !currentRefreshToken) {
      await logout();
      return;
    }

    const rememberedUntil = rememberedUntilRef.current;
    if (shouldPersistRef.current && (!rememberedUntil || rememberedUntil <= Date.now())) {
      await logout();
      return;
    }

    try {
      const response = await apiRefreshToken(currentToken, currentRefreshToken);
      if (
        authGenerationRef.current !== refreshGeneration ||
        tokenRef.current !== currentToken
      ) {
        return;
      }
      const mappedUser = mapUserResponse(response.user);
      setToken(response.access_token);
      setRefreshToken(response.refresh_token ?? currentRefreshToken ?? null);
      setUser(mappedUser);
      tokenRef.current = response.access_token;
      refreshTokenRef.current = response.refresh_token ?? currentRefreshToken ?? null;
      if (shouldPersistRef.current && rememberedUntil) {
        await persistSession(
          response.access_token,
          response.refresh_token ?? currentRefreshToken,
          mappedUser,
          rememberedUntil
        );
      }
    } catch (error) {
      if (
        authGenerationRef.current !== refreshGeneration ||
        tokenRef.current !== currentToken
      ) {
        return;
      }
      if (error instanceof Error && error.message.includes('Sesiune expirată')) {
        await logout();
        return;
      }
      clearRefreshTimeout();
      refreshTimeoutRef.current = setTimeout(() => {
        void refreshAccessToken();
      }, TOKEN_REFRESH_RETRY_MS);
    }
  }, [clearRefreshTimeout, logout, persistSession]);

  useEffect(() => {
    setAuthFailureHandler((failedToken) => {
      if (failedToken && tokenRef.current === failedToken) {
        void refreshAccessToken();
      }
    });
  }, [refreshAccessToken]);

  useEffect(() => {
    if (!token) {
      clearRefreshTimeout();
      return;
    }
    const expiresAt = getTokenExpiryMs(token);
    if (!expiresAt) {
      return;
    }
    const refreshAt = expiresAt - TOKEN_REFRESH_BUFFER_MS;
    const delay = Math.max(refreshAt - Date.now(), 0);
    clearRefreshTimeout();
    refreshTimeoutRef.current = setTimeout(() => {
      void refreshAccessToken();
    }, delay);
    return () => {
      clearRefreshTimeout();
    };
  }, [clearRefreshTimeout, refreshAccessToken, token]);

  // ── Value ──────────────────────────────────────────────────────────────────

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated,
      isLoading,
      login,
      register,
      updateProfile,
      deleteAccount,
      resetPassword,
      logout,
    }),
    [
      user,
      token,
      isAuthenticated,
      isLoading,
      login,
      register,
      updateProfile,
      deleteAccount,
      resetPassword,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return context;
}
