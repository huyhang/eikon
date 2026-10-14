from eikon_tagger.main import build_app, build_tagger
from eikon_tagger.settings import Settings


def test_build_tagger_names_model_after_repo_without_loading():
    tagger = build_tagger(Settings(model_repo="SmilingWolf/wd-vit-tagger-v3"))
    assert tagger.model_name == "wd-vit-tagger-v3"
    assert tagger.device == "unloaded"


def test_build_app_registers_protocol_routes():
    paths = {route.path for route in build_app(Settings()).routes}
    assert {"/health", "/v1/tag"} <= paths
