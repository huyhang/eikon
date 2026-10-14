# Tagger on gpubox

Runs the Eikon tagger (WD v3 on the RTX 3090) in Docker and publishes it to the tailnet as
`http://gpubox.<tailnet>.ts.net:7860` (MagicDNS). The full Eikon setup guide covers the NAS side.

## 1. GPU + Docker prerequisites (one time)

1. NVIDIA driver 525 or newer: `nvidia-smi` should list the 3090.
2. Docker Engine with the compose plugin: `docker compose version`.
3. NVIDIA Container Toolkit (Ubuntu/Debian shown; for other distros see
   <https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html>):

   ```bash
   curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
     | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
   curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
     | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
     | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
   sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
   sudo nvidia-ctk runtime configure --runtime=docker
   sudo systemctl restart docker
   docker run --rm --gpus all ubuntu nvidia-smi   # must print the GPU table
   ```

## 2. Start the tagger

```bash
cd docker/gpubox
cp .env.example .env          # set TAGGER_TOKEN (openssl rand -hex 32)
docker compose up -d --build
docker compose logs -f tagger # wait for "loaded wd-eva02-large-tagger-v3 on cuda" and "loaded embeddings"
curl http://127.0.0.1:7861/health
```

The first start downloads the WD model (~1.3 GB) and the CLIP model (~1.7 GB, or ~0.9 GB with
`TAGGER_EMBED_PRECISION=fp16`) into the `models` volume; later starts take seconds.
If the log says `on cpu`, the container can't see the GPU — re-check step 1.3.

### Choosing the embedding model

CLIP embeddings power "similar images" and describe-in-words search in Eikon. `TAGGER_EMBED_REPO` in `.env`
picks the model:

| Setting | Download | Notes |
|---|---|---|
| `Xenova/clip-vit-large-patch14` (default) | 1.7 GB (fp32) / 0.9 GB (fp16) | Best results; 768-dimension vectors |
| `Xenova/clip-vit-base-patch16` | 0.6 GB (fp32) | Lighter and faster; 512 dimensions |
| `off` | — | No embeddings; Eikon hides those features |

Eikon re-embeds images in the background when the model changes; tags are not touched.

## 3. Publish it to the tailnet

```bash
sudo tailscale serve --bg --http=7860 http://127.0.0.1:7861
tailscale serve status
```

`--bg` makes the setting persistent across reboots. Undo with `sudo tailscale serve --http=7860 off`.

## 4. Verify from another tailnet machine (e.g. your Mac)

```bash
curl http://gpubox:7860/health
curl -H "Authorization: Bearer $TAGGER_TOKEN" -H "Content-Type: image/jpeg" \
     --data-binary @some-illustration.jpg http://gpubox:7860/v1/tag
curl -H "Authorization: Bearer $TAGGER_TOKEN" -H "Content-Type: application/json" \
     -d '{"text": "a huge wave in front of a mountain"}' http://gpubox:7860/v1/embed-text
```

On Eikon set `EIKON_TAGGER_URL=http://gpubox.<tailnet>.ts.net:7860` (the full MagicDNS name) and
`EIKON_TAGGER_TOKEN` to the same token.

## Living with Ollama

VRAM use is an estimate, not a measurement: it was worked out from the model file sizes (WD eva02-large
1.26 GB; CLIP L/14 1.7 GB fp32 or 0.86 GB fp16) plus working memory for a batch of 16. Expect roughly
2–3 GB for the WD model and 2–3 GB for CLIP L/14 in fp32 (about 1.5 GB in fp16), so **about 4–6 GB
in total**. That leaves most of the 3090's 24 GB for Ollama. Check with `nvidia-smi` once it's running.

If Ollama loads a model large enough to fill the card, tagging requests can fail with CUDA out-of-memory
errors. Eikon simply retries them later. To avoid that, keep Ollama models under ~18 GB, or make the
tagger lighter:

- `TAGGER_EMBED_PRECISION=fp16`;
- `Xenova/clip-vit-base-patch16`;
- `SmilingWolf/wd-vit-tagger-v3`;
- a smaller `TAGGER_MAX_BATCH`.

If you switch the WD model, run "Re-tag all" in Eikon's settings.

## Updating

```bash
git pull && docker compose up -d --build
```
