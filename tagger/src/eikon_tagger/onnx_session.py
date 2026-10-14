"""ONNX Runtime implementation of the InferenceSession interface."""

import logging
from collections.abc import Sequence
from typing import Any

import numpy as np

from .settings import Device

log = logging.getLogger(__name__)

CUDA = "CUDAExecutionProvider"
CPU = "CPUExecutionProvider"


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


class OnnxSession:
    def __init__(self, session: Any) -> None:
        self._session = session
        model_input = session.get_inputs()[0]
        self._input_name = model_input.name
        self._input_size = square_input_size(model_input.shape)

    @classmethod
    def create(cls, model_path: str, device: Device) -> "OnnxSession":
        import onnxruntime as ort  # imported lazily so tests and tooling need no runtime

        providers = select_providers(ort.get_available_providers(), device)
        session = cls(ort.InferenceSession(model_path, providers=providers))
        if device == "cuda" and session.device != "cuda":
            raise RuntimeError("CUDA was requested but the session fell back to CPU")
        log.info("onnx session ready on %s (requested providers %s)", session.device, providers)
        return session

    @property
    def input_size(self) -> int:
        return self._input_size

    @property
    def device(self) -> str:
        active = self._session.get_providers()
        return "cuda" if active and active[0] == CUDA else "cpu"

    def run(self, batch: np.ndarray) -> np.ndarray:
        outputs = self._session.run(None, {self._input_name: batch})
        return np.asarray(outputs[0])[0]
