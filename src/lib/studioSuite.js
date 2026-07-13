// ── AI Studio Suite — shared quota + gating helpers ─────────────────
// One monthly meter (stores._ai_studio_suite_used / _ai_studio_suite_limit)
// gates every Studio Suite feature. Enforced client-side, same pattern the
// old per-feature meters used (AIModelPanel incremented _ai_used += urls.length;
// DesignStudio incremented _design_used += 1).
//
// Charging model (decided 2026-07-14):
//   • Image features (AI Model, Jewellery Design, Studio Photo, Metal Swap):
//     +N where N = images actually produced, incremented AFTER generation.
//   • Reels: +reelSuiteCost(seconds, resolution), incremented on completion.
//
// The six Studio Suite features and their app_gallery `kind`:
export const SUITE_FEATURES = {
  studio_photo:    { label: 'Studio Photo',     kind: 'studio_photo' },
  metal_swap:      { label: 'Metal Swap',       kind: 'metal_swap' },
  jewellery_design:{ label: 'Jewellery Design', kind: 'design' },
  ai_model:        { label: 'AI Model',         kind: 'ai_model' },
  reels:           { label: 'Generate Reels',   kind: 'reel' },
};

import { db } from './config';
import { effectiveLimit, hasFeature } from './plans';

// How many units the store has left this month (Infinity if unlimited).
export function suiteUnitsLeft(store) {
  const limit = effectiveLimit(store, 'ai_studio_suite');
  if (limit === Infinity) return Infinity;
  const used = Math.floor(store?._ai_studio_suite_used || 0);
  return Math.max(0, limit - used);
}

// True if the plan unlocks Studio Suite AND there's at least `need` units left.
export function canUseSuite(store, need = 1) {
  if (!hasFeature(store, 'ai_studio_suite')) return false;
  const left = suiteUnitsLeft(store);
  return left === Infinity || left >= need;
}

// Human label for the usage line, e.g. "42/150 this month" (null if unlimited).
export function suiteUsageText(store) {
  const limit = effectiveLimit(store, 'ai_studio_suite');
  if (limit === Infinity) return null;
  const used = Math.floor(store?._ai_studio_suite_used || 0);
  return `${used}/${limit} this month`;
}

// Add `units` to the store's monthly counter. Returns the new used value.
// Reads the current value first so concurrent tabs don't clobber each other
// with a stale local number (best-effort; a hard race can still overshoot,
// which is acceptable per the client-side enforcement decision).
export async function chargeSuite(ownerId, units) {
  if (!ownerId || !units || units <= 0) return;
  const { data } = await db
    .from('stores')
    .select('_ai_studio_suite_used')
    .eq('owner_id', ownerId)
    .single();
  const current = Math.floor(data?._ai_studio_suite_used || 0);
  const next = current + Math.ceil(units);
  await db.from('stores').update({ _ai_studio_suite_used: next }).eq('owner_id', ownerId);
  return next;
}
