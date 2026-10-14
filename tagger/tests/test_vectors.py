import base64

import numpy as np
import pytest

from eikon_tagger.protocol import Embedding
from eikon_tagger.vectors import decode_vector, encode_vector, l2_normalize


@pytest.mark.parametrize(
    ("vector", "expected"),
    [([3.0, 4.0], [0.6, 0.8]), ([0.0, 0.0], [0.0, 0.0]), ([[2.0], [0.0]], [1.0, 0.0])],
)
def test_l2_normalize(vector, expected):
    assert l2_normalize(np.asarray(vector)).tolist() == pytest.approx(expected)


@pytest.mark.parametrize(
    ("vector", "raw"),
    [
        ([1.0], b"\x00\x3c"),  # 1.0 in float16 is 0x3C00, little-endian
        ([-2.0], b"\x00\xc0"),
        ([0.5, 0.0], b"\x00\x38\x00\x00"),
    ],
)
def test_encodes_little_endian_float16_base64(vector, raw):
    encoded = encode_vector(np.asarray(vector, dtype=np.float32))
    assert base64.b64decode(encoded) == raw
    assert decode_vector(encoded).tolist() == vector


def test_round_trip_keeps_float16_precision():
    vector = l2_normalize(np.random.default_rng(1).normal(size=768))
    decoded = decode_vector(encode_vector(vector))
    assert decoded.dtype == np.float32
    assert np.max(np.abs(decoded - vector)) < 1e-3


def test_embedding_json_shape():
    embedding = Embedding("clip-test", np.asarray([1.0, 0.0], dtype=np.float32))
    assert embedding.to_json() == {
        "model": "clip-test",
        "vector": base64.b64encode(b"\x00\x3c\x00\x00").decode(),
    }
