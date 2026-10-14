import io

from PIL import Image


def image_bytes(
    mode: str = "RGB", size: tuple[int, int] = (8, 6), color=(10, 20, 30), fmt: str = "PNG"
) -> bytes:
    buffer = io.BytesIO()
    Image.new(mode, size, color).save(buffer, format=fmt)
    return buffer.getvalue()
