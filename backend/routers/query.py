from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from services.vector_store import search_chunks
from services.ai_service import (
    answer_question,
    explain_selection,
    summarize_paper,
    generate_quiz
)

router = APIRouter()


# ── Request Models ─────────────────────────────────────────────────────
# These define exactly what JSON the frontend must send

class QuestionRequest(BaseModel):
    file_id:      str                        # which paper to query
    question:     str                        # user's question
    mode:         Optional[str] = "expert"   # 'expert' or 'eli5'
    chat_history: Optional[List[dict]] = []  # previous messages


class SelectionRequest(BaseModel):
    file_id:       str
    selected_text: str                       # text user selected on PDF
    mode:          Optional[str] = "expert"


class SummaryRequest(BaseModel):
    file_id: str
    mode:    Optional[str] = "expert"


class QuizRequest(BaseModel):
    file_id: str
    mode:    Optional[str] = "expert"


# ── Endpoints ──────────────────────────────────────────────────────────

@router.post("/query")
async def query_paper(req: QuestionRequest):
    """
    Main Q&A endpoint.
    Frontend sends question → backend searches ChromaDB
    → sends to Gemini → returns answer.
    """

    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    # Search ChromaDB for relevant chunks
    chunks = search_chunks(
        file_id=req.file_id,
        query=req.question,
        top_k=4
    )

    if not chunks:
        raise HTTPException(
            status_code=404,
            detail="Paper not found. Please upload the paper again."
        )

    try:
        result = answer_question(
            question=req.question,
            chunks=chunks,
            mode=req.mode,
            chat_history=req.chat_history
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")

    return {
        "success": True,
        "answer":  result["answer"],
        "sources": result["sources"],
        "mode":    result["mode"]
    }


@router.post("/explain")
async def explain_selected_text(req: SelectionRequest):
    """
    Called when user selects text on PDF and clicks Ask AI.
    Returns a focused explanation of the selected text.
    """

    if not req.selected_text.strip():
        raise HTTPException(status_code=400, detail="No text selected.")

    chunks = search_chunks(
        file_id=req.file_id,
        query=req.selected_text,
        top_k=3
    )

    try:
        result = explain_selection(
            selected_text=req.selected_text,
            surrounding_chunks=chunks,
            mode=req.mode
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")

    return {
        "success":       True,
        "answer":        result["answer"],
        "selected_text": result["selected_text"],
        "sources":       result["sources"],
        "mode":          result["mode"]
    }


@router.post("/summarize")
async def summarize(req: SummaryRequest):
    """
    Returns a structured 5-part summary of the uploaded paper.
    Best to call this right after upload.
    """

    chunks = search_chunks(
        file_id=req.file_id,
        query="introduction abstract overview objective problem method summary",
        top_k=10
    )

    if not chunks:
        raise HTTPException(status_code=404, detail="Paper content not found.")

    try:
        result = summarize_paper(chunks=chunks, mode=req.mode)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")

    return {
        "success": True,
        "summary": result["summary"],
        "mode":    result["mode"]
    }


@router.post("/quiz")
async def quiz(req: QuizRequest):
    """
    Generates 5 MCQ questions from the paper
    to test the user's understanding.
    """

    chunks = search_chunks(
        file_id=req.file_id,
        query="key concepts methods results findings contribution",
        top_k=8
    )

    if not chunks:
        raise HTTPException(status_code=404, detail="Paper content not found.")

    try:
        result = generate_quiz(chunks=chunks, mode=req.mode)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")

    return {
        "success": True,
        "quiz":    result["quiz"],
        "mode":    result["mode"]
    }