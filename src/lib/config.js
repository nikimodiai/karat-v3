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

export const N8N_BASE = env.VITE_N8N_BASE || 'https://n8n.srv1639765.hstgr.cloud/webhook';
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
  // White Gold
  '18K White Gold',
  '14K White Gold',
  '9K White Gold',
  // Rose Gold
  '18K Rose Gold',
  '14K Rose Gold',
  '9K Rose Gold',
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
      '18K White Gold', '14K White Gold', '9K White Gold',
      '18K Rose Gold', '14K Rose Gold', '9K Rose Gold',
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
