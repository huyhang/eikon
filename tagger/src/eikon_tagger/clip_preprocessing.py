"""Pure CLIP image preprocessing, driven by the model's preprocessor_config.json."""

import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

import numpy as np
from PIL import Image

from .preprocessing import to_rgb_on_white


@dataclass(frozen=True)
class ClipImageConfig:
    shortest_edge: int
    crop_width: int
    crop_height: int
    mean: tuple[float, float, float]
    std: tuple[float, float, float]
    rescale_factor: float = 1 / 255
    center_crop: bool = True


def _edge(value: Any, key: str) -> int:
    """HF configs store sizes either as a number or as {"shortest_edge"|"height"|"width": n}."""
    return int(value[key] if isinstance(value, Mapping) else value)


def _shortest_edge(size: Any) -> int:
    if isinstance(size, Mapping) and "shortest_edge" not in size:
        return min(int(size["height"]), int(size["width"]))
    return _edge(size, "shortest_edge")


def parse_image_config(raw: Mapping[str, Any]) -> ClipImageConfig:
    shortest = _shortest_edge(raw["size"])
    crop = raw.get("crop_size")
    mean = raw.get("image_mean", [0.0, 0.0, 0.0])
    std = raw.get("image_std", [1.0, 1.0, 1.0])
    return ClipImageConfig(
        shortest_edge=shortest,
        crop_width=_edge(crop, "width") if crop is not None else shortest,
        crop_height=_edge(crop, "height") if crop is not None else shortest,
        mean=(float(mean[0]), float(mean[1]), float(mean[2])),
        std=(float(std[0]), float(std[1]), float(std[2])),
        rescale_factor=float(raw.get("rescale_factor", 1 / 255)),
        center_crop=bool(raw.get("do_center_crop", True)),
    )


def load_image_config(path: str) -> ClipImageConfig:
    with open(path, encoding="utf-8") as f:
        return parse_image_config(json.load(f))


def resize_shortest_edge(image: Image.Image, size: int) -> Image.Image:
    """Scales so the shorter side is `size`, like the HF CLIP processor (long side rounded down)."""
    width, height = image.size
    scaled_long = int(size * max(width, height) / min(width, height))
    target = (size, scaled_long) if width <= height else (scaled_long, size)
    return image if target == image.size else image.resize(target, Image.Resampling.BICUBIC)


def center_crop(image: Image.Image, width: int, height: int) -> Image.Image:
    """Crops the middle; pads with black if the image is smaller than the crop."""
    if image.width < width or image.height < height:
        canvas = Image.new("RGB", (max(width, image.width), max(height, image.height)))
        canvas.paste(image, ((canvas.width - image.width) // 2, (canvas.height - image.height) // 2))
        image = canvas
    left = int((image.width - width) / 2)
    top = int((image.height - height) / 2)
    return image.crop((left, top, left + width, top + height))


def to_pixel_values(image: Image.Image, config: ClipImageConfig) -> np.ndarray:
    """RGB image -> normalised float32 CHW array with a leading batch axis."""
    array = np.asarray(image, dtype=np.float32) * config.rescale_factor
    array = (array - np.asarray(config.mean, dtype=np.float32)) / np.asarray(config.std, dtype=np.float32)
    return np.ascontiguousarray(array.transpose(2, 0, 1))[np.newaxis, ...]


def preprocess_clip(image: Image.Image, config: ClipImageConfig) -> np.ndarray:
    resized = resize_shortest_edge(to_rgb_on_white(image), config.shortest_edge)
    if config.center_crop:
        resized = center_crop(resized, config.crop_width, config.crop_height)
    return to_pixel_values(resized, config)
