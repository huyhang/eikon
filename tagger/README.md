# Eikon tagger

GPU service that runs on **gpubox** and tags illustrations for Eikon with
[SmilingWolf's WD v3 tagger](https://huggingface.co/SmilingWolf/wd-eva02-large-tagger-v3)
(Danbooru-style tags, the same kind Szurubooru setups use). It speaks the protocol in
`shared/src/tagger.ts`:

- `GET /health` → `{"status":"ok","model":"wd-eva02-large-tagger-v3","device":"cuda"}` (public)
- `POST /v1/tag` with raw image bytes → `{"model", "rating": {...}, "tags": [{"name","category","confidence"}]}`

Deployment on gpubox: see [`docker/gpubox/README.md`](../docker/gpubox/README.md).

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `TAGGER_TOKEN` | *(empty)* | When set, `/v1/tag` requires `Authorization: Bearer <token>` |
| `TAGGER_MODEL_REPO` | `SmilingWolf/wd-eva02-large-tagger-v3` | Any WD v3 repo with `model.onnx` + `selected_tags.csv` |
| `TAGGER_MIN_CONFIDENCE` | `0.2` | Lowest confidence returned; Eikon applies its own display thresholds |
| `TAGGER_DEVICE` | `auto` | `auto` (CUDA if available), `cuda` (fail without GPU) or `cpu` |
| `TAGGER_MAX_BODY_BYTES` | `52428800` | Larger uploads get `413` |
| `TAGGER_CACHE_DIR` | `/models` | Hugging Face download cache |
| `TAGGER_HOST` / `TAGGER_PORT` | `0.0.0.0` / `7860` | Listen address |

## Development

```bash
uv venv tagger/.venv
uv pip install --python tagger/.venv/bin/python -e 'tagger[cpu,dev]'
cd tagger
.venv/bin/python -m pytest          # unit tests, no GPU or model download needed
.venv/bin/ruff check . && .venv/bin/ruff format --check .
TAGGER_DEVICE=cpu TAGGER_CACHE_DIR=/tmp/models .venv/bin/eikon-tagger   # real model on CPU (slow)
```

Layout: `app.py` (HTTP, takes any `Tagger`), `wd_tagger.py` (model loader + preprocessor + session),
`preprocessing.py` / `postprocessing.py` / `labels.py` (pure functions), `onnx_session.py`,
`model_store.py`, and `main.py` (composition root).
