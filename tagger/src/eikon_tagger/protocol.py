"""Domain types and the Tagger/Embedder interfaces shared by the HTTP layer and implementations."""

from dataclasses import dataclass, field
from typing import Literal, Protocol

import numpy as np
from PIL import Image

from .vectors import encode_vector

TagCategory = Literal["general", "character"]
RATING_NAMES: tuple[str, ...] = ("general", "sensitive", "questionable", "explicit")


@dataclass(frozen=True)
class Tag:
    name: str
    category: TagCategory
    confidence: float


@dataclass(frozen=True)
class Embedding:
    model: str
    #: L2-normalised float32 vector.
    vector: np.ndarray

    def to_json(self) -> dict:
        return {"model": self.model, "vector": encode_vector(self.vector)}


@dataclass(frozen=True)
class TagResult:
    model: str
    rating: dict[str, float]
    tags: list[Tag] = field(default_factory=list)
    embedding: Embedding | None = None

    def to_json(self) -> dict:
        return {
            "model": self.model,
            "rating": dict(self.rating),
            "tags": [{"name": t.name, "category": t.category, "confidence": t.confidence} for t in self.tags],
            "embedding": self.embedding.to_json() if self.embedding else None,
        }


class InvalidImageError(ValueError):
    """Raised when uploaded bytes cannot be decoded as an image."""


class Tagger(Protocol):
    @property
    def model_name(self) -> str: ...

    @property
    def device(self) -> str: ...

    def load(self) -> None:
        """Loads the model; called once at startup."""

    def tag(self, image: Image.Image) -> TagResult: ...

    def close(self) -> None:
        """Releases background workers; called at shutdown."""


class Embedder(Protocol):
    @property
    def model_name(self) -> str: ...

    def load(self) -> None:
        """Loads the image and text models; called once at startup."""

    def embed_image(self, image: Image.Image) -> np.ndarray:
        """L2-normalised embedding of an image."""

    def embed_text(self, text: str) -> np.ndarray:
        """L2-normalised embedding of a text query, comparable with image embeddings."""

    def close(self) -> None: ...
