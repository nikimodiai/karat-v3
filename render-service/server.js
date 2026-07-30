'use strict';

/**
 * Swarnix Render Service
 * ----------------------
 * One job: take 2-3 Seedance clip URLs (already in the chosen ratio/resolution),
 * normalise them, concatenate with hard cuts, lay one background music track over
 * the whole reel, burn in an optional contact/caption text overlay, upload the
 * result to Cloudinary, and return the secure URL.
 *
 * n8n calls POST /render. ffmpeg never touches n8n.
 *
 * Deployed on the Hostinger VPS at /docker/n8n/render-service/server.js
 * (alongside n8n's docker-compose.yml). Deploy changes with:
 *   cd /docker/n8n && docker compose build --no-cache render-service && docker compose up -d render-service
 */

const express = require('express');
const cloudinary = require('cloudinary').v2;
const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 8080;
const RENDER_API_KEY = process.env.RENDER_API_KEY || '';      // shared secret with n8n
const MUSIC_DIR = process.env.MUSIC_DIR || path.join(__dirname, 'music');
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'swarnix/reels';
// Fonts for the burned-in overlay. Keys are what the app sends as overlay.font;
// values are absolute .ttf paths. DejaVu (Sans/Serif) ships with node:20-slim at
// this path, so no image change is needed. Add more by installing font packages
// in the Dockerfile and adding entries here.
const FONT_DIR = process.env.FONT_DIR ||
  '/usr/share/fonts/truetype/dejavu';
const OVERLAY_FONTS = {
  sans:      path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'),
  serif:     path.join(FONT_DIR, 'DejaVuSerif-Bold.ttf'),
  mono:      path.join(FONT_DIR, 'DejaVuSansMono-Bold.ttf'),
};
const DEFAULT_FONT_KEY = 'sans';
const DEFAULT_OVERLAY_FONT = OVERLAY_FONTS[DEFAULT_FONT_KEY];

// Overlay text colours the app can pick. Keys map to ffmpeg colour values
// (named colours or 0xRRGGBB). Kept to a curated set so we never pass unescaped
// arbitrary strings into the filtergraph.
const OVERLAY_COLORS = {
  white:  'white',
  black:  'black',
  gold:   '0xC9A84C',
  navy:   '0x0B1829',
  red:    '0xBE123C',
  cream:  '0xF4F0E8',
};
const DEFAULT_COLOR = 'white';

// Cloudinary reads CLOUDINARY_URL from env automatically, or set the three vars below.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---- helpers ---------------------------------------------------------------

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(dest, buf);
}

async function probe(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration',
    '-of', 'json', file,
  ]);
  const j = JSON.parse(stdout);
  const s = (j.streams && j.streams[0]) || {};
  return {
    width: parseInt(s.width, 10),
    height: parseInt(s.height, 10),
    duration: parseFloat((j.format && j.format.duration) || '0'),
  };
}

const even = (n) => (n % 2 === 0 ? n : n + 1);
const safeId = (s) => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '');

// Escape text for ffmpeg drawtext: backslash, colon, single-quote, percent and
// newlines all have special meaning inside the filtergraph.
function escapeDrawtext(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\r?\n/g, '\n');
}

// Word-wrap overlay text to at most `maxChars` per line so it never runs off
// the sides of the video. drawtext honours literal newlines, so we join with
// '\n'. Keeps to a few lines max to avoid covering the whole frame.
function wrapOverlay(text, maxChars, maxLines = 3) {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line) { line = w; continue; }
    if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines).join('\n');
}

// ---- routes ----------------------------------------------------------------

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/render', async (req, res) => {
  if (RENDER_API_KEY && req.get('x-render-key') !== RENDER_API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const {
    job_id,
    clips,
    music_id,
    music_url,
    music_volume = 0.7,
    fade_out_seconds = 1.5,
    overlay,               // { text, position: 'whole'|'end', start_at, font, color } | null
  } = req.body || {};

  if (!job_id || !Array.isArray(clips) || clips.length < 1) {
    return res.status(400).json({ error: 'job_id and clips[] are required' });
  }

  const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'reel-'));
  try {
    // 1. download clips in order
    const ordered = [...clips].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const files = [];
    for (let i = 0; i < ordered.length; i++) {
      const f = path.join(work, `clip_${i}.mp4`);
      await download(ordered[i].url, f);
      files.push(f);
    }

    // 2. probe — first clip sets target dimensions, sum durations = reel length
    const metas = [];
    for (const f of files) metas.push(await probe(f));
    const W = even(metas[0].width || 720);
    const H = even(metas[0].height || 1280);
    const totalDur = metas.reduce((s, m) => s + (m.duration || 0), 0);

    // 3. resolve music source (optional). If music was requested but the file is
    //    missing, fail loudly instead of silently shipping a muted reel.
    let musicFile = null;
    if (music_url) {
      musicFile = path.join(work, 'music.mp3');
      await download(music_url, musicFile);
    } else if (music_id) {
      // The music_id (e.g. "Town This Small") is also the file name — do NOT
      // strip spaces/case, just guard against path traversal. Fall back to a
      // case-insensitive directory match so minor casing drift still resolves.
      const wanted = String(music_id).replace(/[\/\\]|\.\./g, '').trim();
      const direct = path.join(MUSIC_DIR, `${wanted}.mp3`);
      if (fs.existsSync(direct)) {
        musicFile = direct;
      } else {
        const entries = fs.existsSync(MUSIC_DIR) ? fs.readdirSync(MUSIC_DIR) : [];
        const hit = entries.find(
          (f) => f.toLowerCase() === `${wanted.toLowerCase()}.mp3`
        );
        if (hit) musicFile = path.join(MUSIC_DIR, hit);
      }
      if (!musicFile) {
        throw new Error(
          `music_id "${music_id}" requested but no matching file in ${MUSIC_DIR} ` +
          `(looked for "${wanted}.mp3"; have: ${
            (fs.existsSync(MUSIC_DIR) ? fs.readdirSync(MUSIC_DIR) : []).join(', ') || 'none'
          })`
        );
      }
    }

    // 3b. resolve overlay (optional). If overlay text was requested, the font
    //     must exist or drawtext will fail — check up front for a clear error.
    let overlayText = null;
    let overlayFont = DEFAULT_OVERLAY_FONT;
    let overlayColor = OVERLAY_COLORS[DEFAULT_COLOR];
    if (overlay && typeof overlay.text === 'string' && overlay.text.trim()) {
      // Map the app's font/color keys to safe, known values (never trust raw
      // strings in the filtergraph). Fall back to defaults on anything unknown.
      overlayFont = OVERLAY_FONTS[String(overlay.font || '').toLowerCase()] || DEFAULT_OVERLAY_FONT;
      overlayColor = OVERLAY_COLORS[String(overlay.color || '').toLowerCase()] || OVERLAY_COLORS[DEFAULT_COLOR];
      if (!fs.existsSync(overlayFont)) {
        throw new Error(
          `overlay text requested but font not found at ${overlayFont} ` +
          `(install the font in the Dockerfile or set FONT_DIR)`
        );
      }
      overlayText = overlay.text.trim();
    }

    // 4. build ffmpeg command
    const args = [];
    files.forEach((f) => args.push('-i', f));
    if (musicFile) args.push('-stream_loop', '-1', '-i', musicFile);

    const filters = [];
    files.forEach((_, i) => {
      filters.push(
        `[${i}:v]fps=24,scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${i}]`
      );
    });
    const vlabels = files.map((_, i) => `[v${i}]`).join('');

    // Concat → [vcat]. If there's an overlay we then drawtext onto it → [vv],
    // otherwise [vcat] is renamed straight to [vv].
    if (overlayText) {
      filters.push(`${vlabels}concat=n=${files.length}:v=1:a=0[vcat]`);

      const fontsize = Math.round(H * 0.04);           // ~4% of height
      const pad = Math.round(H * 0.05);
      // Wrap so text never runs off the sides. Rough fit: at this font size,
      // ~90% of the width holds about W / (fontsize * 0.5) characters per line.
      const maxChars = Math.max(12, Math.floor((W * 0.9) / (fontsize * 0.52)));
      const escaped = escapeDrawtext(wrapOverlay(overlayText, maxChars));
      // 'end' → show only for the last window (start_at..totalDur). 'whole' →
      // show for the entire reel. y is near the bottom, boxed for legibility.
      let enable = '';
      if (overlay.position === 'end') {
        const startAt = Math.max(0, Number(overlay.start_at) || 0);
        enable = `:enable='gte(t,${startAt.toFixed(2)})'`;
      }
      // A soft shadow + semi-transparent box keeps light text legible on light
      // footage and dark text on dark footage.
      filters.push(
        `[vcat]drawtext=fontfile='${overlayFont}':text='${escaped}':` +
        `fontcolor=${overlayColor}:fontsize=${fontsize}:line_spacing=8:` +
        `shadowcolor=black@0.45:shadowx=2:shadowy=2:` +
        `box=1:boxcolor=black@0.35:boxborderw=${Math.round(fontsize * 0.45)}:` +
        `x=(w-text_w)/2:y=h-text_h-${pad}${enable}[vv]`
      );
    } else {
      filters.push(`${vlabels}concat=n=${files.length}:v=1:a=0[vv]`);
    }

    const map = ['-map', '[vv]'];
    if (musicFile) {
      const mIdx = files.length; // music is the last input
      const fadeStart = Math.max(0, totalDur - fade_out_seconds).toFixed(2);
      // Trim the (looped) music to the reel length, normalise the sample format,
      // set volume, then fade out. atrim+asetpts keeps the fade timing correct.
      filters.push(
        `[${mIdx}:a]atrim=0:${totalDur.toFixed(2)},asetpts=PTS-STARTPTS,` +
        `aformat=sample_fmts=fltp:channel_layouts=stereo,` +
        `volume=${music_volume},` +
        `afade=t=out:st=${fadeStart}:d=${fade_out_seconds}[aout]`
      );
      map.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100');
    } else {
      map.push('-an');
    }

    const out = path.join(work, `${safeId(job_id)}.mp4`);
    args.push(
      '-filter_complex', filters.join(';'),
      ...map,
      '-t', totalDur.toFixed(2),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-y', out
    );

    await run('ffmpeg', args);

    // 5. upload to Cloudinary
    const uploaded = await cloudinary.uploader.upload(out, {
      resource_type: 'video',
      folder: CLOUDINARY_FOLDER,
      public_id: safeId(job_id),
      overwrite: true,
    });

    const stat = await fsp.stat(out);
    return res.json({
      url: uploaded.secure_url,
      public_id: uploaded.public_id,
      duration: Number(totalDur.toFixed(2)),
      width: W,
      height: H,
      bytes: stat.size,
    });
  } catch (err) {
    console.error('[render] failed', job_id, err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => console.log(`render-service listening on :${PORT}`));
