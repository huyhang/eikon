import numpy as np
import pytest
from conftest import image_bytes
from PIL import Image

from eikon_tagger.preprocessing import (
    decode_image,
    has_transparency,
    pad_to_square,
    preprocess,
    resize_square,
    to_model_input,
    to_rgb_on_white,
)
from eikon_tagger.protocol import InvalidImageError


@pytest.mark.parametrize("data", [b"", b"definitely not an image", b"\x89PNG\r\n\x1a\n-truncated"])
def test_decode_rejects_garbage(data):
    with pytest.raises(InvalidImageError):
        decode_image(data)


@pytest.mark.parametrize(("fmt", "mode"), [("PNG", "RGB"), ("JPEG", "RGB"), ("WEBP", "RGB"), ("PNG", "RGBA")])
def test_decode_accepts_common_formats(fmt, mode):
    image = decode_image(image_bytes(mode=mode, size=(5, 3), color=(1, 2, 3, 255)[: len(mode)], fmt=fmt))
    assert image.size == (5, 3)


def palette_with_transparency() -> Image.Image:
    image = Image.new("P", (2, 2), 0)
    image.info["transparency"] = 0
    return image


@pytest.mark.parametrize(
    ("image", "expected"),
    [
        (Image.new("RGBA", (1, 1)), True),
        (Image.new("LA", (1, 1)), True),
        (palette_with_transparency(), True),
        (Image.new("P", (1, 1)), False),
        (Image.new("RGB", (1, 1)), False),
        (Image.new("L", (1, 1)), False),
    ],
)
def test_has_transparency(image, expected):
    assert has_transparency(image) is expected


@pytest.mark.parametrize(
    ("image", "expected_pixel"),
    [
        (Image.new("RGBA", (1, 1), (255, 0, 0, 0)), (255, 255, 255)),
        (Image.new("RGBA", (1, 1), (255, 0, 0, 255)), (255, 0, 0)),
        (Image.new("RGBA", (1, 1), (0, 0, 0, 128)), (127, 127, 127)),
        (Image.new("LA", (1, 1), (0, 0)), (255, 255, 255)),
        (Image.new("L", (1, 1), 50), (50, 50, 50)),
        (Image.new("RGB", (1, 1), (1, 2, 3)), (1, 2, 3)),
    ],
)
def test_to_rgb_on_white_flattens_alpha(image, expected_pixel):
    result = to_rgb_on_white(image)
    assert result.mode == "RGB"
    assert result.getpixel((0, 0)) == pytest.approx(expected_pixel, abs=1)


@pytest.mark.parametrize(
    ("size", "expected_size", "inner_origin"),
    [((4, 2), (4, 4), (0, 1)), ((2, 6), (6, 6), (2, 0)), ((3, 3), (3, 3), (0, 0)), ((5, 2), (5, 5), (0, 1))],
)
def test_pad_to_square_centers_on_white(size, expected_size, inner_origin):
    padded = pad_to_square(Image.new("RGB", size, (0, 0, 0)))
    assert padded.size == expected_size
    assert padded.getpixel(inner_origin) == (0, 0, 0)
    if size != expected_size:
        corner = (expected_size[0] - 1, expected_size[1] - 1) if inner_origin == (0, 0) else (0, 0)
        assert padded.getpixel(corner) == (255, 255, 255)


@pytest.mark.parametrize(("size", "target"), [((10, 10), 4), ((2, 2), 8), ((448, 448), 448)])
def test_resize_square(size, target):
    assert resize_square(Image.new("RGB", size), target).size == (target, target)


def test_to_model_input_is_bgr_float_nhwc():
    array = to_model_input(Image.new("RGB", (3, 2), (10, 20, 30)))
    assert array.shape == (1, 2, 3, 3)
    assert array.dtype == np.float32
    assert array[0, 0, 0].tolist() == [30.0, 20.0, 10.0]
    assert array.flags["C_CONTIGUOUS"]


def test_preprocess_pipeline_produces_model_sized_batch():
    batch = preprocess(Image.new("RGBA", (20, 10), (0, 0, 255, 255)), 8)
    assert batch.shape == (1, 8, 8, 3)
    assert batch[0, 0, 0].tolist() == [255.0, 255.0, 255.0]  # white padding
    assert batch[0, 4, 4].tolist() == [255.0, 0.0, 0.0]  # blue in BGR order
