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
cd deploy/gpubox
cp .env.example .env          # set TAGGER_TOKEN (openssl rand -hex 32)
docker compose up -d --build
docker compose logs -f tagger # wait for "loaded wd-eva02-large-tagger-v3 on cuda"
curl http://127.0.0.1:7861/health
```

The first start downloads the model (~1.3 GB) into the `models` volume; later starts take seconds.
If the log says `on cpu`, the container can't see the GPU — re-check step 1.3.

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
```

On Eikon set `EIKON_TAGGER_URL=http://gpubox.<tailnet>.ts.net:7860` (the full MagicDNS name) and
`EIKON_TAGGER_TOKEN` to the same token.

## Living with Ollama

The tagger needs roughly 2 GB of the 3090's 24 GB VRAM, so it runs comfortably next to Ollama.
If Ollama loads a model large enough to fill the card, tagging requests can fail with CUDA
out-of-memory errors. Eikon simply retries them later. To avoid that, keep Ollama models under
~20 GB, or switch to the lighter `SmilingWolf/wd-vit-tagger-v3`. If you switch models, run
"Re-tag all" in Eikon's settings. `nvidia-smi` shows who is using what.

## Updating

```bash
git pull && docker compose up -d --build
```
