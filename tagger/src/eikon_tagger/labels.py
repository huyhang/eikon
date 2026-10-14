"""Parsing of the WD tagger `selected_tags.csv` label file."""

import csv
from collections.abc import Iterable
from dataclasses import dataclass

from .protocol import TagCategory

# Category ids used by the WD v3 label files.
CATEGORY_GENERAL = 0
CATEGORY_CHARACTER = 4
CATEGORY_RATING = 9

_TAG_CATEGORIES: dict[int, TagCategory] = {CATEGORY_GENERAL: "general", CATEGORY_CHARACTER: "character"}


@dataclass(frozen=True)
class Label:
    index: int
    name: str
    category_id: int

    @property
    def is_rating(self) -> bool:
        return self.category_id == CATEGORY_RATING

    @property
    def tag_category(self) -> TagCategory | None:
        return _TAG_CATEGORIES.get(self.category_id)


def parse_labels(lines: Iterable[str]) -> list[Label]:
    """Parses CSV rows with a `name` and `category` header (tag_id,name,category,count)."""
    reader = csv.DictReader(lines)
    if reader.fieldnames is None or not {"name", "category"} <= set(reader.fieldnames):
        raise ValueError("label file must have 'name' and 'category' columns")
    return [
        Label(index=i, name=row["name"].strip(), category_id=int(row["category"]))
        for i, row in enumerate(reader)
    ]


def load_labels(path: str) -> list[Label]:
    with open(path, encoding="utf-8", newline="") as f:
        return parse_labels(f)
