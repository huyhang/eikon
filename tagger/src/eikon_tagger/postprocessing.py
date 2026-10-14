"""Turns raw model probabilities into a TagResult."""

from collections.abc import Sequence

from .labels import Label
from .protocol import RATING_NAMES, Tag, TagResult


def rating_scores(labels: Sequence[Label], probs: Sequence[float]) -> dict[str, float]:
    """Probabilities of the four rating labels; missing ones default to 0."""
    found = {label.name: float(probs[label.index]) for label in labels if label.is_rating}
    return {name: round(found.get(name, 0.0), 4) for name in RATING_NAMES}


def select_tags(labels: Sequence[Label], probs: Sequence[float], min_confidence: float) -> list[Tag]:
    """General and character tags at or above the threshold, most confident first."""
    tags = [
        Tag(name=label.name, category=category, confidence=round(float(probs[label.index]), 4))
        for label in labels
        if (category := label.tag_category) is not None and float(probs[label.index]) >= min_confidence
    ]
    return sorted(tags, key=lambda t: (-t.confidence, t.name))


def build_result(
    model: str, labels: Sequence[Label], probs: Sequence[float], min_confidence: float
) -> TagResult:
    if len(probs) != len(labels):
        raise ValueError(f"model returned {len(probs)} scores for {len(labels)} labels")
    return TagResult(
        model=model,
        rating=rating_scores(labels, probs),
        tags=select_tags(labels, probs, min_confidence),
    )
