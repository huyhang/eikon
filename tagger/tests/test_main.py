import threading

import pytest

from eikon_tagger.batching import unbatched
from eikon_tagger.main import build_app, build_embedder, build_tagger
from eikon_tagger.settings import Settings


def test_build_tagger_names_model_after_repo_without_loading():
    tagger = build_tagger(Settings(model_repo="SmilingWolf/wd-vit-tagger-v3"), unbatched)
    assert tagger.model_name == "wd-vit-tagger-v3"
    assert tagger.device == "unloaded"


@pytest.mark.parametrize(
    ("embed_repo", "expected_name"),
    [("Xenova/clip-vit-large-patch14", "clip-vit-large-patch14"), (None, None)],
)
def test_build_embedder_follows_the_embed_setting(embed_repo, expected_name):
    embedder = build_embedder(Settings(embed_repo=embed_repo), unbatched, threading.Lock())
    assert (embedder.model_name if embedder else None) == expected_name
    if embedder:
        assert embedder.device == "unloaded"


def test_build_app_registers_protocol_routes():
    paths = {route.path for route in build_app(Settings()).routes}
    assert {"/health", "/v1/tag", "/v1/embed-image", "/v1/embed-text"} <= paths
