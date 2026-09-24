'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabaseBrowser, setRememberPreference } from './supabase-browser';
import { isManager } from './roles';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  operatorEmail: string | null;
  accessToken: string | null;
  isManager: boolean;
  signIn: (email: string, password: string, remember: boolean) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Wraps the app with the operator's Supabase Auth session. Checkout still
 * works with no session at all (see PRD 7 — fault tolerance / operatorId is
 * optional server-side); this is only needed for routes that require an
 * operator identity (adding catalog items, stock overrides) and for
 * attaching operator_id to checkouts for the audit trail.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = supabaseBrowser();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      operatorEmail: session?.user?.email ?? null,
      accessToken: session?.access_token ?? null,
      isManager: isManager(session),
      signIn: async (email, password, remember) => {
        // Must be set before signInWithPassword writes the session, since
        // our storage adapter reads this preference at write time to pick
        // localStorage (persists across browser restarts) vs sessionStorage
        // (cleared when the tab/browser closes).
        setRememberPreference(remember);
        const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      signOut: async () => {
        await supabaseBrowser().auth.signOut();
      },
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>.');
  return ctx;
}
