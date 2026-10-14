# Docker

Everything needed to build and run Eikon in containers lives here. Both images build from the
repository root; each Dockerfile has its own `Dockerfile.dockerignore`, so only the files that
image needs are sent to the builder.

| Path | What |
|---|---|
| `eikon/` | The Eikon image (API server + built web app) that runs on the Synology NAS |
| `tagger/` | The CUDA tagger image (WD v3 tagger) that runs on gpubox |
| `nas/` | Compose stack and `.env.example` for the NAS — see [`docs/SETUP.md`](../docs/SETUP.md) |
| `gpubox/` | Compose stack, `.env.example` and setup guide for gpubox — see [`gpubox/README.md`](gpubox/README.md) |

Build an image by hand from the repository root:

```bash
docker build -f docker/eikon/Dockerfile -t eikon .
docker build -f docker/tagger/Dockerfile -t eikon-tagger .
```

Day to day you don't need these commands: `docker compose up -d --build` in `docker/nas` or
`docker/gpubox` builds and starts the right image.
