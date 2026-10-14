"""ONNX Runtime implementations of the inference-session interfaces."""

import logging
from collections.abc import Sequence
from typing import Any

import numpy as np

from .settings import Device

log = logging.getLogger(__name__)

CUDA = "CUDAExecutionProvider"
CPU = "CPUExecutionProvider"

_NUMPY_TYPES = {
    "tensor(float)": np.float32,
    "tensor(float16)": np.float16,
    "tensor(int64)": np.int64,
    "tensor(int32)": np.int32,
}


def select_providers(available: Sequence[str], device: Device) -> list[str]:
    """Execution providers to request, in priority order."""
    if device == "cpu":
        return [CPU]
    if CUDA in available:
        return [CUDA, CPU]
    if device == "cuda":
        raise RuntimeError("TAGGER_DEVICE=cuda but onnxruntime has no CUDA provider")
    return [CPU]


def square_input_size(shape: Sequence[Any]) -> int:
    """Extracts the edge length from an NHWC input shape such as ['batch', 448, 448, 3]."""
    if len(shape) != 4 or not isinstance(shape[1], int) or shape[1] != shape[2]:
        raise ValueError(f"expected a square NHWC input shape, got {list(shape)}")
    return shape[1]


def active_device(session: Any) -> str:
    active = session.get_providers()
    return "cuda" if active and active[0] == CUDA else "cpu"


def open_ort_session(model_path: str, device: Device) -> Any:
    import onnxruntime as ort  # imported lazily so tests and tooling need no runtime

    providers = select_providers(ort.get_available_providers(), device)
    session = ort.InferenceSession(model_path, providers=providers)
    if device == "cuda" and active_device(session) != "cuda":
        raise RuntimeError("CUDA was requested but the session fell back to CPU")
    log.info("onnx session %s ready on %s (requested %s)", model_path, active_device(session), providers)
    return session


class OnnxSession:
    """The WD tagger: NHWC image batch in, one probability row per image out."""

    def __init__(self, session: Any) -> None:
        self._session = session
        model_input = session.get_inputs()[0]
        self._input_name = model_input.name
        self._input_size = square_input_size(model_input.shape)

    @classmethod
    def create(cls, model_path: str, device: Device) -> "OnnxSession":
        return cls(open_ort_session(model_path, device))

    @property
    def input_size(self) -> int:
        return self._input_size

    @property
    def device(self) -> str:
        return active_device(self._session)

    def run(self, batch: np.ndarray) -> np.ndarray:
        outputs = self._session.run(None, {self._input_name: batch})
        return np.asarray(outputs[0])


class OnnxEmbeddingSession:
    """One CLIP tower: pixels or token ids in, a [batch, D] float32 embedding out."""

    def __init__(self, session: Any, preferred_output: str) -> None:
        self._session = session
        model_input = session.get_inputs()[0]
        self._input_name = model_input.name
        self._input_type = _NUMPY_TYPES.get(model_input.type, np.float32)
        names = [output.name for output in session.get_outputs()]
        self._output_name = preferred_output if preferred_output in names else names[0]

    @classmethod
    def create(cls, model_path: str, device: Device, preferred_output: str) -> "OnnxEmbeddingSession":
        return cls(open_ort_session(model_path, device), preferred_output)

    @property
    def device(self) -> str:
        return active_device(self._session)

    def run(self, batch: np.ndarray) -> np.ndarray:
        feeds = {self._input_name: batch.astype(self._input_type, copy=False)}
        (output,) = self._session.run([self._output_name], feeds)
        return np.asarray(output, dtype=np.float32)
