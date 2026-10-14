import numpy as np
from PIL import Image

from eikon_tagger.labels import Label
from eikon_tagger.protocol import Tag, TagResult


class FakeSession:
    def __init__(self, probs: list[float], input_size: int = 4, device: str = "cuda") -> None:
        self.probs = probs
        self.input_size = input_size
        self.device = device
        self.batches: list[np.ndarray] = []

    def run(self, batch: np.ndarray) -> np.ndarray:
        self.batches.append(batch)
        return np.asarray(self.probs, dtype=np.float32)


class FakeTagger:
    model_name = "fake-model"
    device = "cpu"

    def __init__(self) -> None:
        self.loaded = False
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


LABELS = [Label(0, "general", 9), Label(1, "explicit", 9), Label(2, "sky", 0), Label(3, "miku", 4)]
