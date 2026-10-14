import pytest

from eikon_tagger.labels import Label
from eikon_tagger.postprocessing import build_result, rating_scores, select_tags
from eikon_tagger.protocol import Tag

LABELS = [
    Label(0, "general", 9),
    Label(1, "sensitive", 9),
    Label(2, "questionable", 9),
    Label(3, "explicit", 9),
    Label(4, "1girl", 0),
    Label(5, "sky", 0),
    Label(6, "hatsune_miku", 4),
    Label(7, "some_artist", 1),
]
PROBS = [0.8, 0.15, 0.04, 0.01, 0.97, 0.2, 0.5, 0.99]


def test_rating_scores_cover_all_four_ratings():
    assert rating_scores(LABELS, PROBS) == {
        "general": 0.8,
        "sensitive": 0.15,
        "questionable": 0.04,
        "explicit": 0.01,
    }


def test_missing_rating_labels_default_to_zero():
    assert rating_scores(LABELS[:1], [0.9]) == {
        "general": 0.9,
        "sensitive": 0.0,
        "questionable": 0.0,
        "explicit": 0.0,
    }


@pytest.mark.parametrize(
    ("threshold", "expected_names"),
    [
        (0.0, ["1girl", "hatsune_miku", "sky"]),
        (0.2, ["1girl", "hatsune_miku", "sky"]),
        (0.21, ["1girl", "hatsune_miku"]),
        (0.97, ["1girl"]),
        (0.98, []),
    ],
)
def test_select_tags_applies_threshold_inclusively(threshold, expected_names):
    assert [t.name for t in select_tags(LABELS, PROBS, threshold)] == expected_names


def test_select_tags_reports_category_and_rounded_confidence():
    tags = select_tags(LABELS, [0, 0, 0, 0, 0.123456, 0, 0.654321, 0], 0.1)
    assert tags == [Tag("hatsune_miku", "character", 0.6543), Tag("1girl", "general", 0.1235)]


def test_build_result_rejects_mismatched_lengths():
    with pytest.raises(ValueError):
        build_result("m", LABELS, PROBS[:-1], 0.2)


def test_build_result_serializes_to_protocol_shape():
    result = build_result("wd-test", LABELS, PROBS, 0.9).to_json()
    assert result == {
        "model": "wd-test",
        "rating": {"general": 0.8, "sensitive": 0.15, "questionable": 0.04, "explicit": 0.01},
        "tags": [{"name": "1girl", "category": "general", "confidence": 0.97}],
        "embedding": None,
    }
