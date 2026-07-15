import { createClient } from '@supabase/supabase-js';

// ── Env-driven config (Vite reads VITE_* at build time) ─────────────
// Falls back to development defaults only if env is missing
// so local dev keeps working. In production, set VITE_* in Vercel.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

export const SUPABASE_URL =
  env.VITE_SUPABASE_URL ||
  'https://bigmdvjrvqyqzyrijdum.supabase.co';

export const SUPABASE_KEY =
  env.VITE_SUPABASE_ANON_KEY ||
  // PUBLIC anon key (safe in browser when RLS is enabled on every table).
  // Move to env in production: never commit a long-lived anon key.
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZ21kdmpydnF5cXp5cmlqZHVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MDU0OTcsImV4cCI6MjA5Mzk4MTQ5N30.8WWSA8xC0ySHhAgz9pscBvI5O2r6-LSejuy-mnyzRdM';

export const CLOUDINARY_CLOUD = env.VITE_CLOUDINARY_CLOUD || 'jewelleryinventory';
export const CLOUDINARY_PRESET = env.VITE_CLOUDINARY_PRESET || 'jewelleryupload';

export const FB_APP_ID = env.VITE_FB_APP_ID || '';

export const N8N_BASE = env.VITE_N8N_BASE || 'https://n8n.srv1639765.hstgr.cloud/webhook';
export const N8N_SIGNUP_URL    = N8N_BASE + '/store-approval-request';
export const N8N_IMPORT_ANALYZE = N8N_BASE + '/swarnix-import/analyze';
export const N8N_IMPORT_COMMIT  = N8N_BASE + '/swarnix-import/commit';
export const N8N_VOICE_INGEST   = N8N_BASE + '/swarnix-voice-ingest';
export const N8N_AI_MODEL       = N8N_BASE + '/swarnix-ai-model';
// Image-search vectorization: receives { product_id, primary_image_url },
// generates an embedding for the main image, writes it back to the product row.
export const N8N_ADD_PRODUCT_VECTOR = N8N_BASE + '/add_product_vector';
// Conversation summary: receives { owner_id, days, customers[] }, returns { summaries[] }
export const N8N_CONVERSATION_SUMMARY = N8N_BASE + '/conversation-summary';
// "Ask Swarnix" SOP help chatbot: receives { owner_id, asked_by, question }, returns { answer, matchedSlugs[] }
export const N8N_SOP_CHAT = N8N_BASE + '/swarnix-sop-chat';
// Marketing campaign send: receives { owner_id, wa_access_token, whatsapp_phone_number_id,
// campaign_name, template_name, template_language, components, customers[] }, sends one
// WhatsApp template message per customer (rate-limited) and logs each result to Supabase.
export const N8N_MARKETING_SEND = N8N_BASE + '/marketing-send';
// Design Studio generation: receives FormData { owner_id, prompt, mode ('scratch'|'reference'),
// variation ('0'|'1'), and (Mode B) a `reference` image file. Calls Vertex AI server-side,
// uploads the render(s) to Cloudinary, returns { renders: ["https://…"] }.
export const N8N_DESIGN_GENERATE = N8N_BASE + '/swarnix-design-generate-v2';
// Background removal: receives FormData { image (file) } or { image_url },
// runs the self-hosted rembg service, uploads the transparent PNG to
// Cloudinary, returns { secure_url, public_id }. Cost ₹0 (VPS compute).
export const N8N_BG_REMOVE = N8N_BASE + '/swarnix-bg-remove';

// ── AI Studio Suite webhooks (shared with the mobile studio) ────────
// The web app's Studio Suite reuses the SAME proven n8n workflows the mobile
// swarnix-studio app calls — no separate app-* endpoints. All take the
// jeweller's Supabase user id (owner_id === user.id) for the usage log; the
// monthly cap is enforced client-side against stores._ai_studio_suite_limit.
//
// Studio Photo (retouch) + Metal Swap (variant): one workflow, two modes
// (`mode: 'retouch' | 'variant'`). The app first turns a device photo into a
// Cloudinary URL via reel-image-upload (n8n holds the Cloudinary creds), then
// POSTs JSON here → { success, retouched_url }.
export const N8N_RETOUCH = N8N_BASE + '/retouch';
// Reel Generation (image-to-video), three webhooks:
//  - reel-image-upload: multipart { file, user_id? } → { url } (Cloudinary).
//  - reel-generate: JSON submit → { job_id, status:'processing' }; n8n renders
//    in the background and updates the reel_jobs row (service role).
//  - reel-status: optional fallback poll; the app prefers Supabase Realtime.
export const N8N_REEL_IMAGE_UPLOAD = N8N_BASE + '/reel-image-upload';
export const N8N_REEL_GENERATE     = N8N_BASE + '/reel-generate';
export const N8N_REEL_STATUS       = N8N_BASE + '/reel-status';

// Owner metal-rate override: after the jeweller saves their own rate/premium
// into app_owner_metal_rates, POST { owner_id } here to immediately re-price
// that owner's dynamic products/variants (scoped run of the Daily Dynamic
// Pricing Updater). Absent owner_id = the scheduled run re-prices everyone.
export const N8N_OWNER_RATE_SAVE = N8N_BASE + '/swarnix-owner-rate-save';

export const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'swarnix-auth-v3',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

// ── Categories ──────────────────────────────────────────────────────
// Subcategories grouped by category. Items shown in dropdown order.
export const SUBCATEGORY_MAP = {
  Ring: ['Engagement Rings', 'Wedding Bands', 'Solitaire Rings', 'Cocktail Rings', 'Daily Wear Rings', 'Couple Rings', "Men's Rings", 'Eternity Rings', 'Half-Eternity Rings', 'Navratna Ring', 'Thumb Ring', 'Signet Ring'],
  Earring: ['Studs', 'Jhumkas', 'Hoops', 'Drop & Dangle', 'Chandeliers', 'Ear Cuffs', 'Huggies', 'Tops / Tops with Chain', 'Clip-on', 'Kaan Chain', 'Ear Jacket'],
  Necklace: ['Chokers', 'Layered Necklaces', 'Necklace Sets', 'Harams', 'Temple Jewellery', 'Kundan Necklaces', 'Polki Necklaces', 'Diamond Necklaces', 'Gold Necklaces', 'Short Necklace (18")', 'Rani Haar', 'Kanthi Mala', 'Satlada', 'Riviera Necklace'],
  Bangle: ['Gold Bangles', 'Diamond Bangles', 'Kada', 'Bangle Sets', 'Openable Bangles', 'Antique Bangles', 'Polki Bangles', 'Chuda Set', 'Baby Bangles'],
  Bracelet: ['Tennis Bracelets', 'Link Bracelets', 'Charm Bracelets', "Men's Bracelets", 'Stackable Bracelets', 'Cuff Bracelets'],
  Pendant: ['Pendant with Chain', 'Pendant Sets', 'Religious Pendants', 'Solitaire Pendants', 'Initial Pendants', 'Lockets', 'Enamel Pendants'],
  Mangalsutra: ['Traditional Mangalsutra', 'Diamond Mangalsutra', 'Lightweight Mangalsutra', 'Short Mangalsutra', 'Long Mangalsutra', 'Tanmaniya', 'Single Chain Mangalsutra', 'Double Chain Mangalsutra', 'Mangalsutra Bracelet'],
  Chain: ['Gold Chains', "Men's Chains", 'Box Chains', 'Rope Chains', 'Fancy Chains', 'Rolo Chains', 'Figaro Chain', 'Singapore Chain', 'Wheat / Spiga Chain'],
  Anklet: ['Gold Anklets', 'Silver Anklets', 'Diamond Anklets', 'Beaded Anklets'],
  Nosepin: ['Stud Nosepins', 'Ring Nosepins (Nath)', 'Clip-on Nosepins', 'Nath (Bridal Nose Ring)', 'Septum Ring'],
  'Maang Tikka': ['Traditional Maang Tikka', 'Passa / Side Tikka', 'Jhoomar', 'Chain Maang Tikka'],
  Bajuband: ['Traditional Bajuband', 'Diamond Bajuband', 'Bridal Bajuband', 'Gold Bajuband', 'Antique Bajuband'],
  Kamarband: ['Gold Kamarband', 'Silver Kamarband', 'Diamond Kamarband', 'Bridal Kamarband', 'Antique Kamarband'],
  'Haath Phool': ['Gold Haath Phool', 'Diamond Haath Phool', 'Kundan Haath Phool', 'Bridal Haath Phool', 'Polki Haath Phool'],
  Bichhiya: ['Gold Bichhiya', 'Silver Bichhiya', 'Diamond Bichhiya', 'Plain Bichhiya', 'Floral Bichhiya'],
  Brooch: ['Floral Brooches', 'Religious Brooches', 'Animal Brooches', 'Geometric Brooches'],
  Set: ['Necklace + Earring Set', 'Full Bridal Set', 'Ring + Earring Set', '3-Piece Set', '5-Piece Set', 'Mangalsutra Set', 'Choker Set'],
  Silver: ['Silver Rings', 'Silver Earrings', 'Silver Necklaces', 'Silver Bangles', 'Silver Bracelets', 'Silver Pendants', 'Silver Anklets', 'Silver Toe Rings', 'Silver Idols', 'Silver Utensils', 'Silver Coins', 'Oxidised Silver Jewellery'],
  'Lab-Grown Diamond': ['LGD Solitaire Rings', 'LGD Engagement Rings', 'LGD Stud Earrings', 'LGD Tennis Bracelets', 'LGD Pendants', 'LGD Necklaces', 'LGD Eternity Bands', 'LGD Cocktail Rings', 'Loose LGD Stones'],
  'Loose Stone': ['Natural Diamonds', 'Lab-Grown Diamonds', 'Rubies', 'Emeralds', 'Sapphires', 'Polki', 'Pearls', 'Semi-precious Stones'],
  Coin: ['2g Gold Coin', '4g Gold Coin', '5g Gold Coin', '8g Gold Coin', '10g Gold Coin', '20g Gold Coin', '50g Gold Bar', '100g Gold Bar', 'Silver Coin', 'Silver Bar'],
  Other: ['Custom Order', 'Antique Piece', 'Heirloom', 'Miscellaneous'],
};

export const CATEGORIES = [
  { value: 'Silver', label: 'Silver Jewellery' },
  { value: 'Lab-Grown Diamond', label: 'Lab-Grown Diamonds' },
  { value: 'Loose Stone', label: 'Loose Stones' },
  { value: 'Coin', label: 'Gold Coins & Bars' },
  { value: 'Ring', label: 'Rings' },
  { value: 'Earring', label: 'Earrings' },
  { value: 'Necklace', label: 'Necklaces' },
  { value: 'Bangle', label: 'Bangles' },
  { value: 'Bracelet', label: 'Bracelets' },
  { value: 'Pendant', label: 'Pendants' },
  { value: 'Mangalsutra', label: 'Mangalsutra' },
  { value: 'Chain', label: 'Chains' },
  { value: 'Anklet', label: 'Anklets' },
  { value: 'Nosepin', label: 'Nosepins' },
  { value: 'Maang Tikka', label: 'Maang Tikka' },
  { value: 'Bajuband', label: 'Bajuband (Armlets)' },
  { value: 'Kamarband', label: 'Kamarband (Waist Belt)' },
  { value: 'Haath Phool', label: 'Haath Phool' },
  { value: 'Bichhiya', label: 'Bichhiya (Toe Rings)' },
  { value: 'Brooch', label: 'Brooches' },
  { value: 'Set', label: 'Sets' },
  { value: 'Other', label: 'Other' },
];

// ── Metal & Purity options ──────────────────────────────────────────
export const GOLD_CARATS = [
  // Yellow Gold
  '24K Gold',
  '23K Gold',
  '22K Gold',
  '21K Gold',
  '20K Gold',
  '18K Gold',
  '16K Gold',
  '14K Gold',
  '12K Gold',
  '10K Gold',
  '9K Gold',
  '8K Gold',
  // Silver purities
  '999 Silver (Fine)',
  '970 Silver (Traditional)',
  '958 Silver (Britannia)',
  '925 Silver (Sterling)',
  '900 Silver (Coin)',
  '835 Silver (Alloyed)',
  '800 Silver',
  // Other precious / base metals
  'Platinum',
  'Panchdhatu (5-Metal Alloy)',
  'Ashtadhatu (8-Metal Alloy)',
  'Brass',
  'Copper',
  'Titanium',
  'Stainless Steel',
];

// ── Metal Purity grouped (for product form optgroups & calculator) ──
export const METAL_PURITY_GROUPS = [
  {
    label: 'Gold Purity',
    options: [
      '24K Gold', '23K Gold', '22K Gold', '21K Gold', '20K Gold',
      '18K Gold', '16K Gold', '14K Gold', '10K Gold', '9K Gold', '8K Gold',
    ],
  },
  {
    label: 'Silver Purity',
    options: [
      '999 Silver (Fine)', '970 Silver (Traditional)', '958 Silver (Britannia)',
      '925 Silver (Sterling)', '900 Silver (Coin)', '835 Silver (Alloyed)', '800 Silver',
    ],
  },
  {
    label: 'Others',
    options: [
      'Platinum', 'Panchdhatu (5-Metal Alloy)', 'Ashtadhatu (8-Metal Alloy)',
      'Brass', 'Copper', 'Titanium', 'Stainless Steel',
    ],
  },
];

// GIA clarity scale (best → lowest), plus Polki for traditional Indian uncut-diamond jewellery
export const DIAMOND_PURITIES = [
  'FL',
  'IF',
  'VVS1',
  'VVS2',
  'VS1',
  'VS2',
  'SI1',
  'SI2',
  'I1',
  'I2',
  'I3',
  'Polki / Uncut Diamond',
];

// Categories that should default to silver purities in the Carat dropdown
export const SILVER_CATEGORIES = new Set(['Silver']);

// Categories where lab-grown diamond cost (per carat) is the dominant component
export const LAB_DIAMOND_CATEGORIES = new Set(['Lab-Grown Diamond']);

// ── Misc constants ──────────────────────────────────────────────────
export const INACTIVITY_MS = 30 * 60 * 1000;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;  // 5 MB per image
