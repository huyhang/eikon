"""WD v3 tagger composed from injectable parts: model loader, preprocessor, session and batcher."""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Protocol

import numpy as np
from PIL import Image

from .batching import Batcher, BatcherFactory, unbatched
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
        """Runs an (N, H, W, 3) batch and returns N probability rows."""


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
        batcher_factory: BatcherFactory = unbatched,
    ) -> None:
        self._model_name = model_name
        self._loader = loader
        self._min_confidence = min_confidence
        self._preprocess = preprocessor
        self._batcher_factory = batcher_factory
        self._model: LoadedModel | None = None
        self._batcher: Batcher | None = None

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def device(self) -> str:
        return self._model.session.device if self._model else "unloaded"

    def load(self) -> None:
        self._model = self._loader()
        # Concurrent requests share batched session calls; preprocessing still runs in each caller's thread.
        self._batcher = self._batcher_factory(self._model.session.run)

    def tag(self, image: Image.Image) -> TagResult:
        model, batcher = self._require_loaded()
        probs = batcher.submit(self._preprocess(image, model.session.input_size))
        return build_result(self._model_name, model.labels, probs.tolist(), self._min_confidence)

    def close(self) -> None:
        if self._batcher:
            self._batcher.close()

    def _require_loaded(self) -> tuple[LoadedModel, Batcher]:
        if self._model is None or self._batcher is None:
            raise ModelNotLoadedError("model has not been loaded")
        return self._model, self._batcher
