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
    const cached = localStorage.getItem('swarnix_cached_products');
    return cached ? JSON.parse(cached) : [];
  } catch (e) {
    return [];
  }
};

const getCachedCustomers = () => {
  try {
    const cached = localStorage.getItem('swarnix_cached_customers');
    return cached ? JSON.parse(cached) : [];
  } catch (e) {
    return [];
  }
};

const getCachedMonthlyUsage = () => {
  try {
    const cached = localStorage.getItem('swarnix_cached_monthly_usage');
    return cached ? JSON.parse(cached) : null;
  } catch (e) {
    return null;
  }
};

const getCachedReviews = () => {
  try {
    const cached = localStorage.getItem('swarnix_cached_reviews');
    return cached ? JSON.parse(cached) : [];
  } catch (e) {
    return [];
  }
};

export function StoreDataProvider({ children }) {
  const { user, store, storeUser, authStatus, isAuthReady } = useAuth();

  const [products,  setProducts]  = useState(getCachedProducts);
  const [customers, setCustomers] = useState(getCachedCustomers);
  const [monthlyUsage, setMonthlyUsage] = useState(getCachedMonthlyUsage);
  const [reviews, setReviews] = useState(getCachedReviews);
  const [loading,   setLoading]   = useState(() => {
    try {
      return !localStorage.getItem('swarnix_cached_products');
    } catch (e) {
      return true;
    }
  });
  const [error,     setError]     = useState(null);
  const loadedForUid = useRef(null);

  // Studio Suite → Inventory hand-off. When AI Model's "Add to Inventory" runs,
  // it stashes a prefill here and switches to the Inventory tab; Inventory reads
  // and clears it, opening its Add Product modal pre-populated. Lives here so we
  // reuse Inventory's full save/vectorize/variant logic instead of duplicating it.
  const [inventoryPrefill, setInventoryPrefill] = useState(null);

  const loadAll = useCallback(async () => {
    // Staff sessions have no Supabase Auth uid — use store.owner_id instead.
    // The RLS migration adds a staff_read policy that allows anon to read
    // rows where owner_id matches the value in the query filter.
    const ownerId = storeUser ? storeUser.owner_id : user?.id;
    if (!ownerId) return;

    setLoading(true);
    setError(null);
    try {
      const productsP = db
        .from('products')
        .select('*')
        .eq('owner_id', ownerId)
        .eq('is_current', true)
        .order('created_at', { ascending: false });

      const customersP = db
        .from('customers')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0,0,0,0);
      const usageP = db
        .from('monthly_usage')
        .select('*')
        .eq('owner_id', ownerId)
        .gte('month', monthStart.toISOString())
        .limit(1)
        .maybeSingle();

      const reviewsP = db
        .from('reviews')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });

      const [pRes, cRes, uRes, rRes] = await Promise.allSettled([productsP, customersP, usageP, reviewsP]);

      const prods = pRes.status === 'fulfilled' && pRes.value.data ? pRes.value.data : [];
      const custs = cRes.status === 'fulfilled' && cRes.value.data ? cRes.value.data : [];
      const usage = uRes.status === 'fulfilled' && uRes.value.data ? uRes.value.data : null;
      const revs  = rRes.status === 'fulfilled' && rRes.value.data ? rRes.value.data : [];

      setProducts(prods);
      setCustomers(custs);
      setMonthlyUsage(usage);
      setReviews(revs);

      try {
        localStorage.setItem('swarnix_cached_products', JSON.stringify(prods));
        localStorage.setItem('swarnix_cached_customers', JSON.stringify(custs));
        localStorage.setItem('swarnix_cached_reviews', JSON.stringify(revs));
        if (usage) {
          localStorage.setItem('swarnix_cached_monthly_usage', JSON.stringify(usage));
        } else {
          localStorage.removeItem('swarnix_cached_monthly_usage');
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
  }, [user, storeUser]);

  // Auto-load when the user (owner or staff) becomes available / changes.
  useEffect(() => {
    const sessionId = storeUser ? storeUser.id : user?.id;
    if (authStatus !== 'app' || !sessionId || !isAuthReady) {
      if (authStatus !== 'app' || !sessionId) {
        setProducts([]); setCustomers([]); setMonthlyUsage(null); setReviews([]);
        loadedForUid.current = null;
      }
      return;
    }
    if (loadedForUid.current === sessionId) return;
    loadedForUid.current = sessionId;
    loadAll();
  }, [authStatus, user, storeUser, isAuthReady, loadAll]);

  // ── Mutators used by Inventory / Customers pages ──────────────────
  const setProductsAndSync = useCallback((updater) => {
    setProducts(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (typeof window !== 'undefined') {
        window._products = next;
        try {
          localStorage.setItem('swarnix_cached_products', JSON.stringify(next));
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
          localStorage.setItem('swarnix_cached_customers', JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
  }, []);

  const setReviewsAndSync = useCallback((updater) => {
    setReviews(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem('swarnix_cached_reviews', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  }, []);

  const ctx = {
    products, customers, monthlyUsage, reviews,
    loading, error,
    reload: loadAll,
    setProducts: setProductsAndSync,
    setCustomers: setCustomersAndSync,
    setReviews: setReviewsAndSync,
    inventoryPrefill, setInventoryPrefill,
  };

  return <StoreDataContext.Provider value={ctx}>{children}</StoreDataContext.Provider>;
}

export function useStoreData() {
  const ctx = useContext(StoreDataContext);
  if (!ctx) throw new Error('useStoreData must be used inside <StoreDataProvider>');
  return ctx;
}
