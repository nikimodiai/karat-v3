// ── Indian Jewellery Pricing Calculator ─────────────────────────────
// Models how a real Indian jewellery owner prices a piece:
//
//   FINAL PRICE = ((Metal Cost) + (Making Charges) + (Stone Cost)
//                  + (Hallmark Fee)) × (1 + GST %)
//
// Where:
//   Metal Cost     = (rate_per_gram / 24) × purity_carat × weight_g
//                    (for gold; analogous for silver using fineness/1000)
//   Making Charges = either ₹/gram OR percentage of Metal Cost
//   Stone Cost     = sum of (stone_rate_per_carat × stone_weight_ct)
//                    + flat add-ons (e.g. enamel, pearls)
//   Hallmark Fee   = flat (BIS hallmark ~₹35–45)
//   GST            = 3% on all of the above (gold/silver jewellery, India)
//
// Live gold rates change daily; the owner enters today's rate manually
// (or we fetch it via API — see TODO at the bottom).
// ────────────────────────────────────────────────────────────────────

// Indicative default rates (₹/gram) — the owner overrides these daily.
// These are PLACEHOLDERS, not live quotes. UI must label them as such.
export const DEFAULT_GOLD_RATES = {
  '24K': 7800,        // ₹/g, indicative as of edit date
  '22K': 7150,
  '20K': 6500,
  '18K': 5850,
  '18K White Gold': 5850,
  '18K Rose Gold': 5850,
  'Platinum': 3200,
};

export const DEFAULT_SILVER_RATES = {
  '999 Silver (Fine)':         95,
  '925 Silver (Sterling)':     88,
  '800 Silver':                75,
};

// Default lab-grown diamond price (₹ per carat) — varies wildly by cut/colour
export const DEFAULT_LAB_DIAMOND_RATE = 18000;     // ₹/ct
export const DEFAULT_NATURAL_DIAMOND_RATE = 95000; // ₹/ct (reference only)

// Default making charge presets (owner can override)
export const MAKING_CHARGE_MODES = [
  { value: 'per_gram',   label: '₹ per gram' },
  { value: 'percent',    label: '% of metal cost' },
  { value: 'flat',       label: 'Flat amount ₹' },
];

export const GST_RATE = 0.03; // 3% on jewellery (India)
export const DEFAULT_HALLMARK_FEE = 45; // ₹

// Parse a carat string like "22K Gold" → 22.  Returns null if not gold.
export function parseGoldCarat(carat) {
  if (!carat) return null;
  const m = String(carat).match(/^(\d+)K/);
  return m ? Number(m[1]) : null;
}

// Parse silver purity like "925 Silver (Sterling)" → 0.925
export function parseSilverFineness(carat) {
  if (!carat) return null;
  const m = String(carat).match(/^(\d{3})\s*Silver/i);
  return m ? Number(m[1]) / 1000 : null;
}

// True if this carat string is platinum
export function isPlatinum(carat) {
  return /platinum/i.test(carat || '');
}

// Determine the *type* of metal a product is made of, based on its carat
export function metalType(carat) {
  if (!carat) return 'unknown';
  if (isPlatinum(carat))             return 'platinum';
  if (parseSilverFineness(carat))    return 'silver';
  if (parseGoldCarat(carat))         return 'gold';
  return 'unknown';
}

// ── The actual calculator ───────────────────────────────────────────
// inputs: { weight, carat, ratePerGram, making, makingMode,
//           stoneCount, stoneRate, flatStoneCost, hallmarkFee, gstPct }
// returns: { metalCost, makingCost, stoneCost, hallmark, subtotal, gst, total }
export function calculatePrice(inputs) {
  const w           = num(inputs.weight);
  const carat       = inputs.carat;
  const rate        = num(inputs.ratePerGram);
  const makingVal   = num(inputs.making);
  const makingMode  = inputs.makingMode || 'per_gram';
  const stoneCt     = num(inputs.stoneWeightCt);     // total carats of stones
  const stoneRate   = num(inputs.stoneRatePerCt);    // ₹/carat
  const flatStone   = num(inputs.flatStoneCost);     // additional flat stone cost
  const hallmark    = num(inputs.hallmarkFee, DEFAULT_HALLMARK_FEE);
  const gstPct      = inputs.gstPct != null ? num(inputs.gstPct) : GST_RATE * 100;

  // Metal purity factor
  let purity = 0;
  const mt = metalType(carat);
  if (mt === 'gold')        purity = (parseGoldCarat(carat) || 0) / 24;
  else if (mt === 'silver') purity = parseSilverFineness(carat) || 0;
  else if (mt === 'platinum') purity = 0.95; // PT950 standard
  else purity = 0;

  const metalCost = roundP(rate * purity * w);

  let makingCost = 0;
  if (makingMode === 'per_gram')      makingCost = roundP(makingVal * w);
  else if (makingMode === 'percent')  makingCost = roundP(metalCost * (makingVal / 100));
  else                                makingCost = roundP(makingVal); // flat

  const stoneCost = roundP(stoneCt * stoneRate + flatStone);

  const subtotal  = roundP(metalCost + makingCost + stoneCost + hallmark);
  const gst       = roundP(subtotal * (gstPct / 100));
  const total     = roundP(subtotal + gst);

  return { metalCost, makingCost, stoneCost, hallmark, subtotal, gst, total };
}

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function roundP(n) { return Math.round(n * 100) / 100; }

// Returns the default ₹/gram suggestion for a carat string.
export function defaultRateFor(carat) {
  if (!carat) return 0;
  if (DEFAULT_GOLD_RATES[carat])   return DEFAULT_GOLD_RATES[carat];
  if (DEFAULT_SILVER_RATES[carat]) return DEFAULT_SILVER_RATES[carat];
  // Try matching by leading carat code (e.g. "22K Gold" → "22K")
  const g = parseGoldCarat(carat);
  if (g)              return DEFAULT_GOLD_RATES[g + 'K'] || 0;
  if (isPlatinum(carat)) return DEFAULT_GOLD_RATES['Platinum'];
  return 0;
}

// Locale-aware INR formatter, ₹ symbol prefix, no decimals for prices ≥ ₹100.
export function fmtINR(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 100) {
    return '₹' + Math.round(v).toLocaleString('en-IN');
  }
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// TODO (production): wire to a live gold-rate API. Options:
//   - GoldAPI.io (paid, USD-based, convert via FX)
//   - MetalPriceAPI
//   - Scrape MCX or local jeweller association rate-cards via a
//     small n8n scheduled workflow that writes today's rates to a
//     `daily_metal_rates` table; client reads from there.
// Until then, owner enters the rate manually each day.
