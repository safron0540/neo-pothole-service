import React, { createContext, useContext, useMemo, useState } from 'react';

// Заглушка авторизации. Позже: токены в expo-secure-store и вызовы src/api.
interface AuthValue {
  isAuthed: boolean;
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthed, setAuthed] = useState(false);
  const value = useMemo(
    () => ({ isAuthed, signIn: () => setAuthed(true), signOut: () => setAuthed(false) }),
    [isAuthed],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}
