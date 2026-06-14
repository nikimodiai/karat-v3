# KARAT v3 — Security Audit & Remediation

This document is the security record for the v2 → v3 migration. It lists
every vulnerability found in v2, what v3 does about it, and what remains
for the owner to do.

---

## OPEN — anon role can read `stores.wa_access_token`

**Severity:** High (confidentiality — per-tenant WhatsApp Business token)
**Status:** Mitigated for the public storefront; root cause still open.

**The issue.** Staff sessions authenticate via a custom RPC
(`authenticate_store_user`) and then run all queries as the Supabase
**anon** role with an app-supplied `owner_id` filter. To make that work,
`staff_read_stores` (in `supabase/2026_05_30_store_users.sql`) grants anon
`SELECT` on `public.stores` with `USING (true)` — i.e. every column of
every row, including `wa_access_token`, `waba_id`, and
`whatsapp_phone_number_id`. The admin app legitimately reads those columns
(`src/hooks/useAuth.jsx` `STORE_SELECT`, `src/components/WhatsAppConnect.jsx`),
so the broad policy cannot simply be dropped or column-revoked without
breaking staff WhatsApp connect/load. Anyone holding the public anon key
can therefore `select wa_access_token from stores`.

**Mitigation in place (2026-06-14).** The public customer storefront never
touches the base table. It reads through a restricted view
`public.public_stores` (safe columns only) created in the storefront
project (`../stores-site/supabase/2026_06_14_store_slug.sql`), which is
where the storefront code now lives. This removes the storefront as an
exposure path and documents intent, but does **not** revoke anon's direct
access to the base table.

**Proper fix (not yet done).** Either:
1. Move `wa_access_token` (+ `waba_id`) into a separate `store_secrets`
   table with **no** anon policy, read only via the service role / n8n; or
2. Replace anon-role staff sessions with real scoped Supabase sessions (or
   `SECURITY DEFINER` RPCs) so the `USING (true)` policies can be removed.

Until then: treat the anon key as able to read all WhatsApp tokens, and
rotate any token you believe leaked.

---

## CRITICAL — Hardcoded Supabase service-role key in n8n workflows

**Severity:** Critical
**CVSS-ish:** 9.0 (confidentiality + integrity + availability of every tenant's data)
**Status in v3:** Removed from JSON, **must be rotated by owner**

### What was wrong

Both n8n workflow JSON files exported from v2 contained a literal
service-role key inline as the value of `apikey` and `Authorization: Bearer ...` headers
in every HTTP Request node that talks to Supabase, and inside Code nodes
as a string constant `SK`.

This is the **service role key**. Unlike the anon key (which respects
Row Level Security), the service role key bypasses RLS entirely. Anyone
with this key can read, modify, or delete every row in every table for
every tenant.

Because the JSON files were shared in conversation and may have been
committed to git, the key must be considered compromised.

### What v3 does

The patched workflows in `n8n_workflows/`:
- `Jewellery_Store_WhatsApp_AI_Agent_v11.json`
- `Karat_AddEdit_Product_v3.json`

…have every occurrence of the literal replaced with one of:
- For HTTP header values: `={{ $env.SUPABASE_SERVICE_KEY }}` and `={{ 'Bearer ' + $env.SUPABASE_SERVICE_KEY }}`
- Inside Code nodes: `($env.SUPABASE_SERVICE_KEY || '')`

Residual count of the bad literal in both JSONs: **0**.

### What the owner must do

1. **Open Supabase dashboard → Project Settings → API → "Reset service role key"**. The old key is dead the moment you rotate.
2. **Set the new key in n8n's environment**:
   ```
   SUPABASE_SERVICE_KEY=<new_key_here>
   ```
   For Docker:
   ```yaml
   environment:
     - SUPABASE_SERVICE_KEY=sb_secret_xxx
   ```
   Or via `.env` next to your `docker-compose.yml`. Restart n8n.
3. **Import the patched workflows**. They'll pick up the env var via the `$env` expression.
4. (Recommended) Replace each HTTP Request node's "Header Auth" with an n8n **Credential** of type "HTTP Header Auth", named e.g. "Supabase Service Role". Centralises rotation: next time you rotate, you change the credential value once and every workflow picks it up.
5. **Audit your Supabase audit log** (Database → Logs → Logs Explorer) for the last 30 days. Look for unexpected `SELECT/INSERT/UPDATE/DELETE` traffic from IPs outside your n8n host. If anything looks suspicious, restore from the most recent point-in-time backup and notify affected owners.

---

## HIGH — Row Level Security disabled / weak on customer-facing tables

**Severity:** High
**Status in v3:** Fixed by `MIGRATIONS.sql`

### What was wrong

The anon key (which is fine to ship in the browser) only respects RLS
if RLS is enabled on every table. The v2 schema didn't enable RLS, so
any user with a valid Supabase session could read any other store's
products, customers, conversation logs, and usage data by changing the
`owner_id` filter in their browser dev tools.

### What v3 does

`MIGRATIONS.sql` step 5 enables RLS on every owner-scoped table and
adds policies:

| Table                  | SELECT policy                  | Write policy                   |
|------------------------|--------------------------------|--------------------------------|
| `stores`               | `owner_id = auth.uid()`        | `UPDATE` only, owner-scoped    |
| `products`             | `owner_id = auth.uid()`        | All ops, owner-scoped          |
| `customers`            | `owner_id = auth.uid()`        | All ops, owner-scoped          |
| `monthly_usage`        | `owner_id = auth.uid()`        | None (n8n writes via service)  |
| `whatsapp_logs`        | `owner_id = auth.uid()`        | None                           |
| `conversation_sessions`| `owner_id = auth.uid()`        | None                           |
| `alert_flags`          | `owner_id = auth.uid()`        | None                           |
| `jewellery_categories` | `true` (public)                | None                           |
| `jewellery_sub_cats`   | `true` (public)                | None                           |
| `subscription_plans`   | `true` (public)                | None                           |

The service role key (used by n8n) bypasses RLS, so back-end writes
(insert into `monthly_usage`, `whatsapp_logs`, etc.) keep working.

### Verification

After running the migration, log in as a test owner and try:

```js
// In the browser console of the test owner
const { data } = await supabase.from('products').select('*').neq('owner_id', '<your-uid>');
console.log(data);   // should be [] — RLS filtered everything out
```

---

## MEDIUM — Hardcoded anon key in source code

**Severity:** Medium (not a secret, but couples the build to one project)
**Status in v3:** Mitigated — moved to env, fallback left for dev

### What was wrong

`src/lib/config.js` hardcoded the Supabase URL + anon key. The anon
key isn't sensitive when RLS is correctly configured (see above), but
hardcoding it:
- Couples the build to one Supabase project (can't run staging easily)
- Makes rotation a code change instead of a config change
- Sets a bad example for team members ("oh, secrets go in code")

### What v3 does

`src/lib/config.js` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
from `import.meta.env`. If the env var is missing, it falls back to the
v2 hardcoded value so local dev keeps working.

The owner sets the real values in:
- `.env.local` for local dev (gitignored)
- Vercel env vars for production

`.env.example` is committed as a template.

### What the owner must do

1. Copy `.env.example` to `.env.local`, paste your anon key.
2. In Vercel: Settings → Environment Variables, add all 5 `VITE_*` vars.
3. Trigger a re-deploy. The next build will use env, not the fallback.

---

## MEDIUM — No client-side input validation on uploads

**Severity:** Medium (DoS / storage abuse)
**Status in v3:** Fixed

### What was wrong

v2 accepted any image file via Cloudinary upload, with no size check.
A malicious or careless user could upload a 100 MB image, fill the
store's Cloudinary quota, and hit the owner with a surprise bill.

### What v3 does

- `ProductModal.jsx`: rejects images > 5 MB before upload with a clear error
- `VideoUpload.jsx`: rejects videos > 25 MB or > 10 s before upload
- Both check MIME type (`startsWith('image/')` / `startsWith('video/')`)
- Cloudinary preset should additionally enforce these limits server-side (see README "Set up Cloudinary")

---

## LOW — Inactivity timeout not enforced for backgrounded tabs

**Severity:** Low
**Status in v3:** Unchanged (acceptable risk)

### What was wrong

The 30-minute inactivity timeout in `useAuth.jsx` uses `setTimeout`,
which most browsers throttle in background tabs to ~1 min minimum.
A backgrounded session may auto-logout slightly later than 30 min.

### Why we left it

The exposure window is short, and forcing the issue with a
`visibilitychange` listener has UX trade-offs (premature logout when
the owner just switches tabs to copy a customer's phone number).
Acceptable for the threat model (jewellery store back office, not
high-security medical/banking).

---

## LOW — n8n workflows trusted user-supplied `owner_id`

**Severity:** Low
**Status in v3:** Partly addressed; further hardening recommended

### What was wrong

The Add/Edit workflow's `Parse Form Data` node accepts `ownerId` from
the request body. A malicious client could spoof another store's
`owner_id` to insert products into their inventory.

### What v3 does

The frontend in v3 no longer routes Add/Edit through n8n at all —
products are inserted via the Supabase JS client, which means
`auth.uid()` is the actual logged-in user (not a body field), and RLS
enforces ownership.

The n8n Add/Edit workflow is kept around as a fallback for external
integrations (Zapier, custom CSV imports), but those integrations should
authenticate via a signed token, not a free-form body field.

### What the owner could do next

If you want to keep the n8n endpoint live, add a signing layer:
1. Generate a per-store HMAC secret.
2. Require requests to include `X-Signature: hex(hmac_sha256(secret, body))`.
3. The `Parse Form Data` node verifies the signature before reading `ownerId`.

---

## INFO — Anon key embedded in client bundles

**Severity:** Informational (this is by design for Supabase)
**Action:** None — but make sure RLS is on (see HIGH above)

The Supabase anon key is **designed** to be public. The whole security
model assumes it ships in the browser. What matters is that RLS is on
every table, which the v3 migration ensures.

---

## Periodic hygiene checklist

Run these once a month:

- [ ] Rotate the Supabase service-role key (5 min)
- [ ] Review Supabase audit logs for unexpected service-role usage
- [ ] Audit `stores` rows for any with `status='active'` you didn't approve
- [ ] Check Cloudinary `/usage` for unexpected bandwidth spikes
- [ ] Update n8n + its base image (security patches)
- [ ] Update npm deps: `npm outdated && npm audit fix`
- [ ] Verify backups: trigger a manual point-in-time restore drill to a staging project

---

## Reporting a vulnerability

Email **nikimodi81@gmail.com**. Please don't open a public GitHub issue
for security topics — give the team 7 days to patch before disclosure.
