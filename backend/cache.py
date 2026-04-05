import hashlib
import json
import time
from pathlib import Path

import diskcache

from config import config


class CogniFlowCache:
    """Persistent content-hash cache for AI processing results."""

    def __init__(self):
        cache_dir = Path(config.CACHE_DIR)
        cache_dir.mkdir(parents=True, exist_ok=True)
        self._cache = diskcache.Cache(
            str(cache_dir),
            size_limit=500 * 1024 * 1024,  
            eviction_policy="least-recently-used"
        )
        self._hits = 0
        self._misses = 0

    def _make_key(self, text: str, profiles: list[str]) -> str:
        """Generate a deterministic cache key from text content and profile."""
        profile_str = ",".join(sorted(profiles))
        raw = f"{text}||{profile_str}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]

    def get(self, text: str, profiles: list[str]) -> dict | None:
        """Look up cached result. Returns None on miss."""
        key = self._make_key(text, profiles)
        result = self._cache.get(key)
        if result is not None:
            self._hits += 1
            return json.loads(result)
        self._misses += 1
        return None

    def set(self, text: str, profiles: list[str], result: dict) -> None:
        """Store a result in cache with TTL."""
        key = self._make_key(text, profiles)
        self._cache.set(key, json.dumps(result), expire=config.CACHE_TTL)

    @property
    def stats(self) -> dict:
        return {
            "hits": self._hits,
            "misses": self._misses,
            "size": len(self._cache),
            "hit_rate": (
                round(self._hits / (self._hits + self._misses) * 100, 1)
                if (self._hits + self._misses) > 0 else 0
            )
        }

    def clear(self):
        self._cache.clear()
        self._hits = 0
        self._misses = 0


cache = CogniFlowCache()