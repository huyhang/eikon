# Eikon tagger

GPU service that runs on **gpubox**. It tags illustrations for Eikon with
[SmilingWolf's WD v3 tagger](https://huggingface.co/SmilingWolf/wd-eva02-large-tagger-v3)
(Danbooru-style tags, the same kind Szurubooru setups use) and, optionally, computes
[CLIP](https://huggingface.co/Xenova/clip-vit-large-patch14) embeddings so Eikon can find similar images
and search by description. It speaks the protocol in `shared/src/tagger.ts`:

| Endpoint | Body | Response |
|---|---|---|
| `GET /health` (public) | | `{"status":"ok","model":"wd-eva02-large-tagger-v3","device":"cuda","embedModel":"clip-vit-large-patch14"}` |
| `POST /v1/tag` | raw image bytes | `{"model","rating":{...},"tags":[{"name","category","confidence"}],"embedding":{"model","vector"}\|null}` |
| `POST /v1/embed-image` | raw image bytes | `{"model","vector"}` |
| `POST /v1/embed-text` | `{"text":"a girl reading under cherry blossoms"}` (≤ 500 characters) | `{"model","vector"}` |

`vector` is the L2-normalised embedding as little-endian float16, base64-encoded (2 bytes per dimension:
512 for CLIP B/16, 768 for L/14). With embeddings turned off, `embedModel` and `embedding` are `null` and the
two embed endpoints answer `404`. Errors are `{"error": "..."}` with `400` (undecodable image or bad text),
`401` (token), or `413` (too large).

Deployment on gpubox: see [`docker/gpubox/README.md`](../docker/gpubox/README.md).

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `TAGGER_TOKEN` | *(empty)* | When set, every `POST` requires `Authorization: Bearer <token>` |
| `TAGGER_MODEL_REPO` | `SmilingWolf/wd-eva02-large-tagger-v3` | Any WD v3 repo with `model.onnx` + `selected_tags.csv` |
| `TAGGER_EMBED_REPO` | `Xenova/clip-vit-large-patch14` | CLIP repo in Xenova's ONNX layout (e.g. `Xenova/clip-vit-base-patch16`), or `off` |
| `TAGGER_EMBED_PRECISION` | `fp32` | `fp16` loads the half-precision CLIP files (about half the VRAM) |
| `TAGGER_MIN_CONFIDENCE` | `0.2` | Lowest confidence returned; Eikon applies its own display thresholds |
| `TAGGER_DEVICE` | `auto` | `auto` (CUDA if available), `cuda` (fail without GPU) or `cpu` |
| `TAGGER_MAX_BATCH` | `16` | Most concurrent images run through a model in one GPU call |
| `TAGGER_BATCH_WAIT_MS` | `5` | How long the first image of a batch waits for others to join (`0` = only what's queued) |
| `TAGGER_MAX_BODY_BYTES` | `52428800` | Larger uploads get `413` |
| `TAGGER_CACHE_DIR` | `/models` | Hugging Face download cache |
| `TAGGER_HOST` / `TAGGER_PORT` | `0.0.0.0` / `7860` | Listen address |

## Batching

Eikon sends several images at once (`EIKON_TAG_CONCURRENCY`). Each request is decoded and preprocessed in
its own thread, then a micro-batcher hands the WD model (and the CLIP vision model) up to `TAGGER_MAX_BATCH`
images per call. One lock is shared by every model call, so only one job uses the GPU at a time and memory
stays flat. Text queries are not batched (their lengths differ) but take the same lock.

## Development

```bash
uv venv tagger/.venv
uv pip install --python tagger/.venv/bin/python -e 'tagger[cpu,dev]'
cd tagger
.venv/bin/python -m pytest          # unit tests, no GPU or model download needed
.venv/bin/ruff check . && .venv/bin/ruff format --check .
# Real models on CPU (slow); the smaller models are fine for trying things out:
TAGGER_DEVICE=cpu TAGGER_CACHE_DIR=/tmp/models TAGGER_MODEL_REPO=SmilingWolf/wd-vit-tagger-v3 \
  TAGGER_EMBED_REPO=Xenova/clip-vit-base-patch16 .venv/bin/eikon-tagger
```

Layout:

- `app.py`: HTTP; takes any `Tagger` and optional `Embedder` (`protocol.py`).
- `wd_tagger.py` / `clip_embedder.py`: model loaders composed with preprocessors, sessions and a batcher.
- `preprocessing.py`, `clip_preprocessing.py`, `postprocessing.py`, `labels.py`, `vectors.py`: pure functions.
- `batching.py`: the micro-batcher.
- `onnx_session.py`: ONNX Runtime sessions.
- `model_store.py`: Hugging Face downloads.
- `settings.py`: environment parsing.
- `main.py`: the composition root.
