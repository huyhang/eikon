"""HTTP layer: exposes any Tagger over the Eikon tagger protocol."""

import hmac
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .preprocessing import decode_image
from .protocol import InvalidImageError, Tagger
from .settings import Settings

log = logging.getLogger(__name__)


class BodyTooLargeError(Exception):
    pass


def is_authorized(authorization: str | None, token: str | None) -> bool:
    """True when no token is configured or the header carries `Bearer <token>`."""
    if not token:
        return True
    if not authorization:
        return False
    scheme, _, credentials = authorization.partition(" ")
    return scheme.lower() == "bearer" and hmac.compare_digest(credentials.strip(), token)


def declared_length_exceeds(content_length: str | None, limit: int) -> bool:
    try:
        return content_length is not None and int(content_length) > limit
    except ValueError:
        return False


async def read_limited_body(request: Request, limit: int) -> bytes:
    if declared_length_exceeds(request.headers.get("content-length"), limit):
        raise BodyTooLargeError
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise BodyTooLargeError
        chunks.append(chunk)
    return b"".join(chunks)


def error(status: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": message})


def create_app(tagger: Tagger, settings: Settings) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        started = time.perf_counter()
        await run_in_threadpool(tagger.load)
        log.info("loaded %s on %s in %.1fs", tagger.model_name, tagger.device, time.perf_counter() - started)
        yield

    app = FastAPI(title="Eikon tagger", lifespan=lifespan, docs_url=None, redoc_url=None)

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "model": tagger.model_name, "device": tagger.device}

    @app.post("/v1/tag")
    async def tag(request: Request) -> JSONResponse:
        if not is_authorized(request.headers.get("authorization"), settings.token):
            return error(401, "unauthorized")
        try:
            body = await read_limited_body(request, settings.max_body_bytes)
            image = await run_in_threadpool(decode_image, body)
        except BodyTooLargeError:
            return error(413, f"image exceeds {settings.max_body_bytes} bytes")
        except InvalidImageError as invalid:
            return error(400, str(invalid))
        started = time.perf_counter()
        result = await run_in_threadpool(tagger.tag, image)
        log.info("tagged %dx%d image in %.0f ms", *image.size, (time.perf_counter() - started) * 1000)
        return JSONResponse(result.to_json())

    return app
