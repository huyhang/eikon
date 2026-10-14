"""Pure image preprocessing functions implementing the WD tagger input convention."""

import io

import numpy as np
from PIL import Image, UnidentifiedImageError

from .protocol import InvalidImageError

WHITE = (255, 255, 255)


def decode_image(data: bytes) -> Image.Image:
    """Decodes bytes into a fully loaded image (first frame for animations)."""
    if not data:
        raise InvalidImageError("empty body")
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as error:
        raise InvalidImageError(f"cannot decode image: {error}") from error
    return image


def has_transparency(image: Image.Image) -> bool:
    return image.mode in ("RGBA", "LA", "PA") or (image.mode == "P" and "transparency" in image.info)


def to_rgb_on_white(image: Image.Image) -> Image.Image:
    """Flattens any transparency onto a white background and returns an RGB image."""
    if has_transparency(image):
        rgba = image.convert("RGBA")
        background = Image.new("RGBA", rgba.size, (*WHITE, 255))
        return Image.alpha_composite(background, rgba).convert("RGB")
    return image.convert("RGB")


def pad_to_square(image: Image.Image) -> Image.Image:
    """Centers the image on a white square canvas whose side is the longer edge."""
    width, height = image.size
    side = max(width, height)
    if width == height:
        return image
    canvas = Image.new("RGB", (side, side), WHITE)
    canvas.paste(image, ((side - width) // 2, (side - height) // 2))
    return canvas


def resize_square(image: Image.Image, size: int) -> Image.Image:
    if image.size == (size, size):
        return image
    return image.resize((size, size), Image.Resampling.BICUBIC)


def to_model_input(image: Image.Image) -> np.ndarray:
    """RGB image -> float32 BGR array in 0..255 with a leading batch axis (NHWC)."""
    array = np.asarray(image, dtype=np.float32)[:, :, ::-1]
    return np.ascontiguousarray(array)[np.newaxis, ...]


def preprocess(image: Image.Image, size: int) -> np.ndarray:
    return to_model_input(resize_square(pad_to_square(to_rgb_on_white(image)), size))
