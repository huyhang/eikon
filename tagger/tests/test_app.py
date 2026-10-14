import base64

import pytest
from conftest import image_bytes
from fakes import FakeEmbedder, FakeTagger
from fastapi.testclient import TestClient

from eikon_tagger.app import (
    MAX_EMBED_TEXT_LENGTH,
    RequestError,
    create_app,
    declared_length_exceeds,
    is_authorized,
    parse_embed_text,
)
from eikon_tagger.settings import Settings

# Unit vectors from FakeEmbedder as little-endian float16: 1.0 is 0x3C00.
IMAGE_VECTOR = base64.b64encode(b"\x00\x3c" + b"\x00\x00" * 3).decode()
TEXT_VECTOR = base64.b64encode(b"\x00\x00\x00\x3c" + b"\x00\x00" * 2).decode()


@pytest.fixture
def tagger() -> FakeTagger:
    return FakeTagger()


@pytest.fixture
def embedder() -> FakeEmbedder:
    return FakeEmbedder()


def client_for(tagger: FakeTagger, embedder: FakeEmbedder | None = None, **settings) -> TestClient:
    return TestClient(create_app(tagger, Settings(**settings), embedder))


def test_loads_models_at_startup_and_closes_them_at_shutdown(tagger, embedder):
    with client_for(tagger, embedder):
        assert tagger.loaded and embedder.loaded
    assert tagger.closed and embedder.closed


@pytest.mark.parametrize(("with_embedder", "embed_model"), [(False, None), (True, "fake-clip")])
def test_health(tagger, embedder, with_embedder, embed_model):
    with client_for(tagger, embedder if with_embedder else None) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "model": "fake-model",
        "device": "cpu",
        "embedModel": embed_model,
    }


def test_tags_an_image(tagger):
    with client_for(tagger) as client:
        response = client.post(
            "/v1/tag", content=image_bytes(size=(7, 5)), headers={"content-type": "image/png"}
        )
    assert response.status_code == 200
    assert response.json() == {
        "model": "fake-model",
        "rating": {"general": 0.9, "sensitive": 0.1, "questionable": 0.0, "explicit": 0.0},
        "tags": [{"name": "sky", "category": "general", "confidence": 0.75}],
        "embedding": None,
    }
    assert tagger.images[0].size == (7, 5)


def test_tag_includes_the_embedding_when_configured(tagger, embedder):
    with client_for(tagger, embedder) as client:
        response = client.post("/v1/tag", content=image_bytes())
    assert response.status_code == 200
    assert response.json()["embedding"] == {"model": "fake-clip", "vector": IMAGE_VECTOR}
    assert tagger.images[0] is not embedder.images[0]  # each thread gets its own copy


def test_embeds_an_image(tagger, embedder):
    with client_for(tagger, embedder) as client:
        response = client.post("/v1/embed-image", content=image_bytes(size=(3, 9)))
    assert response.status_code == 200
    assert response.json() == {"model": "fake-clip", "vector": IMAGE_VECTOR}
    assert embedder.images[0].size == (3, 9)
    assert tagger.images == []


def test_embeds_text(tagger, embedder):
    with client_for(tagger, embedder) as client:
        response = client.post("/v1/embed-text", json={"text": "  a huge wave  "})
    assert response.status_code == 200
    assert response.json() == {"model": "fake-clip", "vector": TEXT_VECTOR}
    assert embedder.texts == ["a huge wave"]


@pytest.mark.parametrize(
    ("path", "kwargs"),
    [("/v1/embed-image", {"content": image_bytes()}), ("/v1/embed-text", {"json": {"text": "sky"}})],
)
def test_embedding_endpoints_answer_404_when_embeddings_are_off(tagger, path, kwargs):
    with client_for(tagger) as client:
        response = client.post(path, **kwargs)
    assert response.status_code == 404
    assert response.json() == {"error": "embeddings are disabled"}


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"content": b"not json"}, "JSON"),
        ({"json": ["sky"]}, "text is required"),
        ({"json": {}}, "text is required"),
        ({"json": {"text": "   "}}, "text is required"),
        ({"json": {"text": 42}}, "text is required"),
        ({"json": {"text": "x" * (MAX_EMBED_TEXT_LENGTH + 1)}}, "longer than"),
    ],
)
def test_embed_text_rejects_bad_bodies(tagger, embedder, kwargs, message):
    with client_for(tagger, embedder) as client:
        response = client.post("/v1/embed-text", **kwargs)
    assert response.status_code == 400
    assert message in response.json()["error"]
    assert embedder.texts == []


@pytest.mark.parametrize(
    ("path", "body", "status"),
    [
        ("/v1/embed-image", b"not an image", 400),
        ("/v1/embed-image", b"x" * 101, 413),
        ("/v1/embed-text", b"x" * 101, 413),
    ],
)
def test_embedding_endpoints_enforce_body_rules(tagger, embedder, path, body, status):
    with client_for(tagger, embedder, max_body_bytes=100) as client:
        assert client.post(path, content=body).status_code == status


@pytest.mark.parametrize("path", ["/v1/tag", "/v1/embed-image", "/v1/embed-text"])
def test_every_post_endpoint_requires_the_token(tagger, embedder, path):
    with client_for(tagger, embedder, token="s3cret") as client:
        assert client.post(path, content=image_bytes()).status_code == 401


def test_parse_embed_text_raises_request_errors():
    assert parse_embed_text(b'{"text": " sky "}') == "sky"
    with pytest.raises(RequestError) as caught:
        parse_embed_text(b"\xff")
    assert caught.value.status == 400


@pytest.mark.parametrize(
    ("headers", "status"),
    [
        ({}, 401),
        ({"authorization": "Bearer wrong"}, 401),
        ({"authorization": "Basic s3cret"}, 401),
        ({"authorization": "Bearer s3cret"}, 200),
        ({"authorization": "bearer s3cret"}, 200),
    ],
)
def test_token_is_enforced_when_configured(tagger, headers, status):
    with client_for(tagger, token="s3cret") as client:
        response = client.post("/v1/tag", content=image_bytes(), headers=headers)
    assert response.status_code == status


def test_health_stays_public_with_token(tagger):
    with client_for(tagger, token="s3cret") as client:
        assert client.get("/health").status_code == 200


@pytest.mark.parametrize("body", [b"", b"not an image"])
def test_rejects_undecodable_images(tagger, body):
    with client_for(tagger) as client:
        response = client.post("/v1/tag", content=body)
    assert response.status_code == 400
    assert "error" in response.json()
    assert tagger.images == []


def test_rejects_oversized_bodies(tagger):
    with client_for(tagger, max_body_bytes=100) as client:
        response = client.post("/v1/tag", content=b"x" * 101)
    assert response.status_code == 413


def test_rejects_oversized_streamed_bodies_without_content_length(tagger):
    def chunks():
        yield b"x" * 60
        yield b"x" * 60

    with client_for(tagger, max_body_bytes=100) as client:
        response = client.post("/v1/tag", content=chunks())
    assert response.status_code == 413


@pytest.mark.parametrize(
    ("header", "token", "expected"),
    [
        (None, None, True),
        ("anything", "", True),
        (None, "t", False),
        ("Bearer t", "t", True),
        ("Bearer  t ", "t", True),
        ("Bearer tt", "t", False),
        ("Token t", "t", False),
    ],
)
def test_is_authorized(header, token, expected):
    assert is_authorized(header, token) is expected


@pytest.mark.parametrize(
    ("content_length", "expected"),
    [(None, False), ("100", False), ("101", True), ("abc", False)],
)
def test_declared_length_exceeds(content_length, expected):
    assert declared_length_exceeds(content_length, 100) is expected
