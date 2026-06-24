// ── Plan definitions & limit helpers ────────────────────────────────
// Single source of truth for what each plan unlocks. Mirrors the
// `subscription_plans` table in Supabase. The actual per-store limits
// come from the `stores` row (admin can override per-tenant);
// this file is used for: (a) default limits when store columns are
// null, (b) UI labels, (c) feature-gating decisions on the client.
//
// IMPORTANT: client-side checks are UX only. Server-side enforcement
// happens via (i) Supabase RLS, (ii) the n8n WhatsApp-agent
// "Check Subscription & Usage" node, and (iii) the SQL trigger in
// MIGRATIONS.sql that hard-rejects inserts past product_limit.

export const PLAN_KEYS = ['trial', 'starter', 'professional', 'enterprise'];

export const PLAN_LABELS = {
  trial:        'Trial',
  starter:      'Starter',
  professional: 'Professional',
  enterprise:   'Enterprise',
};

// Per-plan default limits. These are sensible defaults — the actual
// per-store limit lives in `stores.{conversation_limit, product_limit,
// image_storage_gb, ai_models_limit}` and overrides these.
export const PLAN_LIMITS = {
  trial: {
    conversations:  200,
    products:       100,
    image_storage:  1,        // GB
    ai_models:      20,       // AI Models Try-On / month
    selfie_tryon:   10,       // Selfie Try-On for Customers / month
    design_studio:  15,       // Design Studio generations / month
    monthly_inr:    0,
    features: {
      whatsapp:        true,
      inventory:       true,
      voice_search:    true,
      image_search:    false,
      customer_tiers:  false,
      teach_ai_style:  false,
      ai_models:       true,
      virtual_tryon:   true,
      design_studio:   true,
      marketing_messages: false,
      analytics:       'PROFESSIONAL',
    },
  },
  starter: {
    conversations:  1000,
    products:       500,
    image_storage:  5,
    ai_models:      50,
    selfie_tryon:   30,
    design_studio:  0,        // off on Starter (feature gated below)
    monthly_inr:    3999,
    features: {
      whatsapp:        true,
      inventory:       true,
      voice_search:    false,
      image_search:    false,
      customer_tiers:  false,
      teach_ai_style:  false,
      ai_models:       true,
      virtual_tryon:   true,
      design_studio:   false,
      marketing_messages: false,
      analytics:       'STARTER',
    },
  },
  professional: {
    conversations:  3000,
    products:       1000,
    image_storage:  25,
    ai_models:      200,
    selfie_tryon:   100,
    design_studio:  100,
    monthly_inr:    8999,
    features: {
      whatsapp:        true,
      inventory:       true,
      voice_search:    true,
      image_search:    true,
      customer_tiers:  true,
      teach_ai_style:  true,
      ai_models:       true,
      virtual_tryon:   true,
      design_studio:   true,
      marketing_messages: true,
      analytics:       'PROFESSIONAL',
    },
  },
  enterprise: {
    conversations:  10000,
    products:       5000,
    image_storage:  Infinity,
    ai_models:      500,
    selfie_tryon:   300,
    design_studio:  300,
    monthly_inr:    17999,
    features: {
      whatsapp:        true,
      inventory:       true,
      voice_search:    true,
      image_search:    true,
      customer_tiers:  true,
      teach_ai_style:  true,
      ai_models:       true,
      virtual_tryon:   true,
      design_studio:   true,
      marketing_messages: true,
      analytics:       'ENTERPRISE',
    },
  },
};

// Returns the effective plan key (always lowercase, defaults to "trial")
export function planKey(store) {
  return (store?.plan_name || 'trial').toLowerCase();
}

// Returns the PLAN_LIMITS row for the store's plan
export function planLimits(store) {
  return PLAN_LIMITS[planKey(store)] || PLAN_LIMITS.trial;
}

// Returns the *effective* limit for a resource: the store's per-tenant
// override (if set in the DB) or the plan default.
// resource ∈ 'conversations' | 'products' | 'image_storage' | 'ai_models' | 'selfie_tryon' | 'design_studio'
export function effectiveLimit(store, resource) {
  const plan = planLimits(store);
  const ov = store && {
    conversations:  store.conversation_limit,
    products:       store.product_limit,
    image_storage:  store.image_storage_gb,
    ai_models:      store.ai_models_limit,
    selfie_tryon:   store.virtual_tryon,   // virtual_tryon column = Selfie Try-On limit
    design_studio:  store.design_studio_limit,
  }[resource];
  // Treat 0 as "use plan default"; treat null/undefined the same.
  if (ov === null || ov === undefined || ov === 0) return plan[resource];
  return ov;
}

// True if the store's plan unlocks `featureKey`
export function hasFeature(store, featureKey) {
  // Feature toggles can be enabled per-store in the DB (override).
  // Fall back to plan-default features.
  const dbToggle = store && {
    voice_search:   store.has_voice_search,
    image_search:   store.has_image_search,
    customer_tiers: store.customer_tiers,
    ai_models:      store.ai_models,
    virtual_tryon:  store.virtual_tryon,
    design_studio:  store.design_studio,
  }[featureKey];
  if (typeof dbToggle === 'boolean') return dbToggle;
  return !!planLimits(store).features[featureKey];
}

// Trial is *treated as Professional* per Nikhil's spec for analytics gating.
export function analyticsTier(store) {
  const p = planKey(store);
  if (p === 'trial') return 'PROFESSIONAL';
  const fromDb = store?.analytics;
  if (fromDb && fromDb !== 'BASIC') return fromDb;
  return planLimits(store).features.analytics || 'STARTER';
}

// True if the user can use Pro-tier features (Trial unlocks them so the
// owner can evaluate the product before paying).
export function isProTier(store) {
  const p = planKey(store);
  return p === 'trial' || p === 'professional' || p === 'enterprise';
}

// Render a limit value for display: ∞ for Infinity, locale for numbers.
export function fmtLimit(v) {
  if (v === Infinity || v === 'unlimited' || v == null) return '∞';
  return Number(v).toLocaleString('en-IN');
}

// % used (0..100), clamped, handles Infinity.
export function pctUsed(used, limit) {
  if (!limit || limit === Infinity) return 0;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

// Returns a copy text explaining how conversations map to LLM tokens,
// for the owner-facing Analytics page. We deliberately do NOT expose
// raw cost numbers — owners see conversation counts only.
export function conversationTokenCopy(plan) {
  const map = {
    trial:        { tokensPerConv: 4000, model: 'GPT-4o (Trial unlock)', fairUse: 'evaluation only' },
    starter:      { tokensPerConv: 3500, model: 'Groq Llama 3.1 70B',    fairUse: '1 customer chat ≈ 1 conversation' },
    professional: { tokensPerConv: 4500, model: 'GPT-4o Mini',           fairUse: '1 customer chat ≈ 1 conversation' },
    enterprise:   { tokensPerConv: 6000, model: 'GPT-4o (full)',         fairUse: 'unlimited, fair use' },
  };
  return map[plan] || map.starter;
}
