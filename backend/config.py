import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

class Config:
    """
    Centralized configuration management.
    Handles environment variable retrieval with type-safe defaults.
    """

    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    MODEL_NAME: str = os.getenv("MODEL_NAME", "llama-3.1-8b-instant")
    MAX_TOKENS: int = int(os.getenv("MAX_TOKENS_PER_CALL", "2048"))

    CACHE_DIR: str = os.getenv("CACHE_DIR", "./cache")
    CACHE_TTL: int = int(os.getenv("CACHE_TTL_SECONDS", "86400"))

    MAX_REQUESTS_PER_MINUTE: int = int(os.getenv("MAX_REQUESTS_PER_MINUTE", "60"))
    MAX_PARAGRAPHS_PER_REQUEST: int = int(os.getenv("MAX_PARAGRAPHS_PER_REQUEST", "30"))

    @classmethod
    def validate(cls):
        """
        Validates essential configuration parameters.
        Raises:
            ValueError: If critical API keys are missing.
        """
        if not cls.GROQ_API_KEY:
            raise ValueError(
                "GROQ_API_KEY is missing. AI processing requires a valid key in .env"
            )

config = Config()