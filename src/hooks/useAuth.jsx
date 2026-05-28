import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { db, N8N_SIGNUP_URL, INACTIVITY_MS } from '../lib/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [authStatus, setAuthStatus] = useState('loading'); // loading | login | pending | app
  const inactivityRef = useRef(null);
  const loadedUidRef = useRef(null);

  const resetInactivity = useCallback(() => {
    clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => {
      if (loadedUidRef.current) logout();
    }, INACTIVITY_MS);
  }, []);

  const logout = useCallback(async () => {
    try { await db.auth.signOut(); } catch(e) {}
    const keys = Object.keys(localStorage);
    keys.forEach(k => {
      if (k.startsWith('sb-') || k.includes('supabase')) localStorage.removeItem(k);
    });
    try { sessionStorage.clear(); } catch(e) {}
    setUser(null); setStore(null);
    loadedUidRef.current = null;
    setAuthStatus('login');
  }, []);

  const loadStore = useCallback(async (u) => {
    const { data: storeData } = await db
      .from('stores')
      .select('id, status, store_name, owner_name, customer_tiers, plan_name, subscription_status, plan_expires_at, phone, email, whatsapp_phone, owner_whatsapp, has_image_search, has_voice_search, ai_models, ai_models_limit, virtual_tryon, analytics, product_limit, image_storage_gb, conversation_limit, monthly_budget_inr, address, _conv_used, _ai_used, _vt_used')
      .eq('owner_id', u.id)
      .single();

    if (!storeData) {
      setAuthStatus('pending');
      // Fire signup notification once
      const signupKey = 'karat_signup_fired_' + u.id;
      if (!sessionStorage.getItem(signupKey)) {
        sessionStorage.setItem(signupKey, '1');
        try {
          const name  = u.user_metadata?.full_name || u.email || 'Unknown';
          await fetch(N8N_SIGNUP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: u.id, email: u.email || '', name, phone: u.phone || '' }),
          });
        } catch(e) {}
      }
      return;
    }

    if (storeData.status !== 'active') {
      setAuthStatus('pending');
      return;
    }

    setStore(storeData);
    setAuthStatus('app');
  }, []);

  const handleUser = useCallback(async (u) => {
    if (loadedUidRef.current === u.id) return;
    loadedUidRef.current = u.id;
    setUser(u);
    resetInactivity();
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 10000)
      );
      await Promise.race([loadStore(u), timeout]);
    } catch(e) {
      loadedUidRef.current = null;
      setAuthStatus('login');
    }
  }, [loadStore, resetInactivity]);

  useEffect(() => {
    // Supabase v2 fires INITIAL_SESSION synchronously when the listener is
    // registered — this is the reliable initial-load path and avoids waiting
    // on getSession() which may hang if the access token needs a network refresh.
    const { data: { subscription } } = db.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await handleUser(session.user);
      } else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        setUser(null); setStore(null);
        loadedUidRef.current = null;
        setAuthStatus('login');
      }
    });

    // Belt-and-suspenders: getSession() covers edge cases where INITIAL_SESSION
    // doesn't resolve auth state (e.g. older Supabase clients / token race).
    db.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) handleUser(session.user);
      else setAuthStatus(prev => prev === 'loading' ? 'login' : prev);
    }).catch(() => setAuthStatus(prev => prev === 'loading' ? 'login' : prev));

    // Inactivity reset events
    const events = ['click','keydown','mousemove','touchstart','scroll'];
    events.forEach(e => document.addEventListener(e, resetInactivity, { passive: true }));

    return () => {
      subscription.unsubscribe();
      events.forEach(e => document.removeEventListener(e, resetInactivity));
      clearTimeout(inactivityRef.current);
      loadedUidRef.current = null;
    };
  }, [handleUser, resetInactivity]);

  const loginWithGoogle = useCallback(async () => {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: false },
    });
    if (error) throw error;
  }, []);

  const refreshStore = useCallback(async () => {
    if (!user) return;
    await loadStore(user);
  }, [user, loadStore]);

  const updateStore = useCallback((patch) => {
    setStore(prev => prev ? { ...prev, ...patch } : prev);
  }, []);

  return (
    <AuthContext.Provider value={{ user, store, authStatus, loginWithGoogle, logout, refreshStore, updateStore }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
