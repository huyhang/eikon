import numpy as np
from PIL import Image

from eikon_tagger.labels import Label
from eikon_tagger.protocol import Tag, TagResult


class FakeSession:
    """WD stand-in: returns the same probability row for every image in the batch."""

    def __init__(self, probs: list[float], input_size: int = 4, device: str = "cuda") -> None:
        self.probs = probs
        self.input_size = input_size
        self.device = device
        self.batches: list[np.ndarray] = []

    def run(self, batch: np.ndarray) -> np.ndarray:
        self.batches.append(batch)
        return np.tile(np.asarray(self.probs, dtype=np.float32), (len(batch), 1))


class FakeTagger:
    model_name = "fake-model"
    device = "cpu"

    def __init__(self) -> None:
        self.loaded = False
        self.closed = False
        self.images: list[Image.Image] = []

    def load(self) -> None:
        self.loaded = True

    def tag(self, image: Image.Image) -> TagResult:
        self.images.append(image)
        return TagResult(
            model=self.model_name,
            rating={"general": 0.9, "sensitive": 0.1, "questionable": 0.0, "explicit": 0.0},
            tags=[Tag("sky", "general", 0.75)],
        )

    def close(self) -> None:
        self.closed = True


class FakeEmbedder:
    """Returns unit vectors: images point along x, texts along y."""

    model_name = "fake-clip"

    def __init__(self) -> None:
        self.loaded = False
        self.closed = False
        self.texts: list[str] = []
        self.images: list[Image.Image] = []

    def load(self) -> None:
        self.loaded = True

    def embed_image(self, image: Image.Image) -> np.ndarray:
        self.images.append(image)
        return np.asarray([1.0, 0.0, 0.0, 0.0], dtype=np.float32)

    def embed_text(self, text: str) -> np.ndarray:
        self.texts.append(text)
        return np.asarray([0.0, 1.0, 0.0, 0.0], dtype=np.float32)

    def close(self) -> None:
        self.closed = True


class FakeTower:
    """A CLIP tower stand-in: embeds each row as [sum, count, 0] so outputs are traceable."""

    def __init__(self, device: str = "cpu") -> None:
        self.device = device
        self.batches: list[np.ndarray] = []

    def run(self, batch: np.ndarray) -> np.ndarray:
        self.batches.append(batch)
        flat = batch.reshape(len(batch), -1).astype(np.float32)
        return np.stack([flat.sum(axis=1), np.full(len(batch), flat.shape[1]), np.zeros(len(batch))], axis=1)


class FakeTokenizer:
    def __init__(self) -> None:
        self.texts: list[str] = []

    def encode(self, text: str) -> list[int]:
        self.texts.append(text)
        return [49406, *[len(word) for word in text.split()], 49407]


LABELS = [Label(0, "general", 9), Label(1, "explicit", 9), Label(2, "sky", 0), Label(3, "miku", 4)]
