# CHANGELOG

## Unreleased

### Added
- **Image background swap** in Add/Edit Product (`src/components/BackgroundPicker.jsx`)
  Wand button on each photo cuts out the jewellery (self-hosted rembg, ₹0) and
  drops it on Transparent / White / Studio Blue / Brand Navy / Cream / Black or a
  custom colour. Live preview, then Apply — all backgrounds are free Cloudinary
  delivery transforms.
- **Auto-arrange Set** (`src/components/SetComposer.jsx`)
  Composites uploaded pieces (necklace centred, earrings flanking — one earring is
  auto-mirrored) into a single product image via free Cloudinary overlays. Pick
  centre/side pieces, layout (top corners / mid sides) and background.
- **`src/lib/imageStudio.js`** — Cloudinary URL builders (`bgFillUrl`,
  `composeSetUrl`), `removeBackground` (rembg webhook), brand swatch palette.
- **`n8n_workflows/Swarnix_BgRemove_v1.js`** + **`REMBG_SETUP.md`** — rembg
  service + `/swarnix-bg-remove` webhook (uploads transparent PNGs to Cloudinary).
- **`N8N_BG_REMOVE`** endpoint in `src/lib/config.js`.

## v3.0.0 — 2026-05-24

Major release. Addresses 12 feature requests + critical security fix +
production hardening across React frontend, Supabase schema, and n8n workflows.

### Added
- **Dynamic pricing calculator** (`src/lib/pricing.js`, `src/components/PricingCalculator.jsx`)
  Indian jewellery formula: `((rate/24 × purity × weight) + making + stones + hallmark) × (1 + GST)`.
  Supports gold (18K–24K + white/rose), silver (800/925/999), platinum (PT950), and lab-grown diamonds.
  Owner enters today's rate; calculator shows live breakdown and applies the total to the Price field with one click.
- **Silver category** with 12 sub-categories (rings, earrings, anklets, idols, utensils, oxidised, etc.)
- **Lab-Grown Diamond category** with 9 sub-categories (LGD solitaires, studs, eternity bands, loose stones, etc.)
- **Cloudinary video upload** (`src/components/VideoUpload.jsx`)
  Max 10 seconds, client-side duration probe, 25 MB hard cap. Unlocked on Professional + Trial plans only.
- **Centralised data context** (`src/hooks/useStoreData.jsx`)
  Loads products, customers, monthly usage once at app boot. All pages render with real numbers immediately, regardless of which tab the user lands on first.
- **Plan limit library** (`src/lib/plans.js`)
  Single source of truth for plan features and limits. Helpers: `planKey`, `effectiveLimit`, `hasFeature`, `analyticsTier`, `isProTier`, `conversationTokenCopy`, `fmtLimit`, `pctUsed`.
- **Upgrade UX components** (`src/components/UpgradeNotice.jsx`)
  `UpgradeBanner` (inline), `UpgradeDialog` (blocking modal), `LockedCard` (full-page block).
- **Conversation/token explainer** on Analytics — answers "what does '0 of 2000 conversations' mean?" by showing tokens-per-chat, model, monthly allotment in tokens.
- **Catalog Value KPI** on Dashboard (sum of listed prices).
- **Mini-stats** inline in the compact Dashboard hero (SKUs / Customers / Chats).
- **`MIGRATIONS.sql`** — idempotent Supabase migration covering all schema changes, RLS policies, triggers, and seed data.
- **`SECURITY_NOTES.md`** — full audit with severities and remediation steps.
- **`CHANGELOG.md`** — this file.
- **`.env.example`** + **`.gitignore`** — keep secrets out of source.
- **Code-splitting** in `vite.config.js` — separate chunks for charts, supabase, icons, react.
- **Database triggers** — `enforce_product_limit` rejects inserts past `stores.product_limit`.
- **Partial unique index** — `UNIQUE(owner_id, sku) WHERE is_current = true` makes duplicate-current-row physically impossible.
- **Row Level Security policies** on every owner-scoped table.
- **Patched n8n workflows** in `n8n_workflows/`:
  - `Karat_AddEdit_Product_v3.json` — AI generation nodes removed, hardcoded key purged.
  - `Jewellery_Store_WhatsApp_AI_Agent_v11.json` — hardcoded key purged, AI-column dependencies removed (falls back to `name`/`occasion`/`description`).

### Changed
- **Dashboard hero** is now a compact single-row layout with inline mini-stats. Old hero was 2× too tall.
- **Edit product** now does a **direct Supabase `UPDATE`** instead of inserting a new row via n8n. One row per product, forever.
- **`ProductModal`** removed AI-related fields (no more "Description / Notes for AI"), removed the "Regenerate AI title & description" checkbox, added pricing calculator and video slot.
- **`ProductCard`** stops falling back to `ai_title` (now uses `name` only) and shows a small video badge if `video_url` is set.
- **`Analytics`** is now categorised by plan tier (Trial maps to Professional per spec). Adds the conversation-quota explainer card. Reads AI limit from `stores.ai_models_limit`.
- **`Profile`** shows real plan limits and live usage bars instead of static feature lists.
- **`Login` copy** — "AI-powered" framing replaced with "Inventory, WhatsApp, and analytics, built for Indian jewellery stores."
- **`index.html`** — clean title and meta description, deduplicated viewport tag, added theme-color.
- **`config.js`** — reads from `import.meta.env` first, falls back to v2 values for local dev.
- **`subscription_plans` seed** — refreshed to match the spec exactly (trial 50, starter 500/3500, pro 2000/8500, enterprise unlimited/18000).

### Removed
- All `ai_*` columns from the `products` table (the migration drops them).
- The `AI - Generate Product Description`, `Groq Chat Model`, `Parse AI Response`, `Generate AI?`, `Skip AI`, and `Merge Save Result` nodes from the Add/Edit n8n workflow.
- The "Regenerate AI" checkbox from `ProductModal`.
- The mock monthly trend data on Dashboard (it was hardcoded to zeros; now derived from current `_conv_used`).
- The dependency on `window._products` / `window._customers` globals (kept as back-compat shim, but pages read from context now).

### Fixed
- **Edit creates duplicate records** — root cause was the n8n workflow soft-inserting on every edit. Now: direct `UPDATE`, partial unique index, DB trigger.
- **Dashboard shows zeros on first view** — root cause was products/customers being lazy-loaded only when the Inventory/Customers tabs were visited. Now: `StoreDataProvider` loads all of them at app boot.
- **AI model calls always showed 0** — was reading from `store.ai_models` (boolean feature flag) instead of `store.ai_models_limit` (integer). Now reads the correct column via `effectiveLimit(store, 'ai_models')`.
- **CSS calc warning** — `calc(100%+6px)` had no spaces around `+`; fixed.
- **Memory leak in `VideoUpload`** — `URL.createObjectURL` was never revoked. Now revoked in the cleanup effect.
- **`SECURITY` — hardcoded Supabase service-role key in n8n workflows** — see `SECURITY_NOTES.md` for full detail.

### Migration steps from v2 to v3
1. Rotate the Supabase service-role key (see `SECURITY_NOTES.md`).
2. Run `MIGRATIONS.sql` in the Supabase SQL editor.
3. Set `SUPABASE_SERVICE_KEY` env var on n8n; restart n8n.
4. Import the two patched workflows from `n8n_workflows/`.
5. Create a second Cloudinary upload preset for video (`jewelleryvideoupload`).
6. Set Vercel env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLOUDINARY_*`, `VITE_N8N_BASE`).
7. Deploy. The frontend is backward-compatible with v2 data; nothing to migrate on the product/customer level.
