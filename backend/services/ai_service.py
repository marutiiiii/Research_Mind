import os
import time
from dotenv import load_dotenv
from typing import List
import google.generativeai as genai

load_dotenv()

# ── Setup ──────────────────────────────────────────────────────────────

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not found in environment. Add it to backend/.env")

genai.configure(api_key=GEMINI_API_KEY)

GEMINI_MODEL = "gemini-2.5-flash"


def _generate(prompt: str, max_retries: int = 3) -> str:
    """
    Calls the Gemini API to generate a response.
    Retries with exponential backoff on transient errors.
    """
    model = genai.GenerativeModel(GEMINI_MODEL)
    last_error = None
    for attempt in range(max_retries):
        try:
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            last_error = e
            wait = 2 ** attempt  # 1s, 2s, 4s
            time.sleep(wait)
            continue

    raise RuntimeError(
        f"Failed to generate response from Gemini API after {max_retries} attempts. Last error: {last_error}"
    )


# ── Helper Functions ───────────────────────────────────────────────────

def build_context(chunks: List[dict]) -> str:
    """
    Takes chunks from ChromaDB and formats them
    into a clean readable block for Gemini.
    """
    if not chunks:
        return "No relevant sections found in the paper."

    parts = []
    for i, chunk in enumerate(chunks):
        page = f"[Page {chunk['page']}]" if chunk.get("page") else ""
        parts.append(f"--- Excerpt {i+1} {page} ---\n{chunk['text']}")

    return "\n\n".join(parts)


def get_tone(mode: str) -> str:
    """
    Returns tone instruction based on selected mode.
    eli5   = simple language, analogies, no jargon
    expert = technical, precise, detailed
    """
    if mode == "eli5":
        return (
            "Use very simple language. Explain like the user is 15 years old. "
            "Use real-world analogies. Avoid jargon. Keep sentences short and clear."
        )
    return (
        "Use precise technical language suitable for researchers. "
        "Be thorough. Reference specific methods, algorithms, or equations by name."
    )


def extract_source_pages(chunks: List[dict]) -> List[int]:
    """
    Pulls unique sorted page numbers from the chunks used.
    This tells the user which pages the answer came from.
    """
    pages = set()
    for c in chunks:
        p = c.get("page")
        if p and p != "?":
            try:
                pages.add(int(p))
            except (ValueError, TypeError):
                pass
    return sorted(pages)


# ── Core AI Functions ──────────────────────────────────────────────────

def answer_question(
    question: str,
    chunks: List[dict],
    mode: str = "expert",
    chat_history: List[dict] = []
) -> dict:
    """
    Main Q&A function.

    Flow:
    1. Format chunks into context
    2. Build chat history so Gemini remembers conversation
    3. Send everything to Gemini
    4. Return answer + source pages

    Args:
        question:     the user's question
        chunks:       relevant chunks from ChromaDB
        mode:         'expert' or 'eli5'
        chat_history: list of previous messages
                      e.g. [{"role": "user", "content": "..."},
                             {"role": "assistant", "content": "..."}]
    """

    context = build_context(chunks)
    tone    = get_tone(mode)

    # Format last 6 messages as readable history for Gemini
    history_text = ""
    if chat_history:
        lines = []
        for msg in chat_history[-6:]:
            role = "User" if msg["role"] == "user" else "Assistant"
            lines.append(f"{role}: {msg['content']}")
        history_text = "\nPrevious conversation:\n" + "\n".join(lines) + "\n"

    prompt = f"""You are ResearchMind AI — an expert research paper assistant.
Your job is to help users deeply understand academic research papers.
Answer questions based ONLY on the paper excerpts provided below.
Always mention which page your answer comes from when possible.
If the answer is not found in the excerpts, say so honestly — never make up information.
{tone}
{history_text}
Relevant excerpts from the paper:
{context}

---

User question: {question}

Answer:"""

    response_text = _generate(prompt)

    return {
        "answer":  response_text,
        "sources": extract_source_pages(chunks),
        "mode":    mode
    }


def explain_selection(
    selected_text: str,
    surrounding_chunks: List[dict],
    mode: str = "expert"
) -> dict:
    """
    Called when user selects text on the PDF and clicks 'Ask AI'.
    Gives a focused explanation of that exact selected piece of text.

    Different from answer_question — this is more targeted.
    It explains WHAT the selected text means, WHY it matters,
    and HOW it connects to the rest of the paper.
    """

    context = build_context(surrounding_chunks)
    tone    = get_tone(mode)

    prompt = f"""You are ResearchMind AI — an expert research paper assistant.
The user has selected a specific piece of text from a research paper.
Explain it clearly and in detail.
{tone}

Selected text:
"{selected_text}"

Surrounding context from the paper:
{context}

---

Explain this selected text by covering:
1. What it means in plain terms
2. Why it is important in this paper
3. How it connects to the broader concepts in the paper

Explanation:"""

    response_text = _generate(prompt)

    return {
        "answer":        response_text,
        "selected_text": selected_text,
        "sources":       extract_source_pages(surrounding_chunks),
        "mode":          mode
    }


def summarize_paper(chunks: List[dict], mode: str = "expert") -> dict:
    """
    Generates a clean structured 5-part summary of the paper.
    Uses the first 10 chunks — which usually covers
    the abstract and introduction.
    """

    summary_chunks = chunks[:10]
    context        = build_context(summary_chunks)
    tone           = get_tone(mode)

    prompt = f"""You are ResearchMind AI — an expert research paper assistant.
Generate a clear structured summary of this research paper.
{tone}

Paper excerpts:
{context}

---

Write a structured summary with exactly these 5 sections:

**Problem:** What problem does this paper solve?

**Method:** What approach or technique did the authors use?

**Key Findings:** What are the main results or discoveries?

**Limitations:** What are the weaknesses or limitations mentioned?

**Impact:** Why does this paper matter to the research field?

Summary:"""

    response_text = _generate(prompt)

    return {
        "summary": response_text,
        "mode":    mode
    }


def generate_quiz(chunks: List[dict], mode: str = "expert") -> dict:
    """
    Bonus — generates 5 MCQ questions from the paper
    to test the user's understanding of key concepts.
    """

    context = build_context(chunks[:8])
    tone    = get_tone(mode)

    prompt = f"""You are ResearchMind AI.
Generate exactly 5 multiple choice questions to test understanding of this research paper.
{tone}

Paper excerpts:
{context}

---

Format each question exactly like this:

Q1: [Question text]
A) [Option]
B) [Option]
C) [Option]
D) [Option]
Answer: [Correct letter]
Explanation: [Why this is correct]

Generate all 5 questions:"""

    response_text = _generate(prompt)

    return {
        "quiz": response_text,
        "mode": mode
    }