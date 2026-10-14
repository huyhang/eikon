"""HTTP layer: exposes any Tagger (and optional Embedder) over the Eikon tagger protocol."""

import asyncio
import dataclasses
import hmac
import json
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from PIL import Image
from starlette.concurrency import run_in_threadpool

from .preprocessing import decode_image
from .protocol import Embedder, Embedding, InvalidImageError, Tagger, TagResult
from .settings import Settings

log = logging.getLogger(__name__)

#: Longest text accepted by /v1/embed-text (matches MAX_EMBED_TEXT_LENGTH in shared/src/tagger.ts).
MAX_EMBED_TEXT_LENGTH = 500


class BodyTooLargeError(Exception):
    pass


class RequestError(Exception):
    """A request the endpoint rejects with `status` and a message."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


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


def parse_embed_text(body: bytes) -> str:
    """The `text` of a {"text": "..."} body, trimmed; RequestError(400) when unusable."""
    try:
        payload = json.loads(body)
    except (ValueError, UnicodeDecodeError) as error:
        raise RequestError(400, 'body must be JSON like {"text": "..."}') from error
    text = payload.get("text") if isinstance(payload, dict) else None
    if not isinstance(text, str) or not text.strip():
        raise RequestError(400, "text is required")
    if len(text) > MAX_EMBED_TEXT_LENGTH:
        raise RequestError(400, f"text is longer than {MAX_EMBED_TEXT_LENGTH} characters")
    return text.strip()


def error(status: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": message})


def create_app(tagger: Tagger, settings: Settings, embedder: Embedder | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        await load_models(tagger, embedder)
        yield
        tagger.close()
        if embedder:
            embedder.close()

    app = FastAPI(title="Eikon tagger", lifespan=lifespan, docs_url=None, redoc_url=None)

    async def checked_body(request: Request) -> bytes:
        if not is_authorized(request.headers.get("authorization"), settings.token):
            raise RequestError(401, "unauthorized")
        try:
            return await read_limited_body(request, settings.max_body_bytes)
        except BodyTooLargeError as too_large:
            raise RequestError(413, f"body exceeds {settings.max_body_bytes} bytes") from too_large

    async def checked_image(request: Request) -> Image.Image:
        body = await checked_body(request)
        try:
            return await run_in_threadpool(decode_image, body)
        except InvalidImageError as invalid:
            raise RequestError(400, str(invalid)) from invalid

    def require_embedder() -> Embedder:
        if embedder is None:
            raise RequestError(404, "embeddings are disabled")
        return embedder

    @app.exception_handler(RequestError)
    async def request_error(_: Request, exc: RequestError) -> JSONResponse:
        return error(exc.status, str(exc))

    @app.get("/health")
    async def health() -> dict:
        return {
            "status": "ok",
            "model": tagger.model_name,
            "device": tagger.device,
            "embedModel": embedder.model_name if embedder else None,
        }

    @app.post("/v1/tag")
    async def tag(request: Request) -> JSONResponse:
        image = await checked_image(request)
        started = time.perf_counter()
        result = await tag_and_embed(tagger, embedder, image)
        log.info("tagged %dx%d image in %.0f ms", *image.size, (time.perf_counter() - started) * 1000)
        return JSONResponse(result.to_json())

    @app.post("/v1/embed-image")
    async def embed_image(request: Request) -> JSONResponse:
        model = require_embedder()
        image = await checked_image(request)
        vector = await run_in_threadpool(model.embed_image, image)
        return JSONResponse(Embedding(model.model_name, vector).to_json())

    @app.post("/v1/embed-text")
    async def embed_text(request: Request) -> JSONResponse:
        model = require_embedder()
        text = parse_embed_text(await checked_body(request))
        vector = await run_in_threadpool(model.embed_text, text)
        return JSONResponse(Embedding(model.model_name, vector).to_json())

    return app


async def load_models(tagger: Tagger, embedder: Embedder | None) -> None:
    started = time.perf_counter()
    await run_in_threadpool(tagger.load)
    log.info("loaded %s on %s in %.1fs", tagger.model_name, tagger.device, time.perf_counter() - started)
    if embedder:
        started = time.perf_counter()
        await run_in_threadpool(embedder.load)
        log.info("loaded embeddings %s in %.1fs", embedder.model_name, time.perf_counter() - started)


async def tag_and_embed(tagger: Tagger, embedder: Embedder | None, image: Image.Image) -> TagResult:
    """Tags and (when configured) embeds in parallel threads; the batchers serialise GPU use."""
    if embedder is None:
        return await run_in_threadpool(tagger.tag, image)
    result, vector = await asyncio.gather(
        run_in_threadpool(tagger.tag, image),
        run_in_threadpool(embedder.embed_image, image.copy()),
    )
    return dataclasses.replace(result, embedding=Embedding(embedder.model_name, vector))
