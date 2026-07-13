// Reel Generation — web integration. Ported from swarnix-studio/src/lib/reels.ts.
//
// Three backend touchpoints (shared with the mobile studio):
//  1. reel-image-upload (n8n) — device image → Cloudinary URL. On the web we
//     already hold a Cloudinary preset, so we upload directly instead.
//  2. reel-generate (n8n) — submit a job, returns job_id; the render runs in the
//     background and n8n's service role updates the reel_jobs row.
//  3. Supabase reel_jobs / reel_music — read under the user's session (RLS
//     scopes rows to user_id = auth.uid() = the store owner). Status via Realtime.
//
// Billing (web): the shared Studio Suite meter is charged ON COMPLETION
// (reelSuiteCost units) when the job flips to 'completed' — failed reels cost
// nothing. The result screen watches the row and does the charge.

import { N8N_REEL_GENERATE, db, CLOUDINARY_CLOUD, CLOUDINARY_PRESET } from './config';
import { compressImage } from './imageUtils';

export const LENGTH_MIN = 4;
export const LENGTH_MAX = 24;
export const LENGTH_DEFAULT = 8;
export const MAX_REEL_IMAGES = 6;

export const RATIOS = [
  { value: '9:16', label: 'Instagram Reel / Status', hint: 'Vertical · the default for reels' },
  { value: '1:1', label: 'Instagram / Facebook Post', hint: 'Square feed post' },
  { value: '16:9', label: 'YouTube / Facebook Video', hint: 'Landscape' },
];
export const DEFAULT_RATIO = '9:16';

export const QUALITIES = [
  { value: '480p', label: 'SD', hint: 'Fastest, smallest file' },
  { value: '720p', label: 'HD', hint: 'Recommended' },
  { value: '1080p', label: 'Full HD', hint: 'Best quality' },
];
export const DEFAULT_RESOLUTION = '720p';

const REEL_JOB_COLUMNS = 'id, status, output_url, error_message, ratio, length_seconds, resolution, created_at';

function mapJob(row) {
  return {
    id: row.id,
    status: row.status,
    outputUrl: row.output_url ?? null,
    errorMessage: row.error_message ?? null,
    ratio: row.ratio ?? null,
    lengthSeconds: row.length_seconds ?? null,
    resolution: row.resolution ?? null,
    createdAt: row.created_at,
  };
}

// End-overlay duration: last 3-4s, never more than half the reel.
export function endOverlayDuration(lengthSeconds) {
  return Math.min(4, Math.max(1, Math.ceil(lengthSeconds / 2)));
}

// Upload a device image to Cloudinary; returns the secure_url.
export async function uploadReelImage(fileOrBlob, filename = 'reel.jpg') {
  const compressed = await compressImage(fileOrBlob);
  const fd = new FormData();
  fd.append('file', compressed, filename);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', 'swarnix-reels');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Cloudinary upload failed');
  return (await res.json()).secure_url;
}

// Submit a reel job. Returns job_id immediately (render runs in background).
export async function submitReel({ userId, imageUrls, lengthSeconds, ratio, resolution, customPrompt, musicId, overlayText, overlayPosition }) {
  if (!imageUrls?.length) throw new Error('Add at least one image for your reel.');
  const body = {
    user_id: userId,
    image1_url: imageUrls[0],
    image_urls: imageUrls,
    length_seconds: lengthSeconds,
    ratio,
    resolution,
  };
  if (imageUrls[1]) body.image2_url = imageUrls[1];
  if (customPrompt?.trim()) body.custom_prompt = customPrompt.trim();
  if (musicId) body.music_id = musicId;

  const overlay = overlayText?.trim();
  if (overlay) {
    body.overlay_text = overlay;
    body.overlay_position = overlayPosition === 'end' ? 'end' : 'whole';
    if (body.overlay_position === 'end') body.overlay_start_at = lengthSeconds - endOverlayDuration(lengthSeconds);
  }

  let res;
  try {
    res = await fetch(N8N_REEL_GENERATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      mode: 'cors',
    });
  } catch {
    throw new Error('Network error — check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) {
    throw new Error(data?.message || `Couldn’t start your reel (${res.status}). Please try again.`);
  }
  if (typeof data.job_id !== 'string' || !data.job_id) {
    throw new Error('The reel was submitted but no job id came back. Check My Reels in a moment.');
  }
  return data.job_id;
}

// Fetch the current user's reels, newest first (RLS scopes to the owner).
export async function fetchReels() {
  const { data, error } = await db.from('reel_jobs').select(REEL_JOB_COLUMNS).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapJob);
}

export async function fetchReel(jobId) {
  const { data, error } = await db.from('reel_jobs').select(REEL_JOB_COLUMNS).eq('id', jobId).maybeSingle();
  if (error) throw error;
  return data ? mapJob(data) : null;
}

export async function deleteReel(jobId) {
  const { error } = await db.from('reel_jobs').delete().eq('id', jobId);
  if (error) throw error;
}

// Subscribe to live updates for one reel job. Returns an unsubscribe fn.
export function subscribeToReel(jobId, onChange) {
  const topic = `reel_job:${jobId}`;
  for (const existing of db.getChannels()) {
    if (existing.topic === `realtime:${topic}`) db.removeChannel(existing);
  }
  const channel = db
    .channel(topic)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reel_jobs', filter: `id=eq.${jobId}` },
      (payload) => onChange(mapJob(payload.new)))
    .subscribe();
  return () => db.removeChannel(channel);
}

export async function fetchReelMusic() {
  try {
    const { data, error } = await db
      .from('reel_music')
      .select('music_id, name, mood, preview_url, duration_seconds')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      musicId: row.music_id, name: row.name, mood: row.mood ?? null,
      previewUrl: row.preview_url, durationSeconds: row.duration_seconds ?? null,
    }));
  } catch {
    return [];
  }
}

// Poster-frame JPG from a Cloudinary reel MP4 (swap ext to .jpg + so_0 transform).
export function reelPosterUrl(outputUrl) {
  if (!outputUrl) return null;
  const marker = '/upload/';
  const idx = outputUrl.indexOf(marker);
  if (idx === -1) return null;
  const head = outputUrl.slice(0, idx + marker.length);
  const tail = outputUrl.slice(idx + marker.length);
  const jpgTail = tail.replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg');
  if (jpgTail === tail) return null;
  return `${head}so_0/${jpgTail}`;
}
