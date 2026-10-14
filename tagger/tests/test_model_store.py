import pytest

from eikon_tagger.model_store import (
    LABELS_FILE,
    MODEL_FILE,
    PREPROCESSOR_FILE,
    TOKENIZER_FILE,
    download_embed_files,
    download_model_files,
)


def recording_downloader():
    calls = []

    def downloader(**kwargs):
        calls.append(kwargs)
        return f"/cache/{kwargs['filename']}"

    return downloader, calls


def test_downloads_model_and_labels_into_cache_dir():
    downloader, calls = recording_downloader()

    files = download_model_files("owner/wd-model", "/cache", downloader)

    assert files.model_path == f"/cache/{MODEL_FILE}"
    assert files.labels_path == f"/cache/{LABELS_FILE}"
    assert calls == [
        {"repo_id": "owner/wd-model", "filename": MODEL_FILE, "cache_dir": "/cache"},
        {"repo_id": "owner/wd-model", "filename": LABELS_FILE, "cache_dir": "/cache"},
    ]


@pytest.mark.parametrize(
    ("precision", "vision", "text"),
    [
        ("fp32", "onnx/vision_model.onnx", "onnx/text_model.onnx"),
        ("fp16", "onnx/vision_model_fp16.onnx", "onnx/text_model_fp16.onnx"),
    ],
)
def test_downloads_clip_towers_tokenizer_and_preprocessor(precision, vision, text):
    downloader, calls = recording_downloader()

    files = download_embed_files("Xenova/clip", "/cache", precision, downloader)

    assert (files.vision_path, files.text_path) == (f"/cache/{vision}", f"/cache/{text}")
    assert files.tokenizer_path == f"/cache/{TOKENIZER_FILE}"
    assert files.preprocessor_path == f"/cache/{PREPROCESSOR_FILE}"
    assert [c["filename"] for c in calls] == [vision, text, TOKENIZER_FILE, PREPROCESSOR_FILE]
    assert {c["repo_id"] for c in calls} == {"Xenova/clip"}


def test_defaults_to_the_hugging_face_hub_downloader():
    from huggingface_hub import hf_hub_download

    from eikon_tagger.model_store import _default_downloader

    assert _default_downloader() is hf_hub_download
