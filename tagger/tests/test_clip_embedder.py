import threading

import numpy as np
import pytest
from fakes import FakeTokenizer, FakeTower
from PIL import Image

from eikon_tagger.batching import DirectBatcher
from eikon_tagger.clip_embedder import ClipEmbedder, EmbedderNotLoadedError, HfTokenizer, LoadedClip
from eikon_tagger.clip_preprocessing import ClipImageConfig

CONFIG = ClipImageConfig(4, 4, 4, (0.0, 0.0, 0.0), (1.0, 1.0, 1.0), rescale_factor=1 / 255)


def make_embedder(**kwargs):
    vision, text, tokenizer = FakeTower(device="cuda"), FakeTower(), FakeTokenizer()
    embedder = ClipEmbedder("clip-test", lambda: LoadedClip(vision, text, tokenizer, CONFIG), **kwargs)
    return embedder, vision, text, tokenizer


@pytest.mark.parametrize("call", ["embed_image", "embed_text"])
def test_use_before_load_raises(call):
    embedder, *_ = make_embedder()
    argument = Image.new("RGB", (2, 2)) if call == "embed_image" else "sky"
    with pytest.raises(EmbedderNotLoadedError):
        getattr(embedder, call)(argument)


@pytest.mark.parametrize(("loaded", "expected"), [(False, "unloaded"), (True, "cuda")])
def test_device_reflects_load_state(loaded, expected):
    embedder, *_ = make_embedder()
    if loaded:
        embedder.load()
    assert embedder.device == expected


def test_embed_image_preprocesses_batches_and_normalises():
    factories: list = []

    def factory(run):
        factories.append(run)
        return DirectBatcher(run)

    embedder, vision, _, _ = make_embedder(batcher_factory=factory)
    embedder.load()
    vector = embedder.embed_image(Image.new("RGB", (8, 6), (255, 255, 255)))

    assert vision.batches[0].shape == (1, 3, 4, 4)
    assert factories == [vision.run]  # only the vision tower is micro-batched
    assert np.linalg.norm(vector) == pytest.approx(1.0)
    assert vector.tolist() == pytest.approx(np.asarray([48.0, 48.0, 0.0]) / np.sqrt(2 * 48.0**2))


def test_embed_text_tokenizes_into_int64_ids():
    embedder, _, text, tokenizer = make_embedder(text_lock=threading.Lock())
    embedder.load()
    vector = embedder.embed_text("big wave")

    assert tokenizer.texts == ["big wave"]
    assert text.batches[0].dtype == np.int64
    assert text.batches[0].tolist() == [[49406, 3, 4, 49407]]
    assert np.linalg.norm(vector) == pytest.approx(1.0)


def test_close_stops_the_vision_batcher():
    closed: list[bool] = []

    class ClosingBatcher(DirectBatcher):
        def close(self) -> None:
            closed.append(True)

    embedder, *_ = make_embedder(batcher_factory=ClosingBatcher)
    embedder.close()  # before load: nothing to close
    embedder.load()
    embedder.close()
    assert closed == [True]
    assert embedder.model_name == "clip-test"


def test_hf_tokenizer_adds_markers_and_truncates(tmp_path):
    tokenizers = pytest.importorskip("tokenizers")
    from tokenizers import models, pre_tokenizers, processors

    vocab = {"<s>": 0, "</s>": 1, "[UNK]": 2, "big": 3, "wave": 4}
    tokenizer = tokenizers.Tokenizer(models.WordLevel(vocab, unk_token="[UNK]"))
    tokenizer.pre_tokenizer = pre_tokenizers.Whitespace()
    tokenizer.post_processor = processors.TemplateProcessing(
        single="<s> $A </s>", special_tokens=[("<s>", 0), ("</s>", 1)]
    )
    path = tmp_path / "tokenizer.json"
    tokenizer.save(str(path))

    hf = HfTokenizer.from_file(str(path), max_length=4)
    assert hf.encode("big wave") == [0, 3, 4, 1]
    assert hf.encode("big wave big wave") == [0, 3, 4, 1]
