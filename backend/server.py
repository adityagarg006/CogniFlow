import asyncio
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import config
from models import (
    ProcessRequest, ProcessResponse, ProcessedItem,
    HealthResponse
)
from cache import cache
from agents import process_item


# RATE LIMITING
class RateLimiter:
    """Token bucket rate limiter. Per-IP in production, global for dev."""

    def __init__(self, max_per_minute: int):
        self.max = max_per_minute
        self.requests: dict[str, list[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.time()
        if key not in self.requests:
            self.requests[key] = []

        self.requests[key] = [t for t in self.requests[key] if now - t < 60]

        if len(self.requests[key]) >= self.max:
            return False

        self.requests[key].append(now)
        return True


rate_limiter = RateLimiter(config.MAX_REQUESTS_PER_MINUTE)


# APP LIFESPAN
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown hooks."""
    try:
        config.validate()
        print(f"[CogniFlow] Server starting on {config.HOST}:{config.PORT}")
        print(f"[CogniFlow] Model: {config.MODEL_NAME}")
        print(f"[CogniFlow] Cache: {config.CACHE_DIR} (TTL: {config.CACHE_TTL}s)")
    except ValueError as e:
        print(f"[CogniFlow] WARNING: {e}")
        print("[CogniFlow] Server will start but AI processing will fail without API key.")

    yield

    print("[CogniFlow] Server shutting down. Cache stats:", cache.stats)


# FASTAPI APP
app = FastAPI(
    title="CogniFlow API",
    description="Cognitive Accessibility AI Backend",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=3600,
)


@app.get("/")
async def root():
    return {"status": "running", "message": "CogniFlow API"}


# CHECKING IF SERVER IS ALL GOOD
@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        version="1.0.0",
        model=config.MODEL_NAME,
        cacheSize=cache.stats["size"]
    )


# MAIN PROCESSING ENDPOINT
@app.post("/api/v1/process", response_model=ProcessResponse)
async def process_text(request: ProcessRequest, req: Request):
    """
    Process a batch of text items through the AI pipeline.
    
    FLOW:
    1. Validate request size
    2. Check cache for each item
    3. Process cache misses through LangGraph pipeline
    4. Cache new results
    5. Return combined response
    """
    start_time = time.time()

    client_ip = req.client.host if req.client else "unknown"
    if not rate_limiter.allow(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Max {}/minute.".format(config.MAX_REQUESTS_PER_MINUTE)
        )

    if len(request.items) > config.MAX_PARAGRAPHS_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"Batch too large. Max {config.MAX_PARAGRAPHS_PER_REQUEST} items."
        )

    results: list[ProcessedItem] = []
    cache_hits = 0
    cache_misses = 0
    
    batch_cache = {} 

    for item in request.items:
        cached_result = cache.get(item.fullText, request.profiles)
        if cached_result:
            cached_result["domPath"] = item.domPath 
            cached_result["cached"] = True
            results.append(ProcessedItem(**cached_result))
            cache_hits += 1
            continue

        if item.fullText in batch_cache:
            duplicate_result = {**batch_cache[item.fullText]}
            duplicate_result["domPath"] = item.domPath
            duplicate_result["cached"] = True
            results.append(ProcessedItem(**duplicate_result))
            cache_hits += 1
            continue

        cache_misses += 1

        try:
            print(f"Processing paragraph: {item.fullText[:40]}...")
            result = await process_item(item.model_dump(), request.profiles)
            results.append(ProcessedItem(**result))

            batch_cache[item.fullText] = result

            cache_result = {**result}
            cache_result.pop("domPath", None)  
            cache.set(item.fullText, request.profiles, cache_result)

        except Exception as e:
            print("failure")
            results.append(ProcessedItem(
                domPath=item.domPath,
                simplified=item.fullText,
                tldr=None,
                toneFlags=[],
                originalGrade=item.gradeLevel,
                simplifiedGrade=item.gradeLevel,
                cached=False
            ))
            print(f"[CogniFlow] Processing error for {item.domPath}: {e}")

    elapsed_ms = int((time.time() - start_time) * 1000)

    return ProcessResponse(
        items=results,
        processingTimeMs=elapsed_ms,
        cacheHits=cache_hits,
        cacheMisses=cache_misses
    )


# CACHE MANAGEMENT
@app.post("/api/v1/clear-cache")
async def clear_cache():
    cache.clear()
    return {"status": "ok", "message": "Cache cleared"}


@app.get("/api/v1/cache-stats")
async def cache_stats():
    return cache.stats


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host=config.HOST,
        port=config.PORT,
        reload=config.DEBUG,
        log_level="info"
    )
