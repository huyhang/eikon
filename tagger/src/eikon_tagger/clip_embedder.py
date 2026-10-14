"""CLIP image and text embeddings composed from injectable parts: towers, tokenizer, preprocessor, batcher."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

import numpy as np
from PIL import Image

from .batching import Batcher, BatcherFactory, DirectBatcher, Lock, unbatched
from .clip_preprocessing import ClipImageConfig, preprocess_clip
from .vectors import l2_normalize

#: CLIP's text context length; longer queries are truncated.
CLIP_CONTEXT_LENGTH = 77


class EmbeddingModel(Protocol):
    @property
    def device(self) -> str: ...

    def run(self, batch: np.ndarray) -> np.ndarray:
        """Runs a batch and returns one embedding row per item."""


class TextTokenizer(Protocol):
    def encode(self, text: str) -> list[int]: ...


@dataclass(frozen=True)
class LoadedClip:
    vision: EmbeddingModel
    text: EmbeddingModel
    tokenizer: TextTokenizer
    image_config: ClipImageConfig


ClipLoader = Callable[[], LoadedClip]
ClipPreprocessor = Callable[[Image.Image, ClipImageConfig], np.ndarray]


class EmbedderNotLoadedError(RuntimeError):
    pass


class ClipEmbedder:
    def __init__(
        self,
        model_name: str,
        loader: ClipLoader,
        batcher_factory: BatcherFactory = unbatched,
        text_lock: Lock | None = None,
        preprocessor: ClipPreprocessor = preprocess_clip,
    ) -> None:
        self._model_name = model_name
        self._loader = loader
        self._batcher_factory = batcher_factory
        self._text_lock = text_lock
        self._preprocess = preprocessor
        self._model: LoadedClip | None = None
        self._vision: Batcher | None = None
        self._text: Batcher | None = None

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def device(self) -> str:
        return self._model.vision.device if self._model else "unloaded"

    def load(self) -> None:
        self._model = self._loader()
        self._vision = self._batcher_factory(self._model.vision.run)
        # Queries have different token counts, so they run one at a time (still behind the GPU lock).
        self._text = DirectBatcher(self._model.text.run, self._text_lock)

    def embed_image(self, image: Image.Image) -> np.ndarray:
        model, vision, _ = self._require_loaded()
        return l2_normalize(vision.submit(self._preprocess(image, model.image_config)))

    def embed_text(self, text: str) -> np.ndarray:
        model, _, text_tower = self._require_loaded()
        ids = np.asarray([model.tokenizer.encode(text)], dtype=np.int64)
        return l2_normalize(text_tower.submit(ids))

    def close(self) -> None:
        if self._vision:
            self._vision.close()

    def _require_loaded(self) -> tuple[LoadedClip, Batcher, Batcher]:
        if self._model is None or self._vision is None or self._text is None:
            raise EmbedderNotLoadedError("embedding model has not been loaded")
        return self._model, self._vision, self._text


class HfTokenizer:
    """The model's tokenizer.json (Hugging Face `tokenizers`), truncated to CLIP's context length."""

    def __init__(self, tokenizer: Any) -> None:
        self._tokenizer = tokenizer

    @classmethod
    def from_file(cls, path: str, max_length: int = CLIP_CONTEXT_LENGTH) -> "HfTokenizer":
        from tokenizers import Tokenizer  # imported lazily, like onnxruntime

        tokenizer = Tokenizer.from_file(path)
        tokenizer.enable_truncation(max_length)
        tokenizer.no_padding()
        return cls(tokenizer)

    def encode(self, text: str) -> list[int]:
        return list(self._tokenizer.encode(text).ids)
