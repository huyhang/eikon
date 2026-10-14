"""Composition root: wires the real WD tagger from environment settings."""

import logging
import os
import sys

import uvicorn
from fastapi import FastAPI

from .app import create_app
from .labels import load_labels
from .model_store import download_model_files
from .onnx_session import OnnxSession
from .settings import Settings, model_name_from_repo, settings_from_env
from .wd_tagger import LoadedModel, WdTagger


def build_tagger(settings: Settings) -> WdTagger:
    def load_model() -> LoadedModel:
        files = download_model_files(settings.model_repo, settings.cache_dir)
        return LoadedModel(
            session=OnnxSession.create(files.model_path, settings.device),
            labels=load_labels(files.labels_path),
        )

    return WdTagger(model_name_from_repo(settings.model_repo), load_model, settings.min_confidence)


def build_app(settings: Settings) -> FastAPI:
    return create_app(build_tagger(settings), settings)


def run() -> None:
    logging.basicConfig(
        stream=sys.stdout, level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    settings = settings_from_env(os.environ)
    uvicorn.run(build_app(settings), host=settings.host, port=settings.port, log_config=None)


if __name__ == "__main__":
    run()
