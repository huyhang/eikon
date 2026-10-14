from types import SimpleNamespace

import numpy as np
import pytest

from eikon_tagger.onnx_session import CPU, CUDA, OnnxSession, select_providers, square_input_size


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


def test_run_returns_first_row_of_first_output():
    session = OnnxSession(FakeOrtSession([CPU]))
    probs = session.run(np.full((1, 4, 4, 3), 2.0, dtype=np.float32))
    assert probs.tolist() == [2.0, 2.0]
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
    probs = session.run(np.zeros((1, 8, 8, 3), dtype=np.float32))

    assert session.input_size == 8
    assert session.device == "cpu"
    assert probs.tolist() == pytest.approx([0.5, 0.5, 0.5])
