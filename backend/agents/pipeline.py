import time
import textstat
from typing import TypedDict, Annotated
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END

from config import config


# LLM INSTANCE
def get_llm():
    return ChatGroq(
        model=config.MODEL_NAME, 
        api_key=config.GROQ_API_KEY,
        max_tokens=config.MAX_TOKENS, 
        temperature=0.3,
    )


class AgentState(TypedDict):
    """Shared state passed between agents in the pipeline."""
    full_text: str
    complex_sentences: list[dict]
    all_sentences: list[str]
    profiles: list[str]
    grade_level: float
    word_count: int
    dom_path: str

    simplified_text: str
    tldr: str
    tone_flags: list[str]
    simplified_grade: float
    processing_time_ms: int
    error: str


# AGENT ROUTER
def router_agent(state: AgentState) -> dict:
    """
    Determines which agents to run based on profile and content.
    Pure logic — no LLM call needed.
    """
    profiles = state["profiles"]
    needs = set()

    if state["complex_sentences"]:
        needs.add("simplify")

    if "adhd" in profiles and state["word_count"] > 60:
        needs.add("summarize")

    needs.add("tone_check")

    return {"_route": needs}


# AGENT SIMPLIFIER
SIMPLIFIER_SYSTEM = """You are a text simplification expert specializing in cognitive accessibility.

YOUR TASK: Rewrite complex sentences to be easier to read while preserving ALL factual meaning.

RULES:
1. Target reading level: {target_grade}th grade (Flesch-Kincaid)
2. Break long sentences into shorter ones (max 15-20 words each)
3. AGGRESSIVELY replace jargon, academic words, and technical terms with plain English or simple analogies. Do NOT keep technical terms just for precision. 
4. Use active voice whenever possible
5. NEVER add information that wasn't in the original
6. NEVER remove facts, statistics, names, or dates
7. Maintain the original tone (formal/informal) — just simplify the language
8. Preserve paragraph structure — output should be a single flowing paragraph

OUTPUT: Return ONLY the simplified text. No explanations, no labels, no metadata."""


async def simplifier_agent(state: AgentState) -> dict:
    """Rewrites complex sentences at the target grade level."""
    llm = get_llm()

    profiles = state["profiles"]
    if "dyslexia" in profiles:
        target_grade = 6
    elif "adhd" in profiles:
        target_grade = 7
    else:
        target_grade = 8

    complex_indices = {s["index"] for s in state["complex_sentences"]}
    marked_sentences = []
    for i, sentence in enumerate(state["all_sentences"]):
        if i in complex_indices:
            marked_sentences.append(f"[COMPLEX: {sentence}]")
        else:
            marked_sentences.append(sentence)

    input_text = " ".join(marked_sentences)

    system = SIMPLIFIER_SYSTEM.format(target_grade=target_grade)
    human = f"""Here is the paragraph. Sentences marked [COMPLEX] need simplification. 
Leave unmarked sentences mostly unchanged. Output the full paragraph with complex sentences rewritten.

{input_text}"""

    try:
        response = await llm.ainvoke([
            SystemMessage(content=system),
            HumanMessage(content=human)
        ])
        simplified = response.content.strip()
        simplified_grade = textstat.flesch_kincaid_grade(simplified)
        return {
            "simplified_text": simplified,
            "simplified_grade": max(0, round(simplified_grade, 1))
        }
    except Exception as e:
        return {
            "simplified_text": state["full_text"],  
            "simplified_grade": state["grade_level"],
            "error": f"Simplifier error: {str(e)}"
        }
SUMMARIZER_SYSTEM = """You are a TL;DR expert. Create an extremely concise summary.

RULES:
1. Maximum 1-2 short sentences
2. Capture ONLY the single most important point
3. Use simple, direct language
4. No bullet points — just a brief statement
5. Start with the key takeaway, not background

OUTPUT: Return ONLY the TL;DR text. Nothing else."""


async def summarizer_agent(state: AgentState) -> dict:
    """Creates a one-line TL;DR for ADHD users."""
    if "adhd" not in state["profiles"]:
        return {"tldr": ""}

    llm = get_llm()

    try:
        response = await llm.ainvoke([
            SystemMessage(content=SUMMARIZER_SYSTEM),
            HumanMessage(content=f"Create a TL;DR for:\n\n{state['full_text']}")
        ])
        return {"tldr": response.content.strip()}
    except Exception as e:
        return {"tldr": "", "error": f"Summarizer error: {str(e)}"}


TONE_PATTERNS = [
    ("urgency", ["limited time", "act now", "hurry", "expires", "last chance", "only today"]),
    ("fear", ["warning", "danger", "risk", "threat", "don't miss", "you'll lose"]),
    ("guilt", ["you owe", "others are counting", "let down", "disappoint"]),
    ("social_pressure", ["everyone is", "most people", "join millions", "don't be left"]),
    ("scarcity", ["only x left", "selling fast", "almost gone", "limited stock"]),
]


def tone_analyzer_agent(state: AgentState) -> dict:
    """
    Detects manipulative language patterns WITHOUT using AI.
    This is a rule-based check — fast and deterministic.
    Saves API calls for the actual simplification work.
    """
    text_lower = state["full_text"].lower()
    flags = []

    for pattern_name, keywords in TONE_PATTERNS:
        for keyword in keywords:
            if keyword in text_lower:
                flags.append(pattern_name)
                break

    return {"tone_flags": list(set(flags))}


# LANGGRAPH PIPELINE
def build_pipeline():
    """
    Constructs the multi-agent graph.
    
    Flow:
      start → simplifier → summarizer → tone_check → end
    
    All agents run sequentially to manage API rate limits.
    In production with higher limits, simplifier and summarizer
    could run in parallel via LangGraph branching.
    """
    graph = StateGraph(AgentState)

    # DEFINING NODES
    graph.add_node("simplifier", simplifier_agent)
    graph.add_node("summarizer", summarizer_agent)
    graph.add_node("tone_check", tone_analyzer_agent)

    graph.set_entry_point("simplifier")
    graph.add_edge("simplifier", "summarizer")
    graph.add_edge("summarizer", "tone_check")
    graph.add_edge("tone_check", END)

    return graph.compile()


_pipeline = None


def get_pipeline():
    global _pipeline
    if _pipeline is None:
        _pipeline = build_pipeline()
    return _pipeline


async def process_item(item: dict, profiles: list[str]) -> dict:
    """
    Process a single paragraph through the full agent pipeline.
    Returns the processed result dict.
    """
    pipeline = get_pipeline()
    start = time.time()

    initial_state: AgentState = {
        "full_text": item["fullText"],
        "complex_sentences": [s.dict() if hasattr(s, "dict") else s for s in item.get("complexSentences", [])],
        "all_sentences": item.get("allSentences", []),
        "profiles": profiles,
        "grade_level": item.get("gradeLevel", 0),
        "word_count": item.get("wordCount", 0),
        "dom_path": item["domPath"],
        "simplified_text": "",
        "tldr": "",
        "tone_flags": [],
        "simplified_grade": 0,
        "processing_time_ms": 0,
        "error": ""
    }

    print(f"Processing paragraph: {item['fullText'][:50]}...")
    print(f"Complex sentences count: {len(initial_state['complex_sentences'])}")
    

    result = await pipeline.ainvoke(initial_state)

    elapsed_ms = int((time.time() - start) * 1000)

    return {
        "domPath": item["domPath"],
        "simplified": result.get("simplified_text", item["fullText"]),
        "tldr": result.get("tldr", None) or None,
        "toneFlags": result.get("tone_flags", []),
        "originalGrade": item.get("gradeLevel", 0),
        "simplifiedGrade": result.get("simplified_grade", 0),
        "cached": False,
        "processingTimeMs": elapsed_ms
    }
