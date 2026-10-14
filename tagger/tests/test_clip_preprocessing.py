import json

import numpy as np
import pytest
from PIL import Image

from eikon_tagger.clip_preprocessing import (
    ClipImageConfig,
    center_crop,
    load_image_config,
    parse_image_config,
    preprocess_clip,
    resize_shortest_edge,
    to_pixel_values,
)

XENOVA_CLIP = {
    "crop_size": {"height": 224, "width": 224},
    "do_center_crop": True,
    "image_mean": [0.48145466, 0.4578275, 0.40821073],
    "image_std": [0.26862954, 0.26130258, 0.27577711],
    "rescale_factor": 0.00392156862745098,
    "resample": 3,
    "size": {"shortest_edge": 224},
}

IDENTITY = ClipImageConfig(
    shortest_edge=4,
    crop_width=4,
    crop_height=4,
    mean=(0.0, 0.0, 0.0),
    std=(1.0, 1.0, 1.0),
    rescale_factor=1.0,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (
            XENOVA_CLIP,
            ClipImageConfig(
                224, 224, 224, (0.48145466, 0.4578275, 0.40821073), (0.26862954, 0.26130258, 0.27577711)
            ),
        ),
        ({"size": 336, "crop_size": 336}, ClipImageConfig(336, 336, 336, (0.0, 0.0, 0.0), (1.0, 1.0, 1.0))),
        ({"size": {"shortest_edge": 224}}, ClipImageConfig(224, 224, 224, (0.0, 0.0, 0.0), (1.0, 1.0, 1.0))),
        (
            {"size": {"height": 384, "width": 384}, "do_center_crop": False},
            ClipImageConfig(384, 384, 384, (0.0, 0.0, 0.0), (1.0, 1.0, 1.0), center_crop=False),
        ),
    ],
)
def test_parse_image_config(raw, expected):
    config = parse_image_config(raw)
    assert config.shortest_edge == expected.shortest_edge
    assert (config.crop_width, config.crop_height) == (expected.crop_width, expected.crop_height)
    assert config.mean == pytest.approx(expected.mean)
    assert config.std == pytest.approx(expected.std)
    assert config.center_crop is expected.center_crop
    assert config.rescale_factor == pytest.approx(1 / 255)


def test_load_image_config(tmp_path):
    path = tmp_path / "preprocessor_config.json"
    path.write_text(json.dumps(XENOVA_CLIP))
    assert load_image_config(str(path)).shortest_edge == 224


@pytest.mark.parametrize(
    ("size", "expected"),
    [((448, 300), (334, 224)), ((300, 448), (224, 334)), ((224, 224), (224, 224)), ((100, 50), (448, 224))],
)
def test_resize_shortest_edge_keeps_aspect_ratio(size, expected):
    assert resize_shortest_edge(Image.new("RGB", size), 224).size == expected


@pytest.mark.parametrize(
    ("size", "marker", "crop", "marker_kept"),
    [
        ((6, 4), (3, 2), (4, 4), True),  # centre survives
        ((6, 4), (0, 0), (4, 4), False),  # left edge of a landscape image is cut
        ((4, 8), (2, 7), (4, 4), False),  # bottom of a portrait image is cut
        ((2, 2), (1, 1), (4, 4), True),  # smaller than the crop: padded, nothing lost
    ],
)
def test_center_crop_keeps_the_middle(size, marker, crop, marker_kept):
    image = Image.new("RGB", size, (0, 0, 0))
    image.putpixel(marker, (255, 0, 0))
    cropped = center_crop(image, *crop)
    assert cropped.size == crop
    assert bool((np.asarray(cropped) == (255, 0, 0)).all(axis=2).any()) is marker_kept


def test_to_pixel_values_rescales_normalises_and_transposes():
    config = ClipImageConfig(2, 2, 2, mean=(0.5, 0.5, 0.5), std=(0.5, 0.25, 0.5), rescale_factor=1 / 255)
    image = Image.new("RGB", (2, 2), (255, 0, 51))
    values = to_pixel_values(image, config)
    assert values.shape == (1, 3, 2, 2)
    assert values.dtype == np.float32
    assert values[0, :, 0, 0].tolist() == pytest.approx([1.0, -2.0, -0.6])
    assert values.flags["C_CONTIGUOUS"]


@pytest.mark.parametrize(
    ("mode", "color", "expected_red"),
    [("RGB", (10, 20, 30), 10.0), ("RGBA", (0, 0, 0, 0), 255.0), ("L", 128, 128.0)],
)
def test_preprocess_clip_flattens_and_sizes(mode, color, expected_red):
    values = preprocess_clip(Image.new(mode, (8, 6), color), IDENTITY)
    assert values.shape == (1, 3, 4, 4)
    assert values[0, 0, 0, 0] == pytest.approx(expected_red)


def test_preprocess_clip_without_center_crop_keeps_resized_shape():
    config = ClipImageConfig(4, 4, 4, (0.0, 0.0, 0.0), (1.0, 1.0, 1.0), rescale_factor=1.0, center_crop=False)
    assert preprocess_clip(Image.new("RGB", (8, 4)), config).shape == (1, 3, 4, 8)
