import pytest

from eikon_tagger.labels import Label, load_labels, parse_labels

CSV = """tag_id,name,category,count
9999999,general,9,807691
9999998,sensitive,9,3189754
470575,1girl,0,4225150
212816,solo,0,3648120
1309003,hatsune_miku,4,92384
"""


def test_parses_rows_in_order_with_indexes():
    labels = parse_labels(CSV.splitlines(keepends=True))
    assert [(label.index, label.name, label.category_id) for label in labels] == [
        (0, "general", 9),
        (1, "sensitive", 9),
        (2, "1girl", 0),
        (3, "solo", 0),
        (4, "hatsune_miku", 4),
    ]


@pytest.mark.parametrize(
    ("category_id", "is_rating", "tag_category"),
    [(9, True, None), (0, False, "general"), (4, False, "character"), (3, False, None), (1, False, None)],
)
def test_label_category_mapping(category_id, is_rating, tag_category):
    label = Label(index=0, name="x", category_id=category_id)
    assert label.is_rating is is_rating
    assert label.tag_category == tag_category


@pytest.mark.parametrize("header", ["tag_id,label,count", "", "name,count"])
def test_rejects_files_without_required_columns(header):
    with pytest.raises(ValueError):
        parse_labels([header + "\n"] if header else [])


def test_load_labels_reads_from_disk(tmp_path):
    path = tmp_path / "selected_tags.csv"
    path.write_text(CSV, encoding="utf-8")
    assert len(load_labels(str(path))) == 5
