"""Domain types and the Tagger interface shared by the HTTP layer and implementations."""

from dataclasses import dataclass, field
from typing import Literal, Protocol

from PIL import Image

TagCategory = Literal["general", "character"]
RATING_NAMES: tuple[str, ...] = ("general", "sensitive", "questionable", "explicit")


@dataclass(frozen=True)
class Tag:
    name: str
    category: TagCategory
    confidence: float


@dataclass(frozen=True)
class TagResult:
    model: str
    rating: dict[str, float]
    tags: list[Tag] = field(default_factory=list)

    def to_json(self) -> dict:
        return {
            "model": self.model,
            "rating": dict(self.rating),
            "tags": [{"name": t.name, "category": t.category, "confidence": t.confidence} for t in self.tags],
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
