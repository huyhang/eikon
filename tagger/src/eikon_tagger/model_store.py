"""Fetches the model and label files from the Hugging Face Hub into a local cache."""

from collections.abc import Callable
from dataclasses import dataclass

MODEL_FILE = "model.onnx"
LABELS_FILE = "selected_tags.csv"

Downloader = Callable[..., str]


@dataclass(frozen=True)
class ModelFiles:
    model_path: str
    labels_path: str


def download_model_files(repo: str, cache_dir: str, downloader: Downloader | None = None) -> ModelFiles:
    """Downloads (or reuses cached) model files; returns their local paths."""
    if downloader is None:
        from huggingface_hub import hf_hub_download

        downloader = hf_hub_download
    return ModelFiles(
        model_path=downloader(repo_id=repo, filename=MODEL_FILE, cache_dir=cache_dir),
        labels_path=downloader(repo_id=repo, filename=LABELS_FILE, cache_dir=cache_dir),
    )
