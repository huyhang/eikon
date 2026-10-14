from eikon_tagger.model_store import LABELS_FILE, MODEL_FILE, download_model_files


def test_downloads_model_and_labels_into_cache_dir():
    calls = []

    def downloader(**kwargs):
        calls.append(kwargs)
        return f"/cache/{kwargs['filename']}"

    files = download_model_files("owner/wd-model", "/cache", downloader)

    assert files.model_path == f"/cache/{MODEL_FILE}"
    assert files.labels_path == f"/cache/{LABELS_FILE}"
    assert calls == [
        {"repo_id": "owner/wd-model", "filename": MODEL_FILE, "cache_dir": "/cache"},
        {"repo_id": "owner/wd-model", "filename": LABELS_FILE, "cache_dir": "/cache"},
    ]
