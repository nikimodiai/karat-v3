import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { db, N8N_SIGNUP_URL, INACTIVITY_MS } from '../lib/config';

// ── Session types ─────────────────────────────────────────────────────────────
// 'owner'      – Google OAuth (Supabase Auth), full access
// 'store_user' – username + password (store_users table RPC), role-limited

const AuthContext = createContext(null);
const STORE_USER_KEY = 'karat_store_user_session';

const getInitialAuthState = () => {
  let initialUser = null;
  let initialStore = null;
  let initialStoreUser = null;
  let initialStatus = 'loading';

  try {
    // Check store_user (staff) session first
    const suStr = localStorage.getItem(STORE_USER_KEY);
    if (suStr) {
      const su = JSON.parse(suStr);
      if (su?.id && su?.owner_id) {
        const cachedStoreStr = localStorage.getItem('karat_cached_store');
        if (cachedStoreStr) {
          initialStore = JSON.parse(cachedStoreStr);
          initialStoreUser = su;
          initialStatus = 'app';
          return { initialUser: null, initialStore, initialStoreUser, initialStatus };
        }
      }
    }

    const storedStr = localStorage.getItem('karat-auth-v3');
    if (storedStr) {
      const parsed = JSON.parse(storedStr);
      const user = parsed?.user || parsed?.currentSession?.user;
      if (user) {
        initialUser = user;
        const cachedStoreStr = localStorage.getItem('karat_cached_store');
        if (cachedStoreStr) {
          initialStore = JSON.parse(cachedStoreStr);
          initialStatus = 'app';
        }
      } else {
        initialStatus = 'login';
      }
    } else {
      initialStatus = 'login';
    }
  } catch (e) {
    // Fallback to loading
  }

  return { initialUser, initialStore, initialStoreUser: null, initialStatus };
};

export function AuthProvider({ children }) {
  const { initialUser, initialStore, initialStoreUser, initialStatus } = getInitialAuthState();
  const [user, setUser]           = useState(initialUser);
  const [store, setStore]         = useState(initialStore);
  const [storeUser, setStoreUser] = useState(initialStoreUser); // staff member session
  const [authStatus, setAuthStatus] = useState(initialStatus); // loading | login | pending | app
  const [isAuthReady, setIsAuthReady] = useState(false);
  const inactivityRef = useRef(null);
  const loadedUidRef  = useRef(null);

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
      if (k.startsWith('sb-') || k.includes('supabase') || k.startsWith('karat_cached_') || k === STORE_USER_KEY) {
        localStorage.removeItem(k);
      }
    });
    try { sessionStorage.clear(); } catch(e) {}
    setUser(null); setStore(null); setStoreUser(null);
    loadedUidRef.current = null;
    setAuthStatus('login');
  }, []);

  const STORE_SELECT = 'id, owner_id, status, store_name, owner_name, customer_tiers, plan_name, subscription_status, plan_expires_at, phone, email, whatsapp_phone, owner_whatsapp, has_image_search, has_voice_search, ai_models, ai_models_limit, virtual_tryon, analytics, product_limit, image_storage_gb, conversation_limit, monthly_budget_inr, address, _conv_used, _ai_used, _vt_used, voice_profile, voice_examples, voice_updated_at';

  const loadStoreById = useCallback(async (storeId) => {
    const { data } = await db.from('stores').select(STORE_SELECT).eq('id', storeId).single();
    return data;
  }, []);

  const loadStore = useCallback(async (u) => {
    const { data: storeData } = await db
      .from('stores')
      .select(STORE_SELECT)
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
    try {
      localStorage.setItem('karat_cached_store', JSON.stringify(storeData));
    } catch (e) {}
    setAuthStatus('app');
  }, []);

  const handleUser = useCallback(async (u) => {
    if (loadedUidRef.current === u.id) {
      setIsAuthReady(true);
      return;
    }
    loadedUidRef.current = u.id;
    setUser(u);
    resetInactivity();
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 10000)
      );
      await Promise.race([loadStore(u), timeout]);
      setIsAuthReady(true);
    } catch(e) {
      loadedUidRef.current = null;
      setAuthStatus('login');
      setIsAuthReady(true);
    }
  }, [loadStore, resetInactivity]);

  useEffect(() => {
    // If already in a staff session, skip Supabase OAuth listener
    if (initialStoreUser) {
      loadedUidRef.current = initialStoreUser.id;
      setIsAuthReady(true);
      const events = ['click','keydown','mousemove','touchstart','scroll'];
      events.forEach(e => document.addEventListener(e, resetInactivity, { passive: true }));
      resetInactivity();
      return () => {
        events.forEach(e => document.removeEventListener(e, resetInactivity));
        clearTimeout(inactivityRef.current);
      };
    }

    // Supabase v2 fires INITIAL_SESSION synchronously when the listener is
    // registered — this is the reliable initial-load path and avoids waiting
    // on getSession() which may hang if the access token needs a network refresh.
    const { data: { subscription } } = db.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await handleUser(session.user);
      } else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        if (!localStorage.getItem(STORE_USER_KEY)) {
          setUser(null); setStore(null);
          loadedUidRef.current = null;
          setAuthStatus('login');
          setIsAuthReady(true);
        }
      }
    });

    // Belt-and-suspenders: getSession() covers edge cases where INITIAL_SESSION
    // doesn't resolve auth state (e.g. older Supabase clients / token race).
    db.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) handleUser(session.user);
      else {
        setAuthStatus(prev => prev === 'loading' ? 'login' : prev);
        setIsAuthReady(true);
      }
    }).catch(() => {
      setAuthStatus(prev => prev === 'loading' ? 'login' : prev);
      setIsAuthReady(true);
    });

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

  // ── Username + password login (staff) ────────────────────────────────────

  const loginWithCredentials = useCallback(async (username, password) => {
    const { data, error } = await db.rpc('authenticate_store_user', {
      p_username: username.trim(),
      p_password: password,
    });

    if (error) throw new Error(error.message || 'Login failed');

    const suRow = Array.isArray(data) ? data[0] : data;
    if (!suRow || !suRow.id) throw new Error('Invalid username or password');

    const storeData = await loadStoreById(suRow.store_id);
    if (!storeData || storeData.status !== 'active') {
      throw new Error('Store is not active. Contact the store owner.');
    }

    try {
      localStorage.setItem(STORE_USER_KEY, JSON.stringify(suRow));
      localStorage.setItem('karat_cached_store', JSON.stringify(storeData));
    } catch(e) {}

    setStoreUser(suRow);
    setStore(storeData);
    loadedUidRef.current = suRow.id;
    resetInactivity();
    setAuthStatus('app');
  }, [loadStoreById, resetInactivity]);

  const refreshStore = useCallback(async () => {
    if (storeUser) {
      const storeData = await loadStoreById(storeUser.store_id);
      if (storeData) {
        setStore(storeData);
        try { localStorage.setItem('karat_cached_store', JSON.stringify(storeData)); } catch(e) {}
      }
      return;
    }
    if (user) await loadStore(user);
  }, [user, storeUser, loadStore, loadStoreById]);

  const updateStore = useCallback((patch) => {
    setStore(prev => {
      const next = prev ? { ...prev, ...patch } : prev;
      if (next) {
        try {
          localStorage.setItem('karat_cached_store', JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
  }, []);

  // ── Derived permission values ─────────────────────────────────────────────
  // isOwner: Google OAuth session → full access, can manage users
  // userRole: 'owner' | 'admin' | 'read_write' | 'read_only'
  const isOwner  = !!user && !storeUser;
  const userRole = isOwner ? 'owner' : (storeUser?.role || 'read_only');

  return (
    <AuthContext.Provider value={{
      user, store, storeUser,
      authStatus, isAuthReady,
      isOwner, userRole,
      loginWithGoogle, loginWithCredentials,
      logout, refreshStore, updateStore,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
