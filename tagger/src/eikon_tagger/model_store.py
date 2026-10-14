"""Fetches model, label and embedding files from the Hugging Face Hub into a local cache."""

from collections.abc import Callable
from dataclasses import dataclass

from .settings import Precision

MODEL_FILE = "model.onnx"
LABELS_FILE = "selected_tags.csv"
TOKENIZER_FILE = "tokenizer.json"
PREPROCESSOR_FILE = "preprocessor_config.json"

Downloader = Callable[..., str]


@dataclass(frozen=True)
class ModelFiles:
    model_path: str
    labels_path: str


@dataclass(frozen=True)
class EmbedFiles:
    vision_path: str
    text_path: str
    tokenizer_path: str
    preprocessor_path: str


def _default_downloader() -> Downloader:
    from huggingface_hub import hf_hub_download

    return hf_hub_download


def download_model_files(repo: str, cache_dir: str, downloader: Downloader | None = None) -> ModelFiles:
    """Downloads (or reuses cached) WD model files; returns their local paths."""
    fetch = downloader or _default_downloader()
    return ModelFiles(
        model_path=fetch(repo_id=repo, filename=MODEL_FILE, cache_dir=cache_dir),
        labels_path=fetch(repo_id=repo, filename=LABELS_FILE, cache_dir=cache_dir),
    )


def embed_model_filenames(precision: Precision) -> tuple[str, str]:
    """ONNX exports in Xenova's layout: onnx/vision_model[_fp16].onnx and onnx/text_model[_fp16].onnx."""
    suffix = "_fp16" if precision == "fp16" else ""
    return f"onnx/vision_model{suffix}.onnx", f"onnx/text_model{suffix}.onnx"


def download_embed_files(
    repo: str, cache_dir: str, precision: Precision, downloader: Downloader | None = None
) -> EmbedFiles:
    """Downloads (or reuses cached) CLIP towers, tokenizer and preprocessor config."""
    fetch = downloader or _default_downloader()
    vision, text = embed_model_filenames(precision)

    def get(filename: str) -> str:
        return fetch(repo_id=repo, filename=filename, cache_dir=cache_dir)

    return EmbedFiles(
        vision_path=get(vision),
        text_path=get(text),
        tokenizer_path=get(TOKENIZER_FILE),
        preprocessor_path=get(PREPROCESSOR_FILE),
    )
