'use client';

import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState } from 'react';
import { getFirebaseAuth } from '@/firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function signOutUser(): Promise<void> {
  return signOut(getFirebaseAuth());
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Firebase Auth only runs in the browser, so prerendered HTML always shows the loading state.
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(
    () => onAuthStateChanged(getFirebaseAuth(), (user) => setState({ user, loading: false })),
    [],
  );

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
