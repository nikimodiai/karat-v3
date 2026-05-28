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

export const CLOUDINARY_CLOUD       = env.VITE_CLOUDINARY_CLOUD       || 'jewelleryinventory';
export const CLOUDINARY_PRESET      = env.VITE_CLOUDINARY_PRESET      || 'jewelleryupload';
export const CLOUDINARY_VIDEO_PRESET= env.VITE_CLOUDINARY_VIDEO_PRESET|| 'jewelleryvideoupload';

export const N8N_BASE      = env.VITE_N8N_BASE || 'https://n8n.srv1639765.hstgr.cloud/webhook';
// Kept for backward compat with old workflow URLs (deprecated — add/edit is now direct).
export const N8N_UPLOAD_URL = N8N_BASE + '/jewellery-upload';
export const N8N_DELETE_URL = N8N_BASE + '/delete-product';
export const N8N_SIGNUP_URL = N8N_BASE + '/store-approval-request';

export const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'karat-auth-v3',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

// ── Categories ──────────────────────────────────────────────────────
// Subcategories grouped by category. Items shown in dropdown order.
export const SUBCATEGORY_MAP = {
  Ring:        ['Engagement Rings','Wedding Bands','Solitaire Rings','Cocktail Rings','Daily Wear Rings','Couple Rings',"Men's Rings",'Eternity Rings','Half-Eternity Rings'],
  Earring:     ['Studs','Jhumkas','Hoops','Drop & Dangle','Chandeliers','Ear Cuffs','Huggies','Tops / Tops with Chain','Clip-on'],
  Necklace:    ['Chokers','Layered Necklaces','Necklace Sets','Harams','Temple Jewellery','Kundan Necklaces','Polki Necklaces','Diamond Necklaces','Gold Necklaces','Short Necklace (18")'],
  Bangle:      ['Gold Bangles','Diamond Bangles','Kada','Bangle Sets','Openable Bangles','Antique Bangles','Polki Bangles'],
  Bracelet:    ['Tennis Bracelets','Link Bracelets','Charm Bracelets',"Men's Bracelets",'Stackable Bracelets','Cuff Bracelets'],
  Pendant:     ['Pendant with Chain','Pendant Sets','Religious Pendants','Solitaire Pendants','Initial Pendants','Lockets','Enamel Pendants'],
  Mangalsutra: ['Traditional Mangalsutra','Diamond Mangalsutra','Lightweight Mangalsutra','Short Mangalsutra','Long Mangalsutra','Tanmaniya'],
  Chain:       ['Gold Chains',"Men's Chains",'Box Chains','Rope Chains','Fancy Chains','Rolo Chains'],
  Anklet:      ['Gold Anklets','Silver Anklets','Diamond Anklets','Beaded Anklets'],
  Nosepin:     ['Stud Nosepins','Ring Nosepins (Nath)','Clip-on Nosepins'],
  'Maang Tikka': ['Traditional Maang Tikka','Passa / Side Tikka','Jhoomar','Chain Maang Tikka'],
  Brooch:      ['Floral Brooches','Religious Brooches','Animal Brooches','Geometric Brooches'],
  Set:         ['Necklace + Earring Set','Full Bridal Set','Ring + Earring Set','3-Piece Set','5-Piece Set'],

  // NEW: Silver category
  Silver:      ['Silver Rings','Silver Earrings','Silver Necklaces','Silver Bangles','Silver Bracelets','Silver Pendants','Silver Anklets','Silver Toe Rings','Silver Idols','Silver Utensils','Silver Coins','Oxidised Silver Jewellery'],

  // NEW: Lab-Grown Diamond category
  'Lab-Grown Diamond': ['LGD Solitaire Rings','LGD Engagement Rings','LGD Stud Earrings','LGD Tennis Bracelets','LGD Pendants','LGD Necklaces','LGD Eternity Bands','LGD Cocktail Rings','Loose LGD Stones'],

  'Loose Stone': ['Natural Diamonds','Lab-Grown Diamonds','Rubies','Emeralds','Sapphires','Polki','Pearls','Semi-precious Stones'],
  Coin:        ['2g Gold Coin','4g Gold Coin','5g Gold Coin','8g Gold Coin','10g Gold Coin','20g Gold Coin','50g Gold Bar','100g Gold Bar','Silver Coin','Silver Bar'],
  Other:       ['Custom Order','Antique Piece','Heirloom','Miscellaneous'],
};

export const CATEGORIES = [
  { value: 'Ring',              label: 'Rings' },
  { value: 'Earring',           label: 'Earrings' },
  { value: 'Necklace',          label: 'Necklaces' },
  { value: 'Bangle',            label: 'Bangles' },
  { value: 'Bracelet',          label: 'Bracelets' },
  { value: 'Pendant',           label: 'Pendants' },
  { value: 'Mangalsutra',       label: 'Mangalsutra' },
  { value: 'Chain',             label: 'Chains' },
  { value: 'Anklet',            label: 'Anklets' },
  { value: 'Nosepin',           label: 'Nosepins' },
  { value: 'Maang Tikka',       label: 'Maang Tikka' },
  { value: 'Brooch',            label: 'Brooches' },
  { value: 'Set',               label: 'Sets' },
  { value: 'Silver',            label: 'Silver Jewellery' },
  { value: 'Lab-Grown Diamond', label: 'Lab-Grown Diamonds' },
  { value: 'Loose Stone',       label: 'Loose Stones' },
  { value: 'Coin',              label: 'Gold Coins & Bars' },
  { value: 'Other',             label: 'Other' },
];

// ── Metal & Purity options ──────────────────────────────────────────
export const GOLD_CARATS = [
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
  '18K White Gold',
  '14K White Gold',
  '9K White Gold',
  '18K Rose Gold',
  '14K Rose Gold',
  '9K Rose Gold',
  'Platinum',
  // Silver purities
  '999 Silver (Fine)',
  '970 Silver (Traditional)',
  '958 Silver (Britannia)',
  '925 Silver (Sterling)',
  '900 Silver (Coin)',
  '835 Silver (Alloyed)',
  '800 Silver',
];

export const DIAMOND_PURITIES = ['SI1','SI2','VS1','VS2','VVS1','VVS2','IF','FL'];

// Categories that should default to silver purities in the Carat dropdown
export const SILVER_CATEGORIES = new Set(['Silver']);

// Categories where lab-grown diamond cost (per carat) is the dominant component
export const LAB_DIAMOND_CATEGORIES = new Set(['Lab-Grown Diamond']);

// ── Misc constants ──────────────────────────────────────────────────
export const INACTIVITY_MS = 30 * 60 * 1000;
export const MAX_VIDEO_SECONDS = 10;
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25 MB hard cap pre-Cloudinary
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;  // 5 MB per image
