import pytest
from conftest import image_bytes
from fakes import FakeTagger
from fastapi.testclient import TestClient

from eikon_tagger.app import create_app, declared_length_exceeds, is_authorized
from eikon_tagger.settings import Settings


@pytest.fixture
def tagger() -> FakeTagger:
    return FakeTagger()


def client_for(tagger: FakeTagger, **settings) -> TestClient:
    return TestClient(create_app(tagger, Settings(**settings)))


def test_loads_model_at_startup(tagger):
    with client_for(tagger):
        assert tagger.loaded


def test_health(tagger):
    with client_for(tagger) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "model": "fake-model", "device": "cpu"}


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
    }
    assert tagger.images[0].size == (7, 5)


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
