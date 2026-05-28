import React, { createContext, useContext, useCallback, useEffect, useState, useRef } from 'react';
import { db } from '../lib/config';
import { useAuth } from './useAuth';

// ── useStoreData ────────────────────────────────────────────────────
// Centralized loader for the data shared across pages (products,
// customers, monthly usage). The old code stashed these on
// `window._products`/`window._customers`, which broke any page the
// user landed on first (Dashboard showed zeros until they visited
// Inventory). This hook loads everything once at app boot and shares
// it via React context so all pages render with real numbers.
// ────────────────────────────────────────────────────────────────────

const StoreDataContext = createContext(null);

// Optimistic local caching helpers to render data instantly on page refresh
const getCachedProducts = () => {
  try {
    const cached = localStorage.getItem('karat_cached_products');
    return cached ? JSON.parse(cached) : [];
  } catch (e) {
    return [];
  }
};

const getCachedCustomers = () => {
  try {
    const cached = localStorage.getItem('karat_cached_customers');
    return cached ? JSON.parse(cached) : [];
  } catch (e) {
    return [];
  }
};

const getCachedMonthlyUsage = () => {
  try {
    const cached = localStorage.getItem('karat_cached_monthly_usage');
    return cached ? JSON.parse(cached) : null;
  } catch (e) {
    return null;
  }
};

export function StoreDataProvider({ children }) {
  const { user, store, authStatus, isAuthReady } = useAuth();

  const [products,  setProducts]  = useState(getCachedProducts);
  const [customers, setCustomers] = useState(getCachedCustomers);
  const [monthlyUsage, setMonthlyUsage] = useState(getCachedMonthlyUsage);
  const [loading,   setLoading]   = useState(() => {
    try {
      return !localStorage.getItem('karat_cached_products');
    } catch (e) {
      return true;
    }
  });
  const [error,     setError]     = useState(null);
  const loadedForUid = useRef(null);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // Products: current versions only (is_current filter respects
      // the soft-delete pattern used for product history).
      const productsP = db
        .from('products')
        .select('*')
        .eq('owner_id', user.id)
        .eq('is_current', true)
        .order('created_at', { ascending: false });

      // Customers (will be empty if the plan doesn't include CRM; the
      // page enforces gating before showing them).
      const customersP = db
        .from('customers')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      // Current month's usage row, if the schema exposes it. We tolerate
      // failure (table may not exist yet on fresh installs).
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0,0,0,0);
      const usageP = db
        .from('monthly_usage')
        .select('*')
        .eq('owner_id', user.id)
        .gte('month', monthStart.toISOString())
        .limit(1)
        .maybeSingle();

      const [pRes, cRes, uRes] = await Promise.allSettled([productsP, customersP, usageP]);

      const prods = pRes.status === 'fulfilled' && pRes.value.data ? pRes.value.data : [];
      const custs = cRes.status === 'fulfilled' && cRes.value.data ? cRes.value.data : [];
      const usage = uRes.status === 'fulfilled' && uRes.value.data ? uRes.value.data : null;

      setProducts(prods);
      setCustomers(custs);
      setMonthlyUsage(usage);

      try {
        localStorage.setItem('karat_cached_products', JSON.stringify(prods));
        localStorage.setItem('karat_cached_customers', JSON.stringify(custs));
        if (usage) {
          localStorage.setItem('karat_cached_monthly_usage', JSON.stringify(usage));
        } else {
          localStorage.removeItem('karat_cached_monthly_usage');
        }
      } catch (e) {}

      // Back-compat: keep window._products/_customers in sync so any
      // page not yet migrated to the hook still works.
      if (typeof window !== 'undefined') {
        window._products  = prods;
        window._customers = custs;
        window._monthlyUsage = usage;
      }
    } catch (e) {
      setError(e?.message || 'Failed to load store data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Auto-load when the user becomes available / changes.
  useEffect(() => {
    if (authStatus !== 'app' || !user || !isAuthReady) {
      // Do not clear the data if it's already cached/loaded, but do not
      // load from DB until auth is fully initialized and authenticated.
      if (authStatus !== 'app' || !user) {
        setProducts([]); setCustomers([]); setMonthlyUsage(null);
        loadedForUid.current = null;
      }
      return;
    }
    if (loadedForUid.current === user.id) return;
    loadedForUid.current = user.id;
    loadAll();
  }, [authStatus, user, isAuthReady, loadAll]);

  // ── Mutators used by Inventory / Customers pages ──────────────────
  const setProductsAndSync = useCallback((updater) => {
    setProducts(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (typeof window !== 'undefined') {
        window._products = next;
        try {
          localStorage.setItem('karat_cached_products', JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
  }, []);

  const setCustomersAndSync = useCallback((updater) => {
    setCustomers(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (typeof window !== 'undefined') {
        window._customers = next;
        try {
          localStorage.setItem('karat_cached_customers', JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
  }, []);

  const ctx = {
    products, customers, monthlyUsage,
    loading, error,
    reload: loadAll,
    setProducts: setProductsAndSync,
    setCustomers: setCustomersAndSync,
  };

  return <StoreDataContext.Provider value={ctx}>{children}</StoreDataContext.Provider>;
}

export function useStoreData() {
  const ctx = useContext(StoreDataContext);
  if (!ctx) throw new Error('useStoreData must be used inside <StoreDataProvider>');
  return ctx;
}
