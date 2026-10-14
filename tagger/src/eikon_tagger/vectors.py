"""Embedding vectors on the wire: L2-normalised, little-endian float16, base64 (see shared/src/vectors.ts)."""

import base64

import numpy as np


def l2_normalize(vector: np.ndarray) -> np.ndarray:
    values = np.asarray(vector, dtype=np.float32).reshape(-1)
    norm = float(np.linalg.norm(values))
    return values / norm if norm > 0 else values


def encode_vector(vector: np.ndarray) -> str:
    return base64.b64encode(np.asarray(vector, dtype="<f2").tobytes()).decode("ascii")


def decode_vector(encoded: str) -> np.ndarray:
    return np.frombuffer(base64.b64decode(encoded), dtype="<f2").astype(np.float32)
