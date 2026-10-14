"""Service configuration read from environment variables."""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

Device = Literal["auto", "cuda", "cpu"]
DEFAULT_MODEL_REPO = "SmilingWolf/wd-eva02-large-tagger-v3"


@dataclass(frozen=True)
class Settings:
    model_repo: str = DEFAULT_MODEL_REPO
    cache_dir: str = "/models"
    min_confidence: float = 0.2
    max_body_bytes: int = 50 * 1024 * 1024
    token: str | None = None
    device: Device = "auto"
    host: str = "0.0.0.0"
    port: int = 7860


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


def _device(raw: str) -> Device:
    if raw not in ("auto", "cuda", "cpu"):
        raise ValueError(f"TAGGER_DEVICE must be auto, cuda or cpu, got {raw}")
    return raw  # type: ignore[return-value]


def settings_from_env(env: Mapping[str, str]) -> Settings:
    """Builds Settings from an environment mapping; unset or blank variables keep their defaults."""
    defaults = Settings()

    def get(name: str) -> str | None:
        value = env.get(name, "").strip()
        return value or None

    min_confidence = get("TAGGER_MIN_CONFIDENCE")
    max_body = get("TAGGER_MAX_BODY_BYTES")
    device = get("TAGGER_DEVICE")
    port = get("TAGGER_PORT")
    return Settings(
        model_repo=get("TAGGER_MODEL_REPO") or defaults.model_repo,
        cache_dir=get("TAGGER_CACHE_DIR") or defaults.cache_dir,
        min_confidence=(
            _float_in_unit_range(min_confidence, "TAGGER_MIN_CONFIDENCE")
            if min_confidence
            else defaults.min_confidence
        ),
        max_body_bytes=_positive_int(max_body, "TAGGER_MAX_BODY_BYTES")
        if max_body
        else defaults.max_body_bytes,
        token=get("TAGGER_TOKEN"),
        device=_device(device) if device else defaults.device,
        host=get("TAGGER_HOST") or defaults.host,
        port=_positive_int(port, "TAGGER_PORT") if port else defaults.port,
    )


def model_name_from_repo(repo: str) -> str:
    """'SmilingWolf/wd-eva02-large-tagger-v3' -> 'wd-eva02-large-tagger-v3'."""
    return repo.rstrip("/").rsplit("/", 1)[-1]
