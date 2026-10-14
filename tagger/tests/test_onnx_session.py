from types import SimpleNamespace

import numpy as np
import pytest

from eikon_tagger.onnx_session import (
    CPU,
    CUDA,
    OnnxEmbeddingSession,
    OnnxSession,
    open_ort_session,
    select_providers,
    square_input_size,
)


@pytest.mark.parametrize(
    ("available", "device", "expected"),
    [
        ([CUDA, CPU], "auto", [CUDA, CPU]),
        ([CPU], "auto", [CPU]),
        ([CUDA, CPU], "cpu", [CPU]),
        ([CUDA, CPU], "cuda", [CUDA, CPU]),
    ],
)
def test_select_providers(available, device, expected):
    assert select_providers(available, device) == expected


def test_select_providers_requires_cuda_when_forced():
    with pytest.raises(RuntimeError):
        select_providers([CPU], "cuda")


@pytest.mark.parametrize(
    ("shape", "expected"),
    [(["batch", 448, 448, 3], 448), ([1, 384, 384, 3], 384), ([None, 8, 8, 3], 8)],
)
def test_square_input_size(shape, expected):
    assert square_input_size(shape) == expected


@pytest.mark.parametrize("shape", [[1, 448, 320, 3], [1, "h", "w", 3], [448, 448, 3], [1, 3, 448, 448, 1]])
def test_square_input_size_rejects_unexpected_shapes(shape):
    with pytest.raises(ValueError):
        square_input_size(shape)


class FakeOrtSession:
    def __init__(self, providers):
        self._providers = providers

    def get_inputs(self):
        return [SimpleNamespace(name="input", shape=["batch", 4, 4, 3])]

    def get_providers(self):
        return self._providers

    def run(self, _outputs, feeds):
        return [np.full((1, 2), feeds["input"].mean(), dtype=np.float32)]


@pytest.mark.parametrize(("providers", "device"), [([CUDA, CPU], "cuda"), ([CPU], "cpu"), ([], "cpu")])
def test_device_reports_active_provider(providers, device):
    assert OnnxSession(FakeOrtSession(providers)).device == device


def test_run_returns_every_row_of_the_first_output():
    session = OnnxSession(FakeOrtSession([CPU]))
    probs = session.run(np.full((1, 4, 4, 3), 2.0, dtype=np.float32))
    assert probs.tolist() == [[2.0, 2.0]]
    assert session.input_size == 4


def build_tiny_model(path: str) -> None:
    """NHWC input -> mean per channel -> sigmoid: a 3-label stand-in for the WD model."""
    onnx = pytest.importorskip("onnx")
    from onnx import TensorProto, helper

    graph = helper.make_graph(
        [
            helper.make_node("ReduceMean", ["input", "axes"], ["mean"], keepdims=0),
            helper.make_node("Sigmoid", ["mean"], ["output"]),
        ],
        "tiny",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, ["batch", 8, 8, 3])],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, ["batch", 3])],
        initializer=[helper.make_tensor("axes", TensorProto.INT64, [2], [1, 2])],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 18)])
    model.ir_version = 8
    onnx.save(model, path)


def test_real_onnx_runtime_with_tiny_model(tmp_path):
    pytest.importorskip("onnxruntime")
    path = str(tmp_path / "tiny.onnx")
    build_tiny_model(path)

    session = OnnxSession.create(path, "cpu")
    probs = session.run(np.zeros((2, 8, 8, 3), dtype=np.float32))

    assert session.input_size == 8
    assert session.device == "cpu"
    assert probs.tolist() == [pytest.approx([0.5, 0.5, 0.5])] * 2


def build_tower(path: str, input_type: str, outputs: list[str]) -> None:
    """A CLIP tower stand-in: mean over every non-batch axis, scaled by [1, 2] -> [batch, 2] outputs."""
    onnx = pytest.importorskip("onnx")
    from onnx import TensorProto, helper

    elem = {"float": TensorProto.FLOAT, "float16": TensorProto.FLOAT16, "int64": TensorProto.INT64}[
        input_type
    ]
    shape = ["batch", "seq"] if input_type == "int64" else ["batch", 3, 2, 2]
    axes = [1] if input_type == "int64" else [1, 2, 3]
    nodes = [
        helper.make_node("Cast", ["input"], ["as_float"], to=TensorProto.FLOAT),
        helper.make_node("ReduceMean", ["as_float", "axes"], ["mean"], keepdims=1),
        helper.make_node("Reshape", ["mean", "column"], ["mean2d"]),
        helper.make_node("MatMul", ["mean2d", "weights"], [outputs[-1]]),
    ]
    nodes += [helper.make_node("Identity", [outputs[-1]], [name]) for name in outputs[:-1]]
    graph = helper.make_graph(
        nodes,
        "tower",
        [helper.make_tensor_value_info("input", elem, shape)],
        [helper.make_tensor_value_info(name, TensorProto.FLOAT, ["batch", 2]) for name in outputs],
        initializer=[
            helper.make_tensor("axes", TensorProto.INT64, [len(axes)], axes),
            helper.make_tensor("column", TensorProto.INT64, [2], [-1, 1]),
            helper.make_tensor("weights", TensorProto.FLOAT, [1, 2], [1.0, 2.0]),
        ],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 18)])
    model.ir_version = 8
    onnx.save(model, path)


@pytest.mark.parametrize(
    ("input_type", "batch", "expected"),
    [
        ("float", np.full((2, 3, 2, 2), 0.5, dtype=np.float32), [[0.5, 1.0], [0.5, 1.0]]),
        ("float16", np.full((1, 3, 2, 2), 2.0, dtype=np.float32), [[2.0, 4.0]]),
        ("int64", np.asarray([[2, 4, 6]], dtype=np.int64), [[4.0, 8.0]]),
    ],
)
def test_embedding_session_casts_inputs_to_the_model_type(tmp_path, input_type, batch, expected):
    pytest.importorskip("onnxruntime")
    path = str(tmp_path / f"{input_type}.onnx")
    build_tower(path, input_type, ["embeds"])

    session = OnnxEmbeddingSession.create(path, "cpu", "embeds")
    output = session.run(batch)

    assert output.dtype == np.float32
    np.testing.assert_allclose(output, expected, rtol=1e-6)
    assert session.device == "cpu"


@pytest.mark.parametrize(
    ("outputs", "preferred", "chosen_first"),
    [
        (["last_hidden_state", "image_embeds"], "image_embeds", False),
        (["pooled", "embeds"], "text_embeds", True),
    ],
)
def test_embedding_session_picks_the_preferred_output(tmp_path, outputs, preferred, chosen_first):
    ort = pytest.importorskip("onnxruntime")
    path = str(tmp_path / "multi.onnx")
    build_tower(path, "float", outputs)
    raw = ort.InferenceSession(path, providers=[CPU])

    session = OnnxEmbeddingSession(raw, preferred)

    assert session._output_name == (outputs[0] if chosen_first else preferred)


def test_open_ort_session_refuses_silent_cpu_fallback(tmp_path, monkeypatch):
    ort = pytest.importorskip("onnxruntime")
    path = str(tmp_path / "tiny.onnx")
    build_tiny_model(path)
    monkeypatch.setattr(ort, "get_available_providers", lambda: [CUDA, CPU])
    monkeypatch.setattr(ort, "InferenceSession", lambda *_a, **_k: FakeOrtSession([CPU]))
    with pytest.raises(RuntimeError, match="fell back to CPU"):
        open_ort_session(path, "cuda")
