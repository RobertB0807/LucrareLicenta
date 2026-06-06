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
  apiGetMe,
  apiLogin,
  apiRefreshToken,
  apiRegister,
  apiSendPasswordReset,
  type AuthUserResponse,
} from './auth-api';
import { getAuthStorageItem, removeAuthStorageItem, setAuthStorageItem } from './secure-auth-storage';
import { setAuthFailureHandler, setAuthTokenAccessor } from '../training/api';

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
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const AUTH_STORAGE_KEY = 'auth-session-v1';
const TOKEN_REFRESH_BUFFER_MS = 1000 * 60 * 5;
const TOKEN_REFRESH_RETRY_MS = 1000 * 60;

type PersistedAuthState = {
  token: string;
  refreshToken?: string | null;
  user: AuthUser;
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

  // ── Persist helper ─────────────────────────────────────────────────────────

  const persistSession = useCallback(async (newToken: string, newUser: AuthUser, newRefreshToken?: string | null) => {
    const state: PersistedAuthState = { token: newToken, refreshToken: newRefreshToken ?? null, user: newUser };
    await setAuthStorageItem(AUTH_STORAGE_KEY, JSON.stringify(state));
  }, []);

  const clearPersistedSession = useCallback(async () => {
    await removeAuthStorageItem(AUTH_STORAGE_KEY);
  }, []);

  const clearRefreshTimeout = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
  }, []);

  // ── Hydrate on mount ──────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const raw = await getAuthStorageItem(AUTH_STORAGE_KEY);
        if (!raw || cancelled) {
          return;
        }

        const parsed = JSON.parse(raw) as PersistedAuthState;
        if (!parsed.token || !parsed.user?.id) {
          await clearPersistedSession();
          return;
        }

        // Validate token with backend before trusting it.
        try {
          const freshUser = await apiGetMe(parsed.token);
          if (cancelled) {
            return;
          }
          const mappedUser = mapUserResponse(freshUser);
          setToken(parsed.token);
          setRefreshToken(parsed.refreshToken ?? null);
          setUser(mappedUser);
          tokenRef.current = parsed.token;
          refreshTokenRef.current = parsed.refreshToken ?? null;
          // Update persisted user data in case display_name changed server-side.
          await persistSession(parsed.token, mappedUser, parsed.refreshToken ?? null);
        } catch {
          if (parsed.refreshToken) {
            try {
              const refreshed = await apiRefreshToken(parsed.token, parsed.refreshToken);
              if (cancelled) {
                return;
              }
              const mappedUser = mapUserResponse(refreshed.user);
              setToken(refreshed.access_token);
              setRefreshToken(refreshed.refresh_token ?? parsed.refreshToken);
              setUser(mappedUser);
              tokenRef.current = refreshed.access_token;
              refreshTokenRef.current = refreshed.refresh_token ?? parsed.refreshToken;
              await persistSession(refreshed.access_token, mappedUser, refreshed.refresh_token ?? parsed.refreshToken);
              return;
            } catch {
              // Token and refresh token are invalid, so clear the local session.
            }
          }
          await clearPersistedSession();
        }
      } catch {
        // Corrupt stored data — ignore.
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
    async (email: string, password: string) => {
      const response = await apiLogin(email, password);
      const mappedUser = mapUserResponse(response.user);
      setToken(response.access_token);
      setRefreshToken(response.refresh_token ?? null);
      setUser(mappedUser);
      tokenRef.current = response.access_token;
      refreshTokenRef.current = response.refresh_token ?? null;
      await persistSession(response.access_token, mappedUser, response.refresh_token ?? null);
    },
    [persistSession]
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const response = await apiRegister(email, password, displayName);
      const mappedUser = mapUserResponse(response.user);
      setToken(response.access_token);
      setRefreshToken(response.refresh_token ?? null);
      setUser(mappedUser);
      tokenRef.current = response.access_token;
      refreshTokenRef.current = response.refresh_token ?? null;
      await persistSession(response.access_token, mappedUser, response.refresh_token ?? null);
    },
    [persistSession]
  );

  const resetPassword = useCallback(async (email: string) => {
    await apiSendPasswordReset(email);
  }, []);

  const logout = useCallback(async () => {
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    tokenRef.current = null;
    refreshTokenRef.current = null;
    clearRefreshTimeout();
    await clearPersistedSession();
  }, [clearPersistedSession, clearRefreshTimeout]);

  const refreshAccessToken = useCallback(async () => {
    const currentToken = tokenRef.current;
    const currentRefreshToken = refreshTokenRef.current;
    if (!currentToken) {
      return;
    }
    const expiresAt = getTokenExpiryMs(currentToken);
    if (expiresAt && expiresAt <= Date.now()) {
      await logout();
      return;
    }

    try {
      const response = await apiRefreshToken(currentToken, currentRefreshToken);
      const mappedUser = mapUserResponse(response.user);
      setToken(response.access_token);
      setRefreshToken(response.refresh_token ?? currentRefreshToken ?? null);
      setUser(mappedUser);
      tokenRef.current = response.access_token;
      refreshTokenRef.current = response.refresh_token ?? currentRefreshToken ?? null;
      await persistSession(response.access_token, mappedUser, response.refresh_token ?? currentRefreshToken ?? null);
    } catch (error) {
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
    setAuthFailureHandler(() => {
      void logout();
    });
  }, [logout]);

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
      resetPassword,
      logout,
    }),
    [user, token, isAuthenticated, isLoading, login, register, resetPassword, logout]
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
