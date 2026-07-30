# Swarnix Wholesale & Imitation Expansion — Implementation Plan

Planning document only. No code changed. Written 2026-07-18 after a full read of the repo
(`Swarnix app/`). Execution happens in a later session against this plan.

---

## 1. RECOMMENDED ARCHITECTURE

**Verdict: one app, one schema, one `stores.business_type` flag — but the B2B agent is a NEW
n8n workflow, and party pricing lives in NEW additive tables. Nothing in the existing retail
pricing path is altered.** The retail agent workflow gets exactly one new node pair (a
business-type check + Execute Workflow hand-off); the existing `products`, `product_variants`,
and dynamic-pricing updater keep working byte-for-byte for current tenants. Imitation sellers
are the same `business_type` mechanism with `dynamic_price = false` products priced per piece
or per dozen through the new slab tables — they need no metal-rate machinery at all.

**Two flyer commitments conflict with the current architecture and must be fixed before launch,
not after:** (1) *Party-wise rate privacy* is impossible on top of the staff-access RLS policies in
`supabase/2026_05_30_store_users.sql`, which grant the public anon key unrestricted read/write
(`USING (true)`) on products, customers, and stores — anyone with the anon key (it is embedded in
the shipped JS bundle, `src/lib/config.js:16`) can read every row of any table that copies this
pattern. New party/price/order tables must NOT get these policies, which means staff sessions
cannot see wholesale data until staff auth is reworked. (2) The retail agent caches inventory in
`$getWorkflowStaticData('global')` (node "Save & Compress Inventory"), which is one shared object
for ALL tenants passing through the workflow — a concurrency hazard today and an unacceptable
leak channel for negotiated B2B rates. The new B2B workflow must be stateless per message.

---

## 2. Current-State Findings

### 2.1 Stack correction

The brief says Next.js App Router. The actual app is a **React 18 + Vite SPA**
(`package.json`, `vite.config.js`, `src/index.jsx`), React Router for pages, CSS modules for
styling, deployed on Vercel. Supabase JS runs directly in the browser with the anon key.
There is no server layer in the app itself — everything server-side is n8n or Supabase
(RLS, RPCs, triggers).

### 2.2 Tenant model

- One row per jeweller in `public.stores`, keyed by `owner_id` (= Supabase Auth uid of the
  Google-logged-in owner). Columns seen in code: `id, owner_id, store_name, email, status,
  whatsapp_phone, owner_whatsapp, plan_name, conversation_limit, monthly_budget_inr,
  subscription_status, plan_expires_at, product_limit, image_storage_gb, ai_models_limit,
  whatsapp_phone_number_id, waba_id, wa_access_token, metal_rate_stale_days` (last one added
  2026-07-14 with owner rate overrides).
- Every tenant table carries `owner_id`; owner RLS is `owner_id = auth.uid()`
  (`MIGRATIONS.sql` §5).
- **Staff users** (`store_users`, `supabase/2026_05_30_store_users.sql`) authenticate through a
  SECURITY DEFINER RPC (`authenticate_store_user`), NOT Supabase Auth. Because staff requests
  carry no `auth.uid()`, that migration adds anon-role policies with `USING (true)` on
  `products, customers, stores, product_variants, monthly_usage, store_users`. Isolation for
  staff sessions is client-side only (`useStoreData.jsx:80` filters by `owner_id`). This is the
  single biggest constraint on B2B rate privacy.
- Signup: `n8n_workflows/Swarnix - New Store Signup.json` (admin approval email) →
  `Swarnix - New Owner Store Decision.json` (creates the `stores` row from `subscription_plans`
  limits). No business-type concept anywhere in the repo today (verified by grep:
  no `business_type` / `store_type` hits).

### 2.3 Inventory & pricing engine

- `public.products`: soft-edit history via `is_current`, partial unique index
  `products_owner_sku_current_unique (owner_id, sku) WHERE is_current` (`MIGRATIONS.sql` §2),
  product-limit trigger `enforce_product_limit` (§3a). Fields used by pricing:
  `dynamic_price, gold_purity, gold_weight_grams, silver_purity, silver_weight_grams,
  making_charge_type, making_charge_value, wastage_percent, hallmark_charge, stone_value_inr,
  diamond_value_inr, diamond_cert_fee, price, stock_qty` (from
  `supabase/2026_05_28_dynamic_pricing.sql` and the updater workflow code).
- `public.product_variants` (`supabase/2026_05_29_product_variants.sql`): per-carat/color
  variants with their own weight/making/price fields, mirrored `owner_id` for RLS.
- Three rate tables:
  - `daily_metal_rates` — global IBJA reference, `metal_key` like `gold_916_am`, `rate_inr`
    stored **per 10 g gold / per kg silver** (`src/lib/pricing.js:193`, `MIGRATIONS.sql` §7).
    Fed by `IBJA Metal Rate Scraper (delete-then-insert).json`.
  - `metal_rates` — per-store manual rates (`metal_type`, `rate_per_gram`, `is_current`), read
    by `src/components/PricingCalculator.jsx:84`.
  - `app_owner_metal_rates` — per-owner overrides (absolute + `premium_pct`) with the
    MAX-or-premium staleness fallback, edited in `src/components/MetalRatesCard.jsx`
    (built 2026-07-14).
- Recompute path: `Dynamic Pricing Updater.n8n.json` ("Swarnix – Daily Dynamic Pricing
  Updater", schedule 12:40/18:40 IST) reads `daily_metal_rates`, recomputes every product and
  variant with `dynamic_price = true`, PATCHes `price` back. Its `calcPrice()` mirrors
  `calcJewelleryPrice()` in `src/lib/pricing.js:151`. **The repo export of this workflow
  predates the owner-override nodes** (`Get Owner Rates`, `Rate Save Webhook
  /swarnix-owner-rate-save`) that the live instance has — the repo copy has only 8 nodes.
  [NEEDS CONFIRMATION FROM NIKHIL: re-export all live n8n workflows into the repo before the
  build session; several repo JSONs are stale relative to the live instance.]
- Imitation-relevant fact: the updater skips `dynamic_price = false` rows entirely, so
  fixed-price items are already inert to metal rates. Fixed-price products are fully supported
  today (`fixed_price` slot on variants).

### 2.4 WhatsApp AI agent (retail, B2C)

`n8n_workflows/Jewellery_Store_WhatsApp_AI_Agent_v11.json` (internal name "…v10 (Supabase)"),
~50 nodes. Flow:

1. `WhatsApp Trigger` — one shared webhook for all tenants. Store resolved by
   `metadata.display_phone_number` → `stores.whatsapp_phone` ("Fetch Owner & Products",
   "Lookup Store Owner").
2. `Parse WhatsApp Message` — text / audio (transcribed) / image (vision-described) only.
3. `Check Subscription & Usage` — reads `stores`, calls RPC `upsert_session`, reads view/table
   `owner_usage_current`, `alert_flags`; blocks with a polite message when over
   conversation/budget limits.
4. Inventory context: "Fetch Products by Owner" → "Save & Compress Inventory" builds a
   pipe-delimited `INVENTORY (N items): SKU:X|Name|Cat:…|Rs.Price|Qty:N|…` block, cached in
   `$getWorkflowStaticData('global')` (cross-tenant shared — see §1 verdict).
5. `AI Agent` (LangChain agent, DeepInfra chat model) with a 5.2k-char system prompt:
   script/language matching (Hinglish rules), discovery-only persona, `[SKU: X]` tags that
   drive image sends, `##INTERESTED##` signal → owner notified by Gmail + WhatsApp
   ("Prepare Owner Notifications"). **No cart, no order capture — deliberate "NO ONLINE
   PURCHASE" rule in the prompt.**
6. Token usage logged to Supabase (`whatsapp_logs` per `MIGRATIONS.sql` §5 table list).

There is no per-party concept: `waFrom` (customer phone) is only used for session tracking and
`customers` rows (`name, whatsapp_number, tier, city, email, notes, flag` per
`src/pages/Customers.jsx` usage).

### 2.5 Marketing, Studio, plans

- Broadcasts: `Marketing_Campaign_Send_v1.json` — webhook `/marketing-send`, loops customers,
  sends Meta template messages rate-limited, logs to `marketing_message_logs`
  (`supabase/2026_06_20_marketing_messages.sql`). Audience filter is customer tier
  (`vvip | vvip_vip | all`). UI: `src/pages/Marketing.jsx`.
- Studio Suite (`src/pages/StudioSuite.jsx`, `src/lib/studioSuite.js`, webhooks in
  `src/lib/config.js:50-73`): retouch, metal swap, AI model, reels — all keyed by `owner_id`,
  metered against `stores._ai_studio_suite_limit`. Product-agnostic: it operates on images, so
  B2B catalogs need no schema change here.
- Plans: `subscription_plans` seeded in `MIGRATIONS.sql` §6 (trial/starter/professional/
  enterprise) + per-plan AI limits (`supabase/2026_06_21_subscription_plans_limits.sql`);
  client logic in `src/lib/plans.js`.

---

## 3. Architecture Options Compared

| Option | Migration risk to retail tenants | RLS complexity | Pricing separation | Agent divergence | Solo maintainability | Verdict |
|---|---|---|---|---|---|---|
| (a) `business_type` switch that reconfigures ONE pricing engine, ONE agent workflow, conditional UI everywhere | High — retail pricing code and the v11 agent get edited in place; every branch touches live tenants | Low (same tables) | Poor — slab/party logic tangled into gold-rate engine | Poor — one 50-node workflow grows B2B branches inside already-fragile static-data caching | Poor — every change re-tests both segments | Rejected |
| (b) Distinct wholesale module: same app/schema, new additive tables, new pages, NEW B2B n8n workflow, `business_type` only routes | Near-zero — retail tables/workflows untouched except a 2-node router insert | Medium — new tables need owner-only policies; staff-access question must be answered once | Good — fixed/slab/party resolver is new code; gold-rate engine reused as-is where wholesale wants metal-linked quotes | Good — separate workflow, separate prompt, shared usage-metering nodes | Good — one repo, one Supabase project, clear seams | **Recommended** |
| (c) Separate app/deployment for B2B | Zero | High — duplicate RLS + auth stack | Good | Good | Bad — two frontends, two auth flows, double n8n surface for one part-time dev | Rejected |

Option (b) with `stores.business_type` as the router flag. Imitation sellers are not a third
codepath: they are `business_type = 'imitation'`, whose products are all fixed-price
(`dynamic_price = false`) and priced through the same new slab/party resolver the wholesaler
uses. UI modules shown/hidden per type (e.g. imitation hides Metal Rates card and dynamic
pricing panels).

---

## 4. Data Model Changes

All new tables follow the house pattern: `owner_id uuid NOT NULL`, owner-only RLS, `set_updated_at`
trigger (function already exists from `2026_05_29_product_variants.sql`). n8n accesses them with
the service key, which bypasses RLS — no anon policies needed for the agent.

**Deliberately omitted: the anon `USING (true)` staff policies.** Party rates, orders, and
ledgers must not be readable by the bare anon key. Consequence: staff (`store_users`) sessions
will not see wholesale pages until staff auth moves onto something with a verifiable identity.
[NEEDS CONFIRMATION FROM NIKHIL: is staff access to wholesale data required at launch? If yes,
the fix is to mint real Supabase Auth users (or signed JWTs with an `owner_id` claim checked in
RLS) for staff — a prerequisite work item, estimated M.]

### 4.1 Stores — business type

```sql
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'retail'
    CHECK (business_type IN ('retail', 'wholesale', 'imitation'));
```

Existing rows default to `'retail'` — zero behaviour change for current tenants.
Set at signup ("New Owner Store Decision" workflow) from a new signup-form field.

### 4.2 Products — units and MOQ

```sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sale_unit text NOT NULL DEFAULT 'piece'
    CHECK (sale_unit IN ('piece', 'pair', 'dozen', 'set', 'gram')),
  ADD COLUMN IF NOT EXISTS pieces_per_unit integer,   -- 12 for dozen; NULL for piece/gram
  ADD COLUMN IF NOT EXISTS moq integer;               -- minimum order qty, in sale_unit
```

`products.price` keeps its meaning "rate per `sale_unit`". Retail rows keep
`sale_unit = 'piece'` and are untouched. Risk check: the retail agent renders
`Rs.` + `price` ("Save & Compress Inventory") and the dynamic updater writes `price` — neither
reads `sale_unit`, so retail behaviour is unchanged. The B2B agent must always state the unit
next to the rate.

### 4.3 Parties (buyers)

```sql
CREATE TABLE public.parties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL,
  name            text NOT NULL,              -- shop/firm name
  contact_name    text,
  whatsapp_number text NOT NULL,              -- digits only, matches agent waFrom
  city            text,
  gstin           text,
  tier_id         uuid REFERENCES public.price_tiers(id) ON DELETE SET NULL,
  default_moq     integer,                    -- overrides product moq when higher
  tags            text[] NOT NULL DEFAULT '{}',  -- broadcast segmentation
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('pending', 'active', 'blocked')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, whatsapp_number)
);
CREATE INDEX parties_owner_wa_idx ON public.parties (owner_id, whatsapp_number);
```

`status = 'pending'` is the landing state for unknown numbers that message the agent (see §5.2).

### 4.4 Price tiers and slabs

Two-level model: **tiers** (named rate lists a party is assigned to, e.g. "A rate" / "B rate")
and **slabs** (quantity breaks per product, optionally per tier). The flyer example — J-23 at
12–49 pcs = ₹172, 50+ = ₹160 — is two slab rows with `tier_id NULL` (default for everyone).

```sql
CREATE TABLE public.price_tiers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL,
  name        text NOT NULL,                  -- 'A rate', 'Old party', …
  sort_order  smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

CREATE TABLE public.price_slabs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL,
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tier_id     uuid REFERENCES public.price_tiers(id) ON DELETE CASCADE,  -- NULL = default slab
  min_qty     integer NOT NULL,               -- in the product's sale_unit
  max_qty     integer,                        -- NULL = open-ended
  rate_inr    numeric(12,2) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (max_qty IS NULL OR max_qty >= min_qty)
);
CREATE INDEX price_slabs_lookup_idx ON public.price_slabs (owner_id, product_id, tier_id);
```

### 4.5 Per-party item overrides (negotiated rates)

```sql
CREATE TABLE public.party_item_prices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL,
  party_id     uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  rate_inr     numeric(12,2),        -- fixed-rate override, per product sale_unit
  moq          integer,              -- per-party per-item MOQ
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_id, product_id)
);
```

**Rate resolution order (the one rule, implemented once in a shared n8n Code node and once in
the app UI, like `resolveEffective()` already mirrors the updater in `MetalRatesCard.jsx`):**

1. `party_item_prices.rate_inr` for (party, product) — negotiated rate wins
2. `price_slabs` where `tier_id = party.tier_id` and qty in [min, max]
3. `price_slabs` where `tier_id IS NULL` and qty in [min, max]
4. `products.price` (base rate)

MOQ resolution: `max(party_item_prices.moq, products.moq, parties.default_moq)` — the
strictest applicable minimum. [NEEDS CONFIRMATION FROM NIKHIL: is "party MOQ overrides item
MOQ downward" ever needed (a trusted party allowed below the public MOQ)? If yes, rule becomes
COALESCE(party_item_prices.moq, products.moq).]

Gold-rate-linked wholesale (metal at market + labour per gram) reuses the existing
`dynamic_price` engine untouched; a per-party *labour* discount would add a
`making_charge_override numeric` column to `party_item_prices` in a later phase.
[NEEDS CONFIRMATION FROM NIKHIL: how do your target wholesalers quote party-wise gold — fixed
labour ₹/g per party, % off labour, or premium on metal? Phase 3 depends on this.]

### 4.6 Orders (order sheets)

```sql
CREATE TABLE public.orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL,
  party_id      uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  order_code    text NOT NULL,                -- human code, e.g. 'ORD-0042', per owner
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'awaiting_confirmation', 'confirmed', 'cancelled')),
  source        text NOT NULL DEFAULT 'whatsapp'
                  CHECK (source IN ('whatsapp', 'broadcast_reply', 'manual')),
  subtotal_inr  numeric(14,2) NOT NULL DEFAULT 0,
  notes         text,
  share_token   uuid NOT NULL DEFAULT gen_random_uuid(),  -- read-only share link
  created_at    timestamptz NOT NULL DEFAULT now(),
  confirmed_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, order_code)
);

CREATE TABLE public.order_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  owner_id     uuid NOT NULL,
  product_id   uuid REFERENCES public.products(id) ON DELETE SET NULL,
  sku          text,                          -- snapshot; survives product edits
  item_label   text,                          -- free text when the buyer names something unmatched
  qty          numeric(12,2) NOT NULL,
  unit         text NOT NULL,
  rate_inr     numeric(12,2) NOT NULL,        -- snapshot of the resolved rate
  line_total   numeric(14,2) NOT NULL,
  rate_source  text,                          -- 'party' | 'tier_slab' | 'default_slab' | 'base'
  moq_ok       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_items_order_idx ON public.order_items (order_id);
```

Rates and totals are **snapshots** — a later slab edit must not rewrite a confirmed sheet.
`rate_source` records which rule priced each line, for dispute resolution.

### 4.7 Catalog broadcasts

Modeled on `marketing_message_logs`, but party-targeted and linked to products:

```sql
CREATE TABLE public.catalog_broadcasts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL,
  name          text NOT NULL,
  product_ids   uuid[] NOT NULL,
  tag_filter    text[] NOT NULL DEFAULT '{}', -- empty = all active parties
  template_name text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.catalog_broadcast_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id  uuid NOT NULL REFERENCES public.catalog_broadcasts(id) ON DELETE CASCADE,
  owner_id      uuid NOT NULL,
  party_id      uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'pending',   -- 'sent' | 'failed'
  wa_message_id text,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

### 4.8 RLS policies (all new tables)

```sql
-- Repeat for: parties, price_tiers, price_slabs, party_item_prices,
--             orders, order_items, catalog_broadcasts, catalog_broadcast_logs
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY owners_full_own_parties ON public.parties
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
```

No anon policies. n8n writes via service key. One extra anon policy is needed for the
share-token order view (Phase 2): a SECURITY DEFINER RPC `get_order_by_share_token(uuid)`
rather than opening the table — same pattern as `authenticate_store_user`.

### 4.9 Things that could break retail — checked

- `sale_unit`/`moq`/`pieces_per_unit` are additive with retail-safe defaults; no existing
  query selects `*` into a code path that would choke on new columns (the agent's compressor
  maps fields explicitly).
- The dynamic-pricing updater filters `dynamic_price = true`; imitation products never enter it.
- `enforce_product_limit` trigger counts rows regardless of type — imitation catalogs are big
  (hundreds of designs), so plan limits may need a wholesale plan row in `subscription_plans`.
  [NEEDS CONFIRMATION FROM NIKHIL: pricing/limits for wholesale and imitation plans.]
- The retail agent prompt renders every product with `Rs.Price` assuming per-piece; for
  `business_type = 'retail'` stores nothing changes, and B2B stores never hit that workflow
  after the router (§5.1).

---

## 5. Agent & n8n Changes

### 5.1 Routing (change to existing workflow — the ONLY change to it)

`Jewellery_Store_WhatsApp_AI_Agent_v11.json`: after "Lookup Store Owner" (which already fetches
the store row), add `business_type` to the fetched columns, then an IF node:
`business_type == 'retail'` → existing path unchanged; else → **Execute Workflow** →
`Swarnix_B2B_WhatsApp_Agent_v1`, passing `{ waFrom, waName, waMessage, messageType, ownerId,
storeName, business_type, wa credentials }`. Audio/image preprocessing nodes are upstream of
this point and are reused for free.

### 5.2 New workflow: `Swarnix_B2B_WhatsApp_Agent_v1`

Stateless per message (no `$getWorkflowStaticData` caching — see §1). Nodes, in order:

1. **Party Lookup** (Code + `$http` like "Lookup Store Owner"):
   `GET /rest/v1/parties?owner_id=eq.{ownerId}&whatsapp_number=eq.{waFrom}`.
2. **Unknown number branch**: create `parties` row with `status = 'pending'`, name from the
   WhatsApp profile name; notify the owner (reuse the "Notify Owner via WhatsApp" pattern);
   reply to the buyer: catalog and MOQ talk allowed, **no rates** until the owner activates the
   party in the app. [NEEDS CONFIRMATION FROM NIKHIL: or should unknown buyers get default-slab
   rates immediately? Trade practice varies; this is a per-store setting candidate
   (`stores.b2b_open_rates boolean`).]
3. **Usage check**: reuse the "Check Subscription & Usage" code verbatim (`upsert_session`,
   `owner_usage_current`, `alert_flags` are tenant-generic).
4. **Price Card Builder** (Code node — the privacy boundary): fetch the store's products plus
   `price_slabs` (party's tier + default) plus `party_item_prices` for THIS party only, run the
   §4.5 resolution order **deterministically in code**, and emit a compressed context block per
   item: `SKU:J-23|Chandbali|Unit:dozen|YourRate:Rs.160@50+,Rs.172@12-49|MOQ:12|Stock:40`.
   The LLM never receives other tiers, other parties' overrides, or any cost field. Rate
   privacy is enforced by data filtering, not by prompt instructions — prompts leak, filters
   don't.
5. **B2B AI Agent** (LangChain agent + DeepInfra model, same node types as retail). New system
   prompt: trade tone (concise, numbers-first, Hinglish rules copied from the retail prompt's
   language section), answers rate/stock/MOQ from the price card, quotes slab breaks as an
   incentive ("50+ pcs pe ₹160 lagega"), never invents rates, and on order intent emits a
   machine-readable line: `##ORDER##{"items":[{"sku":"J-23","qty":60,"unit":"piece"}]}`.
6. **Order Capture** (Code): parse `##ORDER##` JSON; re-price every line through the same
   resolver (never trust LLM arithmetic); check MOQ (`moq_ok`); upsert a `draft` order + items;
   reply with a formatted order sheet summary (item, qty, rate, line total, grand total) and
   "Reply CONFIRM to book". Multi-message accumulation: append items to the party's open
   `draft` order (one open draft per party) so messy multi-message orders converge into one
   sheet.
7. **Confirmation**: buyer replies confirm/`CONFIRM`/"pakka" → status `confirmed`,
   `confirmed_at`, owner notified on WhatsApp + Gmail with the sheet and a share link
   (`/orders/{share_token}` app route). Owner can edit/cancel in the app.
8. **Token logging**: reuse "Extract Token Usage" → "Log Token Usage to Supabase".

### 5.3 New workflow: `Swarnix_Catalog_Broadcast_v1`

Clone of `Marketing_Campaign_Send_v1.json` mechanics (webhook → validate → splitInBatches →
rate-limit wait → Meta template send → log). Differences: audience comes from `parties`
filtered by `tag_filter` and `status = 'active'` instead of `customers`+tier; logs to
`catalog_broadcast_logs`; message template carries product image + name + MOQ (rates only if
the store allows public rates — else "reply for your rate"). Buyer replies arrive at the B2B
agent (§5.2), which links `source = 'broadcast_reply'` when a broadcast to that party happened
in the last 48 h. New webhook constant in `src/lib/config.js`: `N8N_CATALOG_BROADCAST`.
[NEEDS CONFIRMATION FROM NIKHIL: Meta template approval — one generic "new design" template
per store, or a Swarnix-owned template library? Template names are per-WABA.]

### 5.4 Workflows that do NOT change

- `Dynamic Pricing Updater` (live owner-aware version) — wholesale gold items opt into it via
  the existing `dynamic_price` flag; imitation never touches it.
- IBJA scraper, SOP chatbot/indexer, conversation summary, signup pair (except one added
  `business_type` field in "Supabase - Create Store"), BgRemove/DesignStudio/retouch/reel
  workflows (Studio Suite is product-agnostic; B2B catalog photography works today).
- `Karat_AddEdit_Product_v3` — [NEEDS CONFIRMATION FROM NIKHIL: is this still in use? The
  README says v3 moved product CRUD to direct Supabase updates in `Inventory.jsx`.]

### 5.5 App (frontend) changes

- `src/pages/Parties.jsx` (new): party list, tier assignment, tags, pending-approval queue,
  per-party negotiated rates editor (writes `party_item_prices`).
- `src/pages/Orders.jsx` (new): order sheets list, status filters, detail view, XLSX export
  (the `xlsx` dep is already in `package.json`), share link, manual order entry.
- `src/pages/Inventory.jsx` + `ProductModal.jsx`: when `business_type != 'retail'`, show
  `sale_unit`, `pieces_per_unit`, `moq`, and a slab editor; hide gold-purity/dynamic-pricing
  fields for imitation stores.
- `src/pages/Marketing.jsx`: add a "Catalog broadcast" tab for B2B stores (party tags instead
  of customer tiers).
- Module switching: read `stores.business_type` in `useAuth.jsx` (it already loads the store
  row) and gate nav items in `Topbar.jsx`. Retail stores see zero UI change.

---

## 6. Feature Proposals (all PROPOSAL — NOT COMMITTED)

| Proposal | Effort (solo dev) | Business case (one line) |
|---|---|---|
| Party ledger: outstanding balance per party, payments received, running total on the party page | M | Wholesalers' #1 daily anxiety is udhaar tracking; keeps them opening Swarnix daily |
| GST invoice generation from a confirmed order (PDF, store branding from `2026_06_19_store_branding.sql` fields) | M | Closes the order-to-paper loop; replaces a separate billing app |
| Dispatch status on WhatsApp ("packed / handed to transport / LR number") driven from the order page | S | One tap replaces the "bhai kab bhejoge" call; visible service quality |
| Repeat-order shortcut: agent recognizes "same as last time", clones the last confirmed sheet at current rates | S | Reorders are most of wholesale volume; makes the agent feel like a real staffer |
| Catalog PDF generation: selected products → branded PDF price list (per-tier rates optional) | M | Wholesalers still walk exhibitions with printed catalogs; instant collateral |
| Buyer segmentation analytics: orders by party, by tag, dead-party alerts (no order in N days) | S | Tells the wholesaler whom to broadcast to; feeds the tag system already built |
| Credit limit per party with agent-side soft warning when a new order pushes past it | S | Loss prevention; pairs with the ledger proposal |
| Rate-staleness WhatsApp nudge for owner metal rates (already a TODO from the 2026-07-14 work) | S | Protects gold wholesalers from quoting on stale overrides |
| WhatsApp order-sheet PDF (share the confirmed sheet as a rendered PDF, not text) | S | Trade buyers forward sheets to their accountants; paper-like artifact travels better |

---

## 7. Phased Roadmap

Each phase is independently shippable; retail tenants are unaffected throughout.

### Phase 0 — Foundations & safety rails (small)

Scope: `stores.business_type` column + signup field + "New Owner Store Decision" workflow
update; re-export all live n8n workflows into the repo; decide the staff-access question (§4);
confirm the two [NEEDS CONFIRMATION] pricing-behaviour questions that block schema freeze
(MOQ rule, unknown-buyer rates).

Verification:
- [ ] Existing retail store logs in, prices, chats on WhatsApp — zero diff in behaviour
- [ ] New signup can select business type; `stores.business_type` lands correctly
- [ ] Repo n8n JSONs match live instance (diff the node lists)

### Phase 1 — IIFJAS flyer commitments (the demo build)

Scope: §4 tables + RLS; product unit/MOQ/slab editing in Inventory; Parties page (add party,
tier, negotiated rates); `Swarnix_B2B_WhatsApp_Agent_v1` through order confirmation (§5.2);
router insert in the retail agent (§5.1); Orders page with XLSX export;
`Swarnix_Catalog_Broadcast_v1` + Marketing tab. This covers every flyer line: 24/7 rate/stock/
MOQ answers, party-wise rates, slab pricing, dozen units, MOQ per item and per party, catalog
broadcast with order capture, clean order sheets. AI photography/reels need nothing new.

Verification:
- [ ] Demo store seeded with J-23-style slabs (12–49 → ₹172, 50+ → ₹160) quotes correctly at qty 12, 49, 50, 200
- [ ] Two parties with different negotiated rates for the same SKU each see only their own rate (test from two phones)
- [ ] A phone registered to Party A of Store 1 messaging Store 2's number is treated as unknown there (tenant isolation)
- [ ] Unknown number → pending party created, owner notified, no rates disclosed
- [ ] Messy 3-message order ("J-23 5 dozen", "aur J-41 bhi 2 dozen", "rate kya hua") converges into one draft sheet; CONFIRM books it and the owner gets the sheet
- [ ] Order below MOQ is flagged, agent asks to raise qty
- [ ] Rates in a confirmed sheet stay frozen after the owner edits the slab
- [ ] Broadcast to a tag segment sends, logs per party, and a reply captures an order with `source = 'broadcast_reply'`
- [ ] Retail regression: an existing retail store's agent flow is byte-identical in behaviour (run the standard greeting/inventory/interest script)
- [ ] anon-key probe: `curl` REST reads on `parties`, `party_item_prices`, `orders` with the shipped anon key return zero rows

### Phase 2 — Order operations polish

Scope: order editing/cancellation UI, share-token order view via SECURITY DEFINER RPC, order
sheet WhatsApp re-send, per-store setting for unknown-buyer rate policy, broadcast history UI,
imitation onboarding defaults (hide metal UI, default `sale_unit`), plan rows + limits for the
two new segments in `subscription_plans`.

Verification:
- [ ] Share link opens the sheet read-only with no auth, wrong token 404s
- [ ] Cancelled order notifies the party; edited order re-sends the summary
- [ ] Imitation store never sees metal-rate UI anywhere

### Phase 3 — Gold wholesale party pricing

Scope: per-party labour overrides on gold-rate-linked items (design pinned by the §4.5 open
question), quoting in the agent as "metal at today's rate + your labour", integration with
`app_owner_metal_rates` overrides so the wholesaler's own rate feeds B2B quotes, rate-staleness
nudge.

Verification:
- [ ] Same gold item quotes differently to two parties per their labour terms; metal component tracks today's effective rate (override/premium/IBJA fallback per the MAX-or-premium rule)
- [ ] Retail dynamic pricing output unchanged for retail stores (spot-check one product before/after)

### Phase 4 — Stickiness features

Scope: pick from §6 by demand after IIFJAS feedback — suggested order: ledger → GST invoice →
dispatch updates → repeat-order.

Verification: per feature, defined at pickup.

---

## 8. Open Questions for Nikhil

1. **Staff access to wholesale data** — required at launch? If yes, staff auth must move to
   verifiable identities (Supabase Auth users or signed JWT claim + RLS) before party rates are
   stored; the current anon `USING (true)` pattern cannot be extended to B2B tables. (§4)
2. **Wholesale gold party-wise quoting** — fixed labour ₹/g per party, % off labour, or premium
   on metal? Blocks Phase 3 schema. (§4.5)
3. **MOQ precedence** — can a trusted party ever have a LOWER MOQ than the item's public MOQ?
   Decides `max(...)` vs `COALESCE(...)`. (§4.5)
4. **Unknown-buyer policy** — no rates until owner approves, or default-slab rates for anyone?
   Proposed as a per-store toggle. (§5.2)
5. **Meta template strategy for catalog broadcasts** — per-store approved template or a shared
   Swarnix template naming convention per WABA? (§5.3)
6. **Plans & limits for wholesale/imitation** — new `subscription_plans` rows, prices, and
   product limits (imitation catalogs run large). (§4.9)
7. **Repo vs live n8n drift** — please re-export the live workflows (at minimum the owner-aware
   Dynamic Pricing Updater and the current agent) into the repo before the build session. (§2.3)
8. **`Karat_AddEdit_Product_v3` workflow** — still active, or fully replaced by direct Supabase
   CRUD in `Inventory.jsx`? Determines whether it needs unit/MOQ fields. (§5.4)
9. **Dual-mode stores** — can one tenant be retail AND wholesale on the same WhatsApp number?
   Current design assumes one `business_type` per store; a dual-mode store would need
   party-vs-customer disambiguation by phone number in the router. Deferred unless you have a
   concrete such customer.
10. **IIFJAS demo date** — fixes the Phase 1 deadline and how much of Phase 2 polish makes the
    demo. [NEEDS CONFIRMATION FROM NIKHIL]
