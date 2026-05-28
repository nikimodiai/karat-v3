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

// ── New jewellery price calculator (no GST, separate gold + silver) ──
// Reads live per-gram rates from daily_metal_rates; owner specifies
// gold grams and/or silver grams independently.
export function calcJewelleryPrice({
  goldGrams, goldRatePerGram,
  silverGrams, silverRatePerGram,
  making, makingMode,
  stoneWeightCt, stoneRatePerCt, flatStoneCost,
  hallmarkFee,
}) {
  const gG = num(goldGrams);
  const sG = num(silverGrams);
  const gR = num(goldRatePerGram);
  const sR = num(silverRatePerGram);

  const goldCost    = roundP(gG * gR);
  const silverCost  = roundP(sG * sR);
  const metalCost   = goldCost + silverCost;
  const metalGrams  = gG + sG;

  const makingVal   = num(making);
  let makingCost = 0;
  if      (makingMode === 'per_gram') makingCost = roundP(makingVal * metalGrams);
  else if (makingMode === 'percent')  makingCost = roundP(metalCost * makingVal / 100);
  else                                makingCost = roundP(makingVal);

  const stoneCost = roundP(num(stoneWeightCt) * num(stoneRatePerCt) + num(flatStoneCost));
  const hallmark  = roundP(num(hallmarkFee, DEFAULT_HALLMARK_FEE));
  const total     = roundP(goldCost + silverCost + makingCost + stoneCost + hallmark);

  return { goldCost, silverCost, metalCost, makingCost, stoneCost, hallmark, total };
}

// ── metal_rates lookup helpers ──────────────────────────────────────
// metal_rates rows look like:
//   { metal_type: 'gold_916', purity_factor: '0.916', rate_per_gram: '12500', is_current: true, ... }
//
// purityToMetalType('22K Gold')         -> 'gold_917'   (22/24×1000 rounded)
// purityToMetalType('970 Silver (T..)') -> 'silver_970'
// purityToMetalType('Platinum')         -> 'platinum'
export function purityToMetalType(purity) {
  if (!purity) return null;
  const k = String(purity).match(/^(\d+)K/);
  if (k) return `gold_${Math.round(Number(k[1]) / 24 * 1000)}`;
  const s = String(purity).match(/^(\d{3})\s*Silver/i);
  if (s) return `silver_${s[1]}`;
  if (/plat/i.test(purity)) return 'platinum';
  return null;
}

// Look up a per-gram rate for a purity. Falls back proportionally to the
// 999 base when an exact row isn't available — so a shop that only
// records gold_999 & silver_999 can still price 22K / 970-silver items.
//
// Returns: { rate, source: 'exact' | 'derived' | 'missing', baseRate, ratio }
export function resolveMetalRate(purity, rows) {
  if (!purity || !rows?.length) return { rate: 0, source: 'missing' };
  const targetKey = purityToMetalType(purity);
  if (!targetKey) return { rate: 0, source: 'missing' };

  const exact = rows.find(r => r.metal_type === targetKey);
  if (exact) return { rate: Number(exact.rate_per_gram), source: 'exact' };

  // Derive from the 999-purity base of the same metal family
  const isGold   = targetKey.startsWith('gold');
  const isSilver = targetKey.startsWith('silver');
  if (!isGold && !isSilver) return { rate: 0, source: 'missing' };

  const base = rows.find(r => r.metal_type === (isGold ? 'gold_999' : 'silver_999'));
  if (!base) return { rate: 0, source: 'missing' };

  const targetPurity = Number(targetKey.split('_')[1]);   // e.g. 970
  const ratio = targetPurity / 999;
  return {
    rate: Number(base.rate_per_gram) * ratio,
    source: 'derived',
    baseRate: Number(base.rate_per_gram),
    ratio,
  };
}

// TODO (production): wire to a live gold-rate API. Options:
//   - GoldAPI.io (paid, USD-based, convert via FX)
//   - MetalPriceAPI
//   - Scrape MCX or local jeweller association rate-cards via a
//     small n8n scheduled workflow that writes today's rates to a
//     `daily_metal_rates` table; client reads from there.
// Until then, owner enters the rate manually each day.
