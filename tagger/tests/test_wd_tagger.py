import pytest
from fakes import LABELS, FakeSession
from PIL import Image

from eikon_tagger.wd_tagger import LoadedModel, ModelNotLoadedError, WdTagger


def make_tagger(session: FakeSession, preprocessor=None) -> WdTagger:
    kwargs = {"preprocessor": preprocessor} if preprocessor else {}
    return WdTagger("wd-test", lambda: LoadedModel(session, LABELS), min_confidence=0.3, **kwargs)


def test_tag_before_load_raises():
    with pytest.raises(ModelNotLoadedError):
        make_tagger(FakeSession([0.1] * 4)).tag(Image.new("RGB", (2, 2)))


@pytest.mark.parametrize(("loaded", "expected"), [(False, "unloaded"), (True, "cuda")])
def test_device_reflects_load_state(loaded, expected):
    tagger = make_tagger(FakeSession([0.1] * 4, device="cuda"))
    if loaded:
        tagger.load()
    assert tagger.device == expected


def test_tag_runs_preprocessed_batch_through_session():
    session = FakeSession([0.7, 0.2, 0.9, 0.25], input_size=6)
    tagger = make_tagger(session)
    tagger.load()

    result = tagger.tag(Image.new("RGB", (12, 3), (0, 128, 0)))

    assert session.batches[0].shape == (1, 6, 6, 3)
    assert result.model == "wd-test"
    assert result.rating["general"] == pytest.approx(0.7)
    assert result.rating["explicit"] == pytest.approx(0.2)
    assert [(t.name, t.category) for t in result.tags] == [("sky", "general")]


def test_preprocessor_receives_model_input_size():
    seen: list[int] = []
    session = FakeSession([0.0] * 4, input_size=448)

    def preprocessor(image, size):
        seen.append(size)
        import numpy as np

        return np.zeros((1, size, size, 3), dtype=np.float32)

    tagger = make_tagger(session, preprocessor)
    tagger.load()
    tagger.tag(Image.new("RGB", (1, 1)))
    assert seen == [448]
