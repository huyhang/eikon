import threading
import time

import numpy as np
import pytest

from eikon_tagger.batching import (
    BatcherClosedError,
    DirectBatcher,
    MicroBatcher,
    micro_batcher_factory,
    unbatched,
)


class RecordingRun:
    """Doubles each row and records the batch sizes it was called with."""

    def __init__(self, fail: bool = False, delay: float = 0.0) -> None:
        self.sizes: list[int] = []
        self.fail = fail
        self.delay = delay
        self.active = 0
        self.max_active = 0
        self._guard = threading.Lock()

    def __call__(self, batch: np.ndarray) -> np.ndarray:
        with self._guard:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
        try:
            time.sleep(self.delay)
            self.sizes.append(len(batch))
            if self.fail:
                raise RuntimeError("CUDA out of memory")
            return batch * 2
        finally:
            with self._guard:
                self.active -= 1


def submit_concurrently(batcher, values: list[float]) -> list:
    """Submits each value from its own thread; returns each thread's result or exception."""
    results: list = [None] * len(values)
    start = threading.Barrier(len(values))

    def worker(i: int) -> None:
        start.wait()
        try:
            results[i] = batcher.submit(np.full((1, 2), values[i], dtype=np.float32))
        except Exception as error:
            results[i] = error

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(len(values))]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=5)
    return results


@pytest.mark.parametrize(("count", "max_batch", "expected_calls"), [(4, 8, 1), (6, 3, 2), (5, 1, 5)])
def test_concurrent_submits_share_batches_up_to_max_batch(count, max_batch, expected_calls):
    run = RecordingRun()
    batcher = MicroBatcher(run, max_batch=max_batch, max_wait_ms=300)
    results = submit_concurrently(batcher, [float(i) for i in range(count)])
    batcher.close()

    assert sorted(run.sizes, reverse=True)[0] <= max_batch
    assert sum(run.sizes) == count
    assert len(run.sizes) == expected_calls
    assert (batcher.calls, batcher.items) == (expected_calls, count)
    for i, row in enumerate(results):
        assert row.tolist() == [2.0 * i, 2.0 * i]  # every caller gets its own row


def test_failure_reaches_every_waiter_in_the_batch():
    batcher = MicroBatcher(RecordingRun(fail=True), max_batch=8, max_wait_ms=300)
    results = submit_concurrently(batcher, [1.0, 2.0, 3.0])
    batcher.close()
    assert all(isinstance(r, RuntimeError) and "out of memory" in str(r) for r in results)


def test_row_count_mismatch_is_an_error():
    batcher = MicroBatcher(lambda batch: batch[:0], max_batch=4, max_wait_ms=0)
    with pytest.raises(ValueError, match="0 rows for a batch of 1"):
        batcher.submit(np.zeros((1, 2), dtype=np.float32))
    batcher.close()


@pytest.mark.parametrize("wait_ms", [0, 1])
def test_sequential_submits_run_alone_with_a_short_window(wait_ms):
    run = RecordingRun()
    batcher = MicroBatcher(run, max_batch=8, max_wait_ms=wait_ms)
    for value in (1.0, 2.0, 3.0):
        assert batcher.submit(np.full((1, 1), value)).tolist() == [value * 2]
    batcher.close()
    assert run.sizes == [1, 1, 1]


def test_shared_lock_keeps_batchers_off_the_gpu_at_the_same_time():
    run = RecordingRun(delay=0.02)
    make = micro_batcher_factory(max_batch=1, max_wait_ms=0, lock=threading.Lock())
    first, second = make(run), make(run)
    threads = [
        threading.Thread(target=b.submit, args=(np.zeros((1, 1)),)) for b in (first, second) for _ in range(3)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=5)
    first.close()
    second.close()
    assert len(run.sizes) == 6
    assert run.max_active == 1


def test_close_finishes_queued_work_and_rejects_new_submits():
    batcher = MicroBatcher(RecordingRun(), max_batch=4, max_wait_ms=0)
    assert batcher.submit(np.ones((1, 1))).tolist() == [2.0]
    batcher.close()
    batcher.close()  # idempotent
    with pytest.raises(BatcherClosedError):
        batcher.submit(np.ones((1, 1)))


@pytest.mark.parametrize("make", [unbatched, lambda run: DirectBatcher(run, threading.Lock())])
def test_direct_batcher_runs_each_item_alone(make):
    run = RecordingRun()
    batcher = make(run)
    assert batcher.submit(np.full((1, 2), 3.0)).tolist() == [6.0, 6.0]
    batcher.close()
    assert run.sizes == [1]


def test_close_during_the_wait_window_still_answers_the_waiting_caller():
    run = RecordingRun()
    batcher = MicroBatcher(run, max_batch=8, max_wait_ms=2000)
    results: list = []
    caller = threading.Thread(target=lambda: results.append(batcher.submit(np.full((1, 1), 4.0))))
    caller.start()
    time.sleep(0.05)  # the worker is now gathering, waiting for more items
    batcher.close()
    caller.join(timeout=5)
    assert [r.tolist() for r in results] == [[8.0]]
    assert run.sizes == [1]
