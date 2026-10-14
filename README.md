# Eikon

A private, Apple Photos–style gallery for your illustration library. It runs on a Synology NAS, is
reachable only through Tailscale, and tags every image with a GPU tagger (WD v3, Szurubooru-style tags) on
**gpubox**.

- Browse by **Illustrators** and **Collections**, straight from your folders.
- Search by any combination of tags, including exclusions.
- Favourites, hand-edited tags, a safe-mode toggle, and a passcode lock.
- Installs as a home-screen app on iPhone and iPad.

## Try it locally (no Docker, no GPU)

Requires Node 24+.

```bash
npm install
npm run dev
```

This paints a sample library into `.dev/library`, then starts three processes:

| Process | Address | What it is |
|---|---|---|
| `web` | <http://127.0.0.1:5173> | The UI with hot reload. **Open this one.** Passcode: `1234` |
| `eikon` | <http://127.0.0.1:8787> | The API server (scanner, tag queue, media) |
| `tagger` | <http://127.0.0.1:7860> | A **fake GPU tagger** that speaks the real protocol and returns repeatable tags |

Useful variations:

```bash
DEV_HOST=0.0.0.0 npm run dev        # reach it from your phone or another machine (e.g. over Tailscale)
EIKON_PASSCODE= npm run dev         # no lock screen
npm run dev:prod                    # production build served by the server on :8787, like the container
npm run sample-library -- --force   # repaint the sample library
curl -X POST http://127.0.0.1:7860/admin/offline   # simulate gpubox going away (…/admin/online to recover)
```

The fake tagger also takes `FAKE_TAGGER_LATENCY_MS` (default 250) and `FAKE_TAGGER_FAILURE_RATE` (default 0.02),
so you can watch the queue, retries and failure list in action.

To point Eikon at your own folder instead, put `Illustrators/` and `Collections/` folders under `.dev/library`,
or run the server directly with `EIKON_LIBRARY_DIR=/path/to/library`.

## Deploy

See **[docs/SETUP.md](docs/SETUP.md)** for the full walkthrough: gpubox tagger, NAS container, `tailscale serve`, and installing on your devices.

## Repository layout

| Path | What |
|---|---|
| `shared/` | API and tagger-protocol types shared by server and web ([docs/API.md](docs/API.md)) |
| `server/` | Fastify API, library scanner, thumbnailer, persistent tag queue, SQLite (`node:sqlite`) |
| `web/` | React + Vite UI (PWA) |
| `tagger/` | The real GPU tagger: Python, FastAPI, ONNX Runtime, WD v3 |
| `fake-tagger/` | The fake tagger for development |
| `tools/` | Dev launcher and sample-library generator |
| `docker/` | Everything Docker: image builds (`docker/eikon`, `docker/tagger`) and Compose stacks (`docker/nas`, `docker/gpubox`) |

Every component receives its dependencies through constructors or React context, with one composition root
per process (`server/src/main.ts`, `tagger/src/eikon_tagger/main.py`), so each piece can be tested in isolation.

## Development

```bash
npm test               # all TypeScript workspaces (Vitest)
npm run typecheck
npm run format         # Prettier
cd tagger && uv venv && uv pip install -e '.[cpu,dev]' && .venv/bin/pytest   # Python tagger
```

Tests use table-driven cases (`it.each` / `pytest.mark.parametrize`) wherever there's more than one case.
