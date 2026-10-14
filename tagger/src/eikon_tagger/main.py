"""Composition root: wires the real WD tagger and CLIP embedder from environment settings."""

import logging
import os
import sys
import threading

import uvicorn
from fastapi import FastAPI

from .app import create_app
from .batching import BatcherFactory, Lock, micro_batcher_factory
from .clip_embedder import ClipEmbedder, HfTokenizer, LoadedClip
from .clip_preprocessing import load_image_config
from .labels import load_labels
from .model_store import download_embed_files, download_model_files
from .onnx_session import OnnxEmbeddingSession, OnnxSession
from .settings import Settings, model_name_from_repo, settings_from_env
from .wd_tagger import LoadedModel, WdTagger


def build_tagger(settings: Settings, batcher_factory: BatcherFactory) -> WdTagger:
    def load_model() -> LoadedModel:
        files = download_model_files(settings.model_repo, settings.cache_dir)
        return LoadedModel(
            session=OnnxSession.create(files.model_path, settings.device),
            labels=load_labels(files.labels_path),
        )

    return WdTagger(
        model_name_from_repo(settings.model_repo),
        load_model,
        settings.min_confidence,
        batcher_factory=batcher_factory,
    )


def build_embedder(
    settings: Settings, batcher_factory: BatcherFactory, gpu_lock: Lock
) -> ClipEmbedder | None:
    repo = settings.embed_repo
    if repo is None:
        return None

    def load_clip() -> LoadedClip:
        files = download_embed_files(repo, settings.cache_dir, settings.embed_precision)
        return LoadedClip(
            vision=OnnxEmbeddingSession.create(files.vision_path, settings.device, "image_embeds"),
            text=OnnxEmbeddingSession.create(files.text_path, settings.device, "text_embeds"),
            tokenizer=HfTokenizer.from_file(files.tokenizer_path),
            image_config=load_image_config(files.preprocessor_path),
        )

    return ClipEmbedder(model_name_from_repo(repo), load_clip, batcher_factory, text_lock=gpu_lock)


def build_app(settings: Settings) -> FastAPI:
    # One lock for every model call keeps a single job on the GPU at a time (and VRAM flat).
    gpu_lock = threading.Lock()
    batchers = micro_batcher_factory(settings.max_batch, settings.batch_wait_ms, gpu_lock)
    return create_app(
        build_tagger(settings, batchers),
        settings,
        build_embedder(settings, batchers, gpu_lock),
    )


def run() -> None:
    logging.basicConfig(
        stream=sys.stdout, level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    settings = settings_from_env(os.environ)
    uvicorn.run(build_app(settings), host=settings.host, port=settings.port, log_config=None)


if __name__ == "__main__":
    run()
