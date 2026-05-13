import AsyncStorage from '@react-native-async-storage/async-storage';
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

import { apiGetMe, apiLogin, apiRegister, type AuthUserResponse } from './auth-api';
import { setAuthTokenAccessor } from '../training/api';

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
  logout: () => Promise<void>;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const AUTH_STORAGE_KEY = 'auth-session-v1';

type PersistedAuthState = {
  token: string;
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

// ── Provider ───────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  // Keep tokenRef in sync for the accessor function.
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Wire up the token accessor so the training API client can inject auth headers.
  useEffect(() => {
    setAuthTokenAccessor(() => tokenRef.current);
  }, []);

  const isAuthenticated = useMemo(() => Boolean(token && user), [token, user]);

  // ── Persist helper ─────────────────────────────────────────────────────────

  const persistSession = useCallback(async (newToken: string, newUser: AuthUser) => {
    const state: PersistedAuthState = { token: newToken, user: newUser };
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
  }, []);

  const clearPersistedSession = useCallback(async () => {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  // ── Hydrate on mount ──────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
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
          setUser(mappedUser);
          tokenRef.current = parsed.token;
          // Update persisted user data in case display_name changed server-side.
          await persistSession(parsed.token, mappedUser);
        } catch {
          // Token expired or invalid — clear it silently.
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
      setUser(mappedUser);
      tokenRef.current = response.access_token;
      await persistSession(response.access_token, mappedUser);
    },
    [persistSession]
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const response = await apiRegister(email, password, displayName);
      const mappedUser = mapUserResponse(response.user);
      setToken(response.access_token);
      setUser(mappedUser);
      tokenRef.current = response.access_token;
      await persistSession(response.access_token, mappedUser);
    },
    [persistSession]
  );

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    tokenRef.current = null;
    await clearPersistedSession();
  }, [clearPersistedSession]);

  // ── Value ──────────────────────────────────────────────────────────────────

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated,
      isLoading,
      login,
      register,
      logout,
    }),
    [user, token, isAuthenticated, isLoading, login, register, logout]
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
