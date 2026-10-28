import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { login, logout, register, setSessionExpiredHandler } from '../api';
import type { RegisterBody } from '../api/types';
import { clearTokens, getTokens, loadTokens } from '../api/tokens';

interface AuthValue {
  isAuthed: boolean;
  isReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (body: RegisterBody) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthed, setAuthed] = useState(false);
  const [isReady, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    setSessionExpiredHandler(() => {
      if (active) setAuthed(false);
    });
    loadTokens()
      .then((tokens) => {
        if (active) setAuthed(Boolean(tokens));
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      setSessionExpiredHandler(null);
    };
  }, []);

  async function signIn(email: string, password: string) {
    await login(email.trim(), password);
    setAuthed(true);
  }

  async function signUp(body: RegisterBody) {
    await register(body);
    setAuthed(true);
  }

  async function signOut() {
    const tokens = getTokens();
    try {
      if (tokens) await logout(tokens.refresh);
    } finally {
      await clearTokens();
      setAuthed(false);
    }
  }

  const value = useMemo(
    () => ({ isAuthed, isReady, signIn, signUp, signOut }),
    [isAuthed, isReady],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}
