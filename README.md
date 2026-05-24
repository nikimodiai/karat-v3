# KARAT v3 — Jewellery Inventory & WhatsApp CRM

Production-grade rebuild of KARAT for Indian jewellery stores.
**WhatsApp AI chatbot + inventory management SaaS** built on
React/Vite + Supabase + n8n + Cloudinary.

This version (v3) addresses all 12 feature requests on top of v2, fixes
a critical security vulnerability, and hardens the codebase for production.

---

## ⚠️ READ THIS FIRST — Security action required

The two n8n workflow JSON files exported from v2 contained the Supabase
**service role key** inline.
That key bypasses Row Level Security entirely.

**Before deploying v3:**

1. **Rotate the key now** — Supabase dashboard → Project Settings → API → "Reset service role key"
2. Set the new key as an n8n env var: `SUPABASE_SERVICE_KEY=…` (in n8n's `.env` or compose file)
3. Import the patched workflows in `n8n_workflows/` — they read the key via `$env.SUPABASE_SERVICE_KEY` so nothing's inlined
4. Optionally convert each HTTP Request node to use a proper **n8n Credential** of type "HTTP Header Auth" pointing at the same env var

See `SECURITY_NOTES.md` for the full security audit and follow-ups.

---

## What's changed from v2

Mapped 1-to-1 with the spec:

| # | Change | Files touched |
|---|--------|---------------|
| 1 | Remove AI-generated title/description from UI, DB, and Add/Edit workflow | `ProductModal.jsx`, `ProductCard.jsx`, `MIGRATIONS.sql`, `n8n_workflows/Karat_AddEdit_Product_v3.json` |
| 2 | Edit creates **1 row per product** (no soft-insert duplicates) | `Inventory.jsx` — direct Supabase `UPDATE` |
| 3 | Dynamic pricing calculator (gold rate × purity × weight + making + stones + hallmark + GST) | `lib/pricing.js`, `components/PricingCalculator.jsx` |
| 4 | Silver category with 12 sub-categories | `lib/config.js` |
| 5 | Lab-Grown Diamond category with 9 sub-categories | `lib/config.js` |
| 6 | Compact hero on Dashboard (single row, inline mini-stats) | `Dashboard.jsx`, `Dashboard.module.css` |
| 7 | Dashboard shows real numbers on first view (centralized data loader) | `hooks/useStoreData.jsx`, `App.jsx`, all pages |
| 8 | "How your conversation quota works" explainer on Analytics | `lib/plans.js` (`conversationTokenCopy`), `Analytics.jsx` |
| 9 | AI model calls read from `stores.ai_models_limit` | `useAuth.jsx`, `lib/plans.js`, `Analytics.jsx` |
| 10 | Plan limit enforcement (products, conversations, AI, storage, video) | `lib/plans.js`, `Inventory.jsx`, `UpgradeDialog`, SQL trigger |
| 11 | Cloudinary video upload, max 10s, Pro/Trial only | `components/VideoUpload.jsx`, `Inventory.jsx`, `MIGRATIONS.sql` (`video_url` column) |
| 12 | Analytics categorized by plan tier (Trial = Professional) | `lib/plans.js` (`analyticsTier`, `isProTier`), `Analytics.jsx` |

Plus production hardening:
- Secrets out of source code → `.env.local` (with `.env.example` template and `.gitignore`)
- Row-Level Security policies on every table
- Partial unique index guarantees one current row per `(owner_id, sku)`
- Database-level trigger enforces product limit (defence in depth)
- Code-split bundle (904 kB monolith → 114 kB main + lazy chunks)

---

## Project structure

```
karat-v3/
├── .env.example                  # template — copy to .env.local
├── .gitignore
├── MIGRATIONS.sql                # Supabase schema migration (idempotent)
├── SECURITY_NOTES.md             # full audit + remediation
├── CHANGELOG.md                  # detailed change log
├── README.md                     # this file
├── index.html
├── package.json                  # v3.0.0
├── vite.config.js                # with manualChunks code-splitting
├── vercel.json
├── n8n_workflows/
│   ├── Karat_AddEdit_Product_v3.json          # AI nodes removed
│   └── Jewellery_Store_WhatsApp_AI_Agent_v11.json  # key purged, AI-col deps removed
└── src/
    ├── App.jsx                   # wires StoreDataProvider
    ├── index.jsx
    ├── index.css
    ├── lib/
    │   ├── config.js             # env-driven, includes Silver + LGD
    │   ├── plans.js              # single source of truth for limits
    │   └── pricing.js            # Indian jewellery pricing math
    ├── hooks/
    │   ├── useAuth.jsx
    │   ├── useStoreData.jsx      # centralised products/customers/usage loader
    │   └── useToast.jsx
    ├── components/
    │   ├── ConfirmDialog.jsx
    │   ├── Footer.jsx
    │   ├── PricingCalculator.jsx # NEW — dynamic gold-rate calculator
    │   ├── ProductCard.jsx
    │   ├── ProductModal.jsx      # AI removed, calculator + video added
    │   ├── Topbar.jsx
    │   ├── UpgradeNotice.jsx     # NEW — banner / dialog / locked-card
    │   └── VideoUpload.jsx       # NEW — Cloudinary video, 10s max
    └── pages/
        ├── Analytics.jsx         # plan-tiered, token explainer
        ├── Customers.jsx
        ├── Dashboard.jsx         # compact hero, real numbers
        ├── Inventory.jsx         # direct CRUD, no n8n round-trip
        ├── Login.jsx
        ├── Pending.jsx
        └── Profile.jsx           # limits + features + usage
```

---

## Setup

### 1. Install deps & configure env

```bash
git clone https://github.com/nikimodiai/karat-v3.git karat-v3
cd karat-v3
npm install

cp .env.example .env.local
# Edit .env.local — fill in your Supabase anon key + Cloudinary preset names
```

### 2. Apply the database migration

Open Supabase → SQL Editor → paste `MIGRATIONS.sql` → Run.

This will:
- Add `products.video_url`
- **Drop the `ai_*` columns** from `products` (review first if you want to keep historical data)
- Enforce one current row per `(owner_id, sku)`
- Add the `enforce_product_limit` trigger
- Enable RLS on every table with owner-scoped policies
- Seed the four `subscription_plans` rows (idempotent — upserts)

### 3. Set up Cloudinary

You need **two** unsigned upload presets:

| Preset name              | Resource type | Max file size | Folder                  |
|--------------------------|---------------|---------------|-------------------------|
| `jewelleryupload`        | Image         | 5 MB          | `karat/products/images` |
| `jewelleryvideoupload`   | Video         | 25 MB         | `karat/products/videos` |

For the video preset, also set:
- **Eager transformations**: `f_mp4,q_auto,vc_h264` (Cloudinary will pre-encode to MP4/H.264 for WhatsApp compatibility)
- **Resource type**: `video`

Name them differently in `.env.local` if you prefer:

```bash
VITE_CLOUDINARY_PRESET=jewelleryupload
VITE_CLOUDINARY_VIDEO_PRESET=jewelleryvideoupload
```

### 4. Import the n8n workflows

In n8n: Workflows → Import from File → pick both files in `n8n_workflows/`.

Set the env var on the n8n container:

```bash
SUPABASE_SERVICE_KEY=<your_freshly_rotated_service_key>
```

Restart n8n. Activate both workflows.

### 5. Run locally / deploy

```bash
npm run dev        # http://localhost:5173
npm run build      # outputs to dist/
```

For Vercel: push to a Vercel-linked repo. Set the same `VITE_*` env vars in the Vercel dashboard (Settings → Environment Variables).

---

## How the dynamic pricing works

The calculator (`lib/pricing.js`) implements the formula real Indian jewellery owners use:

```
FINAL = ((Metal cost) + (Making charges) + (Stone cost) + (Hallmark fee)) × (1 + GST%)

Where:
  Metal cost     = rate_per_gram ÷ 24 × purity_carat × weight_g    [for gold]
                 = rate_per_gram × fineness × weight_g              [for silver, fineness in {0.800, 0.925, 0.999}]
                 = rate_per_gram × 0.95 × weight_g                  [for platinum, PT950]
  Making charges = either rupee/gram, % of metal cost, or flat rupees
  Stone cost     = stone_weight_ct × stone_rate_per_ct + flat add-ons (pearls/enamel/etc.)
  Hallmark       = rupee 35-45 flat (BIS)
  GST            = 3% on jewellery (India)
```

The "Today's rate" input is entered manually by the owner each day. The calculator suggests an indicative default — replace it with the real morning rate from your local association rate card.

**Future enhancement**: a scheduled n8n workflow can fetch MCX/IBJA rates and write to `daily_metal_rates` (table created by the migration). The frontend will then read live rates automatically.

---

## How plan enforcement works

**Three layers of defence** so a buggy or malicious client can't exceed limits:

1. **Frontend** (`lib/plans.js` + `UpgradeDialog`) — best UX. Blocks the action and shows an upgrade dialog before the request even fires.
2. **Database trigger** (`enforce_product_limit` in `MIGRATIONS.sql`) — backstop. Even if the frontend is bypassed (curl, browser console, malicious extension), Postgres rejects the insert past the limit.
3. **n8n WhatsApp agent** (`Check Subscription & Usage` node) — enforces conversation and budget limits on the WhatsApp side. A customer messaging a store that's over quota gets a polite "this store is currently unavailable" reply instead of running up the owner's bill.

The single source of truth for limits is `subscription_plans` (seeded by the migration), with per-store overrides in `stores.{conversation_limit, product_limit, image_storage_gb, ai_models_limit}`.

---

## How the "1 record per product on edit" fix works

In v2, every product edit went through n8n. The n8n workflow inserted a new row with `is_current=true` and patched the old row to `is_current=false` (soft-edit pattern). This is fine in theory but produced two issues:

- **Multiple `is_current=true` rows** if any step failed mid-flow → duplicate cards in the UI.
- **Unbounded row growth** — every edit added a row, even tiny changes (price tweak, stock toggle).

v3 fixes this with two changes:

1. **Frontend does a direct `UPDATE`** on the existing row via Supabase JS (`Inventory.jsx → handleSave`). One row, one product, forever.
2. **Partial unique index** in the migration: `UNIQUE(owner_id, sku) WHERE is_current=true`. If anything tries to create a duplicate current row, Postgres rejects it with a clear error.

The soft-delete pattern (`is_current=false` on delete) is preserved for audit-trail purposes — historical product rows aren't lost, just hidden.

---

## Plan matrix

| Feature                  | Trial    | Starter | Professional | Enterprise |
|--------------------------|----------|---------|--------------|------------|
| Monthly price            | Free     | rupee 3,500  | rupee 8,500       | rupee 18,000    |
| Conversations / month    | 50       | 500     | 2,000        | Unlimited  |
| Products                 | 50       | 500     | 5,000        | Unlimited  |
| Image storage            | 1 GB     | 5 GB    | 25 GB        | Unlimited  |
| AI model calls / month   | 500      | 1,000   | 5,000        | Unlimited  |
| Voice search             | yes      | no      | yes          | yes        |
| Image search             | yes      | no      | yes          | yes        |
| Customer tiers (VVIP/VIP)| yes      | no      | yes          | yes        |
| Advanced AI models       | GPT-4o   | Groq Llama | GPT-4o Mini | GPT-4o |
| Virtual try-on           | yes      | no      | yes          | yes        |
| **Product videos**       | yes      | no      | yes          | yes        |
| Analytics                | Pro      | Starter | Pro          | Enterprise |

**Trial mirrors Professional features** so the owner can evaluate the full product before paying.

---

## Tested edge cases

- Empty store (zero products) — Dashboard, Inventory, Analytics all render with helpful empty states
- First-page-after-login is Analytics — numbers populate (was broken in v2)
- Edit product without changing images — no duplicate row, images preserved
- Edit product replacing only image #3 — slots 1, 2, 4, 5 preserved, only #3 re-uploaded
- Add Silver category — Carat dropdown auto-suggests 925 Silver
- Lab-Grown Diamond category — calculator's stone-rate field pre-filled with rupee 18,000/ct
- Product at limit — Add button shows upgrade dialog (no leaky DB call)
- Video > 10s — rejected client-side with friendly error
- Video > 25 MB — rejected before Cloudinary upload attempt
- Starter plan tries to upload video — locked screen, no upload attempt
- Trial user visits Analytics — sees full Pro analytics with token explainer
- Starter user visits Analytics — sees Starter view + upgrade banner
- SKU collision — blocked on blur with inline error
- Two browser tabs editing the same product — second `UPDATE` wins, no duplicate row
- Network drop during image upload — other images proceed, product still saves with the successful ones; user gets toast for the failed slot
- Logout clears localStorage + sessionStorage (no leftover Supabase tokens)
- Inactivity > 30 min — auto-logout

---

## Known limitations / future work

- **Image storage size** is currently estimated (~0.6 MB/image, ~4 MB/video) because Cloudinary doesn't expose per-asset bytes cheaply. For accurate enforcement, run a nightly n8n job that calls Cloudinary's `/usage` API and writes the figure to `stores`.
- **Live gold rates** are entered manually. Wire MCX/IBJA scrape to `daily_metal_rates` table for automation.
- **`monthly_usage` trend chart** uses current-month-only data because earlier months aren't aggregated yet. Add a scheduled function: `INSERT INTO monthly_usage SELECT ... FROM whatsapp_logs WHERE ... GROUP BY month`.
- **Customer growth chart** (Analytics, Pro section) reuses the conversation trend dataset — needs its own time-series. Track `customers.created_at` per month.

---

## Support

- Email: **nikimodi81@gmail.com**
- Admin dashboard: `https://karat-theta.vercel.app` (production) — currently the same app, accessible only to approved owners

---

## License

Proprietary — Nikhil Modi, 2026.
