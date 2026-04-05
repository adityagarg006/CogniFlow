from pydantic import BaseModel, Field
from typing import Optional


class ComplexSentence(BaseModel):
    """A single sentence flagged as complex by the client-side FK calculator."""
    index: int = Field(description="Position in the original paragraph's sentence array")
    text: str = Field(description="The raw sentence text")
    gradeLevel: float = Field(description="FK grade level computed client-side")
    wordCount: int = Field(description="Word count of this sentence")


class ProcessItem(BaseModel):
    """A single paragraph/element to process."""
    domPath: str = Field(description="Unique CSS-like path to the DOM element")
    fullText: str = Field(description="Complete paragraph text")
    complexSentences: list[ComplexSentence] = Field(
        description="Only the sentences exceeding FK threshold (pre-filtered client-side)"
    )
    allSentences: list[str] = Field(description="All sentences in order")
    totalSentences: int = Field(description="Total sentence count")
    wordCount: int = Field(description="Total word count of full paragraph")
    gradeLevel: float = Field(description="FK grade level of full paragraph")


class ProcessRequest(BaseModel):
    """Batch request from the extension."""
    items: list[ProcessItem] = Field(
        description="Paragraphs to process",
        max_length=20
    )
    profiles: list[str] = Field(
        description="Active cognitive profiles: 'adhd', 'autism', 'dyslexia'"
    )
    pageUrl: str = Field(description="URL of the page being processed")
    domain: str = Field(description="Domain of the page")


class ProcessedItem(BaseModel):
    """A single processed result returned to the extension."""
    domPath: str = Field(description="Matches the input domPath for DOM targeting")
    simplified: str = Field(description="The simplified/rewritten text")
    tldr: Optional[str] = Field(
        default=None,
        description="TL;DR bullet summary (generated for ADHD profile)"
    )
    toneFlags: list[str] = Field(
        default_factory=list,
        description="Detected manipulative language patterns"
    )
    originalGrade: float = Field(description="Original FK grade level")
    simplifiedGrade: float = Field(description="FK grade level after simplification")
    cached: bool = Field(default=False, description="Whether this result came from cache")


class ProcessResponse(BaseModel):
    """Batch response to the extension."""
    items: list[ProcessedItem]
    processingTimeMs: int = Field(description="Total server processing time")
    cacheHits: int = Field(default=0)
    cacheMisses: int = Field(default=0)


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"
    version: str = "1.0.0"
    model: str = ""
    cacheSize: int = 0
