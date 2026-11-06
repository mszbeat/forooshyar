'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError, tokenStore } from './api';
import type { Shop } from './api';

type AuthValue = {
  ready: boolean;
  token: string | null;
  shop: Shop | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, shopName: string) => Promise<void>;
  logout: () => void;
  reloadShop: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const existing = tokenStore.get();
    if (!existing) { setReady(true); return; }
    setToken(existing);
    api.shop()
      .then(setShop)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) { tokenStore.clear(); setToken(null); }
      })
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password);
    tokenStore.set(result.accessToken);
    setToken(result.accessToken);
    setShop(await api.shop());
  }, []);

  const register = useCallback(async (email: string, password: string, shopName: string) => {
    const result = await api.register(email, password, shopName);
    tokenStore.set(result.accessToken);
    setToken(result.accessToken);
    setShop(await api.shop());
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setToken(null);
    setShop(null);
    window.location.assign('/login');
  }, []);

  const reloadShop = useCallback(async () => {
    try { setShop(await api.shop()); } catch { /* keep previous snapshot */ }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ ready, token, shop, login, register, logout, reloadShop }),
    [ready, token, shop, login, register, logout, reloadShop],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
