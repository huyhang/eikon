"""Micro-batching: concurrent single-image requests share one batched model call."""

import contextlib
import logging
import queue
import threading
import time
from collections.abc import Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass, field
from typing import Any, Protocol

import numpy as np

log = logging.getLogger(__name__)

RunBatch = Callable[[np.ndarray], np.ndarray]
#: Anything usable in `with` — normally the shared threading.Lock guarding the GPU.
Lock = AbstractContextManager[Any]


class Batcher(Protocol):
    def submit(self, item: np.ndarray) -> np.ndarray:
        """Runs one (1, ...) item and returns its output row."""

    def close(self) -> None: ...


BatcherFactory = Callable[[RunBatch], Batcher]


class DirectBatcher:
    """No batching: each item runs on its own (tests, CPU tools)."""

    def __init__(self, run_batch: RunBatch, lock: Lock | None = None) -> None:
        self._run_batch = run_batch
        self._lock = lock or contextlib.nullcontext()

    def submit(self, item: np.ndarray) -> np.ndarray:
        with self._lock:
            return np.asarray(self._run_batch(item))[0]

    def close(self) -> None:
        pass


def unbatched(run_batch: RunBatch) -> Batcher:
    return DirectBatcher(run_batch)


@dataclass
class _Pending:
    item: np.ndarray
    done: threading.Event = field(default_factory=threading.Event)
    result: np.ndarray | None = None
    error: BaseException | None = None


class BatcherClosedError(RuntimeError):
    pass


class MicroBatcher:
    """
    Callers block in submit() while a worker thread gathers up to `max_batch` items that arrive
    within `max_wait_ms` of the first, runs them as one batch, and hands each caller its row.
    A shared `lock` keeps several batchers (WD, CLIP) from using the GPU at the same time.
    """

    def __init__(
        self,
        run_batch: RunBatch,
        max_batch: int,
        max_wait_ms: int,
        lock: Lock | None = None,
    ) -> None:
        self._run_batch = run_batch
        self._max_batch = max_batch
        self._max_wait = max_wait_ms / 1000
        self._lock = lock or threading.Lock()
        self._queue: queue.Queue[_Pending | None] = queue.Queue()
        self._state = threading.Lock()
        self._closed = False
        self._thread = threading.Thread(target=self._work, name="micro-batcher", daemon=True)
        self._thread.start()
        self.calls = 0
        self.items = 0

    def submit(self, item: np.ndarray) -> np.ndarray:
        pending = _Pending(item)
        with self._state:
            if self._closed:
                raise BatcherClosedError("batcher is closed")
            self._queue.put(pending)
        pending.done.wait()
        if pending.error is not None:
            raise pending.error
        assert pending.result is not None
        return pending.result

    def close(self) -> None:
        """Finishes queued work, then stops the worker."""
        with self._state:
            if self._closed:
                return
            self._closed = True
            self._queue.put(None)
        self._thread.join()

    def _work(self) -> None:
        while True:
            first = self._queue.get()
            if first is None:
                return
            batch, stop = self._gather(first)
            self._run(batch)
            if stop:
                return

    def _gather(self, first: _Pending) -> tuple[list[_Pending], bool]:
        batch = [first]
        deadline = time.monotonic() + self._max_wait
        while len(batch) < self._max_batch:
            remaining = deadline - time.monotonic()
            try:
                item = self._queue.get(timeout=remaining) if remaining > 0 else self._queue.get_nowait()
            except queue.Empty:
                break
            if item is None:
                return batch, True
            batch.append(item)
        return batch, False

    def _run(self, batch: list[_Pending]) -> None:
        try:
            with self._lock:
                outputs = np.asarray(self._run_batch(np.concatenate([p.item for p in batch], axis=0)))
            if len(outputs) != len(batch):
                raise ValueError(f"model returned {len(outputs)} rows for a batch of {len(batch)}")
            for pending, row in zip(batch, outputs, strict=True):
                pending.result = row
            self.calls += 1
            self.items += len(batch)
            log.debug("ran a batch of %d", len(batch))
        except Exception as error:  # every waiter in the batch learns why it failed
            for pending in batch:
                pending.error = error
        finally:
            for pending in batch:
                pending.done.set()


def micro_batcher_factory(max_batch: int, max_wait_ms: int, lock: Lock) -> BatcherFactory:
    def make(run_batch: RunBatch) -> Batcher:
        return MicroBatcher(run_batch, max_batch, max_wait_ms, lock)

    return make
