# rembg Background Removal — VPS Setup

Powers the **Change Background** and **Auto-arrange Set** features in Add/Edit
Product. Background removal runs on the Hostinger VPS via the open-source
[`rembg`](https://github.com/danielgatis/rembg) service, so it costs **₹0 per
image** (CPU only). Everything after the cut-out — white/blue/brand backgrounds
and set compositing — is done with free Cloudinary delivery transforms.

## Architecture

```
Browser (ProductModal)
  │  POST FormData { image }  (or { image_url })
  ▼
n8n webhook  /swarnix-bg-remove   (Swarnix_BgRemove_v1.js)
  │  forwards the image to ↓
  ▼
rembg HTTP service  http://rembg:7000/api/remove
  │  returns transparent PNG
  ▼
Cloudinary (folder swarnix-cutouts)  →  { secure_url, public_id }
```

## 1. Deploy rembg next to n8n

If n8n runs under Docker Compose, add a sibling service so n8n can reach it at
`http://rembg:7000`:

```yaml
# docker-compose.yml (add alongside the existing n8n service)
  rembg:
    image: danielgatis/rembg:latest
    command: s --host 0.0.0.0 --port 7000
    restart: unless-stopped
    networks:
      - default        # same network as n8n
```

Then:

```bash
docker compose up -d rembg
```

Or as a standalone container on the same Docker network as n8n:

```bash
docker run -d --name rembg --restart unless-stopped \
  --network <n8n_network> \
  danielgatis/rembg:latest s --host 0.0.0.0 --port 7000
```

> First run downloads the model (`isnet-general-use`, ~170 MB) and caches it.
> Pre-warm it: `docker exec rembg python -c "from rembg import new_session; new_session('isnet-general-use')"`

### Verify

```bash
curl -F "file=@necklace.jpg" \
  "http://localhost:7000/api/remove?model=isnet-general-use" \
  --output cutout.png
```

`cutout.png` should have a transparent background.

## 2. Import & activate the n8n workflow

1. Build/import `n8n_workflows/Swarnix_BgRemove_v1.js` into n8n (same way as
   `Swarnix_DesignStudio_Generate_v1.js`).
2. If rembg is **not** reachable at `http://rembg:7000`, set an env var on the
   n8n container: `REMBG_URL=http://<host>:<port>` (no trailing slash).
3. Activate the workflow. The webhook goes live at
   `https://n8n.srv1639765.hstgr.cloud/webhook/swarnix-bg-remove`
   (matches `N8N_BG_REMOVE` in `src/lib/config.js`).

## Notes & tuning

- **Model choice** — `isnet-general-use` gives the cleanest edges for products.
  Swap via the `?model=` query in the workflow's *rembg Remove* node
  (`u2net`, `u2netp` for lower memory, `isnet-general-use` for quality).
- **Memory** — rembg needs ~1–2 GB RAM while a request runs. On a small VPS,
  use `u2netp` if you hit OOM.
- **Alpha matting** (softer edges for hair-thin chains): append
  `&a=true&af=240&ab=10&ae=10` to the rembg URL — slower, but cleaner wisps.
- **Cold start** — the very first request after deploy is slow (model load);
  subsequent ones are typically 2–6 s on CPU.
