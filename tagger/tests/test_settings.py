import pytest

from eikon_tagger.settings import (
    DEFAULT_EMBED_REPO,
    DEFAULT_MODEL_REPO,
    Settings,
    model_name_from_repo,
    settings_from_env,
)


def test_defaults_when_env_is_empty():
    assert settings_from_env({}) == Settings()


@pytest.mark.parametrize(
    ("env", "field", "expected"),
    [
        ({"TAGGER_MODEL_REPO": "me/wd-vit-tagger-v3"}, "model_repo", "me/wd-vit-tagger-v3"),
        ({"TAGGER_CACHE_DIR": "/tmp/models"}, "cache_dir", "/tmp/models"),
        ({"TAGGER_MIN_CONFIDENCE": "0.35"}, "min_confidence", 0.35),
        ({"TAGGER_MAX_BODY_BYTES": "1024"}, "max_body_bytes", 1024),
        ({"TAGGER_TOKEN": "s3cret"}, "token", "s3cret"),
        ({"TAGGER_TOKEN": "   "}, "token", None),
        ({"TAGGER_DEVICE": "cpu"}, "device", "cpu"),
        ({"TAGGER_HOST": "127.0.0.1"}, "host", "127.0.0.1"),
        ({"TAGGER_PORT": "9000"}, "port", 9000),
        ({"TAGGER_MODEL_REPO": ""}, "model_repo", DEFAULT_MODEL_REPO),
        ({}, "embed_repo", DEFAULT_EMBED_REPO),
        ({"TAGGER_EMBED_REPO": "Xenova/clip-vit-base-patch16"}, "embed_repo", "Xenova/clip-vit-base-patch16"),
        ({"TAGGER_EMBED_REPO": "off"}, "embed_repo", None),
        ({"TAGGER_EMBED_REPO": "OFF"}, "embed_repo", None),
        ({"TAGGER_EMBED_PRECISION": "fp16"}, "embed_precision", "fp16"),
        ({"TAGGER_MAX_BATCH": "32"}, "max_batch", 32),
        ({"TAGGER_BATCH_WAIT_MS": "0"}, "batch_wait_ms", 0),
        ({"TAGGER_BATCH_WAIT_MS": "20"}, "batch_wait_ms", 20),
    ],
)
def test_reads_each_variable(env, field, expected):
    assert getattr(settings_from_env(env), field) == expected


@pytest.mark.parametrize(
    "env",
    [
        {"TAGGER_MIN_CONFIDENCE": "1.5"},
        {"TAGGER_MIN_CONFIDENCE": "-0.1"},
        {"TAGGER_MIN_CONFIDENCE": "high"},
        {"TAGGER_MAX_BODY_BYTES": "0"},
        {"TAGGER_PORT": "-1"},
        {"TAGGER_DEVICE": "tpu"},
        {"TAGGER_EMBED_PRECISION": "int8"},
        {"TAGGER_MAX_BATCH": "0"},
        {"TAGGER_MAX_BATCH": "many"},
        {"TAGGER_BATCH_WAIT_MS": "-1"},
    ],
)
def test_rejects_invalid_values(env):
    with pytest.raises(ValueError):
        settings_from_env(env)


@pytest.mark.parametrize(
    ("repo", "expected"),
    [
        ("SmilingWolf/wd-eva02-large-tagger-v3", "wd-eva02-large-tagger-v3"),
        ("SmilingWolf/wd-vit-tagger-v3/", "wd-vit-tagger-v3"),
        ("local-model", "local-model"),
    ],
)
def test_model_name_from_repo(repo, expected):
    assert model_name_from_repo(repo) == expected
