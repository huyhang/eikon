"""Service configuration read from environment variables."""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

Device = Literal["auto", "cuda", "cpu"]
Precision = Literal["fp32", "fp16"]
DEFAULT_MODEL_REPO = "SmilingWolf/wd-eva02-large-tagger-v3"
DEFAULT_EMBED_REPO = "Xenova/clip-vit-large-patch14"
#: TAGGER_EMBED_REPO value that turns embeddings off.
EMBEDDINGS_OFF = "off"


@dataclass(frozen=True)
class Settings:
    model_repo: str = DEFAULT_MODEL_REPO
    #: CLIP repo for image/text embeddings; None when embeddings are off.
    embed_repo: str | None = DEFAULT_EMBED_REPO
    embed_precision: Precision = "fp32"
    cache_dir: str = "/models"
    min_confidence: float = 0.2
    max_body_bytes: int = 50 * 1024 * 1024
    token: str | None = None
    device: Device = "auto"
    host: str = "0.0.0.0"
    port: int = 7860
    #: Most images run through the GPU in one call when requests arrive together.
    max_batch: int = 16
    #: How long the first request of a batch waits for others to join.
    batch_wait_ms: int = 5


def _float_in_unit_range(raw: str, name: str) -> float:
    value = float(raw)
    if not 0.0 <= value <= 1.0:
        raise ValueError(f"{name} must be between 0 and 1, got {raw}")
    return value


def _positive_int(raw: str, name: str) -> int:
    value = int(raw)
    if value <= 0:
        raise ValueError(f"{name} must be positive, got {raw}")
    return value


def _non_negative_int(raw: str, name: str) -> int:
    value = int(raw)
    if value < 0:
        raise ValueError(f"{name} must not be negative, got {raw}")
    return value


def _device(raw: str) -> Device:
    if raw == "auto" or raw == "cuda" or raw == "cpu":
        return raw
    raise ValueError(f"TAGGER_DEVICE must be auto, cuda or cpu, got {raw}")


def _precision(raw: str) -> Precision:
    if raw == "fp32" or raw == "fp16":
        return raw
    raise ValueError(f"TAGGER_EMBED_PRECISION must be fp32 or fp16, got {raw}")


def _embed_repo(raw: str | None) -> str | None:
    if raw is None:
        return DEFAULT_EMBED_REPO
    return None if raw.lower() == EMBEDDINGS_OFF else raw


def settings_from_env(env: Mapping[str, str]) -> Settings:
    """Builds Settings from an environment mapping; unset or blank variables keep their defaults."""
    defaults = Settings()

    def get(name: str) -> str | None:
        value = env.get(name, "").strip()
        return value or None

    def parsed(name, parse, default):
        raw = get(name)
        return parse(raw, name) if raw else default

    precision = get("TAGGER_EMBED_PRECISION")
    device = get("TAGGER_DEVICE")
    return Settings(
        model_repo=get("TAGGER_MODEL_REPO") or defaults.model_repo,
        embed_repo=_embed_repo(get("TAGGER_EMBED_REPO")),
        embed_precision=_precision(precision) if precision else defaults.embed_precision,
        cache_dir=get("TAGGER_CACHE_DIR") or defaults.cache_dir,
        min_confidence=parsed("TAGGER_MIN_CONFIDENCE", _float_in_unit_range, defaults.min_confidence),
        max_body_bytes=parsed("TAGGER_MAX_BODY_BYTES", _positive_int, defaults.max_body_bytes),
        token=get("TAGGER_TOKEN"),
        device=_device(device) if device else defaults.device,
        host=get("TAGGER_HOST") or defaults.host,
        port=parsed("TAGGER_PORT", _positive_int, defaults.port),
        max_batch=parsed("TAGGER_MAX_BATCH", _positive_int, defaults.max_batch),
        batch_wait_ms=parsed("TAGGER_BATCH_WAIT_MS", _non_negative_int, defaults.batch_wait_ms),
    )


def model_name_from_repo(repo: str) -> str:
    """'SmilingWolf/wd-eva02-large-tagger-v3' -> 'wd-eva02-large-tagger-v3'."""
    return repo.rstrip("/").rsplit("/", 1)[-1]
