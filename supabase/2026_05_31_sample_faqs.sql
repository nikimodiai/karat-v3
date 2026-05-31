-- ── 2026-05-31: Sample FAQ catalogue ────────────────────────────────
-- A small global, read-only reference table of starter FAQs that every
-- jewellery owner sees the first time they open the FAQ page (before
-- they have saved anything to public.owner_faqs).
--
-- Flow:
--   1. Owner opens FAQ page.
--   2. If they have no rows in owner_faqs → we show sample_faqs as a
--      pre-filled, editable draft.
--   3. When the owner saves (after optionally tweaking the text), the
--      drafts are written into public.owner_faqs (owner_id-wise).
--   4. From then on, the owner only ever sees their own owner_faqs rows.

CREATE TABLE IF NOT EXISTS public.sample_faqs (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  question    text NOT NULL,
  answer      text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sample_faqs_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_sample_faqs_sort
  ON public.sample_faqs USING btree (sort_order)
  TABLESPACE pg_default
  WHERE (is_active = true);

-- Read-only for every authenticated owner; no insert/update/delete policy
-- is granted, so the catalogue stays curated by us.
ALTER TABLE public.sample_faqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sample_faqs_read_all" ON public.sample_faqs;
CREATE POLICY "sample_faqs_read_all" ON public.sample_faqs
  FOR SELECT TO authenticated
  USING (true);

-- ── Seed: 10 grounded, real-world jeweller FAQs ──────────────────────
-- Idempotent reseed: clear and re-insert so re-running the migration
-- keeps the catalogue in sync with this file.
DELETE FROM public.sample_faqs;

INSERT INTO public.sample_faqs (question, answer, sort_order) VALUES
(
  'Will the gold rate be locked when I book, or charged on the delivery date?',
  'For ready stock, the gold rate is locked the moment you confirm and pay. For made-to-order pieces, we lock the rate against a 25% advance — if rates rise before delivery you pay nothing extra, and if they fall we honour the lower rate. The locked rate is printed on your booking slip.',
  0
),
(
  'How do you calculate the final price — what are making charges and wastage?',
  'Final price = (gold weight × today''s purity rate) + making charges + wastage + stone value + GST. Making charges are the craftsmanship cost (per gram or a flat amount), and wastage covers gold lost during handcrafting, usually 3–8% depending on the design''s intricacy. We show this full breakup on every estimate so there are no surprises.',
  1
),
(
  'Is every piece BIS hallmarked, and what is the HUID number?',
  'Yes — all gold jewellery 2 grams and above is BIS hallmarked with a 6-digit HUID (Hallmark Unique ID) laser-etched on the piece. You can verify it yourself on the BIS Care app. The hallmark guarantees the purity stamped (22K/18K/14K) is genuine.',
  2
),
(
  'What is your buyback and exchange policy, and how much do you deduct?',
  'On exchange of our own hallmarked gold, we deduct only making charges and give you full value on the gold weight at the current rate. On buyback (cash), we deduct a small refining margin (typically 8–10%). Diamonds and stones are valued separately as per their certificate. Always carry your original invoice.',
  3
),
(
  'Do your diamonds come with certification, and are they natural or lab-grown?',
  'Every solitaire and diamond above 0.30 carat ships with an independent IGI or GIA certificate stating the 4Cs — cut, colour, clarity and carat. We clearly label natural vs lab-grown diamonds on the tag and invoice; we never mix the two. Smaller melee diamonds carry our in-house quality assurance.',
  4
),
(
  'Can I customise a design or recreate something from a photo?',
  'Absolutely — custom and made-to-order is our specialty. Share a reference photo, sketch or Pinterest link on WhatsApp with your budget and metal preference, and we''ll send a CAD design and quote within 2–3 days. Production usually takes 10–15 days after the design is approved and advance is paid.',
  5
),
(
  'How long will my order take to deliver?',
  'Ready stock ships within 2–3 business days. Made-to-order and customised pieces take 10–15 business days after design approval. Bridal and heavy hand-set sets can take 3–4 weeks. We share photos and updates at each stage so you always know where your piece is.',
  6
),
(
  'What payment options do you offer — UPI, cards, EMI or a savings scheme?',
  'We accept UPI, bank transfer, and all major credit/debit cards. No-cost EMI is available on select pieces via partner banks. We also run a monthly gold savings scheme where you pay 11 instalments and we add the 12th — redeemable against any purchase. COD is available up to ₹25,000.',
  7
),
(
  'What is your return and refund policy?',
  'Unworn ready-stock jewellery can be returned within 7 days with the original invoice, tag and certificate for a full refund or exchange. Custom-made, engraved and altered pieces are non-returnable as they''re built to your specification. Refunds are processed to the original payment method within 5–7 working days.',
  8
),
(
  'How should I care for my jewellery, and do you offer free cleaning or polishing?',
  'Store each piece in a separate soft pouch, keep it away from perfume, chlorine and harsh chemicals, and wear it after applying makeup. Bring your jewellery to us anytime for complimentary ultrasonic cleaning and polishing for life. Rhodium re-plating on white gold and minor repairs are available at a nominal charge.',
  9
);
