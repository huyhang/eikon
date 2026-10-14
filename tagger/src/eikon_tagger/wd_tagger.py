"""WD v3 tagger composed from injectable parts: model loader, preprocessor and inference session."""

import threading
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Protocol

import numpy as np
from PIL import Image

from .labels import Label
from .postprocessing import build_result
from .preprocessing import preprocess
from .protocol import TagResult


class InferenceSession(Protocol):
    @property
    def input_size(self) -> int:
        """Square input edge length expected by the model."""

    @property
    def device(self) -> str: ...

    def run(self, batch: np.ndarray) -> np.ndarray:
        """Runs a (1, H, W, 3) batch and returns the 1-D probability vector."""


@dataclass(frozen=True)
class LoadedModel:
    session: InferenceSession
    labels: Sequence[Label]


ModelLoader = Callable[[], LoadedModel]
Preprocessor = Callable[[Image.Image, int], np.ndarray]


class ModelNotLoadedError(RuntimeError):
    pass


class WdTagger:
    def __init__(
        self,
        model_name: str,
        loader: ModelLoader,
        min_confidence: float,
        preprocessor: Preprocessor = preprocess,
    ) -> None:
        self._model_name = model_name
        self._loader = loader
        self._min_confidence = min_confidence
        self._preprocess = preprocessor
        self._model: LoadedModel | None = None
        # One inference at a time keeps GPU memory flat; preprocessing still runs in parallel.
        self._inference_lock = threading.Lock()

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def device(self) -> str:
        return self._model.session.device if self._model else "unloaded"

    def load(self) -> None:
        self._model = self._loader()

    def tag(self, image: Image.Image) -> TagResult:
        model = self._require_model()
        batch = self._preprocess(image, model.session.input_size)
        with self._inference_lock:
            probs = model.session.run(batch)
        return build_result(self._model_name, model.labels, probs.tolist(), self._min_confidence)

    def _require_model(self) -> LoadedModel:
        if self._model is None:
            raise ModelNotLoadedError("model has not been loaded")
        return self._model
