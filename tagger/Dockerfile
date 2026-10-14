# WD v3 tagger for Eikon. CUDA 12 + cuDNN 9 matches onnxruntime-gpu <1.27 (see pyproject.toml).
FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/models \
    TAGGER_CACHE_DIR=/models \
    TAGGER_PORT=7860

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install ".[gpu]"

RUN useradd --system --uid 10001 --create-home tagger \
    && mkdir -p /models && chown tagger:tagger /models
USER tagger
VOLUME ["/models"]

EXPOSE 7860
# The first start downloads the model (~1.3 GB), hence the generous start period.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15m --retries=3 \
    CMD curl -fsS http://127.0.0.1:7860/health || exit 1

CMD ["/opt/venv/bin/eikon-tagger"]
